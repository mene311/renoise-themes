import { generatePreviews } from '../lib/preview-renderer.js';
import { parseThemeFile } from '../lib/parser.js';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const db = new Database('db/themes.db');
const themes = db.prepare('SELECT slug, name, filename, preview_slug FROM themes').all();

console.log(`Regenerating previews for ${themes.length} themes...\n`);

let success = 0;
let failed = 0;

for (const theme of themes) {
  const themePath = path.join('public/uploads/themes', theme.filename);
  if (!fs.existsSync(themePath)) {
    console.log(`❌ ${theme.name}: file not found`);
    failed++;
    continue;
  }

  try {
    const parsed = parseThemeFile(themePath);
    const previewDir = path.join('public/uploads/previews', theme.preview_slug);
    fs.mkdirSync(previewDir, { recursive: true });

    const previews = await generatePreviews(parsed.elementColorMap, previewDir);
    const views = Object.keys(previews);
    console.log(`✅ ${theme.name}: ${views.join(', ')}`);
    success++;
  } catch (err) {
    console.log(`❌ ${theme.name}: ${err.message}`);
    failed++;
  }
}

console.log(`\nDone! ${success} succeeded, ${failed} failed`);
