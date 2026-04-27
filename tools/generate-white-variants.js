#!/usr/bin/env node
/**
 * Generates variant .xrnc files with WHITE baseline.
 *
 * ALL elements = #FFFFFF (white)
 * ONE test element = #00FF00 (bright green)
 *
 * Screenshot → every green pixel = that element's pixels.
 * No diffing needed — just threshold for green.
 *
 * Usage:
 *   node tools/generate-white-variants.js [limit] [output-dir]
 *
 *   limit: number of elements to generate (default: all 70)
 *   output-dir: where to store variants (default: tools/white-variants/)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ALL_ELEMENTS = [
  'Main_Back','Main_Font','Alternate_Main_Back','Alternate_Main_Font',
  'Body_Back','Body_Font','Strong_Body_Font',
  'Button_Back','Button_Font','Button_Highlight_Font',
  'Selected_Button_Back','Selected_Button_Font',
  'Selection_Back','Selection_Font',
  'StandBy_Selection_Back','StandBy_Selection_Font',
  'Midi_Mapping_Back','Midi_Mapping_Font',
  'ToolTip_Back','ToolTip_Font',
  'ValueBox_Back','ValueBox_Font','ValueBox_Font_Icons',
  'Scrollbar','Slider','Folder',
  'Pattern_Default_Back','Pattern_Default_Font',
  'Pattern_Default_Font_Volume','Pattern_Default_Font_Panning',
  'Pattern_Default_Font_Pitch','Pattern_Default_Font_Delay',
  'Pattern_Default_Font_Global','Pattern_Default_Font_Other',
  'Pattern_Default_Font_DspFx','Pattern_Default_Font_Unused',
  'Pattern_Highlighted_Back','Pattern_Highlighted_Font',
  'Pattern_Highlighted_Font_Volume','Pattern_Highlighted_Font_Panning',
  'Pattern_Highlighted_Font_Pitch','Pattern_Highlighted_Font_Delay',
  'Pattern_Highlighted_Font_Global','Pattern_Highlighted_Font_Other',
  'Pattern_Highlighted_Font_DspFx','Pattern_Highlighted_Font_Unused',
  'Pattern_PlayPosition_Back','Pattern_PlayPosition_Font',
  'Pattern_CenterBar_Back','Pattern_CenterBar_Font',
  'Pattern_CenterBar_Back_StandBy','Pattern_CenterBar_Font_StandBy',
  'Pattern_Selection','Pattern_StandBy_Selection','Pattern_Mute_State',
  'Automation_Grid','Automation_Line_Edge','Automation_Line_Fill',
  'Automation_Point','Automation_Marker_Play','Automation_Marker_Single',
  'Automation_Marker_Pair','Automation_Marker_Diamond',
  'VuMeter_Meter','VuMeter_Meter_Low','VuMeter_Meter_Middle',
  'VuMeter_Meter_High','VuMeter_Peak',
  'VuMeter_Back_Normal','VuMeter_Back_Clipped'
];

const WHITE = '255,255,255';
const PROBE = '0,255,0'; // bright green

function generateWhiteVariants(limit, outputDir) {
  fs.mkdirSync(outputDir, { recursive: true });

  // Build the white baseline: every element = white
  let baselineXml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  baselineXml += '<SkinColors doc_version="12">\n';
  for (const el of ALL_ELEMENTS) {
    baselineXml += `  <${el}>${WHITE}</${el}>\n`;
  }
  // Track palette colors
  for (let i = 1; i <= 16; i++) {
    const idx = String(i).padStart(2, '0');
    baselineXml += `  <Default_Color_${idx}>${WHITE}</Default_Color_${idx}>\n`;
  }
  baselineXml += '  <ButtonBevalAmount>1.07599998</ButtonBevalAmount>\n';
  baselineXml += '  <BodyBevalAmount>1.0679996</BodyBevalAmount>\n';
  baselineXml += '  <ContrastAdjustment>0.26000002</ContrastAdjustment>\n';
  baselineXml += '  <TextureSet>Default</TextureSet>\n';
  baselineXml += '</SkinColors>\n';

  // Save baseline
  const baselineDir = path.join(outputDir, '00_white_baseline');
  fs.mkdirSync(baselineDir, { recursive: true });
  fs.writeFileSync(path.join(baselineDir, 'white_baseline.xrnc'), baselineXml);
  console.log(`🔲 Baseline (all white): ${baselineDir}/white_baseline.xrnc`);

  const elements = ALL_ELEMENTS.slice(0, limit || ALL_ELEMENTS.length);
  let count = 0;

  for (const element of elements) {
    // Generate variant: this element = green, all others = white
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<SkinColors doc_version="12">\n';
    for (const el of ALL_ELEMENTS) {
      const color = (el === element) ? PROBE : WHITE;
      xml += `  <${el}>${color}</${el}>\n`;
    }
    for (let i = 1; i <= 16; i++) {
      const idx = String(i).padStart(2, '0');
      xml += `  <Default_Color_${idx}>${WHITE}</Default_Color_${idx}>\n`;
    }
    xml += '  <ButtonBevalAmount>1.07599998</ButtonBevalAmount>\n';
    xml += '  <BodyBevalAmount>1.0679996</BodyBevalAmount>\n';
    xml += '  <ContrastAdjustment>0.26000002</ContrastAdjustment>\n';
    xml += '  <TextureSet>Default</TextureSet>\n';
    xml += '</SkinColors>\n';

    const padded = String(count + 1).padStart(2, '0');
    const variantDir = path.join(outputDir, `${padded}_${element}`);
    fs.mkdirSync(variantDir, { recursive: true });
    const outPath = path.join(variantDir, `${element}.xrnc`);
    fs.writeFileSync(outPath, xml);
    count++;
  }

  console.log(`✅ Generated ${count} white-baseline variant .xrnc files`);
  console.log(`   Output: ${outputDir}/`);
}

const limit = parseInt(process.argv[2]) || 0;  // 0 = all
const outDir = process.argv[3] || path.join(__dirname, 'white-variants');
generateWhiteVariants(limit, outDir);
