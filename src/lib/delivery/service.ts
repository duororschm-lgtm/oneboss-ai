import JSZip from 'jszip';
import sharp from 'sharp';
import jsQR from 'jsqr';
import { database } from '../core/db';
import { assert } from '../core/errors';
import { hash, entitlement } from '../core/service';
import { creative } from '../core/creative';
import { store } from '../core/storage';
import { appOrigin, verifyPublicUrl } from '../security/network';
import { DeliveryManifest, Production } from '../../contracts';
export async function inspectPng(bytes: Uint8Array, width: number, height: number, url: string) {
  const buffer = Buffer.from(bytes);
  assert(buffer.length < 20 * 1024 * 1024, 'PNG_TOO_LARGE');
  assert(
    buffer.length > 1000 &&
      buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    'INVALID_PNG',
  );
  const image = sharp(buffer, { limitInputPixels: 20_000_000 }),
    meta = await image.metadata();
  assert(meta.width === width && meta.height === height, 'PNG_DIMENSION_MISMATCH');
  const stats = await image.stats();
  assert(
    stats.channels.some((c) => c.stdev > 5),
    'BLANK_PNG',
  );
  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const qr = jsQR(new Uint8ClampedArray(data), info.width, info.height);
  assert(qr?.data === url, 'QR_TARGET_INVALID');
  return { width, height, size: buffer.length, sha256: hash(buffer) };
}
export async function createDelivery(run: Record<string, any>, context: Record<string, any>) {
  const { p } = context;
  assert(p.published_revision && p.published_verified, 'VERIFIED_SITE_REQUIRED');
  assert(p.browser_verified_revision === p.published_revision, 'BROWSER_QA_REQUIRED');
  const [existing] =
    await database()`select manifest from deliveries where project_id=${p.id} and revision=${p.published_revision}`;
  if (existing) return existing.manifest;
  const [version] =
    await database()`select * from artifact_versions where project_id=${p.id} and revision=${p.published_revision}`;
  assert(version.fact_version === p.fact_version, 'FACT_VERSION_CHANGED', 409);
  const production = Production.parse(version.body);
  const [storedDesign] =
    await database()`select body from design_systems where project_id=${p.id} and revision=${production.site.designSystemVersion} and approved_at is not null`;
  assert(storedDesign, 'DESIGN_MISSING');
  const design = storedDesign.body;
  const url = `${appOrigin()}/p/${p.publish_slug}`;
  await verifyPublicUrl(url, `/p/${p.publish_slug}`);
  const renderer = await creative(),
    zip = new JSZip(),
    files: { path: string; sha256: string; size: number }[] = [],
    posters: Record<string, unknown>[] = [];
  let totalBytes = 0;
  const add = (path: string, bytes: Buffer | string) => {
    totalBytes += Buffer.byteLength(bytes);
    assert(totalBytes < 50 * 1024 * 1024, 'ZIP_TOO_LARGE');
    zip.file(path, bytes);
    files.push({ path, sha256: hash(bytes), size: Buffer.byteLength(bytes) });
  };
  const prefix = `${p.org_id}/${p.id}/deliveries/${p.published_revision}/${run.id}-${run.lease_token}`;
  for (const [i, poster] of production.posters.entries()) {
    const result = await renderer.renderPoster({
      poster,
      design,
      facts: context.facts,
      assets: context.assets,
      publicSiteUrl: url,
    });
    const info = await inspectPng(result.pngBytes, poster.canvas.width, poster.canvas.height, url);
    const path = `posters/poster-${i + 1}.png`,
      qrPath = `qrcode/qr-${i + 1}.png`;
    // Independently verify the standalone QR file as well.
    const qrMeta = await sharp(result.qrBytes).metadata();
    assert(qrMeta.width && qrMeta.height, 'INVALID_QR_PNG');
    await inspectPng(result.qrBytes, qrMeta.width, qrMeta.height, url);
    add(path, Buffer.from(result.pngBytes));
    add(qrPath, Buffer.from(result.qrBytes));
    await store(`${prefix}/${path}`, result.pngBytes, 'image/png');
    const copy = production.copy.find((x) => x.id === poster.copyPackRef);
    assert(copy, 'COPY_MISSING');
    add(
      `copy/xiaohongshu-poster-${i + 1}.md`,
      `${copy.title}\n\n${copy.body}\n\n${copy.hashtags.join(' ')}\n\n${copy.cta}\n网址：${url}\n事实版本：${copy.factVersion}\n海报：${path}\n`,
    );
    posters.push({
      path,
      width: info.width,
      height: info.height,
      size: info.size,
      sha256: info.sha256,
      qrTargetUrl: url,
    });
  }
  add('site-url.txt', url);
  add(
    'README-交付说明.md',
    'OneBoss 宣传素材交付包。包含网站地址、海报、二维码、小红书文案。仅提供素材，不代表已代发或保证获客。\n',
  );
  const manifest = DeliveryManifest.parse({
    schemaVersion: '1.0',
    orderId: p.service_order_id,
    projectId: p.id,
    publicSiteUrl: url,
    siteRevision: p.published_revision,
    factVersion: p.fact_version,
    posters,
    files,
    createdAt: new Date().toISOString(),
  });
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  assert(bytes.length < 50 * 1024 * 1024, 'ZIP_TOO_LARGE');
  const zipPath = await store(`${prefix}/delivery.zip`, bytes, 'application/zip');
  await database().begin(async (tx) => {
    const [current] = await tx`select * from projects where id=${p.id} for update`;
    await entitlement(tx, current);
    const [lease] =
      await tx`select id from agent_runs where id=${run.id} and lease_token=${run.lease_token} and status='RUNNING'`;
    assert(
      lease &&
        current.fact_version === p.fact_version &&
        current.published_revision === p.published_revision &&
        current.published_verified,
      'DELIVERY_VERSION_CONFLICT',
      409,
    );
    await tx`insert into deliveries(org_id,project_id,revision,manifest,zip_path) values(${p.org_id},${p.id},${p.published_revision},${tx.json(manifest)},${zipPath}) on conflict(project_id,revision) do nothing`;
    await tx`update projects set status='DELIVERED' where id=${p.id}`;
  });
  return manifest;
}
