/**
 * Archetype Color Generation Engine for Renoise Theme Creator.
 *
 * Generates cohesive palettes based on color relationship modes
 * (Same Hue, Bi Opposite, Triadic) using locked colors as anchor hues.
 *
 * Pure math — no DOM, no event listeners.
 * Loaded before creator-palette.js which calls generateArchetypePalette().
 *
 * Affinity (0–1) controls how strictly the archetype rules are applied:
 *   1.0 = bold/extreme — tight hue/sat/light per role, high contrast
 *   0.5 = moderate — some drift + broader ranges
 *   0.0 = fully random — degrades to chaos
 */

// ── Color Helpers ────────────────────────────────────

function hslToRgb(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))];
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
}

function hslHex(h, s, l) {
  return rgbToHex(...hslToRgb(h, s, l));
}

function ri(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// ── Element → Role Mapping ──────────────────────────
// Every Renoise element maps to a visual role.
// Tracker column fonts are handled separately.

const ELEMENT_ROLES = {
  // ── Backgrounds & Surfaces (11) ──
  Main_Back: 'bg',
  Body_Back: 'bg',
  Alternate_Main_Back: 'bg',
  Pattern_Default_Back: 'bg',
  Pattern_Highlighted_Back: 'bg',
  Pattern_CenterBar_Back: 'bg',
  Pattern_CenterBar_Back_StandBy: 'bg',
  Button_Back: 'bg',
  ValueBox_Back: 'bg',
  ToolTip_Back: 'bg',
  Midi_Mapping_Back: 'bg',

  // ── Text & Typography (17) ──
  Main_Font: 'text',
  Body_Font: 'text',
  Strong_Body_Font: 'text-strong',
  Alternate_Main_Font: 'text',
  Button_Font: 'text',
  Selected_Button_Font: 'text',
  Button_Highlight_Font: 'accent',
  ValueBox_Font: 'text',
  ValueBox_Font_Icons: 'text-dim',
  Selection_Font: 'text',
  StandBy_Selection_Font: 'text',
  ToolTip_Font: 'text',
  Midi_Mapping_Font: 'text',
  Pattern_CenterBar_Font: 'text-strong',
  Pattern_CenterBar_Font_StandBy: 'text',
  Pattern_Default_Font: 'text',
  Pattern_Highlighted_Font: 'text-strong',

  // ── Buttons & Controls (8) ──
  Selected_Button_Back: 'accent',
  Selection_Back: 'accent',
  Pattern_Selection: 'accent',
  Pattern_StandBy_Selection: 'ui',
  StandBy_Selection_Back: 'ui',
  Scrollbar: 'ui',
  Slider: 'accent',
  Folder: 'accent',

  // ── Automation Editor (8) ──
  Automation_Grid: 'ui',
  Automation_Line_Edge: 'accent',
  Automation_Line_Fill: 'accent-strong',
  Automation_Marker_Play: 'accent-strong',
  Automation_Marker_Single: 'accent',
  Automation_Marker_Pair: 'accent',
  Automation_Marker_Diamond: 'accent',
  Automation_Point: 'accent-strong',

  // ── Pattern Editor extras (3 of 19, rest are tracker columns below) ──
  Pattern_PlayPosition_Back: 'accent',
  Pattern_PlayPosition_Font: 'text-strong',
  Pattern_Mute_State: 'ui',

  // ── VU Meters (7) ──
  VuMeter_Meter: 'vu',
  VuMeter_Meter_Low: 'vu',
  VuMeter_Meter_Middle: 'vu',
  VuMeter_Meter_High: 'vu',
  VuMeter_Peak: 'vu',
  VuMeter_Back_Normal: 'ui',
  VuMeter_Back_Clipped: 'ui',
};

// ── Tracker column names (8 columns × highlighted = 16 elements) ──
const TRACKER_COLUMNS = [
  'Volume', 'Panning', 'Pitch', 'Delay',
  'Global', 'Other', 'DspFx', 'Unused'
];

// ── Role HSL Ranges (target at affinity=1.0 = bold/extreme) ──
// At affinity=1.0: sat and light are clamped to these tight, role-appropriate ranges.
// At affinity=0.0: sat → [0,100], light → [0,100], hue → fully random.
const ROLE_RANGES = {
  'bg':            { s: [0, 15],   l: [5, 25] },
  'text':          { s: [0, 10],   l: [85, 95] },
  'text-strong':   { s: [0, 15],   l: [92, 98] },
  'text-dim':      { s: [0, 8],    l: [55, 70] },
  'ui':            { s: [15, 40],  l: [30, 55] },
  'accent':        { s: [70, 100], l: [45, 70] },
  'accent-strong': { s: [80, 100], l: [50, 75] },
  'vu':            { s: [60, 100], l: [50, 80] },
};

// ── Mode → Role Hue Assignment ──────────────────────
// Each mode maps roles to one of 3 anchor hue slots.
// 0 = primary, 1 = secondary, 2 = tertiary.
const MODE_HUE_MAP = {
  'same-hue': {
    bg: 0, text: 0, 'text-strong': 0, 'text-dim': 0,
    ui: 0, accent: 0, 'accent-strong': 0, vu: 0,
  },
  'bi-opposite': {
    bg: 0, text: 0, 'text-strong': 0, 'text-dim': 0,
    ui: 0, accent: 1, 'accent-strong': 1, vu: 1,
  },
  'triadic': {
    bg: 0,
    text: 0, 'text-strong': 0, 'text-dim': 0,
    ui: 1,
    accent: 2, 'accent-strong': 2, vu: 2,
  },
};

// ── Anchor Hue Extraction ────────────────────────────

/**
 * Extract up to 3 anchor hues from locked elements.
 * Priority: Main_Back > first locked with visible swatch > random fallback.
 * Returns [h1, h2, h3] — trailing slots may be undefined.
 */
function extractAnchorHues(lockedElements) {
  const locked = lockedElements && lockedElements.size > 0
    ? Array.from(lockedElements)
    : [];

  const hues = [];

  // Prio 1: Main_Back
  if (locked.includes('Main_Back')) {
    const h = getHueFromInput('Main_Back');
    if (h !== null) hues.push(h);
  }

  // Prio 2: Body_Back
  if (locked.includes('Body_Back')) {
    const h = getHueFromInput('Body_Back');
    if (h !== null) hues.push(h);
  }

  // Prio 3: any other locked element (up to 3 total)
  for (const el of locked) {
    if (hues.length >= 3) break;
    if (el === 'Main_Back' || el === 'Body_Back') continue;
    const h = getHueFromInput(el);
    if (h !== null && !hues.includes(h)) hues.push(h);
  }

  // Fallback: if fewer than 1, generate random
  if (hues.length === 0) {
    hues.push(ri(0, 359));
  }

  // Fill empty slots with +120° offsets
  while (hues.length < 3) {
    hues.push((hues[hues.length - 1] + 120) % 360);
  }

  return hues;
}

/**
 * Read an element's current hue from the hidden input field.
 * Falls back to null if the element has no DOM input (e.g., first load edge case).
 */
function getHueFromInput(elName) {
  const input = document.querySelector(`input[data-element="${CSS.escape(elName)}"]`);
  if (!input || !input.value) return null;
  const hex = input.value.replace('#', '');
  if (hex.length < 6) return null;
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  // Simplified hue extraction (no full HSL needed — approximate)
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let h;
  switch (max) {
    case r: h = ((g - b) / d + (g < b ? 6 : 0)) * 60; break;
    case g: h = ((b - r) / d + 2) * 60; break;
    case b: h = ((r - g) / d + 4) * 60; break;
  }
  return Math.round(h % 360);
}

// ── Single Element Color Generation ──────────────────

/**
 * Generate a single element color.
 * @param {string} role - e.g. 'bg', 'text', 'accent', etc.
 * @param {number[]} anchorHues - [h1, h2, h3]
 * @param {string} mode - 'same-hue' | 'bi-opposite' | 'triadic'
 * @param {number} affinity - 0.0 to 1.0
 * @param {number} [hueOffset=0] - optional extra hue shift (for tracker columns)
 * @returns {string} hex color
 */
function generateElementColor(role, anchorHues, mode, affinity, hueOffset = 0) {
  // 1. Determine base hue from mode's role→hue mapping
  const hueIdx = MODE_HUE_MAP[mode] && MODE_HUE_MAP[mode][role] !== undefined
    ? MODE_HUE_MAP[mode][role]
    : 0;
  const baseHue = anchorHues[hueIdx] !== undefined ? anchorHues[hueIdx] : anchorHues[0];

  // 2. Apply offset (for tracker column cycling) + affinity-based drift
  const maxDrift = (1 - affinity) * 180;
  const drift = ri(-maxDrift, maxDrift);
  const h = ((baseHue + hueOffset + drift) % 360 + 360) % 360;

  // 3. Apply affinity to sat/light ranges
  const range = ROLE_RANGES[role] || ROLE_RANGES.text;
  const satMin = Math.round(lerp(0, range.s[0], affinity));
  const satMax = Math.round(lerp(100, range.s[1], affinity));
  const lightMin = Math.round(lerp(0, range.l[0], affinity));
  const lightMax = Math.round(lerp(100, range.l[1], affinity));

  const s = ri(satMin, satMax);
  const l = ri(lightMin, lightMax);

  return hslHex(h, s, l);
}

// ── Rainbow Track Colors ─────────────────────────────

/**
 * Generate 14 evenly-spaced rainbow track colors.
 * High saturation + medium lightness for vivid swatches.
 */
function generateRainbowTrackColors() {
  const colors = {};
  for (let i = 1; i <= 14; i++) {
    const n = String(i).padStart(2, '0');
    const hue = (i - 1) * (360 / 14);
    colors[`Default_Color_${n}`] = hslHex(hue, 85, 55);
  }
  return colors;
}

// ── Tracker Column Colors ───────────────────────────

/**
 * Generate tracker column font colors.
 * Each column gets a hue offset from the primary to create visual distinction.
 */
function generateTrackerColumnColors(anchorHues, mode, affinity) {
  const colors = {};
  const columns = TRACKER_COLUMNS;
  const perColHue = 360 / columns.length; // 45° between columns

  for (let i = 0; i < columns.length; i++) {
    const colName = columns[i];
    const offset = Math.round(i * perColHue);

    // Default variant (plain text)
    const defHex = generateElementColor('text', anchorHues, mode, affinity, offset);
    colors[`Pattern_Default_Font_${colName}`] = defHex;

    // Highlighted variant (strong text)
    const highHex = generateElementColor('text-strong', anchorHues, mode, affinity, offset);
    colors[`Pattern_Highlighted_Font_${colName}`] = highHex;
  }

  return colors;
}

// ── Public API ───────────────────────────────────────

/**
 * Generate a full 84-element palette using the chosen mode + affinity.
 * @param {string} mode - 'truly-random' | 'same-hue' | 'bi-opposite' | 'triadic'
 * @param {number} affinity - 0.0 to 1.0 (ignored for truly-random)
 * @param {Set} [lockedElements] - Set<string> of locked element names
 * @returns {Object} { elementName: hexColor, ... }
 */
function generateArchetypePalette(mode, affinity, lockedElements) {
  // Truly Random falls through to existing chaos generator
  if (mode === 'truly-random') {
    return null; // signal to caller to use generateChaosPalette()
  }

  // Clamp + validate
  affinity = Math.max(0, Math.min(1, affinity));
  if (!MODE_HUE_MAP[mode]) mode = 'same-hue';

  const anchorHues = extractAnchorHues(lockedElements);
  const palette = {};

  // 1. Element roles (54 elements with explicit roles)
  for (const [el, role] of Object.entries(ELEMENT_ROLES)) {
    palette[el] = generateElementColor(role, anchorHues, mode, affinity);
  }

  // 2. Tracker column fonts (16 elements)
  Object.assign(palette, generateTrackerColumnColors(anchorHues, mode, affinity));

  // 3. Rainbow track colors (14 elements)
  Object.assign(palette, generateRainbowTrackColors());

  return palette;
}
