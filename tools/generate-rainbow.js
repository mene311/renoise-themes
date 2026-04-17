import fs from 'fs';

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node tools/generate-rainbow.js <path-to-xrnc>');
  process.exit(1);
}

const xml = fs.readFileSync(filePath, 'utf-8');

const colorRegex = /<(\w+)>(\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3})<\/\w+>/g;

function hslToRgb(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  };
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

const golden = 0.618033988749895;
let hue = 0;
let colorIndex = 0;
const legend = [];

const newXml = xml.replace(colorRegex, (full, name, originalRgb) => {
  // Skip track colors — leave them alone
  if (/^Default_Color_\d+$/.test(name)) {
    return full;
  }

  hue = (hue + golden) % 1;
  const sat = 0.7 + (colorIndex % 3) * 0.1;
  const lit = 0.3 + (colorIndex % 5) * 0.1;
  const [r, g, b] = hslToRgb(hue * 360, sat, lit);
  const hex = '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');

  legend.push({ element: name, hex, original: originalRgb.trim() });
  colorIndex++;

  return `<${name}>${r},${g},${b}</${name}>`;
});

fs.writeFileSync('rainbow-theme.xrnc', newXml, 'utf-8');
fs.writeFileSync('rainbow-legend.json', JSON.stringify(legend, null, 2), 'utf-8');

console.log(`Rainbowed ${colorIndex} colors (skipped 16 track colors)\n`);
console.log('COLOR LEGEND:');
console.log('─'.repeat(60));
for (const entry of legend) {
  console.log(`  ${entry.hex}  →  ${entry.element}`);
}

console.log(`
══════════════════════════════════════════
  1. Open Renoise
  2. Edit → Preferences → Theme → Import
  3. Load: rainbow-theme.xrnc
  4. Screenshot the whole window
  5. Come back and show me!
══════════════════════════════════════════
`);
