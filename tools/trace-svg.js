/**
 * Traces a .bin pixel map into an SVG file.
 * Each UI element becomes a <g class="ElementName"> group of merged rectangles.
 * The SVG uses CSS variables for theming — swap --ElementName to recolor.
 *
 * Usage:  node tools/trace-svg.js <map-name> [output.svg]
 * Example: node tools/trace-svg.js maps/pattern maps/pattern.svg
 */

import fs from 'fs';

const mapName = process.argv[2];
const outFile = process.argv[3] || `${mapName}.svg`;

if (!mapName) {
  console.error('Usage: node tools/trace-svg.js <map-name> [output.svg]');
  process.exit(1);
}

const meta = JSON.parse(fs.readFileSync(`${mapName}.json`, 'utf-8'));
const indexMap = new Uint8Array(fs.readFileSync(`${mapName}.bin`));
const { width, height, elements } = meta;

console.log(`Tracing ${mapName} (${width}×${height}, ${elements.length} elements)...`);

/**
 * Convert all pixels of one element into merged rectangles.
 * Algorithm: scanline horizontal runs, then merge vertically adjacent
 * runs with identical x and width into taller rects.
 */
function buildRects(elementIndex) {
  // active: Map<"x,w", startY>
  const active = new Map();
  const rects = [];

  for (let y = 0; y < height; y++) {
    const base = y * width;
    const currentKeys = new Set();

    // Find horizontal runs in this row
    let runStart = -1;
    for (let x = 0; x <= width; x++) {
      const match = x < width && indexMap[base + x] === elementIndex;
      if (match && runStart === -1) {
        runStart = x;
      } else if (!match && runStart !== -1) {
        currentKeys.add(`${runStart},${x - runStart}`);
        runStart = -1;
      }
    }

    // Close strips that didn't continue into this row
    for (const [key, startY] of active) {
      if (!currentKeys.has(key)) {
        const [x, w] = key.split(',').map(Number);
        rects.push({ x, y: startY, w, h: y - startY });
        active.delete(key);
      }
    }

    // Open new strips
    for (const key of currentKeys) {
      if (!active.has(key)) active.set(key, y);
    }
  }

  // Close remaining strips at bottom
  for (const [key, startY] of active) {
    const [x, w] = key.split(',').map(Number);
    rects.push({ x, y: startY, w, h: height - startY });
  }

  return rects;
}

const parts = [
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`,
];

// CSS variables — default transparent so unmapped areas show the base screenshot through
const cssLines = elements.map(n => `  .${n}{fill:var(--${n},transparent)}`);
parts.push(`<style>\n${cssLines.join('\n')}\n</style>`);

let totalRects = 0;
let coveredPixels = 0;
const elementStats = [];

for (let i = 0; i < elements.length; i++) {
  const rects = buildRects(i);
  if (rects.length === 0) continue;

  const pixels = rects.reduce((s, r) => s + r.w * r.h, 0);
  coveredPixels += pixels;
  totalRects += rects.length;
  elementStats.push({ name: elements[i], rects: rects.length, pixels });

  const rectStrs = rects.map(r => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}"/>`);
  parts.push(`<g class="${elements[i]}">${rectStrs.join('')}</g>`);
}

parts.push('</svg>');

const svg = parts.join('\n');
fs.writeFileSync(outFile, svg, 'utf-8');

const coverage = (coveredPixels / (width * height) * 100).toFixed(1);
const kb = (svg.length / 1024).toFixed(0);

console.log(`\n✅ ${outFile}`);
console.log(`   ${elements.length} elements · ${totalRects.toLocaleString()} rects · ${coverage}% coverage · ${kb} KB\n`);

// Top 10 elements by pixel area
const top = elementStats.sort((a, b) => b.pixels - a.pixels).slice(0, 10);
console.log('Top elements by area:');
for (const e of top) {
  const pct = (e.pixels / (width * height) * 100).toFixed(1);
  console.log(`  ${e.name.padEnd(42)} ${String(e.pixels).padStart(8)}px  ${pct.padStart(5)}%  (${e.rects} rects)`);
}
