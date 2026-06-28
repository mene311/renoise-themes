/**
 * Studio Orchestrator — manages archetype selection, preview, audit,
 * smart fill, advanced toggle, download, and save for the /studio page.
 *
 * Dependencies (load order):
 *   color-utils.js, creator-constants.js, color-wheel.js, reinvented-color-wheel.js,
 *   studio-generator.js, creator-locks.js, creator-sync.js, creator-global-hsl.js,
 *   archetypes.js, creator-palette.js
 *
 * Exposes window.__studio for sub-module access.
 */

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('creatorForm');
  if (!form) return;

  // ── DOM references ──────────────────────────────

  const previewViewport = document.getElementById('previewViewport');
  const previewLoading = document.getElementById('previewLoading');
  const previewEmpty = document.getElementById('previewEmpty');
  const previewRenderWrap = document.getElementById('previewRenderWrap');
  const downloadBtn = document.getElementById('downloadBtn');
  const smartFillBtn = document.getElementById('smartFillBtn');
  const auditPairs = document.getElementById('auditPairs');
  const auditPassCount = document.getElementById('auditPassCount');
  const auditWarnCount = document.getElementById('auditWarnCount');
  const auditFailCount = document.getElementById('auditFailCount');
  const trapsList = document.getElementById('trapsList');
  const studioTraps = document.getElementById('studioTraps');
  const showAdvancedBtn = document.getElementById('showAdvancedBtn');
  const archetypeSelector = document.getElementById('archetypeSelector');
  const pageEl = document.querySelector('.studio-page');
  const mode = window.__STUDIO_MODE || 'studio';
  const isStudioMode = mode === 'studio';

  // ── State ───────────────────────────────────────

  let previewTimer = null;
  let rendering = false;
  const defaultColors = {};
  let currentArchetypeId = null;
  let advancedOpen = false;
  const lockedElements = new Set();

  // Capture initial values as "default" preset
  form.querySelectorAll('input[data-element]').forEach(input => {
    defaultColors[input.dataset.element] = input.value;
  });

  // ── Helpers ─────────────────────────────────────

  function setPreviewState(state) {
    if (previewEmpty) previewEmpty.style.display = state === 'empty' ? 'flex' : 'none';
    if (previewLoading) previewLoading.style.display = state === 'loading' ? 'flex' : 'none';
    if (previewRenderWrap) previewRenderWrap.style.display = state === 'image' ? 'block' : 'none';
  }

  function getElementColorMap() {
    const map = {};
    const filter = window.__hslFilter;
    form.querySelectorAll('input[data-element]').forEach(input => {
      const el = input.dataset.element;
      const hex = input.value.replace('#', '');
      let r = parseInt(hex.substring(0, 2), 16);
      let g = parseInt(hex.substring(2, 4), 16);
      let b = parseInt(hex.substring(4, 6), 16);
      if (filter) [r, g, b] = filter.rgb(r, g, b);
      map[el] = [r, g, b];
    });
    return map;
  }

  /** Seed all form inputs from a color map object { elementName: '#hex' or [r,g,b] } */
  function seedColors(colorMap) {
    form.querySelectorAll('input[data-element]').forEach(input => {
      const el = input.dataset.element;
      const val = colorMap[el];
      if (!val) return;
      if (typeof val === 'string') {
        input.value = val.startsWith('#') ? val : '#' + val;
      } else if (Array.isArray(val) && val.length === 3) {
        input.value = '#' + [val[0], val[1], val[2]]
          .map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
      }
    });
    syncAllSwatches();
  }

  function syncAllSwatches() {
    const filter = window.__hslFilter;
    form.querySelectorAll('input[data-element]').forEach(input => {
      const swatch = document.querySelector(`.color-swatch[data-el="${CSS.escape(input.dataset.element)}"]`);
      if (swatch) {
        swatch.style.backgroundColor = filter ? filter.hex(input.value) : input.value;
      }
    });
  }

  // ── Preview Rendering ───────────────────────────

  async function renderPreview() {
    if (rendering) return;
    rendering = true;
    setPreviewState('loading');

    try {
      const res = await fetch('/api/render-preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({ elementColorMap: getElementColorMap() })
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => 'Unknown error');
        throw new Error(res.status === 429 ? 'Rate limited — wait a moment' : `Server error: ${errText.slice(0, 100)}`);
      }

      const data = await res.json();
      if (!data.success) {
        previewLoading.textContent = '⚠️ ' + (data.error || 'Render failed');
        rendering = false;
        return;
      }

      previewRenderWrap.innerHTML = '';
      const img = document.createElement('img');
      img.className = 'preview-render';
      img.src = data.previews.pattern + '?t=' + Date.now();
      img.alt = 'Pattern Editor preview';
      img.loading = 'lazy';
      previewRenderWrap.appendChild(img);

      setPreviewState('image');

      // Run audit and trap detection after every successful render
      runAudit();
      runTrapDetection();
    } catch (err) {
      previewLoading.textContent = '⚠️ ' + err.message;
    }
    rendering = false;
  }

  // ── Auto-preview on color change (debounced 500ms) ──

  form.addEventListener('input', (e) => {
    if (e.target.hasAttribute('data-element')) {
      // Immediate local audit — instant grade feedback (no server needed)
      runAudit();
      runTrapDetection();
      // Full preview — debounced
      if (previewTimer) clearTimeout(previewTimer);
      previewTimer = setTimeout(renderPreview, 500);
    }
  });
  form.addEventListener('change', (e) => {
    if (e.target.hasAttribute('data-element')) {
      // Immediate local audit — instant grade feedback (no server needed)
      runAudit();
      runTrapDetection();
      // Full preview — debounced
      if (previewTimer) clearTimeout(previewTimer);
      previewTimer = setTimeout(renderPreview, 500);
    }
  });

  // ── Contrast Audit ──────────────────────────────

  function runAudit() {
    if (!window.__studioGen || !auditPairs) return;
    const map = getElementColorMap();
    const results = window.__studioGen.runContrastAudit(map);

    let pass = 0, warn = 0, fail = 0;
    auditPairs.innerHTML = '';

    for (const r of results) {
      if (r.grade === 'AAA') pass++;
      else if (r.grade === 'AA' || r.grade === 'AA-lg') warn++;
      else if (r.grade === 'FAIL') fail++;

      const pair = document.createElement('div');
      pair.className = 'audit-pair';
      const gradeClass = r.grade === 'AAA' ? 'audit-aaa' :
        r.grade === 'AA' || r.grade === 'AA-lg' ? 'audit-aa' : 'audit-fail-grade';

      pair.innerHTML = `
        <span class="audit-swatch" style="background:${r.fontHex};color:${r.bgHex};">Aa</span>
        <span class="audit-label">${r.label}</span>
        <span class="audit-ratio">${r.ratio > 0 ? r.ratio + ':1' : '—'}</span>
        <span class="audit-grade ${gradeClass}">${r.grade}</span>
      `;

      // Clicking an audit row scrolls to and opens the color swatch for that font element
      pair.dataset.font = r.font;
      pair.style.cursor = 'pointer';
      pair.title = `Click to edit ${r.label}`;
      pair.addEventListener('click', () => {
        const swatch = document.querySelector(`.color-swatch[data-el="${CSS.escape(r.font)}"]`);
        if (swatch) {
          swatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(() => swatch.click(), 300); // small delay for scroll to settle
        }
      });
      auditPairs.appendChild(pair);
    }

    if (auditPassCount) auditPassCount.textContent = pass;
    if (auditWarnCount) auditWarnCount.textContent = warn;
    if (auditFailCount) auditFailCount.textContent = fail;
  }

  // ── Trap Detection ──────────────────────────────

  function runTrapDetection() {
    if (!window.__studioGen || !trapsList || !studioTraps) return;
    const map = getElementColorMap();
    const traps = window.__studioGen.detectTraps(map);

    if (traps.length === 0) {
      studioTraps.style.display = 'none';
      return;
    }

    studioTraps.style.display = 'block';
    trapsList.innerHTML = '';
    for (const t of traps) {
      const el = document.createElement('div');
      el.className = `trap-warning trap-${t.severity}`;
      let swatchHtml = '';
      if (t.element && map[t.element]) {
        const hex = map[t.element];
        const bg = '#' + hex.map(v => v.toString(16).padStart(2,'0')).join('');
        swatchHtml = `<span class="trap-swatch" style="background:${bg}"></span> `;
      }
      el.innerHTML = `<span class="trap-icon">${t.severity === 'high' ? '❌' : '⚠️'}</span>${swatchHtml}<span class="trap-msg">${t.message}</span>`;
      trapsList.appendChild(el);
    }
  }

  // ── Archetype Selection ─────────────────────────

  function selectArchetype(archetypeId) {
    if (!window.__ARCHETYPES || !window.__ARCHETYPES[archetypeId]) return;
    const archetype = window.__ARCHETYPES[archetypeId];
    currentArchetypeId = archetypeId;

    // Highlight selected card
    document.querySelectorAll('.archetype-card').forEach(card => {
      card.classList.toggle('selected', card.dataset.archetype === archetypeId);
    });

    // Seed colors
    seedColors(archetype.colors);

    // Render preview
    renderPreview();
  }

  // Archetype card clicks
  document.querySelectorAll('.archetype-card').forEach(card => {
    card.addEventListener('click', () => selectArchetype(card.dataset.archetype));
  });

  // ── Smart Fill ──────────────────────────────────

  function doSmartFill() {
    if (!window.__studioGen) {
      console.warn('Smart Fill: studio-generator.js not loaded');
      return;
    }
    if (!smartFillBtn) return;

    const map = getElementColorMap();
    const anchors = ['Main_Back', 'Body_Back', 'Main_Font', 'Selection_Back'];
    const missing = anchors.filter(a => !map[a]);
    if (missing.length > 0) {
      console.warn('Smart Fill: missing anchor colors —', missing.join(', '));
      // Still attempt fill — some elements will be skipped
    }

    // Visual feedback: disable button
    smartFillBtn.disabled = true;
    smartFillBtn.textContent = '🔮 Filling...';

    // Get archetype seed for fill defaults
    let archetypeColors = null;
    if (currentArchetypeId && window.__ARCHETYPES && window.__ARCHETYPES[currentArchetypeId]) {
      const arch = window.__ARCHETYPES[currentArchetypeId];
      archetypeColors = {};
      for (const [name, hex] of Object.entries(arch.colors)) {
        const h = hex.replace('#', '');
        archetypeColors[name] = [
          parseInt(h.substring(0, 2), 16),
          parseInt(h.substring(2, 4), 16),
          parseInt(h.substring(4, 6), 16)
        ];
      }
    }

    const filled = window.__studioGen.fillRemaining(map, lockedElements, archetypeColors);

    // Convert back to hex and seed form
    const hexMap = {};
    for (const [name, rgb] of Object.entries(filled)) {
      hexMap[name] = '#' + [rgb[0], rgb[1], rgb[2]]
        .map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
    }
    seedColors(hexMap);

    // Show success feedback
    smartFillBtn.textContent = '✓ Filled';
    setTimeout(() => {
      smartFillBtn.disabled = false;
      smartFillBtn.textContent = '🎲 Smart Fill';
    }, 1200);

    renderPreview();
  }

  if (smartFillBtn) {
    smartFillBtn.addEventListener('click', doSmartFill);
  }

  // ── Advanced Editor Toggle ───────────────────────

  const advancedGroups = document.getElementById('advancedGroups');

  if (showAdvancedBtn) {
    showAdvancedBtn.addEventListener('click', () => {
      advancedOpen = !advancedOpen;
      if (advancedOpen) {
        // Hide archetype selector, show advanced groups
        if (archetypeSelector) archetypeSelector.style.display = 'none';
        if (advancedGroups) { advancedGroups.style.display = 'block'; }
        // Optionally expand all groups
        document.querySelectorAll('.creator-group').forEach(g => g.open = true);
        showAdvancedBtn.innerHTML = '🎨 Guided View <span class="toggle-hint">(hide advanced)</span>';
        if (pageEl) pageEl.dataset.mode = 'advanced';
      } else {
        // Show archetype selector, hide advanced groups
        if (archetypeSelector) archetypeSelector.style.display = 'grid';
        if (advancedGroups) { advancedGroups.style.display = 'none'; }
        showAdvancedBtn.innerHTML = '⚙️ Show Advanced Editor <span class="toggle-hint">(all 70+ color pickers)</span>';
        if (pageEl) pageEl.dataset.mode = 'studio';
      }
    });
  }

  // ── Preset: Default ─────────────────────────────

  document.getElementById('presetDefault')?.addEventListener('click', () => {
    if (window.__creator?.clearAllLocks) window.__creator.clearAllLocks();
    form.querySelectorAll('input[data-element]').forEach(input => {
      const el = input.dataset.element;
      if (defaultColors[el]) input.value = defaultColors[el];
    });
    syncAllSwatches();
    renderPreview();
  });

  document.getElementById('presetWhite')?.addEventListener('click', () => {
    if (window.__creator?.clearAllLocks) window.__creator.clearAllLocks();
    form.querySelectorAll('input[data-element]').forEach(input => {
      input.value = '#FFFFFF';
    });
    syncAllSwatches();
    renderPreview();
  });

  // ── Download ────────────────────────────────────

  if (downloadBtn) {
    downloadBtn.addEventListener('click', async () => {
      try {
        downloadBtn.disabled = true;
        downloadBtn.textContent = '⏳ Generating...';

        const res = await fetch('/api/download-xrnc', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
          },
          body: JSON.stringify({ elementColorMap: getElementColorMap() })
        });

        if (!res.ok) throw new Error('Download failed');

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'my-theme.xrnc';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        downloadBtn.disabled = false;
        downloadBtn.textContent = '⬇ Download .xrnc';
      } catch (err) {
        alert('Download failed: ' + err.message);
        downloadBtn.disabled = false;
        downloadBtn.textContent = '⬇ Download .xrnc';
      }
    });
  }

  // ── Save to Profile ─────────────────────────────

  const saveToProfileBtn = document.getElementById('saveToProfileBtn');
  const themeNameInput = document.getElementById('themeName');
  if (saveToProfileBtn) {
    saveToProfileBtn.addEventListener('click', async () => {
      try {
        const name = themeNameInput ? themeNameInput.value.trim() : '';
        if (!name) {
          themeNameInput?.focus();
          themeNameInput?.classList.add('input-error');
          setTimeout(() => themeNameInput?.classList.remove('input-error'), 2000);
          alert('Please enter a theme name');
          return;
        }

        saveToProfileBtn.disabled = true;
        saveToProfileBtn.textContent = '⏳ Saving...';

        const res = await fetch('/api/save-theme', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
          },
          body: JSON.stringify({ name, elementColorMap: getElementColorMap() })
        });

        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Save failed');

        window.location.href = `/theme/${data.slug}`;
      } catch (err) {
        alert('Save failed: ' + err.message);
        saveToProfileBtn.disabled = false;
        saveToProfileBtn.textContent = '💾 Save to Profile';
      }
    });
  }

  // ── Save Existing (edit mode) ───────────────────

  const saveBtn = document.getElementById('saveBtn');
  const editSlugInput = document.getElementById('editSlug');
  if (saveBtn && editSlugInput) {
    saveBtn.addEventListener('click', async () => {
      try {
        saveBtn.disabled = true;
        saveBtn.textContent = '⏳ Saving...';

        const slug = editSlugInput.value;
        if (!slug) throw new Error('Missing theme slug');

        const res = await fetch('/api/save-edited-theme', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
          },
          body: JSON.stringify({ slug, elementColorMap: getElementColorMap() })
        });

        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Save failed');

        window.location.href = `/theme/${data.slug}`;
      } catch (err) {
        alert('Save failed: ' + err.message);
        saveBtn.disabled = false;
        saveBtn.textContent = '💾 Save Changes';
      }
    });
  }

  // ── Expose shared API for sub-modules ───────────

  window.__studio = {
    form,
    renderPreview,
    getElementColorMap,
    syncAllSwatches,
    lockedElements,
    selectArchetype,
    doSmartFill,
    currentArchetypeId: () => currentArchetypeId,
  };

  // Re-expose for creator-locks.js compatibility
  window.__creator = window.__studio;

  // ── Init ────────────────────────────────────────

  // If remix colors are provided, seed them
  if (window.__REMIX_COLORS) {
    seedColors(window.__REMIX_COLORS);
    // Seed Default_Color track colors from remix too
    setTimeout(renderPreview, 600);
  } else if (isStudioMode && window.__ARCHETYPE_LIST && window.__ARCHETYPE_LIST.length > 0) {
    // Auto-select the first archetype (workhorse)
    selectArchetype(window.__ARCHETYPE_LIST[0].id);
  } else if (isStudioMode) {
    // Edge case: no archetype list available — still render a preview so page isn't blank
    console.warn('Studio: ARCHETYPE_LIST empty or undefined, rendering with defaults');
    setTimeout(renderPreview, 600);
  } else {
    // Create mode: just render with defaults
    setTimeout(renderPreview, 600);
  }
});
