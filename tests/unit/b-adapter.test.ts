import { afterEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import sharp from 'sharp';
import { fixture } from '../fixtures';
import { mapSite, mapPoster, displayFact } from '../../src/lib/creative/b-mapping';
import {
  renderSite,
  renderPoster,
  renderPosterPreview,
  validateProduction,
} from '../../src/lib/creative/b-adapter';
import jsQR from 'jsqr';
import { directionPreview } from '../../src/lib/customer/direction-preview';
import { inspectPng } from '../../src/lib/delivery/service';
import * as storage from '../../src/lib/core/storage';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
function input() {
  const f = fixture();
  return {
    ...f,
    siteInput: { site: f.production.site, design: f.design, facts: [f.fact], assets: [] },
    posterInput: {
      poster: f.production.posters[0],
      design: f.design,
      facts: [f.fact],
      assets: [],
      publicSiteUrl: 'https://oneboss.example/p/approved',
    },
  };
}
it('renders a real private PNG draft with its QR removed until publication', async () => {
  vi.stubEnv('APP_URL', 'https://oneboss.example');
  const f = input(),
    png = await renderPosterPreview(f.posterInput);
  const image = sharp(png),
    meta = await image.metadata();
  expect(meta.width).toBe(1080);
  expect(meta.height).toBe(1350);
  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  expect(jsQR(new Uint8ClampedArray(data), info.width, info.height)).toBeNull();
  expect((await image.stats()).channels.some((c) => c.stdev > 5)).toBe(true);
});
it('previews an unapproved direction without inventing approval or weakening the final renderer', () => {
  const f = input(),
    design = { ...f.design, approvedByClient: false };
  const mapped = directionPreview(f.projectId, 1, design, [f.fact]);
  expect(mapped.design.approvedByClient).toBe(false);
  expect(design.approvedByClient).toBe(false);
  expect(() => mapSite({ ...f.siteInput, design })).toThrow('DESIGN_VERSION_MISMATCH');
});
it('reuses B React rendering with approved references, information tabs and one outer main', async () => {
  const f = input();
  const html = renderToStaticMarkup(await renderSite(f.siteInput));
  expect(html).toContain('测试椅子');
  expect(html).toContain('data-oneboss-interaction="tabs"');
  expect(html).not.toContain('<main');
  expect(mapSite(f.siteInput).spec.pages[0].sections.some((s) => s.type === 'specs')).toBe(true);
  await expect(
    validateProduction({ production: f.production, design: f.design, facts: [f.fact], assets: [] }),
  ).resolves.toEqual({ pass: true, issues: [] });
});
it('never renders unconfirmed facts or a stale approved design', () => {
  const f = input();
  expect(() => mapSite({ ...f.siteInput, facts: [{ ...f.fact, verified: false }] })).toThrow(
    'UNAPPROVED_FACT',
  );
  expect(() => mapSite({ ...f.siteInput, design: { ...f.design, factVersion: 2 } })).toThrow(
    'DESIGN_VERSION_MISMATCH',
  );
});
it('applies website-only black/gold without changing the poster palette or leaking unused facts', async () => {
  const f = input();
  const site = structuredClone(f.production.site);
  site.pages[0].sections[0].props.variant = 'black-gold';
  const changed = mapSite({ ...f.siteInput, site });
  expect(changed.design.palette.background).toBe('#101010');
  expect(mapPoster(f.posterInput).design.palette.background).toBe(f.design.palette.background);
  const html = renderToStaticMarkup(
    await renderSite({
      ...f.siteInput,
      site,
      facts: [f.fact, { ...f.fact, id: f.copyId, value: '不应展示的私人备注' }],
    }),
  );
  expect(html).not.toContain('不应展示的私人备注');
});
it('requires signed public image URLs from the configured Supabase project', () => {
  const f = input();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://oneboss.supabase.co');
  const site = structuredClone(f.production.site);
  site.pages[0].sections[0].assetRefs = [f.factId];
  expect(() =>
    mapSite({
      ...f.siteInput,
      site,
      assets: [{ id: f.factId, url: 'https://other.example/private.png' }],
    }),
  ).toThrow('UNAUTHORIZED_ASSET_URL');
});
it('uses the actual B SVG engine and independently decodes its final PNG and standalone QR', async () => {
  vi.stubEnv('APP_URL', 'https://oneboss.example');
  const f = input();
  const result = await renderPoster(f.posterInput);
  await expect(
    inspectPng(
      result.pngBytes,
      1080,
      1350,
      f.posterInput.publicSiteUrl,
      'auto_bottom_right_or_left',
    ),
  ).resolves.toHaveProperty('sha256');
  await expect(
    inspectPng(result.qrBytes, 800, 800, f.posterInput.publicSiteUrl),
  ).resolves.toHaveProperty('sha256');
});
it('loads an authorized real image from Storage, and rejects foreign project paths before download', async () => {
  vi.stubEnv('APP_URL', 'https://oneboss.example');
  const f = input(),
    id = f.factId;
  const image = await sharp({
    create: { width: 500, height: 500, channels: 3, background: '#ff0000' },
  })
    .png()
    .toBuffer();
  const download = vi
    .fn()
    .mockResolvedValue({ data: new Blob([new Uint8Array(image)]), error: null });
  vi.spyOn(storage, 'storage').mockReturnValue({ download } as any);
  const poster = { ...f.posterInput.poster, assetRefs: [id] };
  const assets = [{ id, storage_path: `${f.orgId}/${f.projectId}/assets/${id}.png` }];
  const result = await renderPoster({ ...f.posterInput, poster, assets });
  const mapped = mapPoster({ ...f.posterInput, poster, assets });
  const { posterGeometry } =
    await import('../../src/vendor/creative-b/lib/creative/poster-renderer/geometry');
  const box = posterGeometry(mapped.spec.layout, 1350).art;
  const sample = await sharp(result.pngBytes)
    .extract({
      left: Math.round(box.x + box.width / 2),
      top: Math.round(box.y + box.height / 2),
      width: 1,
      height: 1,
    })
    .removeAlpha()
    .raw()
    .toBuffer();
  expect(sample[0]).toBeGreaterThan(240);
  expect(sample[1]).toBeLessThan(15);
  expect(download).toHaveBeenCalledTimes(1);
  await expect(
    renderPoster({
      ...f.posterInput,
      poster,
      assets: [{ id, storage_path: `${f.orgId}/foreign/assets/${id}.png` }],
    }),
  ).rejects.toThrow('UNAUTHORIZED_ASSET_PATH');
  expect(download).toHaveBeenCalledTimes(1);
});
it('refuses a poster whose confirmed headline would be silently clipped by the B layout', async () => {
  const f = input();
  const result = await validateProduction({
    production: f.production,
    design: f.design,
    facts: [{ ...f.fact, value: '非常长的产品名称'.repeat(50) }],
    assets: [],
  });
  expect(result).toEqual({ pass: false, issues: ['POSTER_HEADLINE_OVERFLOW'] });
});
it('formats approved product prices without mixing service fees or fabricating undisclosed prices', () => {
  expect(
    displayFact({ amountMinor: 18980000, currency: 'CNY', unit: '辆', priceType: 'guide_price' }),
  ).toBe('指导价 ¥189800/辆');
  expect(
    displayFact({ amountMinor: null, currency: 'CNY', unit: '件', priceType: 'not_disclosed' }),
  ).toBe('价格未公开');
});
