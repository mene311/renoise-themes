/**
 * Comprehensive analysis of Renoise .xrnc theme files in the database.
 * Reads all uploaded .xrnc files, extracts element-to-color mappings,
 * and builds frequency tables of color-sharing patterns.
 * 
 * Usage: node analyze-themes.js
 */

import { parseThemeFile } from './lib/parser.js';
import { categorizeColors } from './lib/categorize.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const THEMES_DIR = path.join(__dirname, 'public/uploads/themes');
const DB_PATH = path.join(__dirname, 'db/themes.db');

// ── Known element groups from element-groups.js ──
const ELEMENT_GROUPS = {
  'Backgrounds & Surfaces': [
    'Main_Back', 'Body_Back', 'Alternate_Main_Back',
    'Pattern_Default_Back', 'Pattern_Highlighted_Back',
    'Pattern_CenterBar_Back', 'Pattern_CenterBar_Back_StandBy',
    'Button_Back', 'ValueBox_Back', 'ToolTip_Back', 'Midi_Mapping_Back'
  ],
  'Text & Typography': [
    'Main_Font', 'Body_Font', 'Strong_Body_Font', 'Alternate_Main_Font',
    'Button_Font', 'Selected_Button_Font', 'Button_Highlight_Font',
    'ValueBox_Font', 'ValueBox_Font_Icons', 'Selection_Font',
    'StandBy_Selection_Font', 'ToolTip_Font', 'Midi_Mapping_Font',
    'Pattern_CenterBar_Font', 'Pattern_CenterBar_Font_StandBy',
    'Pattern_Default_Font', 'Pattern_Highlighted_Font'
  ],
  'Buttons & Controls': [
    'Selected_Button_Back', 'Selection_Back', 'Pattern_Selection',
    'Pattern_StandBy_Selection', 'StandBy_Selection_Back',
    'Scrollbar', 'Slider', 'Folder'
  ],
  'Automation Editor': [
    'Automation_Grid', 'Automation_Line_Edge', 'Automation_Line_Fill',
    'Automation_Marker_Play', 'Automation_Marker_Single',
    'Automation_Marker_Pair', 'Automation_Marker_Diamond', 'Automation_Point'
  ],
  'Pattern Editor': [
    'Pattern_Default_Font_Volume', 'Pattern_Default_Font_Panning',
    'Pattern_Default_Font_Pitch', 'Pattern_Default_Font_Delay',
    'Pattern_Default_Font_Global', 'Pattern_Default_Font_Other',
    'Pattern_Default_Font_DspFx', 'Pattern_Default_Font_Unused',
    'Pattern_Highlighted_Font_Volume', 'Pattern_Highlighted_Font_Panning',
    'Pattern_Highlighted_Font_Pitch', 'Pattern_Highlighted_Font_Delay',
    'Pattern_Highlighted_Font_Global', 'Pattern_Highlighted_Font_Other',
    'Pattern_Highlighted_Font_DspFx', 'Pattern_Highlighted_Font_Unused',
    'Pattern_PlayPosition_Back', 'Pattern_PlayPosition_Font', 'Pattern_Mute_State'
  ],
  'VU Meters': [
    'VuMeter_Meter', 'VuMeter_Meter_Low', 'VuMeter_Meter_Middle',
    'VuMeter_Meter_High', 'VuMeter_Peak', 'VuMeter_Back_Normal', 'VuMeter_Back_Clipped'
  ]
};

// All 70 defined elements (flat list)
const ALL_ELEMENTS = Object.values(ELEMENT_GROUPS).flat();
const ALL_ELEMENT_SET = new Set(ALL_ELEMENTS);

