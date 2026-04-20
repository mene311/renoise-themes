/**
 * Processes up to 4 rainbow variant screenshots for a single view,
 * merges them via majority vote, outputs .bin/.json and traces an SVG.
 *
 * Usage:  node tools/build-maps.js <view> <ss-A.png> [ss-B.png] [ss-C.png] [ss-D.png]
 * Example: node tools/build-maps.js pattern screenshot-A-pattern.png screenshot-B-pattern.png ...
 *
 * Expects rainbow-A-legend.json ... rainbow-D-legend.json in the project root.
 * Outputs: maps/<view>.bin  maps/<view>.json  maps/<view>.svg  maps/<view>-text.png
 *
 * Text masking (optional but recommended):
 *   Generate text-theme.xrnc with tools/generate-text-theme.js, load it in Renoise,
 *   screenshot each view, save as text-theme-<view>.png in the project root.
 *   build-maps.js detects these automatically and uses black-pixel detection for the mask.
 */

import fs from 'fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const VARIANT_NAMES = ['A', 'B', 'C', 'D'];
const UNMATCHED = 255;
const MAX_DIST = 2500; // ~50 per RGB channel — handles JPEG/PNG compression artifacts
const TEXT_PAD = 2;    // pixels of padding around each detected text pixel cluster
const TEXT_THRESHOLD = 80; // pixels darker than this (per channel) are considered text

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
  return raw.map((e, i) => ({
    index: i,
    name: e.element,
    r: parseInt(e.hex.slice(1, 3), 16),
    g: parseInt(e.hex.slice(3, 5), 16),
    b: parseInt(e.hex.slice(5, 7), 16),
  }));
}

/**
 * Build a text mask by detecting near-black pixels in a white/black text-theme screenshot.
 * Filters out UI border lines via connected component aspect ratio analysis, then
 * expands surviving text pixels by TEXT_PAD to cover anti-aliasing fringe.
 */
async function buildTextMaskFromImage(imagePath, W, H) {
  const img = await loadImage(fs.readFileSync(imagePath));
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, W, H);

  // Pass 1: detect near-black pixels
  const raw = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const px = i * 4;
    if (data[px] < TEXT_THRESHOLD && data[px + 1] < TEXT_THRESHOLD && data[px + 2] < TEXT_THRESHOLD)
      raw[i] = 1;
  }

  // Pass 2: connected component analysis — filter out border lines (high aspect ratio)
  // Text characters: roughly square bounding boxes (aspect ≤ 8)
  // UI border lines: very elongated (aspect >> 10)
  const MIN_AREA = 4;        // drop single-pixel noise
  const MAX_ASPECT = 10;     // drop long thin lines

  const labels = new Int32Array(W * H).fill(-1);
  const textOnly = new Uint8Array(W * H);
  let kept = 0, dropped = 0;

  for (let start = 0; start < W * H; start++) {
    if (!raw[start] || labels[start] >= 0) continue;

    // BFS to collect component
    const pixels = [];
    let minX = W, maxX = 0, minY = H, maxY = 0;
    const queue = [start];
    labels[start] = start;

    while (queue.length > 0) {
      const idx = queue.pop();
      pixels.push(idx);
      const x = idx % W, y = (idx / W) | 0;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;

      const neighbors = [idx - 1, idx + 1, idx - W, idx + W];
      for (const n of neighbors) {
        if (n < 0 || n >= W * H) continue;
        if ((idx % W === 0 && n === idx - 1) || (idx % W === W - 1 && n === idx + 1)) continue;
        if (raw[n] && labels[n] < 0) { labels[n] = start; queue.push(n); }
      }
    }

    const bw = maxX - minX + 1, bh = maxY - minY + 1;
    const aspect = Math.max(bw, bh) / Math.min(bw, bh);

    if (pixels.length >= MIN_AREA && aspect <= MAX_ASPECT) {
      for (const idx of pixels) textOnly[idx] = 1;
      kept++;
    } else {
      dropped++;
    }
  }

  console.log(`  Component filter: ${kept} kept, ${dropped} dropped (borders/noise)`);

  // Pass 3: dilate surviving text pixels by TEXT_PAD
  const mask = new Uint8Array(W * H);
  let count = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!textOnly[y * W + x]) continue;
      const y0 = Math.max(0, y - TEXT_PAD);
      const y1 = Math.min(H - 1, y + TEXT_PAD);
      const x0 = Math.max(0, x - TEXT_PAD);
      const x1 = Math.min(W - 1, x + TEXT_PAD);
      for (let py = y0; py <= y1; py++)
        for (let px = x0; px <= x1; px++) {
          if (!mask[py * W + px]) { mask[py * W + px] = 1; count++; }
        }
    }
  }

  return { mask, count };
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

