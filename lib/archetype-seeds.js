/**
 * Archetype Seed Palettes for the Renoise Theme Studio.
 *
 * Each archetype defines ~20 hand-picked anchor colors (the core personality).
 * The remaining ~50 element colors are derived algorithmically using the
 * same rules as the Design Principles document.
 *
 * All 6 archetypes are based on Section 9 of Renoise Theme Design Principles.
 */

// ── Color math helpers (inline, no browser dependency) ─────

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
  return [((h % 360) + 360) % 360, s, l];
}

function hslToRgb(h, s, l) {
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))];
}

function hslToHex(h, s, l) {
  return rgbToHex(...hslToRgb(h, s, l));
}

function hexToHsl(hex) {
  return rgbToHsl(...hexToRgb(hex));
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
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function lighten(hex, amt) {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(Math.min(255, r + amt), Math.min(255, g + amt), Math.min(255, b + amt));
}

function darken(hex, amt) {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(Math.max(0, r - amt), Math.max(0, g - amt), Math.max(0, b - amt));
}

function mix(hex1, hex2, t = 0.5) {
  const [r1, g1, b1] = hexToRgb(hex1);
  const [r2, g2, b2] = hexToRgb(hex2);
  return rgbToHex(
    Math.round(r1 + (r2 - r1) * t),
    Math.round(g1 + (g2 - g1) * t),
    Math.round(b1 + (b2 - b1) * t)
  );
}

function complementaryHue(hue) {
  return (hue + 180) % 360;
}

function driftHue(hue, drift) {
  return ((hue + drift) % 360 + 360) % 360;
}

// ── Derivation functions ──────────────────────────────────

/**
 * Generate WCAG-safe font color for a given background.
 * Tries to use accentHue-tinted font first, falls back to neutral white/black.
 */
function deriveFont(bgHex, accentHue, strong = false, dim = false) {
  const bgRgb = hexToRgb(bgHex);
  const bgLum = getLuminance(...bgRgb);
  const isBgDark = bgLum < 0.5;

  let targetL = isBgDark
    ? (strong ? 94 : (dim ? 60 : 88))
    : (strong ? 6 : (dim ? 40 : 10));
  let sat = strong ? 18 : (dim ? 6 : 10);

  const textHex = hslToHex(accentHue, sat / 100, targetL / 100);
  const textRgb = hexToRgb(textHex);
  const ratio = contrastRatio(bgRgb, textRgb);

  if (ratio < 4.5) {
    const neutralL = isBgDark
      ? (strong ? 96 : (dim ? 65 : 92))
      : (strong ? 4 : (dim ? 35 : 8));
    return hslToHex(0, 0, neutralL / 100);
  }
  return textHex;
}

/**
 * Generate StandBy variant of a selection color (desaturated + darker).
 */
function deriveStandby(hex) {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, Math.max(0, s * 0.35), Math.max(0, l - 0.12));
}

/**
 * Generate a brightness cascade for pattern fonts.
 * Note → Volume → Panning → Pitch → Delay → Global → Other → DspFx → Unused
 */