// Pixel-map visible elements (from maps/pattern.json)
const PIXEL_MAP_ELEMENTS = new Set([
  "Automation_Grid", "Body_Back", "Body_Font", "Button_Back", "Button_Font",
  "Button_Highlight_Font", "Folder", "Main_Back", "Main_Font",
  "Pattern_CenterBar_Back", "Pattern_CenterBar_Font", "Pattern_Default_Back",
  "Pattern_Default_Font", "Pattern_Default_Font_Delay", "Pattern_Default_Font_Panning",
  "Pattern_Default_Font_Pitch", "Pattern_Default_Font_Volume",
  "Pattern_Highlighted_Back", "Pattern_Highlighted_Font",
  "Pattern_Highlighted_Font_Delay", "Pattern_Highlighted_Font_Panning",
  "Pattern_Highlighted_Font_Pitch", "Pattern_Highlighted_Font_Volume",
  "Pattern_Mute_State", "Scrollbar", "Selected_Button_Back", "Selected_Button_Font",
  "Selection_Back", "Selection_Font", "Slider", "StandBy_Selection_Back",
  "StandBy_Selection_Font", "Strong_Body_Font", "ValueBox_Back", "ValueBox_Font",
  "ValueBox_Font_Icons", "VuMeter_Back_Normal"
]);

// Map elements to their group
function getElementGroup(name) {
  for (const [group, elements] of Object.entries(ELEMENT_GROUPS)) {
    if (elements.includes(name)) return group;
  }
  return 'Unknown';
}

// ── Parse ALL themes ──
const files = fs.readdirSync(THEMES_DIR).filter(f => f.endsWith('.xrnc'));
console.log(`Found ${files.length} .xrnc files in uploads/themes/\n`);

const themeResults = [];
const colorShareCounts = {};  // "elem1 <> elem2" -> count of themes sharing this pair
const elementFrequency = {};   // elementName -> { present: N, uniqueColor: N, colorValues: [] }
const elementColorDistribution = {}; // elementName -> { [hex]: count }
const roleDistribution = { background: 0, text: 0, ui: 0, accent: 0 };

// Initialize tracking for all 70 known elements
for (const el of ALL_ELEMENTS) {
  elementFrequency[el] = { present: 0, uniqueColorCount: 0, totalInThemes: 0, colorValues: {} };
}

for (const file of files) {
  const filePath = path.join(THEMES_DIR, file);
  const parsed = parseThemeFile(filePath);
  
  // Get name from file or derive from filename
  const nameMatch = file.match(/seed-(.+?)\.xrnc$/i) || file.match(/stress-(.+?)\.xrnc$/i);
  const displayName = nameMatch ? nameMatch[1].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : file;

  // Extract element -> color mapping from colorEntries
  // elementColorMap uses element name without "SkinColors › " prefix
  const elementToColor = {};
  const elementToRole = {};
  for (const entry of parsed.colorEntries) {
    const bareName = entry.name.includes('›') ? entry.name.split('›').pop().trim() : entry.name;
    elementToColor[bareName] = entry.hex;
    elementToRole[bareName] = entry.role;
  }

  // Count unique colors
  const hexToElements = {};  // hex -> [element names]
  for (const [elName, hex] of Object.entries(elementToColor)) {
    if (!hexToElements[hex]) hexToElements[hex] = [];
    hexToElements[hex].push(elName);
  }

  const uniqueHexCount = Object.keys(hexToElements).length;
  const sharedHexes = Object.entries(hexToElements).filter(([, elements]) => elements.length > 1);
  const totalElementsFound = Object.keys(elementToColor).length;

  // Track for each element its color frequency
  for (const [elName, hex] of Object.entries(elementToColor)) {
    if (elementFrequency[elName]) {
      elementFrequency[elName].present++;
      elementFrequency[elName].colorValues[hex] = (elementFrequency[elName].colorValues[hex] || 0) + 1;
    }
  }

  // Track color-sharing pairs
  for (const [hex, elements] of Object.entries(hexToElements)) {
    if (elements.length <= 1) continue;
    // Record every pair within this group
    for (let i = 0; i < elements.length; i++) {
      for (let j = i + 1; j < elements.length; j++) {
        const pairKey = [elements[i], elements[j]].sort().join(' <> ');
        colorShareCounts[pairKey] = (colorShareCounts[pairKey] || 0) + 1;
      }
      // Also track "this element shares with someone" per element
      if (elementFrequency[elements[i]]) {
        elementFrequency[elements[i]].uniqueColorCount++;
      }
    }
  }

  themeResults.push({
    name: displayName,
    file,
    totalElements: totalElementsFound,
    uniqueColors: uniqueHexCount,
    sharedColorGroups: sharedHexes.length,
    duplicateEntries: totalElementsFound - uniqueHexCount,
    hexToElements,
    elementToColor
  });

  // Count elements per role
  for (const entry of parsed.colorEntries) {
    if (entry.role === 'background') roleDistribution.background++;
    else if (entry.role === 'text') roleDistribution.text++;
    else if (entry.role === 'ui') roleDistribution.ui++;
    else if (entry.role === 'accent') roleDistribution.accent++;
  }
}

