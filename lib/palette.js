import fs from 'fs';

/**
 * Generate a weighted SVG palette
 * Prominent colors get bigger blocks
 */
export function generatePaletteSVG(weighted, savePath = null) {
  const padding = 16;
  const gap = 4;
  const totalWidth = 520;
  const innerWidth = totalWidth - padding * 2;

  // Split into tiers by weight
  const tier1 = weighted.filter(c => c.weight >= 8);   // big backgrounds
  const tier2 = weighted.filter(c => c.weight >= 4 && c.weight < 8);  // secondary
  const tier3 = weighted.filter(c => c.weight >= 2 && c.weight < 4);  // UI elements
  const tier4 = weighted.filter(c => c.weight < 2);    // accents

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
  <rect width="100%" height="100%" fill="#0a0a0f" rx="8"/>
${rects}</svg>`;

  if (savePath) {
    fs.writeFileSync(savePath, svg, 'utf-8');
  }

  return svg;
}
