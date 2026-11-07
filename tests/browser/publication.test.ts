import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdir } from 'node:fs/promises';
import { chromium, type Page } from 'playwright-core';
import * as network from '../../src/lib/security/network';
import { verifyPublishedBrowser } from '../../src/lib/publishing/browser';
const originalLaunch = chromium.launch.bind(chromium);
let lastPage: Page;
let mode = 'valid',
  revision = 1,
  product = 'Product A';
const html = () =>
  `<!doctype html><html><body style="margin:0"><main data-oneboss-revision="${revision}"><h1>${product}</h1><button data-oneboss-interaction aria-pressed="false" onclick="${mode === 'inert' ? 'void 0' : `this.setAttribute('aria-pressed',this.getAttribute('aria-pressed')==='true'?'false':'true')`}">Details</button>${mode === 'broken' ? '<img src="/broken.png">' : ''}</main><script>${mode === 'errors' ? "setTimeout(()=>{throw new Error('fixture')},0);" : ''}setInterval(()=>fetch('/poll').catch(()=>{}),100);</script></body></html>`;
beforeEach(() => {
  process.env.APP_URL = 'https://oneboss.example';
  vi.spyOn(network, 'verifyPublicUrl').mockImplementation(
    async () => `data-oneboss-revision="${revision}"`,
  );
  vi.spyOn(chromium, 'launch').mockImplementation(async (options) => {
    const browser = await originalLaunch(options);
    const create = browser.newContext.bind(browser);
    vi.spyOn(browser, 'newContext').mockImplementation(async (options) => {
      const context = await create(options);
      await context.route('**/*', async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path === '/poll') return route.fulfill({ body: '{}', contentType: 'application/json' });
        if (path === '/broken.png') return route.fulfill({ status: 404, body: '' });
        return route.fulfill({ body: html(), contentType: 'text/html' });
      });
      context.on('page', (page) => {
        lastPage = page;
      });
      return context;
    });
    return browser;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
it('reproduces networkidle false timeout on continuous requests; explicit content QA succeeds', async () => {
  mode = 'valid';
  revision = 1;
  const browser = await chromium.launch(process.platform === 'win32' ? { channel: 'msedge' } : {});
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await expect(
      page.goto('https://oneboss.example/p/test', { waitUntil: 'networkidle', timeout: 1200 }),
    ).rejects.toThrow();
  } finally {
    await browser.close();
  }
  expect(await verifyPublishedBrowser('test', 1)).toHaveLength(3);
});
it.each([
  ['Product A', 1],
  ['Product B', 2],
] as const)(
  'checks real ARIA-only interaction for %s revision %s at three widths',
  async (name, rev) => {
    mode = 'valid';
    product = name;
    revision = rev;
    expect(
      await verifyPublishedBrowser('test', rev, {
        publicationToken: '11111111-1111-4111-8111-111111111111',
        onStage: async (stage) => {
          if (stage.endsWith('-interaction')) {
            await mkdir('.cache/publish-browser', { recursive: true });
            await lastPage.screenshot({
              path: `.cache/publish-browser/${name.replaceAll(' ', '-')}-${stage}.png`,
            });
          }
        },
      }),
    ).toEqual([375, 768, 1280].map((width) => ({ width, revision: rev, passed: true })));
  },
);
it('rejects a static marked control instead of passing because unrelated requests continue', async () => {
  mode = 'inert';
  revision = 1;
  await expect(verifyPublishedBrowser('test', 1)).rejects.toThrow('INTERACTION_QA_FAILED');
});
it('rejects an actual broken image', async () => {
  mode = 'broken';
  revision = 1;
  await expect(verifyPublishedBrowser('test', 1)).rejects.toThrow('BROKEN_IMAGE');
});
it('rejects a different public revision', async () => {
  mode = 'valid';
  revision = 2;
  await expect(verifyPublishedBrowser('test', 1)).rejects.toThrow('PUBLIC_REVISION_MISMATCH');
});
it('rejects page JavaScript errors', async () => {
  mode = 'errors';
  revision = 1;
  await expect(verifyPublishedBrowser('test', 1)).rejects.toThrow('BROWSER_ERRORS');
});
it('classifies missing Chromium safely', async () => {
  vi.mocked(chromium.launch).mockRejectedValue(new Error('sensitive internal path'));
  await expect(verifyPublishedBrowser('test', 1)).rejects.toThrow('BROWSER_LAUNCH_FAILED');
});
