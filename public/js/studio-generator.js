/**
 * Studio Generator — algorithmic fill, contrast audit, and trap detection.
 *
 * Depends on window.__colorUtils (must be loaded first).
 * Exposed on window.__studioGen.
 */

window.__studioGen = (function () {
  const U = window.__colorUtils;

  // ── Font↔Background audit pairs ──
  // Each pair: [fontElement, bgElement, label, targetMinRatio]
  const AUDIT_PAIRS = [
    ['Main_Font', 'Main_Back', 'Main Font on Display', 7.0],
    ['Body_Font', 'Body_Back', 'Body Font on Case', 4.5],
    ['Strong_Body_Font', 'Body_Back', 'Strong Body Font on Case', 7.0],
    ['Button_Font', 'Button_Back', 'Button Font', 4.5],
    ['Selected_Button_Font', 'Selected_Button_Back', 'Selected Button Font', 4.5],
    ['ValueBox_Font', 'ValueBox_Back', 'Value Box Font', 7.0],
    ['Pattern_Default_Font', 'Pattern_Default_Back', 'Pattern Font (Default row)', 4.5],
    ['Pattern_Highlighted_Font', 'Pattern_Highlighted_Back', 'Pattern Font (Highlighted row)', 4.5],
    ['Pattern_Default_Font_Volume', 'Pattern_Default_Back', 'Pattern Volume', 3.0],
    ['Pattern_Default_Font_Unused', 'Pattern_Default_Back', 'Pattern Unused', 1.5],
    ['Pattern_CenterBar_Font', 'Pattern_CenterBar_Back', 'Center Bar Font', 4.5],
    ['Pattern_PlayPosition_Font', 'Pattern_PlayPosition_Back', 'Play Position Font', 4.5],
    ['Selection_Font', 'Selection_Back', 'Selection Font', 4.5],
    ['StandBy_Selection_Font', 'StandBy_Selection_Back', 'StandBy Selection Font', 3.0],
    ['ToolTip_Font', 'ToolTip_Back', 'ToolTip Font', 4.5],
    ['Midi_Mapping_Font', 'Midi_Mapping_Back', 'MIDI Mapping Font', 4.5],
  ];

  // ── Contrast Audit ──

  /**
   * Run contrast audit on all font↔background pairs.
   * @param {Object} elementColorMap - { elementName: [r,g,b] }
   * @returns {Array} [{ font, bg, label, ratio, grade, fontHex, bgHex }]
   */
  function runContrastAudit(elementColorMap) {
    const results = [];

    for (const [fontEl, bgEl, label, target] of AUDIT_PAIRS) {
      const fontRgb = elementColorMap[fontEl];
      const bgRgb = elementColorMap[bgEl];
      if (!fontRgb || !bgRgb) {
        results.push({ font: fontEl, bg: bgEl, label, ratio: 0, grade: '—', fontHex: '', bgHex: '' });
        continue;
      }

      const ratio = U.contrastRatio(fontRgb, bgRgb);
      let grade;
      if (ratio >= 7.0) grade = 'AAA';
      else if (ratio >= 4.5) grade = 'AA';
      else if (ratio >= 3.0) grade = 'AA-lg';
      else grade = 'FAIL';

      const fontHex = U.rgbToHex(fontRgb[0], fontRgb[1], fontRgb[2]);
      const bgHex = U.rgbToHex(bgRgb[0], bgRgb[1], bgRgb[2]);

      results.push({ font: fontEl, bg: bgEl, label, ratio: Math.round(ratio * 10) / 10, grade, fontHex, bgHex, target });
    }

    return results;
  }

  // ── Trap Detection ──

  /**
   * Detect common design traps.
   * @param {Object} elementColorMap - { elementName: [r,g,b] }
   * @returns {Array} [{ trap, severity, element, message }]
   */
  function detectTraps(elementColorMap) {
    const traps = [];
    const get = (name) => elementColorMap[name];

    // Trap 0: Same hue for Main_Back and Body_Back
    const mb = get('Main_Back');
    const bb = get('Body_Back');
    if (mb && bb) {
      const [mh] = U.rgbToHsl(mb[0], mb[1], mb[2]);
      const [bh] = U.rgbToHsl(bb[0], bb[1], bb[2]);
      const hueDiff = Math.min(Math.abs(mh - bh), 360 - Math.abs(mh - bh));
      if (hueDiff < 20) {
        traps.push({
          trap: 'same-hue-backgrounds',
          severity: 'high',
          element: 'Main_Back / Body_Back',
          message: `Main_Back and Body_Back have nearly the same hue (Δ${Math.round(hueDiff)}°). Use complementary or temperature-split hues instead.`,
        });
      }
    }

    // Trap 1: Saturated Main_Back
    if (mb) {
      const [, ms] = U.rgbToHsl(mb[0], mb[1], mb[2]);
      if (ms > 25) {
        traps.push({
          trap: 'saturated-main-back',
          severity: 'medium',
          element: 'Main_Back',
          message: `Main_Back saturation is ${Math.round(ms)}% — high-saturation backgrounds cause eye fatigue in long sessions.`,
        });
      }
    }

    // Trap 2: Button_Back too close to Body_Back
    const btn = get('Button_Back');
    if (bb && btn) {
      const btnR = U.rgbToHsl(btn[0], btn[1], btn[2]);
      const bodyR = U.rgbToHsl(bb[0], bb[1], bb[2]);
      const lightnessDiff = Math.abs(btnR[2] - bodyR[2]);
      if (lightnessDiff < 5 && Math.abs(btnR[0] - bodyR[0]) < 20) {
        traps.push({
          trap: 'button-invisible',
          severity: 'high',
          element: 'Button_Back',
          message: 'Button_Back is nearly identical to Body_Back — buttons will disappear into the panel.',
        });
      }
    }

    // Trap 3: Pattern highlighted too different
    const pd = get('Pattern_Default_Back');
    const ph = get('Pattern_Highlighted_Back');
    if (pd && ph) {
      const pdR = U.rgbToHsl(pd[0], pd[1], pd[2]);
      const phR = U.rgbToHsl(ph[0], ph[1], ph[2]);
      const diff = Math.abs(pdR[2] - phR[2]);
      if (diff > 25) {
        traps.push({
          trap: 'strong-zebra',
          severity: 'low',
          element: 'Pattern_Highlighted_Back',
          message: `Pattern highlighted row differs by ${Math.round(diff)}% lightness — this creates strong zebra stripes. Consider 5-15% for subtle grouping.`,
        });
      }
    }

    // Trap 4: Selection too close to pattern back
    const sel = get('Selection_Back');
    if (sel && pd) {
      const selR = U.rgbToHsl(sel[0], sel[1], sel[2]);
      const pdR = U.rgbToHsl(pd[0], pd[1], pd[2]);
      if (Math.abs(selR[0] - pdR[0]) < 30 && Math.abs(selR[2] - pdR[2]) < 20) {
        traps.push({
          trap: 'selection-invisible',
          severity: 'high',
          element: 'Selection_Back',
          message: 'Selection_Back is too close to Pattern_Default_Back — the cursor will be hard to find.',
        });
      }
    }

    // Trap 5: StandBy selection missing or same as selection
    const stby = get('StandBy_Selection_Back');
    if (sel && stby) {
      const cr = U.contrastRatio(sel, stby);
      if (cr < 1.5) {
        traps.push({
          trap: 'standby-missing',
          severity: 'medium',
          element: 'StandBy_Selection_Back',
          message: 'StandBy_Selection_Back is nearly identical to Selection_Back — users won\'t know when focus is lost.',
        });
      }
    }

    // Trap 6: Pure black Main_Back
    if (mb && mb[0] === 0 && mb[1] === 0 && mb[2] === 0) {
      traps.push({
        trap: 'pure-black',
        severity: 'medium',
        element: 'Main_Back',
        message: 'Pure black (#000000) Main_Back — nothing can create depth against it. Use a near-black like #0D0D14.',
      });
    }

    // Trap 8: All pattern fonts same color
    const patFonts = ['Pattern_Default_Font_Volume', 'Pattern_Default_Font_Panning',
      'Pattern_Default_Font_Pitch', 'Pattern_Default_Font_Delay',
      'Pattern_Default_Font_Global', 'Pattern_Default_Font_Unused'];
    const patColors = patFonts.map(name => {
      const c = get(name);
      return c ? `${c[0]},${c[1]},${c[2]}` : null;
    }).filter(Boolean);
    if (patColors.length >= 4) {
      const unique = new Set(patColors);
      if (unique.size === 1) {
        traps.push({
          trap: 'monotone-pattern-fonts',
          severity: 'medium',
          element: 'Pattern Fonts',
          message: 'All pattern fonts are the same color — experienced users can\'t speed-read columns by type.',
        });
      }
    }

    return traps;
  }

  // ── Smart Fill ──

  /**
   * Algorithmically fill/re-derive elements while respecting locked elements.
   * @param {Object} elementColorMap - { elementName: [r,g,b] }
   * @param {Set} lockedElements - Set of element names that must NOT be changed
   * @param {Object} [archetypeColors] - optional archetype seed to pull from
   * @returns {Object} new elementColorMap with derived values
   */
  function fillRemaining(elementColorMap, lockedElements, archetypeColors) {
    // Work with hex strings internally for easier manipulation
    const toHex = (rgb) => rgb ? U.rgbToHex(rgb[0], rgb[1], rgb[2]) : null;
    const isLocked = (name) => lockedElements && lockedElements.has(name);

    // Start from current state, convert to [r,g,b]
    const cur = {};
    for (const [name, rgb] of Object.entries(elementColorMap)) {
      cur[name] = rgb ? [rgb[0], rgb[1], rgb[2]] : null;
    }

    const set = (name, rgb) => {
      if (!isLocked(name)) cur[name] = rgb;
    };

    // Helper: get hex or derive
    const hex = (name) => {
      const c = cur[name];
      return c ? U.rgbToHex(c[0], c[1], c[2]) : null;
    };

    // 1. Get anchor colors
    const mainBack = cur['Main_Back'];
    const bodyBack = cur['Body_Back'];
    const mainFont = cur['Main_Font'];
    const sel = cur['Selection_Back'];

    if (!mainBack || !bodyBack || !mainFont || !sel) {
      // Not enough anchors to derive from — return unchanged
      return elementColorMap;
    }

    // Extract base hues
    const [mainH, mainS, mainL] = U.rgbToHsl(mainBack[0], mainBack[1], mainBack[2]);
    const [bodyH] = U.rgbToHsl(bodyBack[0], bodyBack[1], bodyBack[2]);
    const isDark = mainL < 0.4;

    // 2. Derive StandBy from Selection
    if (!isLocked('StandBy_Selection_Back')) {
      const [h, s, l] = U.rgbToHsl(sel[0], sel[1], sel[2]);
      set('StandBy_Selection_Back', U.hslToRgb(h, s * 0.35, Math.max(0, l - 0.12)));
    }

    // 3. Derive StandBy_Selection_Font
    const stby = cur['StandBy_Selection_Back'];
    if (stby && !isLocked('StandBy_Selection_Font')) {
      set('StandBy_Selection_Font', U.hexToRgb(U.makeTextColor(hex('StandBy_Selection_Back'), bodyH)));
    }

    // 4. Derive Alternate surfaces
    if (!isLocked('Alternate_Main_Back')) {
      const [h, s, l] = [mainH, mainS, mainL];
      const altL = isDark ? Math.min(1, l + 0.04) : Math.max(0, l - 0.06);
      set('Alternate_Main_Back', U.hslToRgb(h, s, altL));
    }
    if (!isLocked('Alternate_Main_Font')) {
      const mf = cur['Alternate_Main_Back'];
      set('Alternate_Main_Font', U.hexToRgb(U.makeTextColor(hex('Alternate_Main_Back'), bodyH)));
    }

    // 5. Button highlights
    const accentHex = hex('Strong_Body_Font') || U.rgbToHex(sel[0], sel[1], sel[2]);
    if (!isLocked('Button_Highlight_Font')) {
      set('Button_Highlight_Font', U.hexToRgb(accentHex));
    }

    // 6. Pattern surface
    if (!isLocked('Pattern_Default_Back')) {
      set('Pattern_Default_Back', [mainBack[0], mainBack[1], mainBack[2]]);
    }
    if (!isLocked('Pattern_Highlighted_Back')) {
      const pd = cur['Pattern_Default_Back'] || mainBack;
      const [h, s, l] = U.rgbToHsl(pd[0], pd[1], pd[2]);
      const hl = isDark ? Math.min(1, l + 0.04) : Math.max(0, l - 0.05);
      set('Pattern_Highlighted_Back', U.hslToRgb(h, s, hl));
    }

    // 7. Pattern font cascade
    const patBack = cur['Pattern_Default_Back'] || mainBack;
    const patBackHex = U.rgbToHex(patBack[0], patBack[1], patBack[2]);

    const FONT_CASCADE = [
      { name: 'Pattern_Default_Font_Volume',   satOff: 10, lumOff: -0.05 },
      { name: 'Pattern_Default_Font_Panning',   satOff: 5,  lumOff: -0.12 },
      { name: 'Pattern_Default_Font_Pitch',     satOff: 15, lumOff: -0.15 },
      { name: 'Pattern_Default_Font_Delay',     satOff: 8,  lumOff: -0.18 },
      { name: 'Pattern_Default_Font_Global',    satOff: 20, lumOff: -0.20 },
      { name: 'Pattern_Default_Font_Other',     satOff: 3,  lumOff: -0.25 },
      { name: 'Pattern_Default_Font_DspFx',     satOff: 12, lumOff: -0.22 },
      { name: 'Pattern_Default_Font_Unused',    satOff: 0,  lumOff: -0.50 },
    ];

    const baseL = isDark ? 0.88 : 0.12;
    const baseS = 0.08;

    for (const { name, satOff, lumOff } of FONT_CASCADE) {
      if (!isLocked(name)) {
        const hue = ((mainH + satOff * 3) % 360 + 360) % 360;
        const sat = Math.max(0, Math.min(1, baseS + satOff / 100));
        const lum = Math.max(0.05, Math.min(0.95, baseL + lumOff));
        const hexColor = U.hslHex(hue, sat * 100, lum * 100);
        const rgb = U.hexToRgb(hexColor);

        // Contrast check
        const cr = U.contrastRatio(patBack, rgb);
        if (cr < 3.0 && name !== 'Pattern_Default_Font_Unused') {
          const neutralL = isDark ? 0.85 + lumOff : 0.15 - lumOff;
          const fallback = U.hslToRgb(0, 0, Math.max(0.05, Math.min(0.95, neutralL)));
          set(name, fallback);
        } else {
          set(name, rgb);
        }
      }
    }

    // 8. Highlighted pattern fonts (brighten from default)
    for (const suffix of ['Volume', 'Panning', 'Pitch', 'Delay', 'Global', 'Other', 'DspFx', 'Unused']) {
      const defKey = `Pattern_Default_Font_${suffix}`;
      const hiKey = `Pattern_Highlighted_Font_${suffix}`;
      if (!isLocked(hiKey) && cur[defKey]) {
        const [h, s, l] = U.rgbToHsl(cur[defKey][0], cur[defKey][1], cur[defKey][2]);
        const offset = isDark ? 0.04 : -0.04;
        set(hiKey, U.hslToRgb(h, s, Math.max(0.05, Math.min(0.95, l + offset))));
      }
    }
    if (!isLocked('Pattern_Highlighted_Font') && cur['Pattern_Default_Font']) {
      const [h, s, l] = U.rgbToHsl(cur['Pattern_Default_Font'][0], cur['Pattern_Default_Font'][1], cur['Pattern_Default_Font'][2]);
      set('Pattern_Highlighted_Font', U.hslToRgb(h, s, Math.max(0.05, Math.min(0.95, l + (isDark ? 0.04 : -0.04)))));
    }

    // 9. Center bar
    if (!isLocked('Pattern_CenterBar_Back') && cur['Selection_Back']) {
      const selRgb = cur['Selection_Back'];
      set('Pattern_CenterBar_Back', U.hslToRgb(...U.rgbToHsl(
        Math.round(selRgb[0] * 0.7 + mainBack[0] * 0.3),
        Math.round(selRgb[1] * 0.7 + mainBack[1] * 0.3),
        Math.round(selRgb[2] * 0.7 + mainBack[2] * 0.3)
      )));
    }

    // 10. Ensure fonts pass WCAG AA on their backgrounds
    const FONT_BG_PAIRS = [
      ['Main_Font', 'Main_Back'],
      ['Body_Font', 'Body_Back'],
      ['Strong_Body_Font', 'Body_Back'],
      ['Button_Font', 'Button_Back'],
      ['Selected_Button_Font', 'Selected_Button_Back'],
      ['ValueBox_Font', 'ValueBox_Back'],
      ['Selection_Font', 'Selection_Back'],
      ['Pattern_Default_Font', 'Pattern_Default_Back'],
      ['Pattern_CenterBar_Font', 'Pattern_CenterBar_Back'],
    ];

    for (const [fontEl, bgEl] of FONT_BG_PAIRS) {
      if (isLocked(fontEl)) continue;
      const bg = cur[bgEl];
      const fg = cur[fontEl];
      if (!bg || !fg) continue;
      const cr = U.contrastRatio(bg, fg);
      if (cr < 4.5) {
        // Try to fix: use makeTextColor
        const bgHex = U.rgbToHex(bg[0], bg[1], bg[2]);
        const accentHue = bodyH;
        const isBgDark = mainL < 0.4;
        const fixedHex = U.makeTextColor(bgHex, Math.round(accentHue), isBgDark, false, false);
        set(fontEl, U.hexToRgb(fixedHex));
      }
    }

    // 11. VU Meter back
    if (!isLocked('VuMeter_Back_Normal')) {
      set('VuMeter_Back_Normal', U.hslToRgb(mainH, mainS, Math.max(0, isDark ? mainL - 0.02 : mainL + 0.04)));
    }
    const vuPeak = cur['VuMeter_Peak'];
    if (vuPeak && !isLocked('VuMeter_Back_Clipped')) {
      set('VuMeter_Back_Clipped', U.hslToRgb(...U.rgbToHsl(
        Math.round(vuPeak[0] * 0.3 + mainBack[0] * 0.7),
        Math.round(vuPeak[1] * 0.3 + mainBack[1] * 0.7),
        Math.round(vuPeak[2] * 0.3 + mainBack[2] * 0.7)
      )));
    }

    // 12. MIDI mapping
    if (!isLocked('Midi_Mapping_Back') && cur['Selection_Back']) {
      set('Midi_Mapping_Back', U.hslToRgb(...U.rgbToHsl(
        Math.round(cur['Selection_Back'][0] * 0.3 + mainBack[0] * 0.7),
        Math.round(cur['Selection_Back'][1] * 0.3 + mainBack[1] * 0.7),
        Math.round(cur['Selection_Back'][2] * 0.3 + mainBack[2] * 0.7)
      )));
    }

    // 13. Fill remaining from archetype seed if available
    if (archetypeColors) {
      for (const [name, rgb] of Object.entries(archetypeColors)) {
        if (!cur[name]) {
          set(name, [rgb[0], rgb[1], rgb[2]]);
        }
      }
    }

    // 14. Deliberate variation: tiny HSL perturbations so Smart Fill always produces a visible change
    // Avoids the "nothing happened" feeling when values were already algorithmically derived.
    // Only perturbs non-anchor, non-locked elements. Anchors (Main_Back, Body_Back, etc.) keep exact values.
    const anchorNames = new Set(['Main_Back', 'Body_Back', 'Main_Font', 'Body_Font', 'Strong_Body_Font', 'Selection_Back', 'Pattern_Default_Back', 'Pattern_Highlighted_Back']);
    // Seeded pseudo-random for repeatability: base on element name char codes
    let seedSum = 0;
    for (const [name] of Object.entries(cur)) {
      for (let i = 0; i < name.length; i++) seedSum += name.charCodeAt(i);
    }
    let variationIdx = 0;
    for (const [name, rgb] of Object.entries(cur)) {
      if (!rgb) continue;
      if (isLocked(name)) continue;
      if (anchorNames.has(name)) continue;
      // Deterministic per-element offset based on name hash
      const hash = (name.length * 7 + name.charCodeAt(0) * 13 + (name.charCodeAt(name.length - 1) || 0) * 3 + variationIdx * 5) % 100;
      const hueOff = ((hash % 5) - 2);       // ±2°
      const satOff = ((hash % 7) - 3) * 0.6; // ±3.6% sat
      const lumOff = ((hash % 5) - 2) * 0.4; // ±0.8% lum
      const [h, s, l] = U.rgbToHsl(rgb[0], rgb[1], rgb[2]);
      const nh = ((h + hueOff) % 360 + 360) % 360;
      const ns = Math.max(0, Math.min(1, s + satOff / 100));
      const nl = Math.max(0.01, Math.min(0.99, l + lumOff / 100));
      set(name, U.hslToRgb(nh, ns, nl));
      variationIdx++;
    }

    // Convert back to plain object
    const result = {};
    for (const [name, rgb] of Object.entries(cur)) {
      result[name] = rgb;
    }
    return result;
  }

  // ── Public API ──

  return {
    runContrastAudit,
    detectTraps,
    fillRemaining,
    AUDIT_PAIRS,
  };
})();
