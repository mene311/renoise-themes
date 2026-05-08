import fs from 'fs';
import path from 'path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

const VIEWS = [
  { name: 'pattern',  map: 'maps/pattern.bin',  textOverlay: 'maps/pattern-text.png' },
  { name: 'mixer',    map: 'maps/mixer.bin',     textOverlay: 'maps/mixer-text.png' },
  { name: 'waveform', map: 'maps/waveform.bin',  textOverlay: 'maps/waveform-text.png' },
];

const UNMATCHED = 255;

// Element patterns that are known to be UI chrome (not text), to skip
// text compositing on even if the text-theme shows dark pixels there.
const NON_TEXT_ELEMENT_PATTERNS = [
  /Scroll/i, /Slider/i, /Border/i, /Header/i, /Tab/i,
  /VU/i, /Meter/i, /Cursor/i, /Line/i, /Grid/i, /Ruler/i,
];

let renderers = null;

export function invalidateRendererCache() {
  renderers = null;
  console.log('♻️  Preview renderer cache invalidated');
}

export async function initRenderers() {
  if (renderers) return renderers;
  renderers = {};

  for (const view of VIEWS) {
    const mapPath = path.join(ROOT, view.map);
    const jsonPath = mapPath.replace('.bin', '.json');

    if (!fs.existsSync(mapPath) || !fs.existsSync(jsonPath)) {
      console.warn(`⚠️  Skipping view "${view.name}" — missing map`);
      continue;
    }

    const map = new Uint8Array(fs.readFileSync(mapPath));
    const meta = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    const { width: W, height: H, elements } = meta;
    if (map.length !== W * H) {
      throw new Error(`Map size mismatch for ${view.name}: ${map.length} != ${W * H}`);
    }

    // Cache text overlay (maps/*-text.png) — may be used for future features
    let textData = null;
    const textPath = path.join(ROOT, view.textOverlay);
    if (fs.existsSync(textPath)) {
      const textImg = await loadImage(fs.readFileSync(textPath));
      const textCanvas = createCanvas(W, H);
      const textCtx = textCanvas.getContext('2d');
      textCtx.drawImage(textImg, 0, 0);
      textData = textCtx.getImageData(0, 0, W, H).data;
    }

    // Cache text-theme screenshot (B/W UI) for Pass 3 anti-aliasing
    // Loaded once at startup, not per upload
    let textThemeData = null;
    const ttPath = path.join(ROOT, `text-theme-${view.name}.png`);
    if (fs.existsSync(ttPath)) {
      const ttImg = await loadImage(fs.readFileSync(ttPath));
      const ttCanvas = createCanvas(W, H);
      const ttCtx = ttCanvas.getContext('2d');
      ttCtx.drawImage(ttImg, 0, 0);
      textThemeData = ttCtx.getImageData(0, 0, W, H).data;
    }

    // Pre-build a lookup: for each element index, boolean indicating if it's a non-text (UI chrome) element.
    // Used in Pass 3 to skip text compositing on scrollbars, sliders, etc.
    const isUIChrome = new Uint8Array(elements.length);
    for (let ei = 0; ei < elements.length; ei++) {
      for (const pattern of NON_TEXT_ELEMENT_PATTERNS) {
        if (pattern.test(elements[ei])) {
          isUIChrome[ei] = 1;
          break;
        }
      }
    }

    renderers[view.name] = { map, W, H, elements, textData, textThemeData, isUIChrome };
  }

  console.log(`🖼️  Preview renderers loaded: ${Object.keys(renderers).join(', ')}`);
  return renderers;
}

/**
 * Generate pixel-accurate Renoise UI previews from a theme's color map.
 *
 * @param {Object} elementColorMap - { elementName: [r, g, b], ... } from parser.js's parseThemeFile()
 * @param {string} outputDir - directory to write preview PNGs into
 * @returns {Promise<Object>} - { viewName: outputPath, ... } for successfully rendered views
 */