function derivePatternFonts(baseHue, bgHex) {
  const fontColors = {};
  const cascade = [
    { name: 'Pattern_Default_Font_Volume',   satOff: 10,  lumOff: -0.05 },
    { name: 'Pattern_Default_Font_Panning',   satOff: 5,   lumOff: -0.12 },
    { name: 'Pattern_Default_Font_Pitch',     satOff: 15,  lumOff: -0.15 },
    { name: 'Pattern_Default_Font_Delay',     satOff: 8,   lumOff: -0.18 },
    { name: 'Pattern_Default_Font_Global',    satOff: 20,  lumOff: -0.20 },
    { name: 'Pattern_Default_Font_Other',     satOff: 3,   lumOff: -0.25 },
    { name: 'Pattern_Default_Font_DspFx',     satOff: 12,  lumOff: -0.22 },
    { name: 'Pattern_Default_Font_Unused',    satOff: 0,   lumOff: -0.50 },
  ];

  const bgRgb = hexToRgb(bgHex);
  const bgLum = getLuminance(...bgRgb);
  const isDark = bgLum < 0.5;

  // Base font: off-white for dark, near-black for light
  const baseL = isDark ? 0.88 : 0.12;
  const baseS = 0.08;

  for (const { name, satOff, lumOff } of cascade) {
    const hue = driftHue(baseHue, satOff * 3);
    const sat = Math.max(0, Math.min(1, baseS + satOff / 100));
    const lum = Math.max(0.05, Math.min(0.95, baseL + lumOff));
    const hex = hslToHex(hue, sat, lum);

    // Contrast check against background
    const rgb = hexToRgb(hex);
    const cr = contrastRatio(bgRgb, rgb);
    if (cr < 3.0) {
      // Fall back to neutral
      const neutralL = isDark ? 0.85 + lumOff : 0.15 - lumOff;
      fontColors[name] = hslToHex(0, 0, Math.max(0.05, Math.min(0.95, neutralL)));
    } else {
      fontColors[name] = hex;
    }
  }

  return fontColors;
}

/**
 * Generate highlighted variant from default pattern font.
 * Slightly brighter for dark themes, slightly darker for light.
 */
function deriveHighlightedFont(defaultFontHex, isDark) {
  const [h, s, l] = hexToHsl(defaultFontHex);
  const offset = isDark ? 0.04 : -0.04;
  return hslToHex(h, s, Math.max(0.05, Math.min(0.95, l + offset)));
}

/**
 * Default 14 track colors (rainbow wheel, evenly spaced).
 */
function generateTrackColors(sat = 0.55, light = 0.55) {
  const colors = {};
  for (let i = 1; i <= 14; i++) {
    const n = String(i).padStart(2, '0');
    const hue = (i - 1) * (360 / 14);
    colors[`Default_Color_${n}`] = hslToHex(hue, sat, light);
  }
  return colors;
}

/**
 * Build full 82-element color map from ~20 anchor colors.
 */
