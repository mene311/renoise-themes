import fs from 'fs';
import path from 'path';
import { createRenderer, parseXrnc } from './render-preview.js';

const THEMES_DIR = process.argv[2] || './themes';
const OUTPUT_DIR = process.argv[3] || './public/previews';
const VIEWS = [
  { name: 'pattern',  map: 'maps/pattern.bin',  screenshot: 'screenshot-pattern-editor.png' },
  { name: 'mixer',    map: 'maps/mixer.bin',     screenshot: 'screenshot-mixer.png' },
  { name: 'waveform', map: 'maps/waveform.bin',  screenshot: 'screenshot-waveform.png' },
];

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// Init renderers once
const renderers = {};
for (const view of VIEWS) {
  console.log(`Loading renderer: ${view.name}...`);
  renderers[view.name] = await createRenderer(view.map, view.screenshot);
}

// Process each theme
const themes = fs.readdirSync(THEMES_DIR).filter(f => f.endsWith('.xrnc'));
console.log(`\nFound ${themes.length} themes\n`);

for (const file of themes) {
  const slug = path.basename(file, '.xrnc');
  const colors = parseXrnc(path.join(THEMES_DIR, file));
  const themeDir = path.join(OUTPUT_DIR, slug);
  fs.mkdirSync(themeDir, { recursive: true });

  for (const view of VIEWS) {
    const out = path.join(themeDir, `${view.name}.png`);
    renderers[view.name].render(colors, out);
  }
  console.log(`  ✓ ${slug} (${VIEWS.length} views)`);
}

console.log(`\nDone! Previews in ${OUTPUT_DIR}`);