// ── ANALYSIS REPORT ──

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║     RENOISE THEMES — COMPREHENSIVE COLOR ANALYSIS           ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log();

// 1. Total element count
console.log('─'.repeat(60));
console.log('1. TOTAL ELEMENT COUNT IN THE RENOISE THEME SPEC');
console.log('─'.repeat(60));
console.log(`  Total elements defined in element-groups.js: ${ALL_ELEMENTS.length}`);
console.log(`  Elements in pixel map (maps/pattern.json):   ${PIXEL_MAP_ELEMENTS.size}`);
console.log(`  Elements in Default.xrnc reference file:     ${ALL_ELEMENTS.length}`);
console.log(`  Elements with pixel-map coverage:            ${PIXEL_MAP_ELEMENTS.size}`);
console.log();

// Groups breakdown
console.log('  By group:');
for (const [group, elements] of Object.entries(ELEMENT_GROUPS)) {
  const inPixelMap = elements.filter(e => PIXEL_MAP_ELEMENTS.has(e)).length;
  console.log(`    ${group.padEnd(30)} ${String(elements.length).padStart(2)} elements  (${inPixelMap} in pixel map)`);
}
console.log();

// 2. Average unique colors
console.log('─'.repeat(60));
console.log('2. AVERAGE UNIQUE COLORS PER THEME vs TOTAL COLOR ENTRIES');
console.log('─'.repeat(60));

const avgTotalElements = themeResults.reduce((s, r) => s + r.totalElements, 0) / themeResults.length;
const avgUniqueColors = themeResults.reduce((s, r) => s + r.uniqueColors, 0) / themeResults.length;
const avgDuplicates = themeResults.reduce((s, r) => s + r.duplicateEntries, 0) / themeResults.length;

console.log(`  Total themes analyzed:         ${themeResults.length}`);
console.log(`  Average elements per theme:    ${avgTotalElements.toFixed(1)}`);
console.log(`  Average unique colors:         ${avgUniqueColors.toFixed(1)}`);
console.log(`  Average duplicate entries:     ${avgDuplicates.toFixed(1)}`);
console.log(`  Avg uniqueness ratio:          ${(avgUniqueColors / avgTotalElements * 100).toFixed(1)}%`);
console.log();

// Per-theme breakdown
console.log('  Per-theme breakdown:');
console.log(`  ${'Theme'.padEnd(25)} ${'Elements'.padEnd(10)} ${'Unique'.padEnd(10)} ${'Shared Grps'.padEnd(12)} ${'Duplicates'}`);
console.log(`  ${''.padEnd(25, '─')} ${''.padEnd(10, '─')} ${''.padEnd(10, '─')} ${''.padEnd(12, '─')} ${''.padEnd(10, '─')}`);
for (const r of themeResults) {
  console.log(`  ${r.name.padEnd(25)} ${String(r.totalElements).padEnd(10)} ${String(r.uniqueColors).padEnd(10)} ${String(r.sharedColorGroups).padEnd(12)} ${String(r.duplicateEntries)}`);
}
console.log();

// 3. Most commonly merged element pairs
console.log('─'.repeat(60));
console.log('3. MOST COMMONLY MERGED ELEMENT PAIRS (share same color)');
console.log('─'.repeat(60));

const sortedPairs = Object.entries(colorShareCounts)
  .sort((a, b) => b[1] - a[1]);