async function processScreenshot(imagePath, legend, textMask) {
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

  // Phase 2: assign text pixels to nearest non-text element for font lookup
  if (textMask) {
    const TEXT_SEARCH_RADIUS = 20;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (!textMask[i]) continue;
        
        // Search outward for nearest non-text element
        let bestIdx = UNMATCHED, bestDist = Infinity;
        for (let dy = -TEXT_SEARCH_RADIUS; dy <= TEXT_SEARCH_RADIUS && bestDist > 0; dy++) {
          for (let dx = -TEXT_SEARCH_RADIUS; dx <= TEXT_SEARCH_RADIUS; dx++) {
            if (dy === 0 && dx === 0) continue;
            const ny = y + dy, nx = x + dx;
            if (ny < 0 || ny >= H || nx < 0 || nx >= W) continue;
            const ni = ny * W + nx;
            if (textMask[ni]) continue;
            const d = dx * dx + dy * dy;
            if (d < bestDist) { bestDist = d; bestIdx = map[ni]; }
          }
        }
        if (bestIdx !== UNMATCHED) map[i] = bestIdx;
      }
    }
  }

  const pct = (themed / (W * H) * 100).toFixed(1);
  console.log(`  ${imagePath}: ${pct}% themed (${W}×${H})`);
  return { map, W, H, legend, srcData: data };
}

// Build unified elements list across all variants
function buildUnifiedElements(variants) {
  const seen = new Map();
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

    let best = -1, bestCount = 0;
    for (let j = 0; j < unifiedList.length; j++) {
      if (votes[j] > bestCount) { bestCount = votes[j]; best = j; }
    }

    if (best >= 0 && bestCount >= Math.ceil(variants.length / 2)) {
      merged[i] = best < UNMATCHED ? best : UNMATCHED;
    }
  }

  return merged;
}

/**
 * Render a text-only PNG from the text-theme screenshot:
 * black pixels → preserved, white pixels → transparent.
 * Saved to maps/<view>-text.png and referenced by the SVG as a top layer.
 */
async function generateTextPng(textScreenPath, textMask, W, H, outPath) {
  const img = await loadImage(fs.readFileSync(textScreenPath));
  const srcCanvas = createCanvas(W, H);
  const srcCtx = srcCanvas.getContext('2d');
  srcCtx.drawImage(img, 0, 0);
  const { data: src } = srcCtx.getImageData(0, 0, W, H);

  const outCanvas = createCanvas(W, H);
  const outCtx = outCanvas.getContext('2d');
  const outImg = outCtx.createImageData(W, H);
  const out = outImg.data; // all zeros = fully transparent

  for (let i = 0; i < W * H; i++) {
    if (!textMask[i]) continue;
    const px = i * 4;
    out[px]     = src[px];
    out[px + 1] = src[px + 1];
    out[px + 2] = src[px + 2];
    out[px + 3] = 255;
  }

  outCtx.putImageData(outImg, 0, 0);
  fs.writeFileSync(outPath, outCanvas.toBuffer('image/png'));
}

function traceSVG(indexMap, elements, W, H, textPngFilename) {
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

  if (textPngFilename) {
    parts.push(`<image id="text-overlay" href="${textPngFilename}" x="0" y="0" width="${W}" height="${H}"/>`);
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

const firstImg = await loadImage(fs.readFileSync(screenshots[0]));
const W = firstImg.width, H = firstImg.height;

// Auto-detect text-theme screenshot for pixel-perfect text masking
const textScreenPath = `text-theme-${view}.png`;
let textMask = null;
let textMaskCount = 0;

if (fs.existsSync(textScreenPath)) {
  console.log(`Found ${textScreenPath} — building text mask from black pixel detection...`);
  const result = await buildTextMaskFromImage(textScreenPath, W, H);
  textMask = result.mask;
  textMaskCount = result.count;
  const maskedPct = (textMaskCount / (W * H) * 100).toFixed(1);
  console.log(`  Masked ${textMaskCount.toLocaleString()} text pixels (${maskedPct}% of frame)\n`);
} else {
  console.log(`No ${textScreenPath} found — proceeding without text mask`);
  console.log(`  (run tools/generate-text-theme.js and screenshot to enable text masking)\n`);
}

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

  const result = await processScreenshot(ssPath, legend, textMask);
  variants.push({ ...result, legend });
}

if (variants.length === 0) {
  console.error('No valid screenshots to process.');
  process.exit(1);
}

const { list: unifiedList, indexMap: unifiedIndex } = buildUnifiedElements(variants);

console.log(`\nMerging ${variants.length} variant(s) → ${unifiedList.length} unified elements`);

const merged = mergeMaps(variants, unifiedList, unifiedIndex, W, H);

let themed = 0;
for (let i = 0; i < W * H; i++) if (merged[i] !== UNMATCHED) themed++;
console.log(`  Final coverage: ${(themed / (W * H) * 100).toFixed(1)}%`);

const binPath  = `maps/${view}.bin`;
const jsonPath = `maps/${view}.json`;
const svgPath  = `maps/${view}.svg`;
const textPath = `maps/${view}-text.png`;

fs.writeFileSync(binPath, Buffer.from(merged));
fs.writeFileSync(jsonPath, JSON.stringify({ width: W, height: H, elements: unifiedList }, null, 2));
console.log(`  ✅ ${binPath}  (${merged.length.toLocaleString()} bytes)`);
console.log(`  ✅ ${jsonPath}  (${unifiedList.length} elements)`);

let textPngFilename = null;
if (textMask) {
  await generateTextPng(textScreenPath, textMask, W, H, textPath);
  textPngFilename = `${view}-text.png`; // relative to maps/ — matches SVG location
  console.log(`  ✅ ${textPath}`);
}

const svg = traceSVG(merged, unifiedList, W, H, textPngFilename);
fs.writeFileSync(svgPath, svg, 'utf-8');
console.log(`  ✅ ${svgPath}  (${(svg.length / 1024).toFixed(0)} KB)\n`);
