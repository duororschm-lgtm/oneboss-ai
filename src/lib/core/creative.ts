import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ReactNode } from 'react';
import type { z } from 'zod';
import { DesignSystem, Production, SiteSpec, PosterSpec } from '../../contracts';
import { AppError } from './errors';
export interface CreativeAdapter {
  renderPosterPreview?(input: Parameters<CreativeAdapter['renderPoster']>[0]): Promise<Uint8Array>;
  renderSite(input: {
    pageSlug?: string;
    site: z.infer<typeof SiteSpec>;
    design: z.infer<typeof DesignSystem>;
    facts: unknown[];
    assets: unknown[];
  }): Promise<ReactNode> | ReactNode;
  renderPoster(input: {
    poster: z.infer<typeof PosterSpec>;
    design: z.infer<typeof DesignSystem>;
    facts: unknown[];
    assets: unknown[];
    publicSiteUrl: string;
  }): Promise<{ pngBytes: Uint8Array; qrBytes: Uint8Array }>;
  validateProduction(input: {
    production: z.infer<typeof Production>;
    design?: z.infer<typeof DesignSystem>;
    facts: unknown[];
    assets: unknown[];
  }): Promise<{ pass: boolean; issues: string[] }>;
}
export async function creative(): Promise<CreativeAdapter> {
  const path = process.env.CREATIVE_ADAPTER_MODULE;
  if (!path) throw new AppError('B_RENDERER_NOT_CONNECTED', 503);
  if (path === 'builtin:b') return import('../creative/b-adapter');
  // Deployment-controlled module, never taken from requests or model output.
  if (!isAbsolute(path)) throw new AppError('B_ADAPTER_PATH_MUST_BE_ABSOLUTE', 503);
  const adapter = await import(/* webpackIgnore: true */ pathToFileURL(path).href);
  for (const name of ['renderSite', 'renderPoster', 'validateProduction'])
    if (typeof adapter[name] !== 'function') throw new AppError('B_ADAPTER_INVALID', 503);
  return adapter as CreativeAdapter;
}
