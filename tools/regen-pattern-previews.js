import { generatePreviews } from '../lib/preview-renderer.js';
import { parseThemeFile } from '../lib/parser.js';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const db = new Database('db/themes.db');
const themes = db.prepare('SELECT slug, name, filename, preview_slug FROM themes LIMIT 10').all();

console.log(`Regenerating Pattern Editor previews for ${themes.length} themes...\n`);

for (const theme of themes) {
  const themePath = path.join('public/uploads/themes', theme.filename);
  if (!fs.existsSync(themePath)) {
    console.log(`❌ ${theme.name}: file not found`);
    continue;
  }

  try {
    const parsed = parseThemeFile(themePath);
    const previewDir = path.join('public/uploads/previews', theme.preview_slug);
    fs.mkdirSync(previewDir, { recursive: true });

    // Generate all views but only report pattern for now
    const previews = await generatePreviews(parsed.elementColorMap, previewDir);
    const views = Object.keys(previews);
    console.log(`✅ ${theme.name}: ${views.join(', ')}`);
  } catch (err) {
    console.log(`❌ ${theme.name}: ${err.message}`);
  }
}

console.log('\nDone!');
