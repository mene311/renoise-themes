/**
 * Batch regenerate previews for all uploaded themes.
 * Reads themes from the DB-managed uploads directory and writes PNGs to
 * public/uploads/previews/<slug>/.
 *
 * Usage:  node tools/generate-all-previews.js [themes-dir] [previews-dir]
 */

import fs from 'fs';
import path from 'path';
import { generatePreviews } from '../lib/preview-renderer.js';

const THEMES_DIR  = process.argv[2] || 'public/uploads/themes';
const PREVIEW_DIR = process.argv[3] || 'public/uploads/previews';

const files = fs.readdirSync(THEMES_DIR).filter(f => f.endsWith('.xrnc'));
console.log(`Found ${files.length} themes in ${THEMES_DIR}\n`);

let ok = 0, failed = 0;

for (const file of files) {
  const slug = path.basename(file, '.xrnc');
  const xrncPath = path.join(THEMES_DIR, file);
  const outDir   = path.join(PREVIEW_DIR, slug);

  try {
    const previews = await generatePreviews(xrncPath, outDir);
    const views = Object.keys(previews).join(', ');
    console.log(`  ✓ ${slug}  [${views}]`);
    ok++;
  } catch (err) {
    console.error(`  ✗ ${slug}: ${err.message}`);
    failed++;
  }
}

console.log(`\nDone — ${ok} ok, ${failed} failed`);