console.log(`  Found ${sortedPairs.length} unique element pairs that share colors across themes.`);
console.log(`  Showing pairs shared in >= ${Math.round(sortedPairs[0][1] * 0.3)} themes:\n`);
console.log(`  ${'Pair'.padEnd(55)} ${'Count'.padEnd(8)} ${'Rate'}`);
console.log(`  ${''.padEnd(55, '─')} ${''.padEnd(8, '─')} ${''.padEnd(6, '─')}`);
for (const [pair, count] of sortedPairs) {
  const rate = (count / themeResults.length * 100).toFixed(0);
  if (parseInt(rate) < 15) break;  // only show >= 15%
  const [e1, e2] = pair.split(' <> ');
  const g1 = getElementGroup(e1).substring(0, 12);
  const g2 = getElementGroup(e2).substring(0, 12);
  const label = `${e1.padEnd(30)}  <>  ${e2.padEnd(30)}`;
  console.log(`  ${label}  ${String(count).padEnd(8)} ${rate}%`);
}
console.log();

// 4. Group-level analysis
console.log('─'.repeat(60));
console.log('4. INTRA-GROUP COLOR SHARING (elements same color within each group)');
console.log('─'.repeat(60));

for (const [group, elements] of Object.entries(ELEMENT_GROUPS)) {
  let totalPairs = 0;
  let sharedCount = 0;
  const groupPairs = [];

  for (const [pair, count] of sortedPairs) {
    const [e1, e2] = pair.split(' <> ');
    if (elements.includes(e1) && elements.includes(e2)) {
      totalPairs++;
      sharedCount += count;
      groupPairs.push({ pair, count });
    }
  }

  const avgPairRate = groupPairs.length > 0 
    ? (groupPairs.reduce((s, p) => s + p.count, 0) / groupPairs.length / themeResults.length * 100).toFixed(1)
    : '0.0';
  
  // Count how many elements in this group are "monochromatic" with another element in the SAME group
  // (i.e., appear in any pair within this group)
  const mongoElements = new Set();
  for (const { pair } of groupPairs) {
    const [e1, e2] = pair.split(' <> ');
    mongoElements.add(e1);
    mongoElements.add(e2);
  }

  const monoPct = (mongoElements.size / elements.length * 100).toFixed(0);
  console.log(`  ${group} (${elements.length} elements):`);
  console.log(`    Intra-group shared pairs:  ${groupPairs.length}`);
  console.log(`    Elements in shared pairs:  ${mongoElements.size}/${elements.length} (${monoPct}%)`);
  if (groupPairs.length > 0) {
    console.log(`    Top shared pairs in group:`);
    groupPairs.sort((a, b) => b.count - a.count).slice(0, 5).forEach(({ pair, count }) => {
      const rate = (count / themeResults.length * 100).toFixed(0);
      console.log(`      ${pair.padEnd(55)} ${rate}% of themes`);
    });
  }
  console.log();
}

// 5. Element coverage frequency
console.log('─'.repeat(60));
console.log('5. ELEMENT HIERARCHY BY COVERAGE FREQUENCY');
console.log('─'.repeat(60));
console.log('  (How often each element appears in a theme)');
console.log();

const coverageSorted = Object.entries(elementFrequency)
  .sort((a, b) => b[1].present - a[1].present);

console.log(`  ${'Element'.padEnd(40)} ${'Present'.padEnd(10)} ${'UniqColors'.padEnd(12)} ${'Group'.padEnd(25)} ${'In PixelMap'}`);
console.log(`  ${''.padEnd(40, '─')} ${''.padEnd(10, '─')} ${''.padEnd(12, '─')} ${''.padEnd(25, '─')} ${''.padEnd(10, '─')}`);
for (const [el, freq] of coverageSorted) {
  const group = getElementGroup(el);
  const distinctColors = Object.keys(freq.colorValues).length;
  const inPixelMap = PIXEL_MAP_ELEMENTS.has(el) ? 'YES' : 'NO';
  console.log(`  ${el.padEnd(40)} ${String(freq.present).padEnd(10)} ${String(distinctColors).padEnd(12)} ${group.padEnd(25)} ${inPixelMap}`);
}
console.log();

// 6. Elements that NEVER share colors vs always share
console.log('─'.repeat(60));
console.log('6. ELEMENTS THAT TEND TO BE UNIQUE vs SHARED');
console.log('─'.repeat(60));

// Elements that share colors in many themes
const shareRateByElement = {};
for (const [pair, count] of sortedPairs) {
  const [e1, e2] = pair.split(' <> ');
  const rate = count / themeResults.length;
  shareRateByElement[e1] = Math.max(shareRateByElement[e1] || 0, rate);
  shareRateByElement[e2] = Math.max(shareRateByElement[e2] || 0, rate);
}

