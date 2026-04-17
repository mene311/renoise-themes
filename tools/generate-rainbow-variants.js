/**
 * Generates 4 diametrically opposite rainbow themes from a base .xrnc.
 * Each element gets a unique color per variant; different variants use
 * different hue ranges so boundary-ambiguous pixels in one are clear in another.
 *
 * Usage:  node tools/generate-rainbow-variants.js [base.xrnc]
 * Output: rainbow-A.xrnc  rainbow-B.xrnc  rainbow-C.xrnc  rainbow-D.xrnc
 *         rainbow-A-legend.json  ...  (hex → element name, array format)
 */

import fs from 'fs';

const baseFile = process.argv[2] || `${process.env.HOME}/.config/Renoise/V3.5.4/Themes/Default.xrnc`;

if (!fs.existsSync(baseFile)) {
  console.error(`File not found: ${baseFile}`);
  console.error('Usage: node tools/generate-rainbow-variants.js [base.xrnc]');
  process.exit(1);
}

const xml = fs.readFileSync(baseFile, 'utf-8');

// Four variants: different hue offsets + saturation/lightness profiles
// "Diametrically opposite" = elements that are hue-neighbors in A are far apart in B, C, D
const VARIANTS = [
  { name: 'A', hueStart:   0, sat: 0.85, litMin: 0.40, litMax: 0.70, desc: 'Warm-start, mid lightness'     },
  { name: 'B', hueStart:  90, sat: 0.90, litMin: 0.60, litMax: 0.80, desc: 'Cool-start, high lightness'    },
  { name: 'C', hueStart: 180, sat: 0.80, litMin: 0.25, litMax: 0.50, desc: 'Teal-start, dark'              },
  { name: 'D', hueStart: 270, sat: 0.95, litMin: 0.35, litMax: 0.65, desc: 'Purple-start, ultra-saturated' },
];

const GOLDEN = 0.618033988749895;

function hslToRgb(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  };
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

// Collect color elements (skip track colors — they're user-defined, not UI)
const COLOR_RE = /<(\w+)>(\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3})<\/\1>/g;
const elements = [];
let m;
while ((m = COLOR_RE.exec(xml)) !== null) {
  if (/^Default_Color_\d+$/.test(m[1])) continue;
  elements.push({ name: m[1], original: m[2], full: m[0] });
}

console.log(`Base: ${baseFile}`);
console.log(`Elements: ${elements.length} color entries\n`);

for (const v of VARIANTS) {
  let hue = v.hueStart;
  let newXml = xml;
  const legend = [];

  for (let i = 0; i < elements.length; i++) {
    hue = (hue + GOLDEN * 360) % 360;
    // Oscillate lightness within the variant's range
    const t = (i % 7) / 6;
    const lit = v.litMin + t * (v.litMax - v.litMin);
    const [r, g, b] = hslToRgb(hue, v.sat, lit);
    const hex = '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');

    legend.push({ element: elements[i].name, hex, original: elements[i].original });
    newXml = newXml.replace(elements[i].full, `<${elements[i].name}>${r},${g},${b}</${elements[i].name}>`);
  }

  fs.writeFileSync(`rainbow-${v.name}.xrnc`, newXml, 'utf-8');
  fs.writeFileSync(`rainbow-${v.name}-legend.json`, JSON.stringify(legend, null, 2), 'utf-8');
  console.log(`✅ rainbow-${v.name}.xrnc  (${v.desc})`);
}

console.log(`
╔══════════════════════════════════════════════════════════════════╗
║  NEXT STEPS                                                      ║
║                                                                  ║
║  For each rainbow-*.xrnc:                                        ║
║    1. Preferences → Theme → Load Theme → pick the file           ║
║    2. Open a song with full mixer/patterns/waveform content       ║
║    3. Screenshot Pattern Editor, Mixer, and Waveform views       ║
║                                                                  ║
║  Name the files:                                                 ║
║    screenshot-A-pattern.png   screenshot-A-mixer.png   ...       ║
║    screenshot-B-pattern.png   screenshot-B-mixer.png   ...       ║
║    screenshot-C-pattern.png   screenshot-C-mixer.png   ...       ║
║    screenshot-D-pattern.png   screenshot-D-mixer.png   ...       ║
║                                                                  ║
║  Then run:  node tools/build-maps.js                             ║
╚══════════════════════════════════════════════════════════════════╝
`);