function buildFullPalette(anchors) {
  const c = { ...anchors };

  const [mainH, mainS, mainL] = hexToHsl(c.Main_Back);
  const [bodyH, bodyS, bodyL] = hexToHsl(c.Body_Back);
  const isDark = mainL < 0.4;

  // ── Alternate main surface ──
  if (!c.Alternate_Main_Back)  c.Alternate_Main_Back  = lighten(c.Main_Back, isDark ? 8 : -15);
  if (!c.Alternate_Main_Font)  c.Alternate_Main_Font  = mix(c.Main_Font, darken(c.Main_Back, 30), 0.3);

  // ── Strong body font (accent) ──
  if (!c.Strong_Body_Font) c.Strong_Body_Font = c.Selection_Back;

  // ── Buttons ──
  if (!c.Button_Back)             c.Button_Back           = lighten(c.Body_Back, isDark ? 10 : -10);
  if (!c.Button_Font)             c.Button_Font           = deriveFont(c.Button_Back, bodyH);
  if (!c.Selected_Button_Back)    c.Selected_Button_Back  = c.Selection_Back;
  if (!c.Selected_Button_Font)    c.Selected_Button_Font  = deriveFont(c.Selected_Button_Back, bodyH, true);
  if (!c.Button_Highlight_Font)   c.Button_Highlight_Font = c.Strong_Body_Font;

  // ── Selection ──
  if (!c.Selection_Font)          c.Selection_Font        = deriveFont(c.Selection_Back, bodyH, true);
  if (!c.StandBy_Selection_Back)  c.StandBy_Selection_Back = deriveStandby(c.Selection_Back);
  if (!c.StandBy_Selection_Font)  c.StandBy_Selection_Font = deriveFont(c.StandBy_Selection_Back, bodyH);

  // ── MIDI mapping ──
  if (!c.Midi_Mapping_Back)       c.Midi_Mapping_Back     = mix(c.Selection_Back, c.Main_Back, 0.7);
  if (!c.Midi_Mapping_Font)       c.Midi_Mapping_Font     = c.Main_Font;

  // ── ToolTip ──
  if (!c.ToolTip_Back)            c.ToolTip_Back          = c.Button_Back;
  if (!c.ToolTip_Font)            c.ToolTip_Font          = c.Main_Font;

  // ── ValueBox ──
  if (!c.ValueBox_Back)           c.ValueBox_Back         = darken(c.Main_Back, isDark ? -5 : 15);
  if (!c.ValueBox_Font)           c.ValueBox_Font         = c.Strong_Body_Font;
  if (!c.ValueBox_Font_Icons)     c.ValueBox_Font_Icons   = c.Main_Font;

  // ── Controls ──
  if (!c.Scrollbar)               c.Scrollbar             = mix(c.Slider || c.Selection_Back, c.Body_Back, 0.5);
  if (!c.Slider)                  c.Slider                = c.Strong_Body_Font;
  if (!c.Folder)                  c.Folder                = mix(c.Slider, c.Main_Font, 0.4);

  // ── Pattern surface ──
  if (!c.Pattern_Default_Back)    c.Pattern_Default_Back  = c.Main_Back;
  if (!c.Pattern_Highlighted_Back) c.Pattern_Highlighted_Back = lighten(c.Pattern_Default_Back, isDark ? 6 : -8);
  if (!c.Pattern_Default_Font)    c.Pattern_Default_Font  = c.Main_Font;

  // ── Pattern fonts (cascade) ──
  const patFonts = derivePatternFonts(mainH, c.Pattern_Default_Back);
  for (const [name, hex] of Object.entries(patFonts)) {
    if (!c[name]) c[name] = hex;
  }

  // ── Highlighted pattern fonts ──
  for (const suffix of ['Volume', 'Panning', 'Pitch', 'Delay', 'Global', 'Other', 'DspFx', 'Unused']) {
    const defKey = `Pattern_Default_Font_${suffix}`;
    const hiKey = `Pattern_Highlighted_Font_${suffix}`;
    if (!c[hiKey] && c[defKey]) {
      c[hiKey] = deriveHighlightedFont(c[defKey], isDark);
    }
  }
  if (!c.Pattern_Highlighted_Font) c.Pattern_Highlighted_Font = deriveHighlightedFont(c.Pattern_Default_Font, isDark);

  // ── Play position ──
  if (!c.Pattern_PlayPosition_Back) c.Pattern_PlayPosition_Back = mix(c.Selection_Back, c.Main_Back, 0.5);
  if (!c.Pattern_PlayPosition_Font) c.Pattern_PlayPosition_Font = c.Main_Font;

  // ── Center bar ──
  if (!c.Pattern_CenterBar_Back)     c.Pattern_CenterBar_Back     = mix(c.Selection_Back, c.Main_Back, 0.7);
  if (!c.Pattern_CenterBar_Font)     c.Pattern_CenterBar_Font     = deriveFont(c.Pattern_CenterBar_Back, mainH, true);
  if (!c.Pattern_CenterBar_Back_StandBy) c.Pattern_CenterBar_Back_StandBy = mix(c.Pattern_CenterBar_Back, c.Pattern_Default_Back, 0.5);
  if (!c.Pattern_CenterBar_Font_StandBy) c.Pattern_CenterBar_Font_StandBy = deriveFont(c.Pattern_CenterBar_Back_StandBy, mainH);

  // ── Selection in pattern ──
  if (!c.Pattern_Selection)          c.Pattern_Selection        = c.Selection_Back;
  if (!c.Pattern_StandBy_Selection)  c.Pattern_StandBy_Selection = mix(c.Selection_Back, c.Pattern_Default_Back, 0.6);

  // ── Mute state ──
  if (!c.Pattern_Mute_State)         c.Pattern_Mute_State       = c.Pattern_Default_Font_Unused || deriveFont(c.Pattern_Default_Back, mainH, false, true);

  // ── Automation ──
  if (!c.Automation_Grid)            c.Automation_Grid          = lighten(c.Pattern_Default_Back, isDark ? 10 : -10);
  if (!c.Automation_Line_Edge)       c.Automation_Line_Edge     = c.Strong_Body_Font;
  if (!c.Automation_Line_Fill)       c.Automation_Line_Fill     = mix(c.Strong_Body_Font, c.Pattern_Default_Back, 0.5);
  if (!c.Automation_Point)           c.Automation_Point         = lighten(c.Automation_Line_Edge, isDark ? 30 : -30);
  if (!c.Automation_Marker_Play)     c.Automation_Marker_Play   = c.Strong_Body_Font;
  if (!c.Automation_Marker_Single)   c.Automation_Marker_Single = c.Selected_Button_Back;
  if (!c.Automation_Marker_Pair)    c.Automation_Marker_Pair    = mix(c.Automation_Marker_Play, c.Automation_Marker_Single, 0.5);
  if (!c.Automation_Marker_Diamond)  c.Automation_Marker_Diamond = lighten(c.Automation_Marker_Play, isDark ? 20 : -20);

  // ── VU Meter ──
  if (!c.VuMeter_Meter)         c.VuMeter_Meter      = '#50fa7b';
  if (!c.VuMeter_Meter_Low)     c.VuMeter_Meter_Low  = c.VuMeter_Meter;
  if (!c.VuMeter_Meter_Middle)  c.VuMeter_Meter_Middle = '#f1fa8c';
  if (!c.VuMeter_Meter_High)   c.VuMeter_Meter_High = '#ffb86c';
  if (!c.VuMeter_Peak)         c.VuMeter_Peak       = '#ff5555';
  if (!c.VuMeter_Back_Normal)  c.VuMeter_Back_Normal = darken(c.Main_Back, isDark ? 3 : -8);
  if (!c.VuMeter_Back_Clipped) c.VuMeter_Back_Clipped = mix(c.VuMeter_Peak, c.Main_Back, 0.3);

  // ── Default track colors ──
  for (let i = 1; i <= 14; i++) {
    const n = String(i).padStart(2, '0');
    if (!c[`Default_Color_${n}`]) {
      const sat = c._trackSat !== undefined ? c._trackSat : 0.55;
      const light = c._trackLight !== undefined ? c._trackLight : 0.55;
      const hue = (i - 1) * (360 / 14);
      c[`Default_Color_${n}`] = hslToHex(hue, sat, light);
    }
  }

  // Clean up internal keys
  delete c._trackSat;
  delete c._trackLight;

  return c;
}

