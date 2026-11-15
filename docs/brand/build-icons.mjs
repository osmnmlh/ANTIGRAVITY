// Regenerates every app icon from docs/brand/antigravity-logo.svg (the single source).
// Usage (from repo root): node docs/brand/build-icons.mjs
// Needs Playwright + Chromium available to Node (require('playwright')) and ImageMagick `convert`
// to strip the alpha channel from the Apple icons (Apple rejects transparent app icons).
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const master = readFileSync('docs/brand/antigravity-logo.svg', 'utf8');
// Browser-tab variant: same artwork on a rounded square so it reads as a tile.
const rounded = master.replace(
  '<rect width="1024" height="1024" fill="#0f1013"/>',
  '<rect width="1024" height="1024" rx="224" fill="#0f1013"/>',
);

const apple = 'mobile/ios/Antigravity_mobil_saat/Antigravity_mobil_saat';
const outputs = [
  // [svg, path, size, opaque]
  [rounded, 'web/public/favicon-32.png', 32, false],
  [rounded, 'web/public/icon-192.png', 192, false],
  [rounded, 'web/public/icon-512.png', 512, false],
  [master, 'web/public/apple-touch-icon.png', 180, true],
  [master, `${apple}/Antigravity_iOS/Resources/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png`, 1024, true],
  [master, `${apple}/Antigravity_watchOS/Resources/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png`, 1024, true],
];

writeFileSync('web/public/favicon.svg', rounded);

const browser = await chromium.launch();
for (const [svg, path, size, opaque] of outputs) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const sized = svg.replace('<svg ', `<svg width="${size}" height="${size}" `);
  await page.setContent(`<html><body style="margin:0;background:transparent">${sized}</body></html>`);
  await page.screenshot({ path, omitBackground: !opaque, clip: { x: 0, y: 0, width: size, height: size } });
  await page.close();
  if (opaque) execFileSync('convert', [path, '-background', '#0f1013', '-alpha', 'remove', '-alpha', 'off', path]);
  console.log('wrote', path);
}
await browser.close();
