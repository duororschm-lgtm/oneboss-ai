import { it, expect } from 'vitest';
import QRCode from 'qrcode';
import sharp from 'sharp';
import { inspectPng } from '../../src/lib/delivery/service';
const url = 'https://oneboss.example/p/test';
it('decodes an actual QR embedded in a full-size PNG', async () => {
  const qr = await QRCode.toBuffer(url, { width: 300, margin: 4 });
  const png = await sharp({
    create: { width: 1080, height: 1350, channels: 4, background: '#f1f1f1' },
  })
    .composite([{ input: qr, left: 750, top: 1020 }])
    .png()
    .toBuffer();
  const result = await inspectPng(png, 1080, 1350, url);
  expect(result.sha256).toHaveLength(64);
  expect(result.size).toBeGreaterThan(1000);
  await expect(inspectPng(png, 1080, 1080, url)).rejects.toThrow('DIMENSION');
  await expect(inspectPng(png, 1080, 1350, 'https://wrong.example')).rejects.toThrow('QR_TARGET');
  await expect(inspectPng(png, 1080, 1350, url, 'bottom-right')).resolves.toBeDefined();
  await expect(inspectPng(png, 1080, 1350, url, 'bottom-left')).rejects.toThrow('QR_PLACEMENT');
});
it('requires the poster QR in an approved bottom corner', async () => {
  const qr = await QRCode.toBuffer(url, { width: 300, margin: 4 });
  const poster = (left: number, top: number) =>
    sharp({
      create: { width: 1080, height: 1350, channels: 4, background: '#f1f1f1' },
    })
      .composite([{ input: qr, left, top }])
      .png()
      .toBuffer();
  await expect(
    inspectPng(await poster(30, 1020), 1080, 1350, url, 'auto_bottom_right_or_left'),
  ).resolves.toBeDefined();
  await expect(
    inspectPng(await poster(390, 30), 1080, 1350, url, 'auto_bottom_right_or_left'),
  ).rejects.toThrow('QR_PLACEMENT');
});
it('rejects an empty/uniform image and disguised non-PNG data', async () => {
  await expect(inspectPng(Buffer.from('not a PNG'), 1080, 1350, url)).rejects.toThrow(
    'INVALID_PNG',
  );
  const blank = await sharp({
    create: { width: 1080, height: 1350, channels: 4, background: '#ffffff' },
  })
    .png()
    .toBuffer();
  await expect(inspectPng(blank, 1080, 1350, url)).rejects.toThrow('BLANK_PNG');
});
