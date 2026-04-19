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

let renderers = null;

async function initRenderers() {
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

    let textData = null;
    const textPath = path.join(ROOT, view.textOverlay);
    if (fs.existsSync(textPath)) {
      const textImg = await loadImage(fs.readFileSync(textPath));
      const textCanvas = createCanvas(W, H);
      const textCtx = textCanvas.getContext('2d');
      textCtx.drawImage(textImg, 0, 0);
      textData = textCtx.getImageData(0, 0, W, H).data;
    }

    renderers[view.name] = { map, W, H, elements, textData };
  }

  console.log(`🖼️  Preview renderers loaded: ${Object.keys(renderers).join(', ')}`);
  return renderers;
}

function parseXrncColors(xml) {
  const colors = {};
  const regex = /<(\w+)>(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})<\/\1>/g;
  let m;
  while ((m = regex.exec(xml)) !== null) {
    colors[m[1]] = [parseInt(m[2]), parseInt(m[3]), parseInt(m[4])];
  }
  return colors;
}

export async function generatePreviews(xrncPath, outputDir) {
  const rr = await initRenderers();
  const xml = fs.readFileSync(xrncPath, 'utf-8');
  const colors = parseXrncColors(xml);

  fs.mkdirSync(outputDir, { recursive: true });

  // Load text-theme screenshots (black text on white UI) as anti-aliasing guides.
  // Using the B/W text theme avoids leaking rainbow/reference colors into recolored previews.
  const textThemeData = {};
  const views = ['pattern', 'mixer', 'waveform'];
  for (const view of views) {
    const ttPath = path.join(ROOT, `text-theme-${view}.png`);
    if (fs.existsSync(ttPath)) {
      const ttImg = await loadImage(fs.readFileSync(ttPath));
      const ttCanvas = createCanvas(ttImg.width, ttImg.height);
      const ttCtx = ttCanvas.getContext('2d');
      ttCtx.drawImage(ttImg, 0, 0);
      textThemeData[view] = ttCtx.getImageData(0, 0, ttImg.width, ttImg.height).data;
    }
  }

  const results = {};

  for (const [viewName, renderer] of Object.entries(rr)) {
    const { map, W, H, elements, textData } = renderer;

    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(W, H);
    const out = imgData.data; // all zeros (transparent) initially

    // Pass 1: paint pixels assigned to a theme element
    for (let i = 0; i < W * H; i++) {
      const idx = map[i];
      if (idx === UNMATCHED) continue;
      const name = idx < elements.length ? elements[idx] : null;
      if (!name || !colors[name]) continue;
      const c = colors[name];
      const px = i * 4;
      out[px]     = c[0];
      out[px + 1] = c[1];
      out[px + 2] = c[2];
      out[px + 3] = 255;
    }

    // Pass 2: fill UNMATCHED pixels — average colors of 8-connected assigned neighbors.
    // Smooths element boundaries and eliminates reference-screenshot color bleed.
    const fallback = colors['Main_Back'] || [20, 20, 30];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (out[i * 4 + 3] > 0) continue; // already painted in pass 1

        let rSum = 0, gSum = 0, bSum = 0, count = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dy === 0 && dx === 0) continue;
            const ny = y + dy, nx = x + dx;
            if (ny < 0 || ny >= H || nx < 0 || nx >= W) continue;
            const ni = ny * W + nx;
            const nIdx = map[ni];
            if (nIdx === UNMATCHED) continue;
            const nName = nIdx < elements.length ? elements[nIdx] : null;
            if (!nName || !colors[nName]) continue;
            const c = colors[nName];
            rSum += c[0]; gSum += c[1]; bSum += c[2]; count++;
          }
        }

        const px = i * 4;
        if (count > 0) {
          out[px]     = (rSum / count) | 0;
          out[px + 1] = (gSum / count) | 0;
          out[px + 2] = (bSum / count) | 0;
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

    // Pass 3: composite text using text-theme screenshot as anti-aliasing guide.
    // text-theme-*.png renders text as black on white UI — darkness = text alpha.
    // For each text pixel, resolve the correct theme font color via the pixel map and
    // alpha-blend over the already-painted background. This preserves Renoise's sharp
    // anti-aliased font edges without leaking colors from the rainbow reference screenshots.
    const tt = textThemeData[viewName];
    if (tt) {
      const mainFont = colors['Main_Font'] || [220, 220, 220];
      for (let i = 0; i < W * H; i++) {
        const px = i * 4;
        const r = tt[px], g = tt[px + 1], b = tt[px + 2];
        const lum = (r + g + b) / 3;
        const alpha = 1 - lum / 255; // black = 1 (full text), white = 0 (no text)
        if (alpha < 0.05) continue;  // skip near-white pixels

        const idx = map[i];
        let fontColor = mainFont;
        if (idx !== UNMATCHED && idx < elements.length) {
          const name = elements[idx];
          if (name && colors[name]) fontColor = colors[name];
        }

        // Alpha blend font color over existing pixel
        out[px]     = (fontColor[0] * alpha + out[px]     * (1 - alpha)) | 0;
        out[px + 1] = (fontColor[1] * alpha + out[px + 1] * (1 - alpha)) | 0;
        out[px + 2] = (fontColor[2] * alpha + out[px + 2] * (1 - alpha)) | 0;
        out[px + 3] = 255;
      }
    }

    ctx.putImageData(imgData, 0, 0);
    const outPath = path.join(outputDir, `${viewName}.png`);
    fs.writeFileSync(outPath, canvas.toBuffer('image/png'));
    results[viewName] = outPath;
  }

  return results;
}
