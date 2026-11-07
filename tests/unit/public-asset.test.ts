import { afterEach, expect, it, vi } from 'vitest';
import * as publishing from '../../src/lib/publishing/service';
import * as files from '../../src/lib/core/storage';
import * as db from '../../src/lib/core/db';
import { GET } from '../../src/app/p/[slug]/assets/[assetId]/route';
const id = '11111111-1111-4111-8111-111111111111';
const request = new Request('https://oneboss.example/p/test/assets/' + id);
const context = { params: Promise.resolve({ slug: 'test', assetId: id }) };
afterEach(() => vi.restoreAllMocks());
it('rejects unknown or expired-publication assets before using service role', async () => {
  vi.spyOn(publishing, 'publicProject').mockResolvedValue(null);
  const storage = vi.spyOn(files, 'storage');
  expect((await GET(request, context)).status).toBe(404);
  expect(storage).not.toHaveBeenCalled();
});
it('never signs or returns an unreferenced private file', async () => {
  vi.spyOn(publishing, 'publicProject').mockResolvedValue({ assets: [] } as any);
  const storage = vi.spyOn(files, 'storage');
  expect((await GET(request, context)).status).toBe(404);
  expect(storage).not.toHaveBeenCalled();
});
it('streams approved image bytes through a stable URL without leaking a private path', async () => {
  vi.spyOn(publishing, 'publicProject').mockResolvedValue({ assets: [{ id }] } as any);
  vi.spyOn(db, 'database').mockReturnValue((async () => [
    { storage_path: 'private/tenant/image.png' },
  ]) as any);
  vi.spyOn(files, 'storage').mockReturnValue({
    download: async () => ({
      error: null,
      data: new Blob(['test fixture'], { type: 'image/png' }),
    }),
  } as any);
  const res = await GET(request, context);
  expect(res.status).toBe(200);
  expect(res.headers.get('cache-control')).toBe('no-store');
  expect(res.headers.get('content-type')).toBe('image/png');
  expect(await res.text()).toBe('test fixture');
});
