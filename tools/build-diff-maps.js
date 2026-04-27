#!/usr/bin/env node
/**
 * Builds refined pixel maps from diff-variant screenshots.
 *
 * For each element variant, compares its screenshot against the white baseline.
 * Pixels that turned green (#00FF00) belong to that element.
 * Merges all per-element maps into final .bin + .json files.
 *
 * Usage:
 *   node tools/build-diff-maps.js tools/diff-variants/
 *
 * Expects:
 *   diff-variants/00_baseline/baseline.png
 *   diff-variants/01_Main_Back/Main_Back.png
 *   diff-variants/02_Main_Font/Main_Font.png
 *   ...
 *
 * Outputs:
 *   maps/pattern.json  (updated element list)
 *   maps/pattern.bin   (updated pixel map)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Check for sharp or use raw PNG parsing via built-in approach
let sharp;
try {
  sharp = (await import('sharp')).default;
} catch (e) {
  console.error('sharp is required. Install with: npm install sharp');
  process.exit(1);
}

// Diff-based green probe detection.
// The white-baseline variant sets one element to #00FF00 while everything else is white.
// We look for pixels that are green-ish (high G, low R/B) AND changed from the white baseline.
// This handles anti-aliasing and UI bevels robustly.
function isProbe(vr, vg, vb, br, bg, bb) {
  // Variant pixel is green-ish: high green, suppressed red/blue
  const greenish = vg > 180 && vr < 140 && vb < 140;
  // And it changed from baseline (baseline is all white = 255,255,255)
  const changed = Math.abs(vr - br) + Math.abs(vg - bg) + Math.abs(vb - bb) > 60;
  return greenish && changed;
}

const STRICT = process.argv.includes('--strict');
const CRITICAL_ELEMENTS = ['Main_Back', 'Body_Back', 'Main_Font'];

async function processScreenshots(variantsDir) {
  // Support both flat dir (tools/screenshots/) and nested (diff-variants/01_Name/Name.png)
  const files = fs.readdirSync(variantsDir);
  const hasSubdirs = files.some(d => d.match(/^\d{2}_/) && fs.statSync(path.join(variantsDir, d)).isDirectory());

  let baselinePath, variantPaths, totalVariants;
  if (hasSubdirs) {
    // Nested mode: diff-variants/00_baseline/baseline.png
    baselinePath = path.join(variantsDir, '00_baseline', 'baseline.png');
    const entries = files
      .filter(d => d.match(/^\d{2}_/) && fs.statSync(path.join(variantsDir, d)).isDirectory())
      .sort();
    variantPaths = entries.map(dir => ({
      name: dir.replace(/^\d{2}_/, ''),
      path: path.join(variantsDir, dir, dir.replace(/^\d{2}_/, '') + '.png')
    }));
  } else {
    // Flat mode: tools/screenshots/white_baseline.png + ElementName.png
    baselinePath = path.join(variantsDir, 'white_baseline.png');
    if (!fs.existsSync(baselinePath)) {
      // Try any file with "baseline" in the name
      const baselineCandidates = files.filter(f => f.toLowerCase().includes('baseline') && f.endsWith('.png'));
      if (baselineCandidates.length) baselinePath = path.join(variantsDir, baselineCandidates[0]);
    }
    variantPaths = files
      .filter(f => f.endsWith('.png') && f !== path.basename(baselinePath))
      .sort()
      .map(f => ({ name: f.replace(/\.png$/, ''), path: path.join(variantsDir, f) }));
  }

  if (!fs.existsSync(baselinePath)) {
    console.error('Baseline screenshot not found: ' + baselinePath);
    process.exit(1);
  }

  // Read baseline to get dimensions
  const baselineMeta = await sharp(baselinePath).metadata();
  const width = baselineMeta.width;
  const height = baselineMeta.height;
  const totalPixels = width * height;

  console.log(`📐 Image: ${width}×${height} (${totalPixels.toLocaleString()} pixels)`);

  // Read baseline as raw RGBA
  const baselineRaw = await sharp(baselinePath)
    .ensureAlpha()
    .raw()
    .toBuffer();

  if (variantPaths.length === 0) {
    console.error('No variant screenshots found in ' + variantsDir);
    process.exit(1);
  }

  console.log(`🔍 Processing ${variantPaths.length} variants...`);

  // Per-element pixel maps: each is a Set of pixel indices
  const elementMaps = {};
  let totalMatched = 0;
  let skipped = 0;

  for (const { name: elementName, path: screenshotPath } of variantPaths) {
    if (!fs.existsSync(screenshotPath)) {
      console.warn(`  ⚠️  No screenshot for ${elementName} — skipping`);
      skipped++;
      continue;
    }

    let variantRaw;
    try {
      const variantMeta = await sharp(screenshotPath).metadata();
      if (variantMeta.width !== width || variantMeta.height !== height) {
        const msg = `Dimension mismatch for ${elementName}: ${variantMeta.width}×${variantMeta.height} vs baseline ${width}×${height}`;
        if (STRICT) {
          console.error(`  ✗ ${msg}`);
          process.exit(1);
        }
        console.warn(`  ⚠️  ${msg} — stretching to fit (may corrupt map)`);
      }
      variantRaw = await sharp(screenshotPath)
        .ensureAlpha()
        .resize(width, height, { fit: 'fill' })
        .raw()
        .toBuffer();
    } catch (err) {
      console.error(`  ✗ Failed to read ${elementName}: ${err.message}`);
      if (STRICT) process.exit(1);
      skipped++;
      continue;
    }

    const pixels = new Set();
    let matchCount = 0;

    // Diff against baseline: only count pixels that are green-ER than baseline
    for (let offset = 0; offset < variantRaw.length; offset += 4) {
      const vr = variantRaw[offset];
      const vg = variantRaw[offset + 1];
      const vb = variantRaw[offset + 2];
      const br = baselineRaw[offset];
      const bg = baselineRaw[offset + 1];
      const bb = baselineRaw[offset + 2];

      if (isProbe(vr, vg, vb, br, bg, bb)) {
        const pixelIdx = offset / 4;
        pixels.add(pixelIdx);
        matchCount++;
      }
    }

    if (matchCount > 0) {
      elementMaps[elementName] = pixels;
      const pct = ((matchCount / totalPixels) * 100).toFixed(2);
      console.log(`  ✅ ${elementName}: ${matchCount.toLocaleString()} px (${pct}%)`);
    } else {
      console.warn(`  ⚠️  ${elementName}: 0 px matched — element may not be visible in screenshot`);
    }
    totalMatched += matchCount;
  }

  console.log(`\n📊 Total matched: ${totalMatched.toLocaleString()} / ${totalPixels.toLocaleString()} (${((totalMatched/totalPixels)*100).toFixed(1)}%)`);
  if (skipped > 0) console.log(`⚠️  Skipped: ${skipped} (no screenshot found)`);

  // Critical element sanity check
  for (const el of CRITICAL_ELEMENTS) {
    if (!elementMaps[el] || elementMaps[el].size === 0) {
      console.error(`\n🚨 Critical element "${el}" has zero mapped pixels.`);
      console.error('   This usually means Renoise failed to load the injected theme.');
      if (STRICT) process.exit(1);
    }
  }

  // Merge all per-element maps into a single pixel map
  // Strategy: assign each pixel to the element with the most specific claim.
  // Since we're using diff-based probing, overlaps should be minimal.
  // If a pixel belongs to multiple elements, assign to the one with smallest coverage.
  console.log('\n🧩 Merging pixel maps...');

  const elements = Object.keys(elementMaps).sort();
  const elementIndex = {};
  elements.forEach((name, i) => { elementIndex[name] = i; });

  // Count per-element to sort small-to-large for overlap resolution
  const sizes = elements.map(name => elementMaps[name].size);
  const order = elements
    .map((name, i) => ({ name, size: sizes[i], idx: i }))
    .sort((a, b) => a.size - b.size || a.name.localeCompare(b.name)); // smallest first, then name for determinism

  const pixelMap = new Uint8Array(totalPixels).fill(255); // 255 = UNMATCHED
  const overlapCounts = {};

  for (const { name, idx } of order) {
    const pixels = elementMaps[name];
    for (const p of pixels) {
      if (pixelMap[p] !== 255) {
        // Overlap! Keep existing (smaller/first) element
        const other = elements[pixelMap[p]];
        const key = [name, other].sort().join('+');
        overlapCounts[key] = (overlapCounts[key] || 0) + 1;
        continue;
      }
      pixelMap[p] = idx;
    }
  }

  // Report overlaps
  const overlaps = Object.entries(overlapCounts);
  if (overlaps.length > 0) {
    console.log('\n⚠️  Pixel overlaps detected:');
    overlaps.sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([key, count]) => {
      console.log(`  ${key}: ${count} px`);
    });
  }

  // Count UNMATCHED
  let unmatched = 0;
  for (let i = 0; i < pixelMap.length; i++) {
    if (pixelMap[i] === 255) unmatched++;
  }
  const unmatchedPct = (unmatched / totalPixels) * 100;
  console.log(`\n❓ UNMATCHED: ${unmatched.toLocaleString()} px (${unmatchedPct.toFixed(1)}%) of screen`);

  if (unmatchedPct > 80) {
    console.error(`🚨 UNMATCHED pixels are ${unmatchedPct.toFixed(1)}%. The pipeline is likely broken.`);
    if (STRICT) process.exit(1);
  }

  // Write output
  const mapsDir = path.join(__dirname, '..', 'maps');
  fs.mkdirSync(mapsDir, { recursive: true });

  // JSON element list
  const jsonOutput = {
    width,
    height,
    elements: elements.map(name => name.replace(/\.xrnc$/, ''))
  };
  const jsonPath = path.join(mapsDir, 'pattern.json');
  fs.writeFileSync(jsonPath, JSON.stringify(jsonOutput, null, 2));
  console.log(`\n💾 ${jsonPath} (${elements.length} elements)`);

  // Binary pixel map
  const binPath = path.join(mapsDir, 'pattern.bin');
  fs.writeFileSync(binPath, pixelMap);
  console.log(`💾 ${binPath} (${pixelMap.length} pixels)`);

  // Coverage report
  console.log('\n📊 Coverage ranking:');
  const coverageReport = elements.map(name => ({
    name,
    px: elementMaps[name]?.size || 0,
    pct: ((elementMaps[name]?.size || 0) / totalPixels * 100).toFixed(2)
  })).sort((a, b) => b.px - a.px);

  coverageReport.slice(0, 15).forEach((e, i) => {
    console.log(`  ${String(i+1).padStart(2)}. ${e.name.padEnd(30)} ${e.pct}% (${e.px.toLocaleString()} px)`);
  });

  // Write manifest with checksums for traceability
  const manifest = {
    generatedAt: new Date().toISOString(),
    sourceCommit: (() => { try { return execSync('git rev-parse HEAD', { cwd: path.join(__dirname, '..'), encoding: 'utf-8' }).trim(); } catch { return null; } })(),
    width, height, totalPixels,
    elementCount: elements.length,
    unmatched,
    unmatchedPct: parseFloat(unmatchedPct.toFixed(2)),
    coverage: coverageReport,
    files: {}
  };
  for (const [label, fpath] of [['pattern.json', jsonPath], ['pattern.bin', binPath]]) {
    const hash = crypto.createHash('sha256').update(fs.readFileSync(fpath)).digest('hex');
    manifest.files[label] = { path: path.relative(path.join(__dirname, '..'), fpath), sha256: hash, size: fs.statSync(fpath).size };
  }
  const manifestPath = path.join(mapsDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\n💾 ${manifestPath}`);

  console.log('\n✨ Done! New maps are at maps/pattern.json and maps/pattern.bin');
  console.log('   Copy to maps/ for all views or re-run for mixer/waveform screenshots.');
}

const dir = process.argv[2] || path.join(__dirname, 'diff-variants');
processScreenshots(dir);
