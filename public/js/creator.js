document.addEventListener('DOMContentLoaded', () => {
  const downloadBtn = document.getElementById('downloadBtn');
  const previewViewport = document.getElementById('previewViewport');
  const previewLoading = document.getElementById('previewLoading');
  const previewEmpty = document.getElementById('previewEmpty');
  const previewRenderWrap = document.getElementById('previewRenderWrap');
  const form = document.getElementById('creatorForm');

  if (!form) return;

  // ── State ────────────────────────────────────

  let previewTimer = null;
  let rendering = false;
  const defaultColors = {};

  // Capture initial values as "default" preset
  form.querySelectorAll('input[data-element]').forEach(input => {
    defaultColors[input.dataset.element] = input.value;
  });

  // ── Helpers ──────────────────────────────────

  function setPreviewState(state) {
    if (previewEmpty) previewEmpty.style.display = state === 'empty' ? 'flex' : 'none';
    if (previewLoading) previewLoading.style.display = state === 'loading' ? 'flex' : 'none';
    if (previewRenderWrap) previewRenderWrap.style.display = state === 'image' ? 'block' : 'none';
  }

  function getElementColorMap() {
    const map = {};
    form.querySelectorAll('input[data-element]').forEach(input => {
      const el = input.dataset.element;
      const hex = input.value.replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      map[el] = [r, g, b];
    });
    return map;
  }

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
    } catch (err) {
      previewLoading.textContent = '⚠️ ' + err.message;
    }
    rendering = false;
  }

  // Auto-preview on color change (debounced 500ms)
  // Listen on both input (for hidden field changes) and change events
  form.addEventListener('input', (e) => {
    if (e.target.hasAttribute('data-element')) {
      if (previewTimer) clearTimeout(previewTimer);
      previewTimer = setTimeout(renderPreview, 500);
    }
  });
  form.addEventListener('change', (e) => {
    if (e.target.hasAttribute('data-element')) {
      if (previewTimer) clearTimeout(previewTimer);
      previewTimer = setTimeout(renderPreview, 500);
    }
  });

  // ── Swatch sync helper ───────────────────────

  function syncAllSwatches() {
    form.querySelectorAll('input[data-element]').forEach(input => {
      const swatch = document.querySelector(`.color-swatch[data-el="${CSS.escape(input.dataset.element)}"]`);
      if (swatch) {
        swatch.style.backgroundColor = input.value;
      }
    });
  }

  // ── Presets ──────────────────────────────────

  document.getElementById('presetDefault').addEventListener('click', () => {
    form.querySelectorAll('input[data-element]').forEach(input => {
      const el = input.dataset.element;
      if (defaultColors[el]) input.value = defaultColors[el];
    });
    syncAllSwatches();
    renderPreview();
  });

  document.getElementById('presetWhite').addEventListener('click', () => {
    form.querySelectorAll('input[data-element]').forEach(input => {
      input.value = '#FFFFFF';
    });
    syncAllSwatches();
    renderPreview();
  });

  // Expose shared API for palette generator (creator-palette.js)
  // and color wheel (color-wheel.js)
  window.__creator = {
    form,
    renderPreview,
    getElementColorMap,
    syncAllSwatches
  };

  // ── Download ─────────────────────────────────

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

  // ── Save Edited Theme ────────────────────────

  const saveBtn = document.getElementById('saveBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      try {
        saveBtn.disabled = true;
        saveBtn.textContent = '⏳ Saving...';

        const slug = document.querySelector('input[name="editSlug"]')?.value;
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

  // Initial preview
  setTimeout(renderPreview, 600);
});
