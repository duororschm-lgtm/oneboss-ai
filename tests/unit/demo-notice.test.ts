import { it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DemoNotice } from '../../src/lib/publishing/demo-notice';

it('renders an explicit no-payment demo notice with Beijing expiry, and nothing for ordinary projects', () => {
  const html = renderToStaticMarkup(
    createElement(DemoNotice, { demo: { expiresAt: '2027-02-05T16:00:00.000Z' } }),
  );
  expect(html).toContain('data-oneboss-demo="true"');
  expect(html).toContain('DEMO 演示项目');
  expect(html).toContain('无真实收款');
  expect(html).toContain('2027/02/06');
  expect(renderToStaticMarkup(createElement(DemoNotice, {}))).toBe('');
});
