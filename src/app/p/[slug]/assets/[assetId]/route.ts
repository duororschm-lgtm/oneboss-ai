import { publicProject } from '../../../../../lib/publishing/service';
import { database } from '../../../../../lib/core/db';
import { storage } from '../../../../../lib/core/storage';
import { AppError } from '../../../../../lib/core/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Only referenced assets of the currently approved/verified page become public.
 * Private bucket paths, credentials and signed URLs are never returned. */
export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string; assetId: string }> },
) {
  try {
    const { slug, assetId } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(assetId)) return new Response(null, { status: 404 });
    const publication = await publicProject(slug, request.headers.get('x-oneboss-publication'));
    if (!publication?.assets.some((asset) => asset.id === assetId))
      return new Response(null, { status: 404 });
    const [asset] =
      await database()`select storage_path from media_assets where id=${assetId} and license_status='customer_authorized'`;
    if (!asset) return new Response(null, { status: 404 });
    const { data, error } = await storage().download(asset.storage_path);
    if (
      error ||
      !data ||
      data.size > 10 * 1024 * 1024 ||
      !['image/png', 'image/jpeg', 'image/webp'].includes(data.type)
    )
      throw new AppError('STORAGE_DOWNLOAD_FAILED', 502);
    return new Response(await data.arrayBuffer(), {
      headers: {
        'Content-Type': data.type,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return Response.json(
      { error: { code: 'PUBLIC_ASSET_UNAVAILABLE' } },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
