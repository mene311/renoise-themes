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
  form.querySelectorAll('input[type="color"]').forEach(input => {
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
    form.querySelectorAll('input[type="color"]').forEach(input => {
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
  form.addEventListener('input', (e) => {
    if (e.target.type === 'color') {
      if (previewTimer) clearTimeout(previewTimer);
      previewTimer = setTimeout(renderPreview, 500);
    }
  });

  // ── Presets ──────────────────────────────────

  document.getElementById('presetDefault').addEventListener('click', () => {
    form.querySelectorAll('input[type="color"]').forEach(input => {
      const el = input.dataset.element;
      if (defaultColors[el]) input.value = defaultColors[el];
    });
    renderPreview();
  });

  document.getElementById('presetWhite').addEventListener('click', () => {
    form.querySelectorAll('input[type="color"]').forEach(input => {
      input.value = '#FFFFFF';
    });
    renderPreview();
  });

  // ── Palette Generator ────────────────────────

  function hexToRgb(hex) {
    hex = hex.replace('#', '');
    return [
      parseInt(hex.substring(0, 2), 16),
      parseInt(hex.substring(2, 4), 16),
      parseInt(hex.substring(4, 6), 16)
    ];
  }

  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
  }

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
    let h, s, l = (max + min) / 2;
    if (max === min) { h = s = 0; }
    else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return [h * 360, s * 100, l * 100];
  }

  function hslHex(h, s, l) {
    return rgbToHex(...hslToRgb(h, s, l));
  }

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

  function makeTextColor(bgHex, accentHue, isLight, strong = false, dim = false) {
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

  function generatePalette(baseHue, scheme, isLight) {
    const p = {};

    let accentHue, accent2Hue;
    switch (scheme) {
      case 'complementary':
        accentHue = (baseHue + 180) % 360;
        accent2Hue = accentHue;
        break;
      case 'triadic':
        accentHue = (baseHue + 120) % 360;
        accent2Hue = (baseHue + 240) % 360;
        break;
      case 'analogous':
        accentHue = (baseHue + 30) % 360;
        accent2Hue = (baseHue - 30 + 360) % 360;
        break;
      case 'split-complementary':
        accentHue = (baseHue + 150) % 360;
        accent2Hue = (baseHue + 210) % 360;
        break;
      default: // monochrome
        accentHue = baseHue;
        accent2Hue = baseHue;
    }

    const bgS = isLight ? 5 : 8;
    const bgL = isLight ? 94 : 10;

    // Backgrounds
    p.Main_Back = hslHex(baseHue, bgS, bgL);
    p.Body_Back = hslHex(baseHue, bgS + 2, isLight ? bgL - 6 : bgL + 6);
    p.Button_Back = hslHex(baseHue, bgS + 4, isLight ? bgL - 14 : bgL + 14);
    p.ValueBox_Back = hslHex(baseHue, bgS + 3, isLight ? bgL - 10 : bgL + 10);
    p.Pattern_Default_Back = hslHex(baseHue, bgS, isLight ? bgL - 3 : bgL + 3);
    p.Pattern_Highlighted_Back = hslHex(baseHue, bgS + 1, isLight ? bgL - 7 : bgL + 7);
    p.Pattern_CenterBar_Back = hslHex(baseHue, bgS + 2, isLight ? bgL - 18 : bgL + 18);
    p.Pattern_CenterBar_Back_StandBy = hslHex(baseHue, bgS + 2, isLight ? bgL - 22 : bgL + 22);
    p.Alternate_Main_Back = hslHex(baseHue, bgS, isLight ? bgL - 10 : bgL + 10);
    p.ToolTip_Back = p.Button_Back;

    // Accents
    const accS = 75;
    const accL = isLight ? 48 : 58;
    p.Selection_Back = hslHex(accentHue, accS, accL);
    p.Selected_Button_Back = hslHex(accent2Hue, accS, accL);
    p.Slider = hslHex(accentHue, accS, accL);
    p.Button_Highlight_Font = hslHex(accentHue, accS, accL + 8);
    p.Automation_Line_Edge = hslHex(accentHue, accS - 10, accL);
    p.Automation_Line_Fill = hslHex(accentHue, accS - 20, accL - 8);
    p.Automation_Marker_Play = hslHex(accentHue, accS, accL + 5);
    p.Automation_Marker_Single = hslHex(accent2Hue, accS, accL + 5);
    p.Automation_Marker_Pair = hslHex((baseHue + 180) % 360, accS, accL + 5);
    p.Automation_Marker_Diamond = hslHex(accentHue, accS, accL + 10);
    p.Automation_Point = hslHex(accentHue, accS - 30, isLight ? accL + 18 : accL + 12);
    p.Pattern_PlayPosition_Back = hslHex(accentHue, accS - 10, isLight ? accL - 15 : accL + 12);
    p.Pattern_Selection = hslHex(accentHue, accS, isLight ? accL - 10 : accL + 8);
    p.Folder = hslHex(accentHue, accS - 15, accL);

    // UI chrome
    p.Scrollbar = hslHex(baseHue, bgS + 6, isLight ? bgL - 22 : bgL + 22);
    p.Automation_Grid = hslHex(baseHue, bgS + 3, isLight ? bgL - 10 : bgL + 10);
    p.Pattern_Mute_State = hslHex(baseHue, bgS + 10, isLight ? bgL - 25 : bgL + 25);
    p.Pattern_StandBy_Selection = hslHex(baseHue, bgS + 5, isLight ? bgL - 20 : bgL + 20);
    p.StandBy_Selection_Back = hslHex(baseHue, bgS + 8, isLight ? bgL - 16 : bgL + 16);
    p.Midi_Mapping_Back = hslHex(accent2Hue, accS - 25, isLight ? accL + 18 : accL - 12);
    p.VuMeter_Back_Normal = hslHex(baseHue, bgS, isLight ? bgL - 8 : bgL + 8);
    p.VuMeter_Back_Clipped = hslHex(0, 85, isLight ? 55 : 70);

    // Text (high-contrast, slight accent tint)
    p.Main_Font = makeTextColor(p.Main_Back, accentHue, isLight);
    p.Body_Font = makeTextColor(p.Body_Back, accentHue, isLight);
    p.Strong_Body_Font = makeTextColor(p.Body_Back, accentHue, isLight, true);
    p.Button_Font = makeTextColor(p.Button_Back, accentHue, isLight);
    p.Selected_Button_Font = makeTextColor(p.Selected_Button_Back, accentHue, isLight);
    p.Selection_Font = makeTextColor(p.Selection_Back, accentHue, isLight);
    p.StandBy_Selection_Font = makeTextColor(p.StandBy_Selection_Back, accentHue, isLight);
    p.ValueBox_Font = makeTextColor(p.ValueBox_Back, accentHue, isLight);
    p.ValueBox_Font_Icons = makeTextColor(p.ValueBox_Back, accentHue, isLight, false, true);
    p.Pattern_Default_Font = makeTextColor(p.Pattern_Default_Back, accentHue, isLight);
    p.Pattern_Highlighted_Font = makeTextColor(p.Pattern_Highlighted_Back, accentHue, isLight, true);
    p.Pattern_CenterBar_Font = makeTextColor(p.Pattern_CenterBar_Back, accentHue, isLight, true);
    p.Pattern_CenterBar_Font_StandBy = makeTextColor(p.Pattern_CenterBar_Back_StandBy, accentHue, isLight);
    p.Pattern_PlayPosition_Font = makeTextColor(p.Pattern_PlayPosition_Back, accentHue, isLight, true);
    p.ToolTip_Font = makeTextColor(p.ToolTip_Back, accentHue, isLight);
    p.Midi_Mapping_Font = makeTextColor(p.Midi_Mapping_Back, accentHue, isLight);
    p.Alternate_Main_Font = makeTextColor(p.Alternate_Main_Back, accentHue, isLight);

    // Tracker columns (fixed semantic hues, adapted L/S)
    const tS = isLight ? 55 : 70;
    const tL = isLight ? 32 : 75;
    const tLHi = tL + (isLight ? 6 : -6);

    const trackerCols = [
      ['Volume', 120],
      ['Panning', 210],
      ['Pitch', 50],
      ['Delay', 280],
      ['Global', 30],
      ['Other', 300],
      ['DspFx', 20],
    ];

    for (const [name, hue] of trackerCols) {
      p[`Pattern_Default_Font_${name}`] = hslHex(hue, tS, tL);
      p[`Pattern_Highlighted_Font_${name}`] = hslHex(hue, tS - 8, tLHi);
    }

    p.Pattern_Default_Font_Unused = hslHex(baseHue, bgS, isLight ? bgL - 28 : bgL + 28);
    p.Pattern_Highlighted_Font_Unused = hslHex(baseHue, bgS, isLight ? bgL - 24 : bgL + 24);

    // VU Meters
    p.VuMeter_Meter = hslHex(baseHue, bgS, isLight ? bgL - 30 : bgL + 30);
    p.VuMeter_Meter_Low = hslHex(140, 75, isLight ? 42 : 55);
    p.VuMeter_Meter_Middle = hslHex(50, 85, isLight ? 48 : 60);
    p.VuMeter_Meter_High = hslHex(0, 90, isLight ? 52 : 65);
    p.VuMeter_Peak = hslHex(10, 90, isLight ? 52 : 65);

    // Default palette slots
    for (let i = 1; i <= 14; i++) {
      const n = String(i).padStart(2, '0');
      const h = (baseHue + (i - 1) * (360 / 14)) % 360;
      p[`Default_Color_${n}`] = hslHex(h, 55, isLight ? 45 : 60);
    }

    return p;
  }

  function applyPalette(palette) {
    form.querySelectorAll('input[type="color"]').forEach(input => {
      const el = input.dataset.element;
      if (palette[el]) {
        input.value = palette[el];
      }
    });
    renderPreview();
  }

  document.getElementById('paletteApply').addEventListener('click', () => {
    const baseHex = document.getElementById('paletteBase').value;
    const [r, g, b] = hexToRgb(baseHex);
    const [h] = rgbToHsl(r, g, b);
    const scheme = document.getElementById('paletteScheme').value;
    const isLight = document.getElementById('paletteLight').checked;
    const palette = generatePalette(h, scheme, isLight);
    applyPalette(palette);
  });

  document.getElementById('paletteRandom').addEventListener('click', () => {
    const schemes = ['monochrome', 'complementary', 'triadic', 'analogous', 'split-complementary'];
    const scheme = schemes[Math.floor(Math.random() * schemes.length)];
    const baseHue = Math.floor(Math.random() * 360);
    const isLight = Math.random() < 0.25;
    const palette = generatePalette(baseHue, scheme, isLight);
    // Sync controls
    document.getElementById('paletteScheme').value = scheme;
    document.getElementById('paletteLight').checked = isLight;
    const baseRgb = hslToRgb(baseHue, 70, 50);
    document.getElementById('paletteBase').value = rgbToHex(...baseRgb);
    applyPalette(palette);
  });

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
