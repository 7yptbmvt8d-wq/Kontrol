// Génère les icônes PNG à partir de public/icons/icon.svg (Chromium via Playwright).
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { readFileSync } from 'node:fs';

const svg = readFileSync('public/icons/icon.svg', 'utf8');
// Version maskable : fond plein, pictogramme réduit à 80 % (marge de sécurité 10 %).
const inner = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/<rect[^>]*\/>/, '');
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180"><rect width="180" height="180" fill="#1B263B"/><g transform="translate(18 18) scale(0.8)">${inner}</g></svg>`;
// apple-touch-icon : iOS arrondit lui-même, on remplit le carré.
const plein = svg.replace(/rx="40"/, '');

const jobs = [
  ['icon-180.png', 180, plein],
  ['icon-192.png', 192, svg],
  ['icon-512.png', 512, svg],
  ['icon-maskable-512.png', 512, maskable],
];
const browser = await chromium.launch();
for (const [name, size, src] of jobs) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const html = `<html><body style="margin:0;background:transparent">${src.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`;
  await page.setContent(html);
  await page.screenshot({ path: `public/icons/${name}`, omitBackground: true });
  await page.close();
}
await browser.close();
console.log('Icônes générées.');
