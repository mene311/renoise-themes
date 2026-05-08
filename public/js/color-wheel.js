/**
 * Color Wheel Panel for Renoise Theme Creator.
 * Replaces browser native <input type="color"> with a canvas HSV color wheel.
 *
 * Uses ReinventedColorWheel (IIFE, pre-loaded via <script> tag).
 * Creates a single floating panel that docks to the viewport bottom-right.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Only run on pages with our swatches
  const firstSwatch = document.querySelector('.color-swatch[data-el]');
  if (!firstSwatch || typeof ReinventedColorWheel === 'undefined') return;

  let activeEl = null;       // Currently selected element name
  let wheel = null;          // ReinventedColorWheel instance
  let syncInProgress = false; // Prevent change→change loops

  // ── Build the wheel panel DOM ─────────────────

  const panel = document.createElement('div');
  panel.className = 'wheel-panel';
  panel.setAttribute('aria-label', 'Color wheel');
  panel.innerHTML = `
    <div class="wheel-panel-header">
      <span class="wheel-panel-title" id="wheelActiveLabel">Pick a color</span>
      <button class="wheel-close" aria-label="Close color wheel" title="Close">&times;</button>
    </div>
    <div class="wheel-canvas-wrap" id="wheelCanvasWrap"></div>
    <div class="wheel-hex-row">
      <span class="wheel-hex-hash">#</span>
      <input type="text" class="wheel-hex-input" id="wheelHexInput" maxlength="6" placeholder="hex" spellcheck="false">
      <span class="wheel-hex-label" id="wheelHexElement"></span>
    </div>
  `;
  document.body.appendChild(panel);

  const closeBtn = panel.querySelector('.wheel-close');
  const hexInput = panel.querySelector('#wheelHexInput');
  const activeLabel = panel.querySelector('#wheelActiveLabel');
  const hexElement = panel.querySelector('#wheelHexElement');

  // ── Initialize color wheel ────────────────────

  function createWheel() {
    if (wheel) return;
    const canvasWrap = panel.querySelector('#wheelCanvasWrap');
    wheel = new ReinventedColorWheel({
      appendTo: canvasWrap,
      hex: '#808080',
      wheelDiameter: 180,
      wheelThickness: 18,
      handleDiameter: 14,
      wheelReflectsSaturation: true,
      onChange: onWheelChange,
    });
  }

  // ── Wheel → inputs ────────────────────────────

  function onWheelChange() {
    if (!activeEl || !wheel || syncInProgress) return;
    const hex = wheel.hex;
    hexInput.value = hex.replace('#', '');

    // Update the hidden input
    const input = document.querySelector(`input[data-element="${CSS.escape(activeEl)}"]`);
    if (input) {
      input.value = hex;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Update the swatch
    updateSwatch(activeEl, hex);
  }

  // ── Hex input → wheel ─────────────────────────

  hexInput.addEventListener('input', () => {
    if (!wheel || syncInProgress) return;
    let val = hexInput.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
    if (val.length === 3 || val.length === 6) {
      val = val.length === 3
        ? val[0] + val[0] + val[1] + val[1] + val[2] + val[2]
        : val;
      syncInProgress = true;
      wheel.hex = '#' + val;
      syncInProgress = false;
    }
  });

  // Also sync on Enter/blur if partial
  hexInput.addEventListener('change', () => {
    if (!wheel || syncInProgress) return;
    let val = hexInput.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
    if (val.length === 6) {
      syncInProgress = true;
      wheel.hex = '#' + val;
      syncInProgress = false;
      onWheelChange();
    }
  });

  // ── Field selection ───────────────────────────

  function selectField(elName) {
    activeEl = elName;

    // Highlight the swatch
    document.querySelectorAll('.color-swatch.active').forEach(s => s.classList.remove('active'));
    const swatch = document.querySelector(`.color-swatch[data-el="${CSS.escape(elName)}"]`);
    if (swatch) swatch.classList.add('active');

    // Show panel
    panel.classList.add('wheel-panel--visible');

    // Update wheel
    const input = document.querySelector(`input[data-element="${CSS.escape(elName)}"]`);
    const hex = input ? input.value : '#808080';
    syncInProgress = true;
    if (wheel) {
      wheel.hex = hex;
    } else {
      createWheel();
      wheel.hex = hex;
    }
    syncInProgress = false;
    hexInput.value = hex.replace('#', '');
    activeLabel.textContent = elName.replace(/_/g, ' ');
    hexElement.textContent = elName.replace(/_/g, ' ');

    // Scroll the swatch into view if needed
    if (swatch) {
      swatch.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function closePanel() {
    activeEl = null;
    panel.classList.remove('wheel-panel--visible');
    document.querySelectorAll('.color-swatch.active').forEach(s => s.classList.remove('active'));
  }

  // ── Event delegation on swatches ──────────────

  document.addEventListener('click', (e) => {
    const swatch = e.target.closest('.color-swatch[data-el]');
    if (swatch) {
      e.preventDefault();
      const elName = swatch.dataset.el;
      // If clicking the same swatch, toggle close
      if (activeEl === elName) {
        closePanel();
      } else {
        selectField(elName);
      }
    }
  });

  // Keyboard support for swatches
  document.addEventListener('keydown', (e) => {
    const swatch = e.target.closest('.color-swatch[data-el]');
    if (swatch && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      selectField(swatch.dataset.el);
    }
  });

  // Close button
  closeBtn.addEventListener('click', closePanel);

  // ── Public API ────────────────────────────────

  /**
   * Update a swatch's background color (call from creator.js / creator-palette.js).
   * @param {string} elName - Element name (e.g., 'Main_Back')
   * @param {string} hex - CSS hex color (e.g., '#ff0000')
   */
  function updateSwatch(elName, hex) {
    const swatch = document.querySelector(`.color-swatch[data-el="${CSS.escape(elName)}"]`);
    if (swatch) {
      swatch.style.backgroundColor = hex;
    }
    // If this is the active field, keep wheel in sync
    if (activeEl === elName && wheel && !syncInProgress) {
      syncInProgress = true;
      wheel.hex = hex;
      hexInput.value = hex.replace('#', '');
      syncInProgress = false;
    }
  }

  /**
   * Sync ALL swatches from hidden inputs (call after presets/palette apply).
   */
  function syncAllSwatches() {
    document.querySelectorAll('input[data-element]').forEach(input => {
      updateSwatch(input.dataset.element, input.value);
    });
  }

  // Expose for creator.js and creator-palette.js
  window.__colorWheel = {
    selectField,
    updateSwatch,
    syncAllSwatches,
    closePanel,
    get activeEl() { return activeEl; },
  };
});
