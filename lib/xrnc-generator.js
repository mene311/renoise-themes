/**
 * XRNC Theme File Generator
 * Produces a valid Renoise .xrnc XML file from an elementColorMap.
 */

// Default non-color parameters from the stock Renoise theme
const DEFAULT_PARAMS = {
  ButtonBevalAmount: '1.07599998',
  BodyBevalAmount: '1.0679996',
  ContrastAdjustment: '0.26000002',
  TextureSet: 'Default'
};

// Default track palette colors (Default_Color_01 through Default_Color_16)
const DEFAULT_TRACK_COLORS = [
  [166,41,41], [166,80,41], [166,118,41], [166,144,41],
  [161,166,41], [118,166,47], [71,166,47], [63,166,106],
  [41,166,153], [41,116,166], [41,59,166], [95,58,166],
  [138,41,166], [140,35,131], [166,41,118], [166,41,80]
];

/**
 * The canonical order of elements as they appear in a .xrnc file.
 * Must match Renoise's expected element order for compatibility.
 */
const ELEMENT_ORDER = [
  // ── Global ──
  'Main_Back', 'Main_Font', 'Alternate_Main_Back', 'Alternate_Main_Font',
  'Body_Back', 'Body_Font', 'Strong_Body_Font',
  'Button_Back', 'Button_Font', 'Button_Highlight_Font',
  'Selected_Button_Back', 'Selected_Button_Font',
  'Selection_Back', 'Selection_Font',
  'StandBy_Selection_Back', 'StandBy_Selection_Font',
  'Midi_Mapping_Back', 'Midi_Mapping_Font',
  'ToolTip_Back', 'ToolTip_Font',
  'ValueBox_Back', 'ValueBox_Font', 'ValueBox_Font_Icons',
  'Scrollbar', 'Slider', 'Folder',

  // ── Pattern Editor ──
  'Pattern_Default_Back', 'Pattern_Default_Font',
  'Pattern_Default_Font_Volume', 'Pattern_Default_Font_Panning',
  'Pattern_Default_Font_Pitch', 'Pattern_Default_Font_Delay',
  'Pattern_Default_Font_Global', 'Pattern_Default_Font_Other',
  'Pattern_Default_Font_DspFx', 'Pattern_Default_Font_Unused',
  'Pattern_Highlighted_Back', 'Pattern_Highlighted_Font',
  'Pattern_Highlighted_Font_Volume', 'Pattern_Highlighted_Font_Panning',
  'Pattern_Highlighted_Font_Pitch', 'Pattern_Highlighted_Font_Delay',
  'Pattern_Highlighted_Font_Global', 'Pattern_Highlighted_Font_Other',
  'Pattern_Highlighted_Font_DspFx', 'Pattern_Highlighted_Font_Unused',
  'Pattern_PlayPosition_Back', 'Pattern_PlayPosition_Font',
  'Pattern_CenterBar_Back', 'Pattern_CenterBar_Font',
  'Pattern_CenterBar_Back_StandBy', 'Pattern_CenterBar_Font_StandBy',
  'Pattern_Selection', 'Pattern_StandBy_Selection',
  'Pattern_Mute_State',

  // ── Automation ──
  'Automation_Grid',
  'Automation_Line_Edge', 'Automation_Line_Fill',
  'Automation_Point',
  'Automation_Marker_Play', 'Automation_Marker_Single',
  'Automation_Marker_Pair', 'Automation_Marker_Diamond',

  // ── VU Meter ──
  'VuMeter_Meter',
  'VuMeter_Meter_Low', 'VuMeter_Meter_Middle', 'VuMeter_Meter_High',
  'VuMeter_Peak',
  'VuMeter_Back_Normal', 'VuMeter_Back_Clipped'
];

/**
 * Generate a valid .xrnc XML string from an elementColorMap.
 * @param {Object} elementColorMap - { elementName: [r, g, b], ... }
 * @param {Object} [trackColors] - Optional array of 16 [r,g,b] track palette colors
 * @returns {string} Complete .xrnc XML
 */
export function generateXrnc(elementColorMap, trackColors = null) {
  const colors = trackColors || DEFAULT_TRACK_COLORS;

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<SkinColors doc_version="12">\n';

  // Element colors in canonical order
  for (const name of ELEMENT_ORDER) {
    const rgb = elementColorMap[name];
    if (rgb && rgb.length === 3) {
      xml += `  <${name}>${rgb[0]},${rgb[1]},${rgb[2]}</${name}>\n`;
    }
  }

  // Track palette colors
  for (let i = 0; i < 16; i++) {
    const idx = String(i + 1).padStart(2, '0');
    const [r, g, b] = colors[i] || [128, 128, 128];
    xml += `  <Default_Color_${idx}>${r},${g},${b}</Default_Color_${idx}>\n`;
  }

  // Non-color parameters
  xml += `  <ButtonBevalAmount>${DEFAULT_PARAMS.ButtonBevalAmount}</ButtonBevalAmount>\n`;
  xml += `  <BodyBevalAmount>${DEFAULT_PARAMS.BodyBevalAmount}</BodyBevalAmount>\n`;
  xml += `  <ContrastAdjustment>${DEFAULT_PARAMS.ContrastAdjustment}</ContrastAdjustment>\n`;
  xml += `  <TextureSet>${DEFAULT_PARAMS.TextureSet}</TextureSet>\n`;
  xml += '</SkinColors>\n';

  return xml;
}

export { ELEMENT_ORDER, DEFAULT_TRACK_COLORS };
