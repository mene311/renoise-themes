import fs from 'fs';

const SIMILARITY_THRESHOLD = 28;

function hexToRgb(hex) {
  const n = parseInt(hex, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function rgbDistance(a, b) {
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function dedupeSimilar(colors, kept, threshold = SIMILARITY_THRESHOLD) {
  const out = [];
  for (const c of colors) {
    const rgb = hexToRgb(c.hex);
    const tooClose = [...kept, ...out].some(k => rgbDistance(k._rgb, rgb) < threshold);
    if (!tooClose) out.push({ ...c, _rgb: rgb });
  }
  return out;
}

/**
 * Generate a weighted SVG palette
 * Prominent colors get bigger blocks
 */
export function generatePaletteSVG(weighted, savePath = null) {
  const padding = 16;
  const gap = 4;
  const totalWidth = 520;
  const innerWidth = totalWidth - padding * 2;

  const rawTier1 = weighted.filter(c => c.weight >= 8);
  const rawTier2 = weighted.filter(c => c.weight >= 4 && c.weight < 8);
  const rawTier3 = weighted.filter(c => c.weight >= 2 && c.weight < 4);
  const rawTier4 = weighted.filter(c => c.weight < 2);

  const tier1 = dedupeSimilar(rawTier1, []);
  const tier2 = dedupeSimilar(rawTier2, tier1);
  const tier3 = dedupeSimilar(rawTier3, [...tier1, ...tier2]);
  const tier4 = dedupeSimilar(rawTier4, [...tier1, ...tier2, ...tier3]);

  const rows = [];
  let y = padding;

  // ── Tier 1: Main colors — tall blocks ──
  if (tier1.length > 0) {
    rows.push({ label: 'MAIN', colors: tier1, height: 52 });
  }

  // ── Tier 2: Secondary — medium blocks ──
  if (tier2.length > 0) {
    rows.push({ label: 'SECONDARY', colors: tier2, height: 36 });
  }

  // ── Tier 3: UI — smaller blocks ──
  if (tier3.length > 0) {
    rows.push({ label: 'UI', colors: tier3, height: 28 });
  }

  // ── Tier 4: Accents — small blocks ──
  if (tier4.length > 0) {
    rows.push({ label: 'ACCENTS', colors: tier4, height: 22 });
  }

  // Build SVG
  let rects = '';
  const labelHeight = 16;
  const rowGap = 12;

  for (const row of rows) {
    // Label
    rects += `  <text x="${padding}" y="${y + 10}" fill="#666" font-family="monospace" font-size="10">${row.label}</text>\n`;
    y += labelHeight;

    // Color blocks — distribute evenly across width
    const count = row.colors.length;
    const blockW = Math.floor((innerWidth - gap * (count - 1)) / count);

    row.colors.forEach((c, i) => {
      const x = padding + i * (blockW + gap);
      const w = i === count - 1 ? (innerWidth - i * (blockW + gap)) : blockW; // last one fills remainder
      rects += `  <rect x="${x}" y="${y}" width="${w}" height="${row.height}" rx="4" fill="#${c.hex}"/>\n`;
    });

    y += row.height + rowGap;
  }

  const totalHeight = y + padding - rowGap;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${totalHeight}" width="${totalWidth}" height="${totalHeight}">
${rects}</svg>`;

  if (savePath) {
    fs.writeFileSync(savePath, svg, 'utf-8');
  }

  return svg;
}
