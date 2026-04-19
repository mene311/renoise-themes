/**
 * Generates a high-contrast text-extraction theme: all UI elements white,
 * all font/text elements black. Use this to take screenshots for the text
 * mask pipeline in build-maps.js — no OCR needed, just black pixel detection.
 *
 * Usage:  node tools/generate-text-theme.js [base.xrnc]
 * Output: text-theme.xrnc
 *
 * Next steps:
 *   1. Load text-theme.xrnc in Renoise
 *   2. Screenshot each view (pattern, mixer, waveform)
 *   3. Save as text-theme-pattern.png / text-theme-mixer.png / text-theme-waveform.png
 *   4. Run build-maps.js — it will auto-detect these and use them for text masking
 */

import fs from 'fs';

const baseFile = process.argv[2] || `${process.env.HOME}/.config/Renoise/V3.5.4/Themes/Default.xrnc`;

if (!fs.existsSync(baseFile)) {
  console.error(`File not found: ${baseFile}`);
  process.exit(1);
}

const xml = fs.readFileSync(baseFile, 'utf-8');
const COLOR_RE = /<(\w+)>(\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3})<\/\1>/g;

let newXml = xml;
let fontCount = 0, bgCount = 0;

let m;
while ((m = COLOR_RE.exec(xml)) !== null) {
  const name = m[1];
  if (/^Default_Color_\d+$/.test(name)) continue;

  const isFont = /Font/i.test(name);
  const [r, g, b] = isFont ? [0, 0, 0] : [255, 255, 255];
  newXml = newXml.replace(m[0], `<${name}>${r},${g},${b}</${name}>`);

  if (isFont) fontCount++; else bgCount++;
}

fs.writeFileSync('text-theme.xrnc', newXml, 'utf-8');
console.log(`✅ text-theme.xrnc`);
console.log(`   ${fontCount} font elements → black (0,0,0)`);
console.log(`   ${bgCount} background/UI elements → white (255,255,255)`);
console.log(`
Next steps:
  1. Load text-theme.xrnc in Renoise
  2. Screenshot pattern, mixer, and waveform views
  3. Save as:
       text-theme-pattern.png
       text-theme-mixer.png
       text-theme-waveform.png
  4. Run build-maps.js — text masking is automatic
`);
