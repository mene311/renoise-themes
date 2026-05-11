/**
 * Element Cluster Sync for Renoise Theme Creator.
 *
 * - Master → slave color propagation (linked elements auto-follow)
 * - Link/unlink toggles per slave element
 * - Accent quick-pick (Strong_Body_Font master)
 * - VU meter preset swatches
 *
 * Load after creator.js and creator-locks.js
 */

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('creatorForm');
  if (!form) return;

  const clusters = window.__CLUSTERS || [];
  const vuPresets = window.__VU_PRESETS || [];

  // ── State: tracks elements the user has unlinked from their master ──
  const unlinkedElements = new Set();

  // Build reverse lookup: master → [slaves]
  const masterMap = {};
  for (const cluster of clusters) {
    masterMap[cluster.master] = cluster.slaves;
  }

  // ── Helpers ──────────────────────────────────

  /** Update a slave's color to match its master */
  function syncSlaveToMaster(masterEl) {
    const masterInput = form.querySelector(`input[data-element="${CSS.escape(masterEl)}"]`);
    if (!masterInput) return;
    const color = masterInput.value;

    const slaves = masterMap[masterEl] || [];
    for (const slave of slaves) {
      if (unlinkedElements.has(slave)) continue;

      const slaveInput = form.querySelector(`input[data-element="${CSS.escape(slave)}"]`);
      if (!slaveInput) continue;
      if (slaveInput.value === color) continue;

      // Update hidden input
      slaveInput.value = color;

      // Update visual swatch (apply HSL filter for display)
      const swatch = document.querySelector(`.color-swatch[data-el="${CSS.escape(slave)}"]`);
      if (swatch) swatch.style.backgroundColor = window.__hslFilter ? window.__hslFilter.hex(color) : color;
    }

    // ── Sync duplicate inputs for the same element ──
    // Certain elements (e.g. Strong_Body_Font) appear in both the accent quick-pick
    // AND an element group. Keep ALL inputs in sync so that whichever input
    // getElementColorMap() reads (via querySelectorAll), it gets the correct value.
    const allInputs = form.querySelectorAll(`input[data-element="${CSS.escape(masterEl)}"]`);
    if (allInputs.length > 1) {
      allInputs.forEach(inp => { inp.value = color; });
    }
  }

  /** Toggle a slave's link state */
  function toggleLink(el) {
    const pick = document.querySelector(`.color-pick[data-cluster-master="${CSS.escape(el)}"], .color-pick[data-cluster-master="${CSS.escape(el)}"]`);
    // Actually, find by data-cluster-master or data-cluster-id on the pick itself
    const label = form.querySelector(`label.color-pick--slave input[data-element="${CSS.escape(el)}"]`)?.closest('.color-pick');
    if (!label) return;

    if (unlinkedElements.has(el)) {
      // Re-link: reconnect to master, sync color
      unlinkedElements.delete(el);
      label.dataset.clusterMaster = label.dataset.clusterMaster || '';
      const master = label.dataset.clusterMaster;
      if (master) syncSlaveToMaster(master);
    } else {
      // Unlink
      unlinkedElements.add(el);
      delete label.dataset.clusterMaster;
    }
    syncLinkUI();
  }

  /** Refresh link indicators in the DOM */
  function syncLinkUI() {
    form.querySelectorAll('.color-pick--slave').forEach(pick => {
      const input = pick.querySelector('input[data-element]');
      if (!input) return;
      const el = input.dataset.element;
      const isUnlinked = unlinkedElements.has(el);
      const linkBtn = pick.querySelector('.unlink-btn');
      const linkIndicator = pick.querySelector('.link-indicator');

      if (isUnlinked) {
        pick.dataset.clusterMaster = '';
        if (linkBtn) linkBtn.textContent = '🔗';
        if (linkBtn) linkBtn.title = 'Re-link to master';
        if (linkIndicator) linkIndicator.textContent = '🔗';
        if (linkIndicator) linkIndicator.title = 'Unlinked — click to re-link';
        pick.classList.add('color-pick--unlinked');
      } else {
        const master = pick.dataset.clusterMaster;
        if (linkBtn) {
          linkBtn.textContent = '⛓️';
          linkBtn.title = master ? `Unlink from ${master.replace(/_/g, ' ')}` : 'Link to master';
        }
        if (linkIndicator) {
          linkIndicator.textContent = '⛓️';
          linkIndicator.title = master ? `Linked to ${master.replace(/_/g, ' ')}` : 'No master';
        }
        pick.classList.remove('color-pick--unlinked');
      }
    });
  }

  // ── Master → Slave propagation ───────────────

  form.addEventListener('input', (e) => {
    const input = e.target;
    if (!input.hasAttribute('data-element')) return;

    const el = input.dataset.element;

    // Check if this is a master element
    if (masterMap[el]) {
      syncSlaveToMaster(el);
    }
  });

  // ── Unlink/Relink button clicks ──────────────

  form.addEventListener('click', (e) => {
    const unlinkBtn = e.target.closest('.unlink-btn');
    if (unlinkBtn && unlinkBtn.dataset.unlinkEl) {
      e.preventDefault();
      toggleLink(unlinkBtn.dataset.unlinkEl);
    }
  });

  // ── VU Meter Presets ─────────────────────────

  const vuPresetRow = document.querySelector('.vu-presets');
  if (vuPresetRow && vuPresets.length > 0) {
    const targets = JSON.parse(vuPresetRow.dataset.targets || '[]');

    for (const preset of vuPresets) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'vu-preset-chip';
      chip.title = preset.name;
      chip.style.cssText = 'display:inline-flex;align-items:center;gap:2px;padding:3px 6px;border:1px solid var(--chrome-border);border-radius:4px;background:var(--chrome-card-bg);cursor:pointer;';

      // Show a mini gradient bar of the 5 meter colors
      const bar = document.createElement('span');
      bar.style.cssText = 'display:flex;gap:1px;height:12px;';
      for (const key of targets) {
        const seg = document.createElement('span');
        seg.style.cssText = `width:12px;height:12px;border-radius:2px;background:${preset.colors[key] || '#888'};`;
        bar.appendChild(seg);
      }
      chip.appendChild(bar);

      // Label
      const label = document.createElement('span');
      label.textContent = preset.name;
      label.style.cssText = 'font-size:9px;color:var(--chrome-text-dim);margin-left:4px;';
      chip.appendChild(label);

      chip.addEventListener('click', () => {
        for (const key of targets) {
          if (!preset.colors[key]) continue;
          const input = form.querySelector(`input[data-element="${CSS.escape(key)}"]`);
          if (!input) continue;
          input.value = preset.colors[key];
          const swatch = document.querySelector(`.color-swatch[data-el="${CSS.escape(key)}"]`);
          if (swatch) swatch.style.backgroundColor = window.__hslFilter ? window.__hslFilter.hex(preset.colors[key]) : preset.colors[key];
        }
        // Trigger a preview re-render
        const creator = window.__creator;
        if (creator && creator.renderPreview) {
          clearTimeout(creator._previewTimer);
          creator._previewTimer = setTimeout(creator.renderPreview, 100);
        }
      });

      vuPresetRow.appendChild(chip);
    }
  }

  // ── Accent quick-pick ────────────────────────

  // The accent swatch already has data-el="Strong_Body_Font". The color-wheel.js
  // handles clicks on any .color-swatch[data-el] element, so clicking the
  // accent swatch will open the wheel for Strong_Body_Font automatically.
  // When the color changes, the input event on Strong_body_Font triggers
  // syncSlaveToMaster which propagates to all accent-ui slaves.

  // ── Expose on __creator ──────────────────────

  const creator = window.__creator;
  if (creator) {
    creator.syncSlaveToMaster = syncSlaveToMaster;
    creator.toggleLink = toggleLink;
    creator.unlinkedElements = unlinkedElements;
  }

  // ── Initial sync: ensure all slaves match their masters ──
  for (const master of Object.keys(masterMap)) {
    syncSlaveToMaster(master);
  }
});
