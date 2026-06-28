/**
 * Color Wheel Panel for Renoise Theme Creator.
 * Replaces browser native <input type="color"> with a canvas HSV color wheel.
 *
 * - Centered modal overlay (not bottom-right docked)
 * - Last picked color persists across swatch switches
 * - ESC discards changes and restores original value
 * - Right-click to copy/paste hex between swatches
 */

document.addEventListener('DOMContentLoaded', () => {
  // Only run on pages with our swatches
  const firstSwatch = document.querySelector('.color-swatch[data-el]');
  if (!firstSwatch || typeof ReinventedColorWheel === 'undefined') return;

  let activeEl = null;            // Currently selected element name
  let wheel = null;               // ReinventedColorWheel instance
  let syncInProgress = false;     // Prevent change→change loops
  let lastHex = null;             // Last color actively picked from wheel
  let originalValue = null;       // Swatch value when panel opened (for ESC revert)
  let copiedHex = null;           // Hex copied via right-click
  let copiedFromEl = null;        // Element the hex was copied from

  // ── Build the overlay + panel DOM ─────────────

  const overlay = document.createElement('div');
  overlay.className = 'wheel-overlay';
  document.body.appendChild(overlay);

  const panel = document.createElement('div');
  panel.className = 'wheel-panel';
  panel.setAttribute('aria-label', 'Color wheel');
  panel.innerHTML = `
    <div class="wheel-panel-header">
      <span class="wheel-panel-title" id="wheelActiveLabel">Pick a color</span>
    </div>
    <div class="wheel-canvas-wrap" id="wheelCanvasWrap"></div>
    <div class="wheel-hex-row">
      <span class="wheel-hex-hash">#</span>
      <input type="text" class="wheel-hex-input" id="wheelHexInput" maxlength="6" placeholder="hex" spellcheck="false">
    </div>
    <div class="wheel-actions">
      <button class="wheel-btn wheel-btn-cancel" id="wheelCancelBtn" title="Discard changes (Esc)">Cancel</button>
      <button class="wheel-btn wheel-btn-accept" id="wheelAcceptBtn" title="Apply color (Enter)">✓ Accept</button>
    </div>
  `;
  document.body.appendChild(panel);

  const acceptBtn = panel.querySelector('#wheelAcceptBtn');
  const cancelBtn = panel.querySelector('#wheelCancelBtn');
  const hexInput = panel.querySelector('#wheelHexInput');
  const activeLabel = panel.querySelector('#wheelActiveLabel');
  // hexElement removed — label is in the header now

  // ── Copy/paste toast ──────────────────────────

  const toast = document.createElement('div');
  toast.className = 'color-copied-toast';
  toast.textContent = '📋 Copied';
  document.body.appendChild(toast);
  let toastTimer = null;

  function showToast(msg, duration = 1200) {
    toast.textContent = msg;
    toast.classList.add('color-copied-toast--visible');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('color-copied-toast--visible');
    }, duration);
  }

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

    // Track the last color the user actively picked
    lastHex = hex;

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
      // Also track last picked color from typed input
      lastHex = '#' + val;
    }
  });

  hexInput.addEventListener('change', () => {
    if (!wheel || syncInProgress) return;
    let val = hexInput.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
    if (val.length === 6) {
      syncInProgress = true;
      wheel.hex = '#' + val;
      syncInProgress = false;
      lastHex = '#' + val;
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

    // Store original value for ESC revert
    const input = document.querySelector(`input[data-element="${CSS.escape(elName)}"]`);
    originalValue = input ? input.value : '#808080';

    // Auto-unlock if this element is pinned (editing manually overrides lock)
    const creator = window.__creator;
    if (creator && creator.isLocked && creator.isLocked(elName)) {
      creator.toggleLock(elName); // toggles off, syncs UI, updates random btn
      showToast('🔓 Unpinned — editing directly');
    }

    // Show overlay + panel
    overlay.classList.add('wheel-overlay--visible');
    panel.classList.add('wheel-panel--visible');

    // Initialize wheel with the LAST picked color (or the swatch's value on first open)
    const hex = lastHex || originalValue;
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

    // Scroll the swatch into view if needed
    if (swatch) {
      swatch.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function closePanel(discard = false) {
    // If discarding, restore the original value
    if (discard && activeEl && originalValue) {
      const input = document.querySelector(`input[data-element="${CSS.escape(activeEl)}"]`);
      if (input) {
        input.value = originalValue;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      updateSwatch(activeEl, originalValue);
    }

    activeEl = null;
    originalValue = null;
    overlay.classList.remove('wheel-overlay--visible');
    panel.classList.remove('wheel-panel--visible');
    document.querySelectorAll('.color-swatch.active').forEach(s => s.classList.remove('active'));
  }

  // ── Right-click copy/paste ────────────────────

  function clearCopiedIndicator() {
    document.querySelectorAll('.color-swatch.copied-from').forEach(s => s.classList.remove('copied-from'));
  }

  function handleRightClick(swatch, elName) {
    const input = document.querySelector(`input[data-element="${CSS.escape(elName)}"]`);
    if (!input) return;

    const currentHex = input.value;

    if (copiedHex && copiedFromEl !== elName) {
      // Paste: another swatch was copied, apply it here
      input.value = copiedHex;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      updateSwatch(elName, copiedHex);

      // If wheel is open for this element, sync it
      if (activeEl === elName && wheel) {
        syncInProgress = true;
        wheel.hex = copiedHex;
        hexInput.value = copiedHex.replace('#', '');
        lastHex = copiedHex;
        syncInProgress = false;
      }

      showToast(`📋 Pasted ${copiedHex}`);
      copiedHex = null;
      clearCopiedIndicator();
      // Remove paste cursor from all swatches
      document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('paste-target'));
    } else if (copiedHex && copiedFromEl === elName) {
      // Cancel: right-clicking the same swatch cancels the copy
      showToast('✕ Cancelled');
      copiedHex = null;
      copiedFromEl = null;
      clearCopiedIndicator();
      document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('paste-target'));
    } else {
      // Copy: store this swatch's hex
      copiedHex = currentHex;
      copiedFromEl = elName;
      clearCopiedIndicator();
      swatch.classList.add('copied-from');
      // Show paste hint on other swatches
      document.querySelectorAll('.color-swatch').forEach(s => {
        if (s.dataset.el !== elName) s.classList.add('paste-target');
      });
      showToast(`📋 Copied ${currentHex}`);
    }
  }

  // ── Event: Click swatch → open wheel ──────────

  document.addEventListener('click', (e) => {
    const swatch = e.target.closest('.color-swatch[data-el]');
    if (!swatch) return;

    e.preventDefault();
    const elName = swatch.dataset.el;

    // If clicking the same swatch, toggle close
    if (activeEl === elName) {
      closePanel(true); // ESC-style discard on re-click
    } else {
      selectField(elName);
    }
  });

  // ── Event: Right-click swatch → copy/paste ────

  document.addEventListener('contextmenu', (e) => {
    const swatch = e.target.closest('.color-swatch[data-el]');
    if (!swatch) return;

    e.preventDefault();
    handleRightClick(swatch, swatch.dataset.el);
  });

  // ── Event: Keyboard support ───────────────────

  document.addEventListener('keydown', (e) => {
    // Enter → save + close
    if (e.key === 'Enter' && panel.classList.contains('wheel-panel--visible')) {
      e.preventDefault();
      closePanel(false); // keep current color, close
      return;
    }

    // ESC → close + discard
    if (e.key === 'Escape' && panel.classList.contains('wheel-panel--visible')) {
      e.preventDefault();
      closePanel(true);
      return;
    }

    // Enter / Space on a swatch → select it
    const swatch = e.target.closest('.color-swatch[data-el]');
    if (swatch && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      selectField(swatch.dataset.el);
    }
  });

  // ── Event: Click overlay → close + discard ────

  overlay.addEventListener('click', () => {
    closePanel(true);
  });

  // ── Close button ──────────────────────────────

  acceptBtn.addEventListener('click', () => closePanel(false));
  cancelBtn.addEventListener('click', () => closePanel(true));

  // ── Public API ────────────────────────────────

  /**
   * Update a swatch's background color (call from creator.js / creator-palette.js).
   * @param {string} elName - Element name (e.g., 'Main_Back')
   * @param {string} hex - CSS hex color (e.g., '#ff0000')
   */
  function updateSwatch(elName, hex) {
    const swatch = document.querySelector(`.color-swatch[data-el="${CSS.escape(elName)}"]`);
    if (swatch) {
      // Display filtered version; store base hex in lastHex
      const displayHex = window.__hslFilter ? window.__hslFilter.hex(hex) : hex;
      swatch.style.backgroundColor = displayHex;
    }
    // Track the BASE color (unfiltered) for next wheel open
    lastHex = hex;
    // If this is the active field, keep wheel in sync (show base in wheel)
    if (activeEl === elName && wheel && !syncInProgress) {
      syncInProgress = true;
      wheel.hex = hex;
      hexInput.value = hex.replace('#', '');
      syncInProgress = false;
    }
  }

  /**
   * Sync ALL swatches from hidden inputs (call after presets/palette apply).
   * Sets lastHex to Main_Back as the most representative color.
   */
  function syncAllSwatches() {
    document.querySelectorAll('input[data-element]').forEach(input => {
      updateSwatch(input.dataset.element, input.value);
    });
    // After bulk update, default lastHex to Main_Back (most representative)
    const mainBack = document.querySelector('input[data-element="Main_Back"]');
    if (mainBack) lastHex = mainBack.value;
  }

  // Expose for creator.js and creator-palette.js
  window.__colorWheel = {
    selectField,
    updateSwatch,
    syncAllSwatches,
    closePanel: (discard) => closePanel(discard !== false),
    get activeEl() { return activeEl; },
  };
});
