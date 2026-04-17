/**
 * RAINBOW THEME GENERATOR
 *
 * Takes an existing .xrnc as a template, replaces every single color
 * with a unique, distinguishable color. Load it in Renoise and screenshot.
 * Then we can map: "that pink area = Pattern_Selection_Back"
 *
 * Usage: node tools/generate-rainbow-theme.js base-theme.xrnc
 * Output: rainbow-theme.xrnc + rainbow-map.json
 */

import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import fs from 'fs';

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node tools/generate-rainbow-theme.js <base-theme.xrnc>');
  process.exit(1);
}

const xml = fs.readFileSync(filePath, 'utf-8');

// We need to preserve structure, so parse with all options
const parser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: false,
  trimValues: true,
  preserveOrder: true
});

const parsed = parser.parse(xml);

/**
 * Generate N visually distinct colors using golden ratio hue spacing
 * This ensures every color is maximally distinguishable
 */
function generateDistinctColors(count) {
  const colors = [];
  const goldenRatio = 0.618033988749895;
  let hue = 0;

  for (let i = 0; i < count; i++) {
    hue = (hue + goldenRatio) % 1;

    // Convert HSL to RGB
    // Alternate saturation and lightness for more distinction
    const sat = 0.7 + (i % 3) * 0.1;        // 0.7, 0.8, 0.9
    const light = 0.35 + ((i % 5) * 0.1);    // 0.35–0.75

    const c = hslToRgb(hue, sat, light);
    colors.push(c);
  }
  return colors;
}

function hslToRgb(h, s, l) {
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255)
  };
}

// Simple approach: regex-replace all R,G,B values in the raw XML
// while preserving structure

const isColor = /^(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})$/;

// First pass: count how many colors there are
const lines = xml.split('\n');
let colorCount = 0;
const colorLines = [];

for (let i = 0; i < lines.length; i++) {
  const match = lines[i].match(/>(\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3})</);
  if (match) {
    // Extract the element name
    const nameMatch = lines[i].match(/<(\w+)>/);
    if (nameMatch) {
      colorLines.push({ lineNum: i, name: nameMatch[1], original: match[1] });
      colorCount++;
    }
  }
}

console.log(`Found ${colorCount} color elements\n`);

// Generate unique colors
const palette = generateDistinctColors(colorCount);

// Build the mapping and new XML
const mapping = {};
let newXml = xml;

// Replace in reverse order so line positions don't shift
const replacements = [];
for (let i = 0; i < colorLines.length; i++) {
  const entry = colorLines[i];
  const color = palette[i];
  const colorStr = `${color.r},${color.g},${color.b}`;
  const hex = '#' + [color.r, color.g, color.b].map(c => c.toString(16).padStart(2, '0')).join('');

  mapping[hex] = {
    element: entry.name,
    original: entry.original,
    rainbow: colorStr,
    hex: hex
  };

  replacements.push({
    search: `<${entry.name}>${entry.original}</${entry.name}>`,
    replace: `<${entry.name}>${colorStr}</${entry.name}>`
  });
}

// Apply replacements
for (const r of replacements) {
  newXml = newXml.replace(r.search, r.replace);
}

// Save files
const outTheme = 'rainbow-theme.xrnc';
const outMap = 'rainbow-map.json';

fs.writeFileSync(outTheme, newXml, 'utf-8');
fs.writeFileSync(outMap, JSON.stringify(mapping, null, 2), 'utf-8');

console.log(`✅ Generated: ${outTheme}`);
console.log(`✅ Color map: ${outMap}`);
console.log(`\n📋 Color Legend:`);
console.log('─'.repeat(65));

for (const [hex, info] of Object.entries(mapping)) {
  console.log(`  ${hex}  →  ${info.element.padEnd(40)} (was ${info.original})`);
}

console.log(`
═══════════════════════════════════════════════════════════
  NEXT STEPS:
  1. Load ${outTheme} in Renoise (Preferences → Theme → Import)
  2. Screenshot the entire Renoise window
  3. Run:  node tools/pixel-mapper.js screenshot.png rainbow-map.json
═══════════════════════════════════════════════════════════
`);
