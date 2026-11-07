import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { SiteSpec, PosterSpec, ProductPrice, ChangeRequest, Brief } from '../../src/contracts';
import { validateProduction } from '../../src/lib/core/validation';
import { publicAddress, appOrigin } from '../../src/lib/security/network';
import { fixture } from '../fixtures';
describe('shared contracts and production boundaries', () => {
  it('accepts a bounded real production contract', () => {
    const f = fixture();
    expect(() => validateProduction(f.production, f.projectId, 1, [f.fact], [], 2)).not.toThrow();
  });
  it('requires the exact requested poster quantity and selected dimensions', () => {
    const f = fixture();
    const requested = {
      site: true,
      posterCount: 1,
      posterFormats: ['square'],
      xhsCopy: true,
    } as const;
    const options = { ...requested, posterFormats: ['square' as const] };
    expect(() =>
      validateProduction(f.production, f.projectId, 1, [f.fact], [], 2, options),
    ).toThrow('POSTER_FORMAT_MISMATCH');
    f.production.posters[0].canvas = { width: 1080, height: 1080 };
    expect(() =>
      validateProduction(f.production, f.projectId, 1, [f.fact], [], 2, options),
    ).not.toThrow();
    expect(() =>
      validateProduction(f.production, f.projectId, 1, [f.fact], [], 2, {
        ...options,
        posterCount: 2,
      }),
    ).toThrow('POSTER_COUNT_MISMATCH');
    const deliverables = Brief.shape.deliverables;
    expect(deliverables.safeParse(options).success).toBe(true);
    expect(deliverables.safeParse({ ...options, posterCount: 2 }).success).toBe(false);
    expect(deliverables.safeParse({ site: true, posterCount: 1, xhsCopy: true }).success).toBe(
      true,
    );
  });
  it.each(['javascript', 'html', 'onClick'])('rejects executable prop %s', (key) => {
    const f = fixture();
    (f.production.site.pages[0].sections[0].props as Record<string, unknown>)[key] = 'alert(1)';
    expect(SiteSpec.safeParse(f.production.site).success).toBe(false);
  });
  it('rejects foreign/unverified facts and stale versions', () => {
    const f = fixture();
    expect(() => validateProduction(f.production, f.projectId, 2, [f.fact], [], 2)).toThrow(
      'STALE',
    );
    expect(() =>
      validateProduction(f.production, f.projectId, 1, [{ ...f.fact, verified: false }], [], 2),
    ).toThrow('UNAPPROVED');
  });
  it('rejects foreign assets', () => {
    const f = fixture();
    f.production.site.pages[0].sections[0].assetRefs = [randomUUID()];
    expect(() => validateProduction(f.production, f.projectId, 1, [f.fact], [], 2)).toThrow(
      'UNAUTHORIZED',
    );
  });
  it('requires a related root catalog covering every approved product', () => {
    const f = fixture();
    const other = { ...f.fact, id: randomUUID(), productId: randomUUID(), value: '第二款产品' };
    expect(() => validateProduction(f.production, f.projectId, 1, [f.fact, other], [], 2)).toThrow(
      'MULTIPRODUCT_CATALOG_REQUIRED',
    );
    f.production.site.pages[0].sections.push({
      type: 'product-grid',
      props: {},
      factRefs: [f.fact.id, other.id],
      assetRefs: [],
    });
    f.production.site.allowedSectionTypes.push('product-grid');
    expect(() =>
      validateProduction(f.production, f.projectId, 1, [f.fact, other], [], 2),
    ).not.toThrow();
  });
  it('rejects arbitrary QR URL and unsupported dimensions', () => {
    const f = fixture();
    expect(
      PosterSpec.safeParse({ ...f.production.posters[0], qr: { url: 'https://attacker.test' } })
        .success,
    ).toBe(false);
    expect(
      PosterSpec.safeParse({ ...f.production.posters[0], canvas: { width: 10, height: 10 } })
        .success,
    ).toBe(false);
  });
  it('separates guide prices and undisclosed prices', () => {
    expect(
      ProductPrice.parse({
        amountMinor: 18980000,
        currency: 'CNY',
        unit: '辆',
        priceType: 'guide_price',
      }).amountMinor,
    ).toBe(18980000);
    expect(
      ProductPrice.parse({
        amountMinor: null,
        currency: 'CNY',
        unit: '件',
        priceType: 'not_disclosed',
      }).amountMinor,
    ).toBeNull();
  });
  it('requires a concrete modification scope and base version', () => {
    expect(
      ChangeRequest.safeParse({ instruction: '修改', baseRevision: 0, targetArtifacts: 'all' })
        .success,
    ).toBe(false);
  });
  it.each([
    '127.0.0.1',
    '10.1.1.1',
    '169.254.169.254',
    '172.17.0.1',
    '192.168.1.1',
    '100.64.0.1',
    '::1',
    '::ffff:127.0.0.1',
    'fe80::1',
    'fc00::1',
  ])('blocks private destination %s', (ip) => expect(publicAddress(ip)).toBe(false));
  it('allows global addresses', () => {
    expect(publicAddress('8.8.8.8')).toBe(true);
    expect(publicAddress('2606:4700::1111')).toBe(true);
  });
  it('rejects loopback deployment configuration', () => {
    const old = process.env.APP_URL;
    process.env.APP_URL = 'https://localhost';
    try {
      expect(() => appOrigin()).toThrow('PUBLIC_HOST');
    } finally {
      if (old) process.env.APP_URL = old;
      else delete process.env.APP_URL;
    }
  });
});