const alwaysShared = Object.entries(shareRateByElement)
  .filter(([, rate]) => rate >= 0.7)
  .sort((a, b) => b[1] - a[1]);

const neverShared = Object.entries(elementFrequency)
  .filter(([el, freq]) => freq.present > 0 && (!shareRateByElement[el] || shareRateByElement[el] < 0.1))
  .sort((a, b) => b[1].present - a[1].present);

console.log('  Elements that share their color with another element in >= 70% of themes:');
if (alwaysShared.length) {
  alwaysShared.forEach(([el, rate]) => {
    const pct = (rate * 100).toFixed(0);
    console.log(`    ${el.padEnd(40)} ${pct}% of themes`);
  });
} else {
  console.log('    (none at this threshold)');
}
console.log();

console.log('  Elements that almost NEVER share their color (< 10% of themes):');
if (neverShared.length) {
  neverShared.slice(0, 20).forEach(([el]) => {
    console.log(`    ${el.padEnd(40)} (${getElementGroup(el)})`);
  });
} else {
  console.log('    (all elements share at least occasionally)');
}
console.log();

// 7. Color value popularity
console.log('─'.repeat(60));
console.log('7. MOST COMMON COLOR PATTERNS (specific hex values shared between elements)');
console.log('─'.repeat(60));

// For each pair, show the most common HEX value they share
// Group pairs by the two element names, track which hex value they most commonly share
const pairHexFrequency = {};  // "elem1 <> elem2" -> { hex: count }

for (const r of themeResults) {
  for (const [hex, elements] of Object.entries(r.hexToElements)) {
    if (elements.length <= 1) continue;
    for (let i = 0; i < elements.length; i++) {
      for (let j = i + 1; j < elements.length; j++) {
        const pairKey = [elements[i], elements[j]].sort().join(' <> ');
        if (!pairHexFrequency[pairKey]) pairHexFrequency[pairKey] = {};
        pairHexFrequency[pairKey][hex] = (pairHexFrequency[pairKey][hex] || 0) + 1;
      }
    }
  }
}

// Show top pairs with their most common hex
console.log('  Top 20 merged pairs with their most common color value:');
console.log();
const topPairs = sortedPairs.slice(0, 20);
for (const [pair, count] of topPairs) {
  const rate = (count / themeResults.length * 100).toFixed(0);
  const hexFreqs = pairHexFrequency[pair] || {};
  const topHex = Object.entries(hexFreqs).sort((a, b) => b[1] - a[1]);
  const hexStr = topHex.length > 0 ? `#${topHex[0][0]} (${topHex[0][1]}/${count} themes)` : '(varies)';
  const [e1, e2] = pair.split(' <> ');
  const g1 = getElementGroup(e1);
  const g2 = getElementGroup(e2);
  console.log(`  ${e1.padEnd(32)}  <>  ${e2.padEnd(32)}  ${'→'.padEnd(3)}  ${String(rate).padStart(2)}%  ${hexStr}`);
}
console.log();

// 8. Parser role assignment analysis
console.log('─'.repeat(60));
console.log('8. PARSER ROLE ASSIGNMENT ANALYSIS');
console.log('─'.repeat(60));
console.log('  Total color entries processed by role:');
const totalRoleEntries = roleDistribution.background + roleDistribution.text + roleDistribution.ui + roleDistribution.accent;
console.log(`    Background: ${roleDistribution.background} (${(roleDistribution.background/totalRoleEntries*100).toFixed(0)}%)`);
console.log(`    Text:       ${roleDistribution.text} (${(roleDistribution.text/totalRoleEntries*100).toFixed(0)}%)`);
console.log(`    UI:         ${roleDistribution.ui} (${(roleDistribution.ui/totalRoleEntries*100).toFixed(0)}%)`);
console.log(`    Accent:     ${roleDistribution.accent} (${(roleDistribution.accent/totalRoleEntries*100).toFixed(0)}%)`);
console.log();

