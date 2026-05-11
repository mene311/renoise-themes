document.addEventListener('DOMContentLoaded', () => {
  const creator = window.__creator;
  if (!creator || !creator.form) return;

  const { form, renderPreview } = creator;

  // ── Color Conversion Helpers ─────────────────

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

  // ── CHAOS: fully independent random per element, guided by boldness ──
  // No binary dark/light flip. Each background element independently picks
  // its own lightness zone. Boldness drives the spread:
  //   0%   = tight cluster, cohesive, near-monochrome, professional
  //   50%  = moderate spread, some dark/light contrast, colorful accents
  //   100% = maximum variety — dark+mid+light surfaces coexist, neon accents

  function generateChaosPalette(boldness = 0.8) {
    const p = {};
    const ri = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
    const rh = () => ri(0, 359);
    const bold = Math.max(0.05, Math.min(1, boldness));

    // ── Helpers ──────────────────────────────

    // Each background surface independently decides its lightness
    // At bold=0: always picks from the tight cluster zone
    // At bold=1: randomly picks dark OR mid OR light zone
    function pickBgLight() {
      if (Math.random() < 1 - bold) return ri(16, 32);  // tight cluster
      const z = ri(0, 2);
      if (z === 0) return ri(3, 22);   // dark zone
      if (z === 1) return ri(28, 55);  // mid zone
      return ri(68, 92);               // light zone
    }

    // Hue drift from base scales with boldness
    function driftHue(base, maxDrift) {
      return ((base + ri(-maxDrift, maxDrift)) % 360 + 360) % 360;
    }

    // Saturation range expands with boldness
    function pickSat(minBase, maxBase, satBoldScale) {
      const maxSat = Math.min(100, Math.round(maxBase + bold * satBoldScale));
      const minSat = Math.min(maxSat, Math.round(minBase + bold * (satBoldScale * 0.3)));
      return ri(minSat, maxSat);
    }

    // ── Base hue — shared starting point ─────
    const baseHue = rh();

    // ── 1. Backgrounds & Surfaces ────────────
    // Each one independently picks its own lightness zone
    // Hue drifts from base by ±bold*60°
    const bDrift = Math.round(bold * 60);
    const bSat = pickSat(0, 6, 20);

    function bgColor() { return hslHex(driftHue(baseHue, bDrift), bSat, pickBgLight()); }

    p.Main_Back                 = bgColor();
    p.Body_Back                 = bgColor();
    p.Alternate_Main_Back       = bgColor();
    p.Pattern_Default_Back      = bgColor();
    p.Pattern_Highlighted_Back  = bgColor();
    p.Pattern_CenterBar_Back    = bgColor();
    p.Pattern_CenterBar_Back_StandBy = bgColor();
    p.Button_Back               = bgColor();
    p.ValueBox_Back             = bgColor();
    p.Midi_Mapping_Back         = bgColor();
    p.ToolTip_Back              = p.Button_Back;

    // ── 2. UI chrome — subtle contrast from bgs ──
    const uiDrift = Math.round(bold * 40);
    const uiSat = pickSat(8, 18, 40);
    const uiLight = bold < 0.5 ? ri(20, 40) : ri(15, 70);
    const uiHue = driftHue(baseHue, uiDrift);

    function uiColor() { return hslHex(uiHue, uiSat, uiLight + ri(-6, 6)); }

    p.Scrollbar            = uiColor();
    p.Automation_Grid      = uiColor();
    p.Pattern_Mute_State   = uiColor();
    p.Pattern_StandBy_Selection = uiColor();
    p.StandBy_Selection_Back = uiColor();

    // ── 3. Accents — pop with hue/sat ───────────
    const accDrift = Math.round(60 + bold * 120);  // 60→180
    const accSat = pickSat(40, 60, 40);
    const accLight = bold < 0.5 ? ri(35, 55) : ri(30, 72);
    const accHue = driftHue(baseHue, 180); // always independent from bg

    function accColor() { return hslHex(accHue, accSat, accLight + ri(-8, 8)); }

    p.Selected_Button_Back   = accColor();
    p.Selection_Back         = accColor();
    p.Slider                 = accColor();
    p.Button_Highlight_Font  = accColor();
    p.Automation_Line_Edge   = accColor();
    p.Automation_Line_Fill   = accColor();
    p.Automation_Marker_Play = accColor();
    p.Automation_Marker_Single = accColor();
    p.Automation_Marker_Pair = accColor();
    p.Automation_Marker_Diamond = accColor();
    p.Automation_Point       = accColor();
    p.Pattern_PlayPosition_Back = accColor();
    p.Pattern_Selection      = accColor();
    p.Folder                 = accColor();

    // ── 4. Text — high contrast via makeTextColor ──
    p.Main_Font = makeTextColor(p.Main_Back, baseHue, false);
    p.Body_Font = makeTextColor(p.Body_Back, baseHue, false);
    p.Strong_Body_Font = makeTextColor(p.Body_Back, baseHue, false, true);
    p.Alternate_Main_Font = makeTextColor(p.Alternate_Main_Back, baseHue, false);
    p.Button_Font = makeTextColor(p.Button_Back, baseHue, false);
    p.Selected_Button_Font = makeTextColor(p.Selected_Button_Back, accHue, false);
    p.Selection_Font = makeTextColor(p.Selection_Back, accHue, false);
    p.StandBy_Selection_Font = makeTextColor(p.StandBy_Selection_Back, baseHue, false);
    p.ValueBox_Font = makeTextColor(p.ValueBox_Back, baseHue, false);
    p.ValueBox_Font_Icons = makeTextColor(p.ValueBox_Back, baseHue, false, false, true);
    p.Pattern_Default_Font = makeTextColor(p.Pattern_Default_Back, baseHue, false);
    p.Pattern_Highlighted_Font = makeTextColor(p.Pattern_Highlighted_Back, baseHue, false, true);
    p.Pattern_CenterBar_Font = makeTextColor(p.Pattern_CenterBar_Back, baseHue, false, true);
    p.Pattern_CenterBar_Font_StandBy = makeTextColor(p.Pattern_CenterBar_Back_StandBy, baseHue, false);
    p.Pattern_PlayPosition_Font = makeTextColor(p.Pattern_PlayPosition_Back, accHue, false, true);
    p.ToolTip_Font = makeTextColor(p.ToolTip_Back, baseHue, false);
    p.Midi_Mapping_Font = makeTextColor(p.Midi_Mapping_Back, baseHue, false);

    // ── 5. Tracker columns — hue-shifted from base ──
    const trackerNames = ['Volume','Panning','Pitch','Delay','Global','Other','DspFx','Unused'];
    for (let i = 0; i < trackerNames.length; i++) {
      const colHue = (baseHue + Math.round(i * (360 / trackerNames.length)) + ri(-10, 10)) % 360;
      const colSat = ri(25 + Math.round(bold * 30), 50 + Math.round(bold * 50));
      const colLight = bold < 0.5 ? ri(45, 60) : ri(35, 78);
      p[`Pattern_Default_Font_${trackerNames[i]}`] = hslHex(colHue, colSat, colLight);
      p[`Pattern_Highlighted_Font_${trackerNames[i]}`] = hslHex(colHue, colSat + ri(5, 15), colLight + ri(5, 12));
    }

    // ── 6. VU Meters — pick a random preset ──────
    const vuPresets = window.__VU_PRESETS || [];
    if (vuPresets.length > 0) {
      const preset = vuPresets[ri(0, vuPresets.length - 1)];
      for (const [key, hex] of Object.entries(preset.colors)) {
        p[key] = hex;
      }
    } else {
      p.VuMeter_Meter = '#50fa7b';
      p.VuMeter_Meter_Low = '#50fa7b';
      p.VuMeter_Meter_Middle = '#f1fa8c';
      p.VuMeter_Meter_High = '#ffb86c';
      p.VuMeter_Peak = '#ff5555';
    }
    // VU back colors — from base hue, subtle
    p.VuMeter_Back_Normal  = hslHex(baseHue, ri(5, 15), ri(10, 25));
    p.VuMeter_Back_Clipped = hslHex(baseHue, ri(10, 22), ri(14, 30));

    // ── 7. Track palette slots — rainbow ────────
    for (let i = 1; i <= 14; i++) {
      const n = String(i).padStart(2, '0');
      const hue = (i - 1) * (360 / 14);
      p[`Default_Color_${n}`] = hslHex(hue, 85, 55);
    }

    return p;
  }

  function isLocked(el) {
    return creator.lockedElements && creator.lockedElements.has(el);
  }

  function applyPalette(palette) {
    requestAnimationFrame(() => {
      form.querySelectorAll('input[data-element]').forEach(input => {
        const el = input.dataset.element;
        if (palette[el] && !isLocked(el)) {
          input.value = palette[el];
        }
      });
      // Sync the visual swatches and color wheel
      if (creator.syncAllSwatches) creator.syncAllSwatches();
      if (window.__colorWheel && window.__colorWheel.syncAllSwatches) {
        window.__colorWheel.syncAllSwatches();
      }
      setTimeout(renderPreview, 50);
    });
  }

  // ── Affinity slider live readout ─────────────

  const modeSelect = document.getElementById('paletteMode');
  const affinitySlider = document.getElementById('paletteAffinity');
  const affinityValue = document.getElementById('affinityValue');

  if (affinitySlider && affinityValue) {
    affinitySlider.addEventListener('input', () => {
      affinityValue.textContent = affinitySlider.value + '%';
    });
  }

  // ── Event Handlers ───────────────────────────

  const randomBtn = document.getElementById('paletteRandom');
  if (randomBtn) {
    randomBtn.addEventListener('click', () => {
      // Cooldown guard — 200ms between clicks
      if (randomBtn.dataset.cooldown) return;
      randomBtn.dataset.cooldown = '1';
      setTimeout(() => { delete randomBtn.dataset.cooldown; }, 200);

      const mode = modeSelect ? modeSelect.value : 'truly-random';
      // Boldness: slider right = more bold/varied. Invert for archetype affinity.
      const boldness = affinitySlider ? parseInt(affinitySlider.value) / 100 : 0.8;
      const affinity = 1 - boldness; // archetype engine uses affinity (0=wild, 1=tight)

      let palette;
      if (mode === 'truly-random') {
        palette = generateChaosPalette(boldness);
      } else if (typeof generateArchetypePalette === 'function') {
        palette = generateArchetypePalette(mode, affinity, creator.lockedElements);
      } else {
        palette = generateChaosPalette(boldness); // fallback
      }

      applyPalette(palette);
    });
  }
});
