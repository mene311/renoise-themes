import fs from 'fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const legend = JSON.parse(fs.readFileSync('rainbow-legend.json', 'utf-8'));

// Pre-parse legend hex into RGB for fast lookup
const elements = legend.map((entry, i) => ({
  index: i,
  name: entry.element,
  r: parseInt(entry.hex.slice(1, 3), 16),
  g: parseInt(entry.hex.slice(3, 5), 16),
  b: parseInt(entry.hex.slice(5, 7), 16),
}));

function findElement(r, g, b) {
  let best = -1;
  let bestDist = Infinity;
  for (const el of elements) {
    const dist = (r - el.r) ** 2 + (g - el.g) ** 2 + (b - el.b) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = el.index;
    }
  }
  // Too far = unthemeable pixel (window chrome, track colors, etc.)
  return bestDist < 2500 ? best : 255;
}

async function buildMap(imagePath, outputName) {
  const img = await loadImage(fs.readFileSync(imagePath));
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, img.width, img.height);

  console.log(`Processing ${imagePath} (${width}x${height})...`);

  // Build index map: 1 byte per pixel
  const indexMap = Buffer.alloc(width * height);
  const counts = new Array(elements.length + 1).fill(0);

  for (let i = 0; i < width * height; i++) {
    const px = i * 4;
    const idx = findElement(data[px], data[px + 1], data[px + 2]);
    indexMap[i] = idx;
    counts[idx === 255 ? elements.length : idx]++;
  }

  // Save as binary index map + metadata
  const meta = {
    width,
    height,
    source: imagePath,
    elements: legend.map(e => e.element),
  };

  fs.writeFileSync(`${outputName}.bin`, indexMap);
  fs.writeFileSync(`${outputName}.json`, JSON.stringify(meta, null, 2));

  // Stats
  const total = width * height;
  const themed = total - counts[elements.length];
  console.log(`  Themed pixels: ${themed} / ${total} (${(themed / total * 100).toFixed(1)}%)`);
  console.log(`  Unmatched:     ${counts[elements.length]} pixels`);
  console.log(`  Saved: ${outputName}.bin (${indexMap.length} bytes)`);
  console.log(`  Saved: ${outputName}.json\n`);

  // Per-element breakdown
  console.log('  Top elements by pixel count:');
  const sorted = elements
    .map((el, i) => ({ name: el.name, count: counts[i] }))
    .filter(e => e.count > 0)
    .sort((a, b) => b.count - a.count);

  for (const el of sorted.slice(0, 15)) {
    const pct = (el.count / total * 100).toFixed(1);
    const bar = '█'.repeat(Math.round(pct));
    console.log(`    ${el.name.padEnd(38)} ${String(el.count).padStart(8)}  ${pct.padStart(5)}%  ${bar}`);
  }
  console.log();
}

// Now the renderer: takes an index map + any .xrnc → outputs a preview PNG
async function renderPreview(mapName, xrncPath, outputPath) {
  const meta = JSON.parse(fs.readFileSync(`${mapName}.json`, 'utf-8'));
  const indexMap = fs.readFileSync(`${mapName}.bin`);
  const xrnc = fs.readFileSync(xrncPath, 'utf-8');

  // Parse colors from xrnc
  const colorRegex = /<(\w+)>(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})<\/\w+>/g;
  const colors = {};
  let match;
  while ((match = colorRegex.exec(xrnc)) !== null) {
    colors[match[1]] = [parseInt(match[2]), parseInt(match[3]), parseInt(match[4])];
  }

  const { width, height, elements: elementNames } = meta;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const imgData = ctx.createImageData(width, height);
  const out = imgData.data;

  // Build element index → RGB lookup
  const colorLookup = elementNames.map(name => colors[name] || [128, 0, 128]);

  for (let i = 0; i < width * height; i++) {
    const idx = indexMap[i];
    const px = i * 4;

    if (idx === 255) {
      // Unthemeable pixel — use neutral gray
      out[px] = 40;
      out[px + 1] = 40;
      out[px + 2] = 40;
    } else {
      const [r, g, b] = colorLookup[idx];
      out[px] = r;
      out[px + 1] = g;
      out[px + 2] = b;
    }
    out[px + 3] = 255;
  }

  ctx.putImageData(imgData, 0, 0);

  const pngBuffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, pngBuffer);
  console.log(`Rendered preview: ${outputPath} (${width}x${height})`);
}

// CLI
const command = process.argv[2];

if (command === 'build') {
  const imagePath = process.argv[3];
  const outputName = process.argv[4] || 'indexmap';
  if (!imagePath) {
    console.error('Usage: node tools/build-index-map.js build <screenshot.png> [output-name]');
    process.exit(1);
  }
  buildMap(imagePath, outputName);

} else if (command === 'render') {
  const mapName = process.argv[3];
  const xrncPath = process.argv[4];
  const outputPath = process.argv[5] || 'preview.png';
  if (!mapName || !xrncPath) {
    console.error('Usage: node tools/build-index-map.js render <map-name> <theme.xrnc> [output.png]');
    process.exit(1);
  }
  renderPreview(mapName, xrncPath, outputPath);

} else {
  console.log(`
Usage:
  node tools/build-index-map.js build <rainbow-screenshot.png> [output-name]
  node tools/build-index-map.js render <map-name> <theme.xrnc> [output.png]

Step 1: Build index maps from your rainbow screenshots
  node tools/build-index-map.js build screenshot-pattern-editor.png maps/pattern
  node tools/build-index-map.js build screenshot-mixer.png maps/mixer
  node tools/build-index-map.js build screenshot-sampler.png maps/sampler

Step 2: Render any theme using those maps
  node tools/build-index-map.js render maps/pattern some-theme.xrnc preview.png
  `);
}