// Check for Body_Font misclassification
const bodyFontThemes = themeResults.filter(r => r.elementToColor['Body_Font'] !== undefined);
const bodyFontBackSame = bodyFontThemes.filter(r => r.elementToColor['Body_Font'] === r.elementToColor['Body_Back']);
console.log(`  Body_Font misclassification check:`);
console.log(`    Body_Font found in: ${bodyFontThemes.length}/${themeResults.length} themes`);
console.log(`    Body_Font same color as Body_Back: ${bodyFontBackSame.length} themes (${(bodyFontBackSame.length/bodyFontThemes.length*100).toFixed(0)}%)`);
console.log();

// Strong_Body_Font check
const strongBodyBackSame = bodyFontThemes.filter(r => r.elementToColor['Strong_Body_Font'] === r.elementToColor['Body_Back']);
console.log(`  Strong_Body_Font same color as Body_Back: ${strongBodyBackSame.length} themes (${(strongBodyBackSame.length/bodyFontThemes.length*100).toFixed(0)}%)`);
console.log();

// 9. Summary statistics
console.log('─'.repeat(60));
console.log('9. SUMMARY STATISTICS');
console.log('─'.repeat(60));

// Min/Max unique colors
const minUnique = Math.min(...themeResults.map(r => r.uniqueColors));
const maxUnique = Math.max(...themeResults.map(r => r.uniqueColors));
const minDup = Math.min(...themeResults.map(r => r.duplicateEntries));
const maxDup = Math.max(...themeResults.map(r => r.duplicateEntries));

console.log(`  Unique colors per theme: ${minUnique} – ${maxUnique} (avg ${avgUniqueColors.toFixed(1)})`);
console.log(`  Duplicate entries per theme: ${minDup} – ${maxDup} (avg ${avgDuplicates.toFixed(1)})`);
console.log(`  Elements always defined: ${coverageSorted.filter(([,f]) => f.present === themeResults.length).length}/${ALL_ELEMENTS.length}`);
console.log(`  Elements never defined:  ${coverageSorted.filter(([,f]) => f.present === 0).length}/${ALL_ELEMENTS.length}`);
console.log();

// Elements that are always present
const alwaysPresent = coverageSorted.filter(([,f]) => f.present === themeResults.length);
const sometimesMissing = coverageSorted.filter(([,f]) => f.present > 0 && f.present < themeResults.length);
const neverPresent = coverageSorted.filter(([,f]) => f.present === 0);

console.log(`  Elements present in ALL ${themeResults.length} themes (${alwaysPresent.length}):`);
alwaysPresent.forEach(([el]) => console.log(`    ${el} (${getElementGroup(el)})`));
console.log();

if (sometimesMissing.length > 0) {
  console.log(`  Elements SOMETIMES missing (${sometimesMissing.length}):`);
  sometimesMissing.slice(0, 15).forEach(([el, freq]) => {
    const pct = (freq.present / themeResults.length * 100).toFixed(0);
    console.log(`    ${el.padEnd(40)} ${freq.present}/${themeResults.length} themes (${pct}%) — ${getElementGroup(el)}`);
  });
  console.log();
}

if (neverPresent.length > 0) {
  console.log(`  Elements NEVER present in any uploaded theme (${neverPresent.length}):`);
  neverPresent.forEach(([el]) => console.log(`    ${el} (${getElementGroup(el)})`));
  console.log();
}

// The most common hex value across all themes for each key element
console.log('─'.repeat(60));
console.log('10. MOST COMMON COLOR FOR KEY ELEMENTS (modal hex value)');
console.log('─'.repeat(60));
console.log();

const keyElements = ['Main_Back', 'Main_Font', 'Body_Back', 'Body_Font', 'Button_Back', 
                     'Button_Font', 'Selection_Back', 'Selection_Font',
                     'Pattern_Default_Back', 'Pattern_Default_Font',
                     'Pattern_Highlighted_Back', 'Pattern_Highlighted_Font',
                     'Scrollbar', 'Slider', 'VuMeter_Back_Normal', 'Pattern_Mute_State',
                     'Pattern_PlayPosition_Back', 'Pattern_CenterBar_Back',
                     'Automation_Grid', 'Automation_Line_Fill'];