// ── Archetype anchor definitions ──────────────────────────

const ARCHETYPE_KEYS = {
  workhorse: {
    id: 'workhorse',
    name: 'The Workhorse',
    description: 'For 12-hour sessions. Nothing tires the eyes. Muted, professional, all-day comfort.',
    swatchColors: ['161620', '252530'],
    anchors: {
      Main_Back: '#161620',
      Body_Back: '#252530',
      Main_Font: '#C8C8D0',
      Body_Font: '#888898',
      Selection_Back: '#2A4060',
      Pattern_CenterBar_Back: '#2A3A4A',
      // Low saturation, no vivid colors
    },
    _trackSat: 0.45,
    _trackLight: 0.45,
  },

  showpiece: {
    id: 'showpiece',
    name: 'The Showpiece',
    description: 'Maximum beauty for screenshots and showcases. Deep navy meets warm brown with vivid orange accent.',
    swatchColors: ['0A0A1A', '1A1210'],
    anchors: {
      Main_Back: '#0A0A1A',
      Body_Back: '#1A1210',
      Main_Font: '#D8D8EC',
      Body_Font: '#A09080',
      Selection_Back: '#FF6B35',
      Pattern_CenterBar_Back: '#2A1A2A',
      Strong_Body_Font: '#FF6B35',
      Slider: '#FF6B35',
      VuMeter_Meter: '#50fa7b',
      VuMeter_Peak: '#ff5555',
    },
    _trackSat: 0.65,
    _trackLight: 0.50,
  },

  flatModern: {
    id: 'flatModern',
    name: 'Flat / Modern',
    description: 'Clean lines, no skeuomorphism. The theme disappears, content reigns. Single accent hue.',
    swatchColors: ['1A1A1A', '242424'],
    anchors: {
      Main_Back: '#1A1A1A',
      Body_Back: '#242424',
      Main_Font: '#D0D0D0',
      Body_Font: '#909090',
      Selection_Back: '#4488CC',
      Strong_Body_Font: '#4488CC',
      Slider: '#4488CC',
      Pattern_CenterBar_Back: '#2A2A2A',
      // All shading transparent — handled by the xrnc default params
    },
    _trackSat: 0.50,
    _trackLight: 0.50,
  },

  neonCyberpunk: {
    id: 'neonCyberpunk',
    name: 'Neon / Cyberpunk',
    description: 'Blade Runner\'s music studio. Near-black backgrounds with glowing neon accents.',
    swatchColors: ['08080C', '0E1420'],
    anchors: {
      Main_Back: '#08080C',
      Body_Back: '#0E1420',
      Main_Font: '#00FFAA',
      Body_Font: '#557799',
      Selection_Back: '#FF0066',
      Pattern_Default_Back: '#08080C',
      Pattern_Highlighted_Back: '#0C0C18',
      Pattern_CenterBar_Back: '#1A0A2A',
      Strong_Body_Font: '#00FFAA',
      Slider: '#FF0066',
      VuMeter_Meter: '#00FFAA',
      VuMeter_Peak: '#FF0066',
    },
    _trackSat: 0.75,
    _trackLight: 0.50,
  },

  vintageWarm: {
    id: 'vintageWarm',
    name: 'Vintage / Warm',
    description: 'Analog vibes. Tape machine warmth. No cool tones — everything through a warm amber filter.',
    swatchColors: ['1A1410', '2E2820'],
    anchors: {
      Main_Back: '#1A1410',
      Body_Back: '#2E2820',
      Main_Font: '#CCAA77',
      Body_Font: '#998877',
      Selection_Back: '#CC8844',
      Pattern_CenterBar_Back: '#2A1E10',
      Strong_Body_Font: '#DDAA55',
      Slider: '#CC8844',
      VuMeter_Meter: '#88AA44',
      VuMeter_Peak: '#CC5533',
    },
    _trackSat: 0.50,
    _trackLight: 0.45,
  },

  light: {
    id: 'light',
    name: 'Light Theme',
    description: 'For daylight working. Clean off-white canvas with near-black typography. Every contrast detail matters.',
    swatchColors: ['EEEEF0', 'D8D8DC'],
    anchors: {
      Main_Back: '#EEEEF0',
      Body_Back: '#D8D8DC',
      Main_Font: '#1A1A2E',
      Body_Font: '#3A3A4E',
      Selection_Back: '#4488CC',
      Pattern_Default_Back: '#F4F4F8',
      Pattern_Highlighted_Back: '#EAEAEE',
      Pattern_CenterBar_Back: '#D0D8E8',
      Strong_Body_Font: '#4488CC',
      Slider: '#5599DD',
      VuMeter_Meter: '#44AA66',
      VuMeter_Peak: '#CC4444',
    },
    _trackSat: 0.50,
    _trackLight: 0.45,
  },
};

// ── Pre-compute full palettes ─────────────────────────────

const ARCHETYPES = {};
const ARCHETYPE_LIST = [];

for (const [id, def] of Object.entries(ARCHETYPE_KEYS)) {
  const full = buildFullPalette(def.anchors);
  const entry = {
    id,
    name: def.name,
    description: def.description,
    swatchColors: def.swatchColors,
    colors: full,
  };
  ARCHETYPES[id] = entry;
  ARCHETYPE_LIST.push(entry);
}

export { ARCHETYPES, ARCHETYPE_LIST, buildFullPalette };
