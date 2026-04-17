import fs from 'fs';
import path from 'path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

const VIEWS = [
  { name: 'pattern',  map: 'maps/pattern.bin',  screenshot: 'screenshot-pattern-editor.png' },
  { name: 'mixer',    map: 'maps/mixer.bin',     screenshot: 'screenshot-mixer.png' },
  { name: 'waveform', map: 'maps/waveform.bin',  screenshot: 'screenshot-waveform.png' },
];

// Cache renderers so we only load maps once
let renderers = null;

async function initRenderers() {
  if (renderers) return renderers;
  renderers = {};

  for (const view of VIEWS) {
    const mapPath = path.join(ROOT, view.map);
    const ssPath = path.join(ROOT, view.screenshot);

    if (!fs.existsSync(mapPath) || !fs.existsSync(ssPath)) {
      console.warn(`⚠️  Skipping view "${view.name}" — missing map or screenshot`);
      continue;
    }

    const map = new Uint8Array(fs.readFileSync(mapPath));
    const img = await loadImage(fs.readFileSync(ssPath));
    const W = img.width, H = img.height;

    const srcCanvas = createCanvas(W, H);
    const srcCtx = srcCanvas.getContext('2d');
    srcCtx.drawImage(img, 0, 0);
    const srcData = srcCtx.getImageData(0, 0, W, H).data;

    const meta = JSON.parse(fs.readFileSync(mapPath.replace('.bin', '.json'), 'utf-8'));

    renderers[view.name] = { map, srcData, W, H, elements: meta.elements };
  }

  console.log(`🖼️  Preview renderers loaded: ${Object.keys(renderers).join(', ')}`);
  return renderers;
}

/**
 * Parse .xrnc XML string into { ElementName: [r, g, b] }
 */
function parseXrncColors(xml) {
  const colors = {};
  const regex = /<(\w+)>(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})<\/\1>/g;
  let m;
  while ((m = regex.exec(xml)) !== null) {
    colors[m[1]] = [parseInt(m[2]), parseInt(m[3]), parseInt(m[4])];
  }
  return colors;
}

/**
 * Generate preview PNGs for a theme
 * @param {string} xrncPath - path to the .xrnc file
 * @param {string} outputDir - directory to save PNGs
 * @returns {object} { pattern: '/path/to.png', mixer: '...', waveform: '...' }
 */
export async function generatePreviews(xrncPath, outputDir) {
  const rr = await initRenderers();
  const xml = fs.readFileSync(xrncPath, 'utf-8');
  const colors = parseXrncColors(xml);

  fs.mkdirSync(outputDir, { recursive: true });

  const results = {};

  for (const [viewName, renderer] of Object.entries(rr)) {
    const { map, srcData, W, H, elements } = renderer;

    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(W, H);
    const out = imgData.data;

    for (let i = 0; i < W * H; i++) {
      const idx = map[i];
      const px = i * 4;

      // Look up which element this pixel maps to
      const elementName = idx < elements.length ? elements[idx] : null;

      if (elementName && colors[elementName]) {
        const c = colors[elementName];
        out[px] = c[0];
        out[px + 1] = c[1];
        out[px + 2] = c[2];
        out[px + 3] = 255;
      } else {
        // Keep original screenshot pixel (text, icons, etc.)
        out[px] = srcData[px];
        out[px + 1] = srcData[px + 1];
        out[px + 2] = srcData[px + 2];
        out[px + 3] = srcData[px + 3];
      }
    }

    ctx.putImageData(imgData, 0, 0);
    const outPath = path.join(outputDir, `${viewName}.png`);
    fs.writeFileSync(outPath, canvas.toBuffer('image/png'));
    results[viewName] = outPath;
  }

  return results;
}