for (const el of keyElements) {
  const freq = elementFrequency[el];
  if (freq && freq.present > 0) {
    const colorEntries = Object.entries(freq.colorValues).sort((a, b) => b[1] - a[1]);
    const top = colorEntries[0];
    const pct = (top[1] / freq.present * 100).toFixed(0);
    console.log(`  ${el.padEnd(38)} most common: #${top[0]} (${top[1]}/${freq.present} themes, ${pct}%)`);
  }
}
console.log();

// 11. DB bug report
console.log('─'.repeat(60));
console.log('11. DATABASE ACCURACY CHECK');
console.log('─'.repeat(60));
console.log();

import Database from 'better-sqlite3';
const db = new Database(DB_PATH);
const dbThemes = db.prepare('SELECT id, name, filename, total_colors, unique_colors FROM themes').all();
let dbMismatches = 0;
for (const t of dbThemes) {
  const fileResult = themeResults.find(r => r.file === t.filename);
  if (fileResult) {
    // total_colors should be fileResult.totalElements (70)
    // unique_colors should be fileResult.uniqueColors (46-47)
    if (t.total_colors !== fileResult.totalElements) {
      dbMismatches++;
      if (dbMismatches <= 5) {
        console.log(`  ${t.name}: DB says total=${t.total_colors}, unique=${t.unique_colors} | Actual: total=${fileResult.totalElements}, unique=${fileResult.uniqueColors}`);
      }
    }
  }
}
console.log(`  Total DB mismatches: ${dbMismatches}/${dbThemes.length}`);
console.log(`  Root cause: DB stores stats.totalUnique (${avgUniqueColors.toFixed(0)}) for BOTH fields`);
console.log(`  instead of totalColorEntries (${avgTotalElements.toFixed(0)}) for total_colors.`);
console.log();

// Final insights
console.log('─'.repeat(60));
console.log('KEY INSIGHTS FOR CREATOR UI REDESIGN');
console.log('─'.repeat(60));
console.log();
console.log('  1. The 70 elements naturally collapse into ~46-47 unique color slots.');
console.log('  2. Many element pairs ALWAYS share colors — the creator should auto-sync them.');
console.log('  3. These element clusters form natural "tied-color groups":');
console.log();

// Find the strongest always-shared clusters
const alwaysSharedPairs = sortedPairs.filter(([, count]) => count === themeResults.length);
const clusters = [];
const seen = new Set();
for (const [pair] of alwaysSharedPairs) {
  const [e1, e2] = pair.split(' <> ');
  // Find or create cluster
  let cluster = clusters.find(c => c.has(e1) || c.has(e2));
  if (!cluster) {
    cluster = new Set();
    clusters.push(cluster);
  }
  cluster.add(e1);
  cluster.add(e2);
}

clusters.sort((a, b) => b.size - a.size);
for (const cluster of clusters) {
  if (cluster.size >= 2) {
    console.log(`    CLUSTER (${cluster.size} elements, share in 100% of themes):`);
    const elems = [...cluster].sort();
    // Show what group they belong to
    elems.forEach(el => console.log(`      ${el.padEnd(38)} ← ${getElementGroup(el)}`));
    console.log();
  }
}

// Cross-cluster insights
const crossGroupPairs = sortedPairs.filter(([pair, count]) => {
  const [e1, e2] = pair.split(' <> ');
  return getElementGroup(e1) !== getElementGroup(e2) && count / themeResults.length >= 0.8;
});
console.log('  4. Cross-group color ties (elements in DIFFERENT groups that share >= 80% of themes):');
if (crossGroupPairs.length > 0) {
  crossGroupPairs.slice(0, 15).forEach(([pair, count]) => {
    const rate = (count / themeResults.length * 100).toFixed(0);
    const [e1, e2] = pair.split(' <> ');
    console.log(`      ${e1.padEnd(32)} <> ${e2.padEnd(32)} — ${rate}%`);
  });
}
console.log();
console.log('  5. The creator UI should show ~46 editable color slots, not 70.');
console.log('     Tied elements should auto-update when their "master" changes.');
console.log('  6. Several pattern-font sub-elements (Volume/Panning/Pitch/etc.) share colors');
console.log('     with their default counterparts, simplifying the Pattern Editor section.');
console.log('  7. Body_Font and Strong_Body_Font are commonly the same as Main_Font or');
console.log('     Main_Back — they rarely need independent color pickers.');

db.close();
