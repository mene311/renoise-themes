/**
 * Processes up to 4 rainbow variant screenshots for a single view,
 * merges them via majority vote, outputs .bin/.json and traces an SVG.
 *
 * Usage:  node tools/build-maps.js <view> <ss-A.png> [ss-B.png] [ss-C.png] [ss-D.png]
 * Example: node tools/build-maps.js pattern screenshot-A-pattern.png screenshot-B-pattern.png ...
 *
 * Expects rainbow-A-legend.json ... rainbow-D-legend.json in the project root.
 * Outputs: maps/<view>.bin  maps/<view>.json  maps/<view>.svg
 */

import fs from 'fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const VARIANT_NAMES = ['A', 'B', 'C', 'D'];
const UNMATCHED = 255;
const MAX_DIST = 2500; // ~50 per RGB channel — handles JPEG/PNG compression artifacts

const view = process.argv[2];
const screenshots = process.argv.slice(3);

if (!view || screenshots.length === 0) {
  console.error('Usage: node tools/build-maps.js <view> <ss-A.png> [ss-B.png] [ss-C.png] [ss-D.png]');
  console.error('Example: node tools/build-maps.js pattern screenshot-A-pattern.png ...');
  process.exit(1);
}

// Load legends for available variants
function loadLegend(variant) {
  const path = `rainbow-${variant}-legend.json`;
  if (!fs.existsSync(path)) return null;
  const raw = JSON.parse(fs.readFileSync(path, 'utf-8'));
  // Array format: [{ element, hex, original }]
  return raw.map((e, i) => ({
    index: i,
    name: e.element,
    r: parseInt(e.hex.slice(1, 3), 16),
    g: parseInt(e.hex.slice(3, 5), 16),
    b: parseInt(e.hex.slice(5, 7), 16),
  }));
}

function nearestElement(legend, r, g, b) {
  let best = UNMATCHED;
  let bestDist = Infinity;
  for (const el of legend) {
    const d = (r - el.r) ** 2 + (g - el.g) ** 2 + (b - el.b) ** 2;
    if (d < bestDist) { bestDist = d; best = el.index; }
  }
  return bestDist <= MAX_DIST ? best : UNMATCHED;
}

async function processScreenshot(imagePath, legend) {
  const img = await loadImage(fs.readFileSync(imagePath));
  const W = img.width, H = img.height;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, W, H);

  const map = new Uint8Array(W * H);
  let themed = 0;
  for (let i = 0; i < W * H; i++) {
    const px = i * 4;
    const idx = nearestElement(legend, data[px], data[px + 1], data[px + 2]);
    map[i] = idx;
    if (idx !== UNMATCHED) themed++;
  }

  const pct = (themed / (W * H) * 100).toFixed(1);
  console.log(`  ${imagePath}: ${pct}% themed (${W}×${H})`);
  return { map, W, H, legend };
}

// Build unified elements list across all variants
function buildUnifiedElements(variants) {
  const seen = new Map(); // name → index
  const list = [];
  for (const { legend } of variants) {
    for (const el of legend) {
      if (!seen.has(el.name)) {
        seen.set(el.name, list.length);
        list.push(el.name);
      }
    }
  }
  return { list, indexMap: seen };
}

// Majority-vote merge of multiple maps into unified element space
function mergeMaps(variants, unifiedList, unifiedIndex, W, H) {
  const merged = new Uint8Array(W * H);
  merged.fill(UNMATCHED);

  const votes = new Array(unifiedList.length);

  for (let i = 0; i < W * H; i++) {
    // Count votes per unified element
    votes.fill(0);
    let totalVotes = 0;

    for (const { map, legend } of variants) {
      const localIdx = map[i];
      if (localIdx === UNMATCHED) continue;
      const name = legend[localIdx]?.name;
      if (!name) continue;
      const uIdx = unifiedIndex.get(name);
      if (uIdx !== undefined) {
        votes[uIdx]++;
        totalVotes++;
      }
    }

    if (totalVotes === 0) continue;

    // Find highest-voted element
    let best = -1, bestCount = 0;
    for (let j = 0; j < unifiedList.length; j++) {
      if (votes[j] > bestCount) { bestCount = votes[j]; best = j; }
    }

    // Accept if at least half of provided screenshots agree
    if (best >= 0 && bestCount >= Math.ceil(variants.length / 2)) {
      merged[i] = best < UNMATCHED ? best : UNMATCHED;
    }
  }

  return merged;
}

