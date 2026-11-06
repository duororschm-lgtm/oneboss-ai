import { outboundFetch } from '../security/http';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { assert } from './errors';
import { hash, project, entitlement } from './service';
import { transaction, type Actor } from './db';
import { randomUUID } from 'node:crypto';
export function storage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert(url && key, 'STORAGE_NOT_CONFIGURED', 503);
  return createClient(url, key, {
    global: { fetch: outboundFetch },
    auth: { persistSession: false, autoRefreshToken: false },
  }).storage.from(process.env.STORAGE_BUCKET || 'oneboss-private');
}
export async function store(path: string, bytes: Uint8Array, type: string) {
  assert(!path.includes('..') && !path.startsWith('/'), 'INVALID_STORAGE_PATH');
  const { error } = await storage().upload(path, bytes, { contentType: type, upsert: true });
  assert(!error, 'STORAGE_UPLOAD_FAILED', 502);
  return path;
}
export async function signed(path: string) {
  const { data, error } = await storage().createSignedUrl(path, 300);
  assert(!error && data, 'STORAGE_SIGN_FAILED', 502);
  return data.signedUrl;
}
export async function uploadAsset(
  actor: Actor,
  projectId: string,
  bytes: Buffer,
  authorized: boolean,
) {
  assert(authorized, 'ASSET_LICENSE_REQUIRED');
  assert(bytes.length > 0 && bytes.length <= 10 * 1024 * 1024, 'ASSET_SIZE_INVALID', 413);
  const meta = await sharp(bytes, { limitInputPixels: 40_000_000 }).metadata();
  assert(
    ['png', 'jpeg', 'webp'].includes(meta.format ?? '') && meta.width && meta.height && !meta.pages,
    'ASSET_TYPE_INVALID',
  );
  assert(
    meta.width >= 32 && meta.height >= 32 && meta.width <= 10000 && meta.height <= 10000,
    'ASSET_DIMENSIONS_INVALID',
  );
  // Re-encode to strip EXIF, unexpected payloads and animation; never accept SVG/HTML.
  const clean = await sharp(bytes, { limitInputPixels: 40_000_000 }).rotate().png().toBuffer();
  const id = randomUUID();
  return transaction(actor, async (tx) => {
    const p = await project(tx, actor, projectId);
    await entitlement(tx, p);
    const path = `${p.org_id}/${p.id}/assets/${id}.png`;
    await store(path, clean, 'image/png');
    const [asset] =
      await tx`insert into media_assets(id,org_id,project_id,storage_path,kind,sha256,width,height,license_status) values(${id},${p.org_id},${p.id},${path},'image/png',${hash(clean)},${meta.width!},${meta.height!},'customer_authorized') returning *`;
    return asset;
  });
}
