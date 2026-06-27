/**
 * Shared Color Utilities for Renoise Theme Creator.
 *
 * All palette-generation and color-manipulation modules import from here
 * to eliminate duplicate hslToRgb / rgbToHex / hexToRgb across 4 files.
 *
 * Must be loaded BEFORE any creator script that uses color math.
 * Exposed on window.__colorUtils.
 */

window.__colorUtils = (function () {

  // ── HSL ↔ RGB ─────────────────────────────────

  function hslToRgb(h, s, l) {
    s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
    return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))];
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) * 60; break;
        case g: h = ((b - r) / d + 2) * 60; break;
        case b: h = ((r - g) / d + 4) * 60; break;
      }
    }
    return [Math.round(h % 360), Math.round(s * 100), Math.round(l * 100)];
  }

  // ── Hex ↔ RGB ─────────────────────────────────

  function hexToRgb(hex) {
    hex = hex.replace('#', '');
    return [
      parseInt(hex.substring(0, 2), 16),
      parseInt(hex.substring(2, 4), 16),
      parseInt(hex.substring(4, 6), 16)
    ];
  }

  function rgbToHex(r, g, b) {
    const clamp = v => Math.round(Math.max(0, Math.min(255, v)));
    return '#' + [r, g, b].map(v => clamp(v).toString(16).padStart(2, '0')).join('');
  }

  function hslHex(h, s, l) {
    return rgbToHex(...hslToRgb(h, s, l));
  }

  // ── Perceptual luminance & contrast ────────────

  function getLuminance(r, g, b) {
    const [rs, gs, bs] = [r, g, b].map(v => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  }

  function contrastRatio(rgb1, rgb2) {
    const l1 = getLuminance(...rgb1);
    const l2 = getLuminance(...rgb2);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  // ── Text color generator (contrast-safe) ───────

  /**
   * Generate a high-contrast text color for a given background.
   * Falls back to neutral (white/black) if WCAG AA fails at 4.5:1.
   */
  function makeTextColor(bgHex, accentHue, isLight, strong, dim) {
    const bgRgb = hexToRgb(bgHex);
    const bgLum = getLuminance(...bgRgb);
    const isBgDark = bgLum < 0.5;

    let targetL = isBgDark
      ? (strong ? 94 : (dim ? 60 : 88))
      : (strong ? 6 : (dim ? 40 : 10));
    let sat = strong ? 18 : (dim ? 6 : 10);

    let textHex = hslHex(accentHue, sat, targetL);
    const textRgb = hexToRgb(textHex);
    const ratio = contrastRatio(bgRgb, textRgb);

    if (ratio < 4.5) {
      const neutralL = isBgDark
        ? (strong ? 96 : (dim ? 65 : 92))
        : (strong ? 4 : (dim ? 35 : 8));
      textHex = hslHex(0, 0, neutralL);
    }

    return textHex;
  }

  // ── Random helpers ─────────────────────────────

  /** Random integer in [min, max] inclusive. */
  function ri(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /** Random hue in [0, 359]. */
  function rh() {
    return ri(0, 359);
  }

  // ── Math helpers ───────────────────────────────

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  /** Drift a hue by maxDrift degrees, wrapping at 360. */
  function driftHue(base, maxDrift) {
    return ((base + ri(-maxDrift, maxDrift)) % 360 + 360) % 360;
  }

  // ── Public API ─────────────────────────────────

  return {
    hslToRgb,
    rgbToHsl,
    hexToRgb,
    rgbToHex,
    hslHex,
    getLuminance,
    contrastRatio,
    makeTextColor,
    ri,
    rh,
    lerp,
    driftHue,
  };
})();