function traceSVG(indexMap, elements, W, H) {
  function buildRects(elementIndex) {
    const active = new Map();
    const rects = [];
    for (let y = 0; y < H; y++) {
      const base = y * W;
      const currentKeys = new Set();
      let runStart = -1;
      for (let x = 0; x <= W; x++) {
        const match = x < W && indexMap[base + x] === elementIndex;
        if (match && runStart === -1) { runStart = x; }
        else if (!match && runStart !== -1) {
          currentKeys.add(`${runStart},${x - runStart}`);
          runStart = -1;
        }
      }
      for (const [key, startY] of active) {
        if (!currentKeys.has(key)) {
          const [x, w] = key.split(',').map(Number);
          rects.push({ x, y: startY, w, h: y - startY });
          active.delete(key);
        }
      }
      for (const key of currentKeys) {
        if (!active.has(key)) active.set(key, y);
      }
    }
    for (const [key, startY] of active) {
      const [x, w] = key.split(',').map(Number);
      rects.push({ x, y: startY, w, h: H - startY });
    }
    return rects;
  }

  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`];
  const css = elements.map(n => `  .${n}{fill:var(--${n},transparent)}`);
  parts.push(`<style>\n${css.join('\n')}\n</style>`);

  let totalRects = 0, covered = 0;
  for (let i = 0; i < elements.length; i++) {
    const rects = buildRects(i);
    if (rects.length === 0) continue;
    covered += rects.reduce((s, r) => s + r.w * r.h, 0);
    totalRects += rects.length;
    const rs = rects.map(r => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}"/>`);
    parts.push(`<g class="${elements[i]}">${rs.join('')}</g>`);
  }
  parts.push('</svg>');

  const pct = (covered / (W * H) * 100).toFixed(1);
  console.log(`  SVG: ${totalRects.toLocaleString()} rects · ${pct}% coverage`);
  return parts.join('\n');
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log(`\nBuilding map for view: ${view}`);
console.log(`Screenshots: ${screenshots.join(', ')}\n`);

fs.mkdirSync('maps', { recursive: true });

const variants = [];
for (let i = 0; i < screenshots.length; i++) {
  const ssPath = screenshots[i];
  const variantName = VARIANT_NAMES[i];
  const legend = loadLegend(variantName);

  if (!legend) {
    console.warn(`⚠️  No legend for variant ${variantName} (rainbow-${variantName}-legend.json missing) — skipping`);
    continue;
  }
  if (!fs.existsSync(ssPath)) {
    console.warn(`⚠️  Screenshot not found: ${ssPath} — skipping`);
    continue;
  }

  const result = await processScreenshot(ssPath, legend);
  variants.push({ ...result, legend });
}

if (variants.length === 0) {
  console.error('No valid screenshots to process.');
  process.exit(1);
}

const { W, H } = variants[0];
const { list: unifiedList, indexMap: unifiedIndex } = buildUnifiedElements(variants);

console.log(`\nMerging ${variants.length} variant(s) → ${unifiedList.length} unified elements`);

const merged = mergeMaps(variants, unifiedList, unifiedIndex, W, H);

// Count coverage
let themed = 0;
for (let i = 0; i < W * H; i++) if (merged[i] !== UNMATCHED) themed++;
console.log(`  Final coverage: ${(themed / (W * H) * 100).toFixed(1)}%`);

// Write .bin + .json
const binPath = `maps/${view}.bin`;
const jsonPath = `maps/${view}.json`;
const svgPath = `maps/${view}.svg`;

fs.writeFileSync(binPath, Buffer.from(merged));
fs.writeFileSync(jsonPath, JSON.stringify({ width: W, height: H, elements: unifiedList }, null, 2));
console.log(`  ✅ ${binPath}  (${merged.length.toLocaleString()} bytes)`);
console.log(`  ✅ ${jsonPath}  (${unifiedList.length} elements)`);

// Trace SVG
const svg = traceSVG(merged, unifiedList, W, H);
fs.writeFileSync(svgPath, svg, 'utf-8');
console.log(`  ✅ ${svgPath}  (${(svg.length / 1024).toFixed(0)} KB)\n`);
