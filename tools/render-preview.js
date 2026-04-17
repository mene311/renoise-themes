import fs from 'fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';

// Load map + original screenshot once, reuse for many themes
export async function createRenderer(mapBinPath, screenshotPath) {
  const map = new Uint8Array(fs.readFileSync(mapBinPath));
  const img = await loadImage(fs.readFileSync(screenshotPath));
  const W = img.width, H = img.height;

  // Read original pixels (for unmatched areas)
  const srcCanvas = createCanvas(W, H);
  const srcCtx = srcCanvas.getContext('2d');
  srcCtx.drawImage(img, 0, 0);
  const srcData = srcCtx.getImageData(0, 0, W, H).data;

  // Load palette key mapping
  const jsonPath = mapBinPath.replace('.bin', '.json');
  const palette = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  // palette = { "Main_Back": { index: 0, color: [r,g,b] }, ... }

  // Build index → key lookup
  const indexToKey = {};
  for (const [key, val] of Object.entries(palette)) {
    indexToKey[val.index] = key;
  }

  return {
    width: W,
    height: H,

    render(themeColors, outputPath) {
      const canvas = createCanvas(W, H);
      const ctx = canvas.getContext('2d');
      const imgData = ctx.createImageData(W, H);
      const out = imgData.data;

      for (let i = 0; i < W * H; i++) {
        const idx = map[i];
        const key = indexToKey[idx];
        const px = i * 4;

        if (key && themeColors[key]) {
          const c = themeColors[key];
          out[px] = c[0];
          out[px + 1] = c[1];
          out[px + 2] = c[2];
          out[px + 3] = 255;
        } else {
          // Keep original pixel
          out[px] = srcData[px];
          out[px + 1] = srcData[px + 1];
          out[px + 2] = srcData[px + 2];
          out[px + 3] = srcData[px + 3];
        }
      }

      ctx.putImageData(imgData, 0, 0);
      const buf = canvas.toBuffer('image/png');
      if (outputPath) {
        fs.writeFileSync(outputPath, buf);
      }
      return buf;
    }
  };
}

// Parse .xrnc into { ColorName: [r, g, b] }
export function parseXrnc(path) {
  const xml = fs.readFileSync(path, 'utf-8');
  const colors = {};
  const regex = /<(\w+)>(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})<\/\1>/g;
  let m;
  while ((m = regex.exec(xml)) !== null) {
    colors[m[1]] = [parseInt(m[2]), parseInt(m[3]), parseInt(m[4])];
  }
  return colors;
}

// CLI mode
if (process.argv[1]?.includes('render-preview')) {
  const [,, mapBin, screenshot, xrncPath, outputPath] = process.argv;
  if (!mapBin || !screenshot || !xrncPath) {
    console.error('Usage: node render-preview.js <map.bin> <screenshot.png> <theme.xrnc> [output.png]');
    process.exit(1);
  }
  const colors = parseXrnc(xrncPath);
  const renderer = await createRenderer(mapBin, screenshot);
  renderer.render(colors, outputPath || 'preview.png');
  console.log(`Done: ${outputPath || 'preview.png'}`);
}
