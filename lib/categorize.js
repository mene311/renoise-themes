function hexToRgb(hex) {
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16)
  };
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  };
}

/**
 * Weighted categorization — prominent colors influence tags more
 * `weighted` = array of { hex, weight, roles }
 */
export function categorizeColors(weighted) {
  // Enrich with HSL
  const colors = weighted.map(c => {
    const { r, g, b } = hexToRgb(c.hex);
    return { ...c, ...rgbToHsl(r, g, b) };
  });

  const totalWeight = colors.reduce((sum, c) => sum + c.weight, 0);
  const tags = [];

  // ── Brightness (weighted average) ──────────────
  const avgLightness = colors.reduce((sum, c) => sum + c.l * c.weight, 0) / totalWeight;
  if (avgLightness < 30)      tags.push('dark');
  else if (avgLightness < 55) tags.push('medium');
  else                        tags.push('light');

  // ── Contrast ────────────────────────────────────
  // Only consider prominent colors (weight >= 3)
  const prominent = colors.filter(c => c.weight >= 3);
  if (prominent.length >= 2) {
    const lightnesses = prominent.map(c => c.l);
    const maxL = Math.max(...lightnesses);
    const minL = Math.min(...lightnesses);
    if (maxL - minL > 60) tags.push('high-contrast');
  }

  // ── Saturation (weighted) ──────────────────────
  const avgSaturation = colors.reduce((sum, c) => sum + c.s * c.weight, 0) / totalWeight;
  const chromatic = colors.filter(c => c.s > 12);
  const chromaticWeight = chromatic.reduce((sum, c) => sum + c.weight, 0);

  if (avgSaturation < 12) {
    tags.push('monochrome');
  } else {
    // Pastel
    const pastelWeight = chromatic
      .filter(c => c.s >= 15 && c.s < 65 && c.l > 55)
      .reduce((sum, c) => sum + c.weight, 0);
    if (chromaticWeight > 0 && pastelWeight > chromaticWeight * 0.5) {
      tags.push('pastel');
    }

    // Neon / Vivid
    const vividWeight = chromatic
      .filter(c => c.s > 70 && c.l > 25 && c.l < 75)
      .reduce((sum, c) => sum + c.weight, 0);
    if (chromaticWeight > 0 && vividWeight > chromaticWeight * 0.3) {
      tags.push('neon');
    }
  }

  // ── Warm vs Cool (weighted) ────────────────────
  if (chromaticWeight > 0) {
    const warmWeight = chromatic
      .filter(c => c.h <= 60 || c.h >= 300)
      .reduce((sum, c) => sum + c.weight, 0);
    const warmRatio = warmWeight / chromaticWeight;
    if (warmRatio > 0.6)      tags.push('warm');
    else if (warmRatio < 0.4) tags.push('cool');
    else                      tags.push('mixed');
  }

  // ── Dominant color families (weighted) ─────────
  const buckets = {
    red: 0, orange: 0, yellow: 0, green: 0,
    cyan: 0, blue: 0, purple: 0, pink: 0
  };

  for (const c of chromatic) {
    if      (c.h < 15  || c.h >= 345) buckets.red    += c.weight;
    else if (c.h < 40)                buckets.orange += c.weight;
    else if (c.h < 70)                buckets.yellow += c.weight;
    else if (c.h < 160)               buckets.green  += c.weight;
    else if (c.h < 200)               buckets.cyan   += c.weight;
    else if (c.h < 260)               buckets.blue   += c.weight;
    else if (c.h < 300)               buckets.purple += c.weight;
    else                               buckets.pink   += c.weight;
  }

  const sorted = Object.entries(buckets)
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1]);

  if (sorted.length > 0) {
    tags.push(sorted[0][0]);
    if (sorted.length > 1 && sorted[1][1] >= sorted[0][1] * 0.5) {
      tags.push(sorted[1][0]);
    }
  }

  return {
    tags,
    stats: {
      avgLightness: Math.round(avgLightness),
      avgSaturation: Math.round(avgSaturation),
      totalUnique: weighted.length,
      chromaticCount: chromatic.length,
      contrastRange: prominent.length >= 2
        ? Math.max(...prominent.map(c => c.l)) - Math.min(...prominent.map(c => c.l))
        : 0
    }
  };
}
