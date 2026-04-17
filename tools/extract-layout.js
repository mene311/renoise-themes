import fs from 'fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';

// Load the rainbow legend
const legend = JSON.parse(fs.readFileSync('rainbow-legend.json', 'utf-8'));

// Build a fast lookup: hex → element name
const colorToElement = {};
for (const entry of legend) {
  colorToElement[entry.hex] = entry.element;
}

// Convert pixel to hex
function pixelToHex(r, g, b) {
  return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
}

// Find nearest legend color (handles anti-aliasing / compression artifacts)
function nearestElement(r, g, b) {
  let best = null;
  let bestDist = Infinity;
  for (const entry of legend) {
    const hr = parseInt(entry.hex.slice(1, 3), 16);
    const hg = parseInt(entry.hex.slice(3, 5), 16);
    const hb = parseInt(entry.hex.slice(5, 7), 16);
    const dist = (r - hr) ** 2 + (g - hg) ** 2 + (b - hb) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = entry.element;
    }
  }
  // If too far from any known color, it's probably a track color or system chrome
  return bestDist < 2500 ? best : null;  // ~50 per channel tolerance
}

async function extract(imagePath) {
  const img = await loadImage(fs.readFileSync(imagePath));
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, img.width, img.height);

  console.log(`Image: ${width}x${height}`);
  console.log('Scanning pixels...\n');

  // Map: element → array of {x, y} pixels
  const elementPixels = {};

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const element = nearestElement(data[i], data[i + 1], data[i + 2]);
      if (element) {
        if (!elementPixels[element]) elementPixels[element] = { minX: x, minY: y, maxX: x, maxY: y, count: 0 };
        const ep = elementPixels[element];
        ep.minX = Math.min(ep.minX, x);
        ep.minY = Math.min(ep.minY, y);
        ep.maxX = Math.max(ep.maxX, x);
        ep.maxY = Math.max(ep.maxY, y);
        ep.count++;
      }
    }
  }

  // Convert to bounding boxes
  const layout = [];
  for (const [element, bounds] of Object.entries(elementPixels)) {
    layout.push({
      element,
      x: bounds.minX,
      y: bounds.minY,
      w: bounds.maxX - bounds.minX + 1,
      h: bounds.maxY - bounds.minY + 1,
      pixels: bounds.count,
      coverage: ((bounds.count / ((bounds.maxX - bounds.minX + 1) * (bounds.maxY - bounds.minY + 1))) * 100).toFixed(1) + '%'
    });
  }

  // Sort by pixel count (biggest elements first)
  layout.sort((a, b) => b.pixels - a.pixels);

  // Output
  console.log('ELEMENT REGIONS:');
  console.log('─'.repeat(90));
  for (const el of layout) {
    console.log(
      `  ${el.element.padEnd(40)} ${String(el.x).padStart(5)},${String(el.y).padStart(5)}  ${String(el.w).padStart(5)}x${String(el.h).padStart(5)}  ${String(el.pixels).padStart(8)}px  ${el.coverage.padStart(6)} fill`
    );
  }

  fs.writeFileSync('layout-raw.json', JSON.stringify(layout, null, 2));
  console.log(`\nSaved layout-raw.json (${layout.length} elements)`);
}

const imagePath = process.argv[2];
if (!imagePath) {
  console.error('Usage: node tools/extract-layout.js <screenshot.png>');
  process.exit(1);
}
extract(imagePath);
