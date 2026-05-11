/**
 * Global HSL Filter for Renoise Theme Creator.
 *
 * Non-destructive filter layer that sits on top of input values.
 * - Swatches display filtered colors, input.value stays as the base
 * - getElementColorMap() applies filter before sending to server
 * - Reset restores unfiltered originals perfectly (no precision loss)
 * - An "Apply" button bakes the filter into inputs permanently
 *
 * Grouped with the boldness slider in the creator-controls bar.
 * Load after creator-sync.js, before archetypes.js.
 */

document.addEventListener('DOMContentLoaded', () => {
  const hueSlider = document.getElementById('hslHue');
  const satSlider = document.getElementById('hslSat');
  const lightSlider = document.getElementById('hslLight');
  const hslDisplay = document.getElementById('hslDisplay');
  const hslReset = document.getElementById('hslReset');
  const form = document.getElementById('creatorForm');

  if (!hueSlider || !form) return;

  // ── Color conversion helpers ─────────────────

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

  function hslToRgb(h, s, l) {
    s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
    return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))];
  }

  // ── Filter state & engine ────────────────────

  const filter = {
    h: 0,
    s: 100,
    l: 0,

    /** Transform a hex color through current filter, return hex */
    hex(hex) {
      if (!this.isActive()) return hex;
      const [r, g, b] = hexToRgb(hex);
      return rgbToHex(...this._applyRgb(r, g, b));
    },

    /** Transform an [r,g,b] triplet, return [r,g,b] */
    rgb(r, g, b) {
      if (!this.isActive()) return [r, g, b];
      return this._applyRgb(r, g, b);
    },

    /** Pure transform: hex → HSL → apply offsets → hex */
    _applyRgb(r, g, b) {
      const [hr, s, l] = rgbToHsl(r, g, b);
      const h = ((hr + this.h) % 360 + 360) % 360;
      const ns = Math.round(Math.max(0, Math.min(100, s * (this.s / 100))));
      const nl = Math.round(Math.max(0, Math.min(100, l + this.l)));
      return hslToRgb(h, ns, nl);
    },

    isActive() {
      return this.h !== 0 || this.s !== 100 || this.l !== 0;
    },

    reset() {
      this.h = 0;
      this.s = 100;
      this.l = 0;
    }
  };

  // Expose globally
  window.__hslFilter = filter;

  // ── Apply filter to all swatches ─────────────

  function syncFilteredSwatches() {
    // Sync color-wheel swatches (calls our modified updateSwatch which applies filter)
    if (window.__colorWheel && window.__colorWheel.syncAllSwatches) {
      window.__colorWheel.syncAllSwatches();
    }
    // Sync creator.js swatches (calls our modified syncAllSwatches which applies filter)
    const creator = window.__creator;
    if (creator && creator.syncAllSwatches) {
      creator.syncAllSwatches();
    }
    // Also sync any swatches that might be direct-displayed (cluster/VU)
    // These are handled by the centralized syncAllSwatches above.
  }

  // ── Slider handlers ──────────────────────────

  function updateFromSliders() {
    filter.h = parseInt(hueSlider.value) || 0;
    filter.s = parseInt(satSlider.value) || 100;
    filter.l = parseInt(lightSlider.value) || 0;

    // Update display text
    const hStr = filter.h >= 0 ? `+${filter.h}°` : `${filter.h}°`;
    hslDisplay.textContent = `${hStr} ${filter.s}% ${filter.l >= 0 ? '+' : ''}${filter.l}%`;

    // Re-sync all swatches through filter
    syncFilteredSwatches();

    // Trigger preview re-render (debounced)
    const creator = window.__creator;
    if (creator && creator.renderPreview) {
      if (window.__previewHslTimer) clearTimeout(window.__previewHslTimer);
      window.__previewHslTimer = setTimeout(creator.renderPreview, 200);
    }
  }

  // ── Reset ────────────────────────────────────

  function resetFilter() {
    hueSlider.value = 0;
    satSlider.value = 100;
    lightSlider.value = 0;
    filter.reset();
    hslDisplay.textContent = '+0° 100% +0%';
    syncFilteredSwatches();

    // Re-render (no filter = original colors)
    const creator = window.__creator;
    if (creator && creator.renderPreview) {
      if (window.__previewHslTimer) clearTimeout(window.__previewHslTimer);
      window.__previewHslTimer = setTimeout(creator.renderPreview, 200);
    }
  }

  // ── Events ──────────────────────────────────

  hueSlider.addEventListener('input', updateFromSliders);
  satSlider.addEventListener('input', updateFromSliders);
  lightSlider.addEventListener('input', updateFromSliders);

  if (hslReset) {
    hslReset.addEventListener('click', resetFilter);
  }
});
