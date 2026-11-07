import { createElement } from 'react';
import sharp from 'sharp';
import QRCode from 'qrcode';
import { z } from 'zod';
import type { CreativeAdapter } from '../core/creative';
import { assert, AppError } from '../core/errors';
import { storage } from '../core/storage';
import { appOrigin } from '../security/network';
import { mapPoster, mapSite } from './b-mapping';
import { SiteRenderer } from '../../vendor/creative-b/components/site-renderer/SiteRenderer';
import { buildPosterSvg, fitText } from '../../vendor/creative-b/lib/creative/poster-renderer/svg';
import { posterGeometry } from '../../vendor/creative-b/lib/creative/poster-renderer/geometry';

export const renderSite: CreativeAdapter['renderSite'] = (input) => {
  const mapped = mapSite(input);
  return createElement(SiteRenderer, {
    spec: mapped.spec,
    designSystem: mapped.design,
    seed: mapped.seed,
    mode: 'public',
  });
};
function checkText(mapped: ReturnType<typeof mapPoster>) {
  const geo = posterGeometry(mapped.spec.layout, mapped.spec.canvas.height);
  const headline = fitText(mapped.spec.headline, geo.headline.width, geo.headline.height, {
    max:
      mapped.spec.layout === 'bold-editorial'
        ? 104
        : mapped.spec.layout === 'future-grid'
          ? 92
          : 98,
    min: mapped.spec.layout === 'bold-editorial' ? 44 : 42,
    maxLines: 3,
  });
  const subhead = fitText(mapped.spec.subhead, geo.subhead.width, geo.subhead.height, {
    max: mapped.spec.layout === 'future-grid' ? 27 : 30,
    min:
      mapped.spec.layout === 'editorial-premium'
        ? 22
        : mapped.spec.layout === 'future-grid'
          ? 20
          : 21,
    maxLines: 2,
  });
  const compact = (value: string) => value.replace(/\s/g, '');
  assert(
    compact(headline.lines.join('')) === compact(mapped.spec.headline),
    'POSTER_HEADLINE_OVERFLOW',
  );
  assert(
    compact(subhead.lines.join('')) === compact(mapped.spec.subhead),
    'POSTER_SUBHEAD_OVERFLOW',
  );
  assert(mapped.warnings.length === 0, 'POSTER_LAYOUT_CONFLICT');
}
export const renderPoster: CreativeAdapter['renderPoster'] = async (input) => {
  const url = new URL(input.publicSiteUrl);
  assert(
    url.origin === appOrigin() && url.pathname.startsWith('/p/') && !url.search && !url.hash,
    'UNTRUSTED_PUBLIC_URL',
  );
  const mapped = mapPoster(input);
  checkText(mapped);
  let image = sharp(Buffer.from(buildPosterSvg(mapped.spec, mapped.design, mapped.seed)), {
    limitInputPixels: 20_000_000,
  });
  if (mapped.spec.assetRef) {
    const asset = z
      .object({ id: z.uuid(), storage_path: z.string() })
      .parse(input.assets.find((value) => (value as { id?: string }).id === mapped.spec.assetRef));
    // The trusted DB snapshot supplies this path. Never fetch a customer URL for server rendering.
    assert(
      new RegExp(`^[a-f0-9-]{36}/${input.poster.projectId}/assets/${asset.id}\\.png$`).test(
        asset.storage_path,
      ),
      'UNAUTHORIZED_ASSET_PATH',
    );
    const { data, error } = await storage().download(asset.storage_path);
    assert(!error && data && data.size <= 20 * 1024 * 1024, 'ASSET_DOWNLOAD_FAILED', 502);
    const region = posterGeometry(mapped.spec.layout, mapped.spec.canvas.height).art;
    const bytes = await sharp(Buffer.from(await data.arrayBuffer()), {
      limitInputPixels: 40_000_000,
    })
      .resize(Math.round(region.width), Math.round(region.height), {
        fit: 'contain',
        background: mapped.design.palette.surface,
      })
      .png()
      .toBuffer();
    image = image.composite([
      { input: bytes, left: Math.round(region.x), top: Math.round(region.y) },
    ]);
  }
  return {
    pngBytes: await image.png().toBuffer(),
    qrBytes: await QRCode.toBuffer(input.publicSiteUrl, {
      width: 800,
      margin: 4,
      errorCorrectionLevel: 'H',
    }),
  };
};
export const validateProduction: CreativeAdapter['validateProduction'] = async (input) => {
  try {
    assert(input.design, 'DESIGN_APPROVAL_REQUIRED');
    for (const page of input.production.site.pages)
      mapSite(
        {
          site: input.production.site,
          design: input.design,
          facts: input.facts,
          assets: input.assets,
          pageSlug: page.slug,
        },
        false,
      );
    for (const poster of input.production.posters)
      checkText(
        mapPoster({
          poster,
          design: input.design,
          facts: input.facts,
          assets: input.assets,
          publicSiteUrl: 'https://validation.invalid/p/draft',
        }),
      );
    return { pass: true, issues: [] };
  } catch (error) {
    return {
      pass: false,
      issues: [error instanceof AppError ? error.code : 'B_RENDER_INPUT_INVALID'],
    };
  }
};