export async function generatePreviews(elementColorMap, outputDir) {
  if (!elementColorMap || Object.keys(elementColorMap).length === 0) {
    throw new Error('No color data provided for preview generation');
  }

  const rr = await initRenderers();
  const colors = elementColorMap; // alias for readability

  fs.mkdirSync(outputDir, { recursive: true });

  const results = {};

  for (const [viewName, renderer] of Object.entries(rr)) {
    try {
      const { map, W, H, elements, textThemeData, isUIChrome } = renderer;

      // Pre-build color-by-element-index array: index → [r,g,b] or null
      // This avoids O(n) string lookups inside the inner loop of Pass 2
      const colorByIndex = new Array(elements.length);
      for (let ei = 0; ei < elements.length; ei++) {
        const name = elements[ei];
        colorByIndex[ei] = colors[name] || null;
      }

      const canvas = createCanvas(W, H);
      const ctx = canvas.getContext('2d');
      const imgData = ctx.createImageData(W, H);
      const out = imgData.data; // all zeros (transparent) initially

      // ── Pass 1: paint pixels assigned to a theme element ──
      for (let i = 0; i < W * H; i++) {
        const idx = map[i];
        if (idx === UNMATCHED) continue;
        const c = colorByIndex[idx];
        if (!c) continue;
        const px = i * 4;
        out[px]     = c[0];
        out[px + 1] = c[1];
        out[px + 2] = c[2];
        out[px + 3] = 255;
      }

      // ── Pass 2: fill UNMATCHED pixels — distance-weighted average of 8-connected assigned neighbors ──
      // Smooths element boundaries and eliminates reference-screenshot color bleed.
      // Reads from the IMMUTABLE map to avoid propagation artifacts.
      // Cardinals weighted 2× diagonals for smoother transitions.
      const fallback = colors['Main_Back'] || [20, 20, 30];
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = y * W + x;
          if (out[i * 4 + 3] > 0) continue; // already painted in pass 1

          let rSum = 0, gSum = 0, bSum = 0, weightSum = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dy === 0 && dx === 0) continue;
              const ny = y + dy, nx = x + dx;
              if (ny < 0 || ny >= H || nx < 0 || nx >= W) continue;
              const ni = ny * W + nx;
              const nIdx = map[ni];             // read from immutable map, NOT out[]
              if (nIdx === UNMATCHED) continue;
              const c = colorByIndex[nIdx];     // pre-flattened O(1) lookup
              if (!c) continue;
              const w = (dx === 0 || dy === 0) ? 2 : 1;
              rSum += c[0] * w;
              gSum += c[1] * w;
              bSum += c[2] * w;
              weightSum += w;
            }
          }

          const px = i * 4;
          if (weightSum > 0) {
            out[px]     = Math.round(rSum / weightSum);
            out[px + 1] = Math.round(gSum / weightSum);
            out[px + 2] = Math.round(bSum / weightSum);
            out[px + 3] = 255;
          } else {
            // Interior unmatched region — use background fallback
            out[px]     = fallback[0];
            out[px + 1] = fallback[1];
            out[px + 2] = fallback[2];
            out[px + 3] = 255;
          }
        }
      }

      // ── Pass 3: composite text using text-theme screenshot as anti-aliasing guide ──
      // text-theme-*.png renders text as black on white UI — darkness = text alpha.
      // Uses Rec.601 perceptual luminance (human eyes are most sensitive to green).
      // Skips text compositing for known non-text elements (scrollbars, sliders, etc.)
      if (textThemeData) {
        const mainFont = colors['Main_Font'] || [220, 220, 220];
        for (let i = 0; i < W * H; i++) {
          const px = i * 4;
          // Rec.601 perceptual luminance — 0.299R + 0.587G + 0.114B
          const lum = 0.299 * textThemeData[px] + 0.587 * textThemeData[px + 1] + 0.114 * textThemeData[px + 2];
          const alpha = 1 - lum / 255; // black = 1 (full text), white = 0 (no text)
          if (alpha < 0.05) continue;  // skip near-white pixels

          const idx = map[i];

          // Skip text compositing on known UI chrome elements (scrollbars, sliders, etc.)
          if (idx !== UNMATCHED && idx < elements.length && isUIChrome[idx]) continue;

          let fontColor = mainFont;
          if (idx !== UNMATCHED && idx < elements.length) {
            const c = colorByIndex[idx];
            if (c) fontColor = c;
          }

          // Alpha blend font color over existing pixel (standard over operation)
          out[px]     = Math.round(fontColor[0] * alpha + out[px]     * (1 - alpha));
          out[px + 1] = Math.round(fontColor[1] * alpha + out[px + 1] * (1 - alpha));
          out[px + 2] = Math.round(fontColor[2] * alpha + out[px + 2] * (1 - alpha));
          out[px + 3] = 255;
        }
      }

      ctx.putImageData(imgData, 0, 0);
      const outPath = path.join(outputDir, `${viewName}.png`);
      fs.writeFileSync(outPath, canvas.toBuffer('image/png'));
      results[viewName] = outPath;
    } catch (err) {
      // Per-view failure handling: one failing view doesn't block the others
      console.warn(`⚠️  Preview view "${viewName}" failed: ${err.message}`);
    }
  }

  return results;
}
