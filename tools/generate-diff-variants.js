#!/usr/bin/env node
/**
 * Generates 70+ variant .xrnc files for diff-based pixel map refinement.
 *
 * For each Renoise theme element, creates a variant where that element
 * is set to magenta (#FF00FF) and all others keep their original colors.
 * Diff each variant screenshot against the baseline screenshot to find
 * exactly which pixels belong to that element.
 *
 * Usage:
 *   node tools/generate-diff-variants.js [path/to/base-theme.xrnc] [output-dir]
 *
 * Default: reads Default.xrnc, outputs to tools/diff-variants/
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// All 70 Renoise theme elements in canonical order
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

// Magenta — highly distinct from any realistic Renoise theme color
const PROBE_COLOR = '255,0,255'; // #FF00FF

function generateVariants(baseThemePath, outputDir) {
  if (!fs.existsSync(baseThemePath)) {
    console.error(`Base theme not found: ${baseThemePath}`);
    process.exit(1);
  }

  const xml = fs.readFileSync(baseThemePath, 'utf-8');
  fs.mkdirSync(outputDir, { recursive: true });

  // Copy baseline as-is (for baseline screenshot)
  const baselineDir = path.join(outputDir, '00_baseline');
  fs.mkdirSync(baselineDir, { recursive: true });
  fs.writeFileSync(path.join(baselineDir, 'baseline.xrnc'), xml);
  console.log(`📸 Baseline: ${baselineDir}/baseline.xrnc`);

  // Generate one variant per element
  let count = 0;
  for (const element of ALL_ELEMENTS) {
    // Replace this element's color with magenta, leave everything else
    const regex = new RegExp(`(<${element}>)[^<]*(</${element}>)`, 'g');
    const variant = xml.replace(regex, `$1${PROBE_COLOR}$2`);

    if (variant === xml) {
      console.warn(`  ⚠️  Element not found in base theme: ${element}`);
      continue;
    }

    const padded = String(count + 1).padStart(2, '0');
    const variantDir = path.join(outputDir, `${padded}_${element}`);
    fs.mkdirSync(variantDir, { recursive: true });
    const outPath = path.join(variantDir, `${element}.xrnc`);
    fs.writeFileSync(outPath, variant);
    count++;
  }

  console.log(`✅ Generated ${count} variant .xrnc files`);
  console.log('');
  console.log('📋 Next steps:');
  console.log(`  1. Load ${baselineDir}/baseline.xrnc in Renoise, open Pattern Editor, screenshot → baseline.png`);
  console.log('  2. For each variant in ' + outputDir + '/XX_ElementName/:');
  console.log('     - Load the .xrnc in Renoise');
  console.log('     - Screenshot the SAME view (same project, same window size)');
  console.log('     - Save as ElementName.png in the same folder');
  console.log('  3. Run: node tools/build-diff-maps.js ' + outputDir);
}

const basePath = process.argv[2] || path.join(__dirname, '..', 'Default.xrnc');
const outDir = process.argv[3] || path.join(__dirname, 'diff-variants');

generateVariants(basePath, outDir);
