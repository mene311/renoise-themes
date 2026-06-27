/**
 * Shared Constants & Config for Renoise Theme Creator.
 *
 * Single source of truth for element-to-role mappings, role HSL ranges,
 * mode hue assignments, tracker column names, and rainbow track generators.
 *
 * Must be loaded AFTER color-utils.js, BEFORE any engine file.
 * Exposed on window.__CREATOR_CONST.
 */

window.__CREATOR_CONST = (function () {
  const { hslHex, ri } = window.__colorUtils;

  // ── Element → Role Mapping ──────────────────────

  const ELEMENT_ROLES = {
    // Backgrounds & Surfaces (11)
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

    // Text & Typography (17)
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

    // Buttons & Controls (8)
    Selected_Button_Back: 'accent',
    Selection_Back: 'accent',
    Pattern_Selection: 'accent',
    Pattern_StandBy_Selection: 'ui',
    StandBy_Selection_Back: 'ui',
    Scrollbar: 'ui',
    Slider: 'accent',
    Folder: 'accent',

    // Automation Editor (8)
    Automation_Grid: 'ui',
    Automation_Line_Edge: 'accent',
    Automation_Line_Fill: 'accent-strong',
    Automation_Marker_Play: 'accent-strong',
    Automation_Marker_Single: 'accent',
    Automation_Marker_Pair: 'accent',
    Automation_Marker_Diamond: 'accent',
    Automation_Point: 'accent-strong',

    // Pattern Editor extras (3 of 19, rest are tracker columns below)
    Pattern_PlayPosition_Back: 'accent',
    Pattern_PlayPosition_Font: 'text-strong',
    Pattern_Mute_State: 'ui',

    // VU Meters (7)
    VuMeter_Meter: 'vu',
    VuMeter_Meter_Low: 'vu',
    VuMeter_Meter_Middle: 'vu',
    VuMeter_Meter_High: 'vu',
    VuMeter_Peak: 'vu',
    VuMeter_Back_Normal: 'ui',
    VuMeter_Back_Clipped: 'ui',
  };

  // ── Tracker column names ────────────────────────

  const TRACKER_COLUMNS = [
    'Volume', 'Panning', 'Pitch', 'Delay',
    'Global', 'Other', 'DspFx', 'Unused'
  ];

  // ── Role HSL Ranges (target at affinity=1.0 = bold/extreme) ──

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

  // ── Mode → Role Hue Assignment ──────────────────

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

  // ── VU Meter Preset names (used by chaos engine) ──
  // These must match the presets defined in the EJS template.
  const VU_PRESET_NAMES = [
    'Classic', 'Fire', 'Ice', 'Acid', 'Pastel', 'Neon', 'Flat'
  ];

  // ── Rainbow Track Colors ────────────────────────

  /**
   * Generate 14 evenly-spaced rainbow track colors.
   * @param {number} [sat=85] - Saturation 0-100
   * @param {number} [light=55] - Lightness 0-100
   * @returns {Object} { Default_Color_01: '#hex', ... Default_Color_14: '#hex' }
   */
  function generateRainbowTrackColors(sat = 85, light = 55) {
    const colors = {};
    for (let i = 1; i <= 14; i++) {
      const n = String(i).padStart(2, '0');
      const hue = (i - 1) * (360 / 14);
      colors[`Default_Color_${n}`] = hslHex(hue, sat, light);
    }
    return colors;
  }

  // ── Public API ─────────────────────────────────

  return {
    ELEMENT_ROLES,
    TRACKER_COLUMNS,
    ROLE_RANGES,
    MODE_HUE_MAP,
    VU_PRESET_NAMES,
    generateRainbowTrackColors,
  };
})();
