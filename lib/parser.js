import { XMLParser } from 'fast-xml-parser';
import fs from 'fs';

/**
 * Role definitions — what kind of UI element is this color for?
 * weight = how much visual real estate it covers (roughly)
 *
 * We match XML tag names by keyword patterns.
 */
const EXCLUDE_PATTERNS = [
  /^Default_Color_\d+$/i,
];

const ROLE_RULES = [
  // Backgrounds — dominate the screen
  { pattern: /^Main_Back$/i,            role: 'background', weight: 10 },
  { pattern: /^Alternate_Main_Back$/i,  role: 'background', weight: 8 },
  { pattern: /Back/i,                   role: 'background', weight: 5 },
  { pattern: /Body(?!.*Font)/i,         role: 'background', weight: 4 },
  { pattern: /Pattern(?!.*Font)/i,      role: 'background', weight: 5 },
  { pattern: /Mixer(?!.*Font)/i,        role: 'background', weight: 4 },

  // Text / Fonts — always visible but thin
  { pattern: /^Main_Font$/i,            role: 'text', weight: 6 },
  { pattern: /^Alternate_Main_Font$/i,  role: 'text', weight: 5 },
  { pattern: /Font/i,                   role: 'text', weight: 3 },

  // UI elements — buttons, sliders, scrollbars
  { pattern: /Button/i,                 role: 'ui', weight: 3 },
  { pattern: /Scroll/i,                 role: 'ui', weight: 2 },
  { pattern: /Slider/i,                 role: 'ui', weight: 2 },
  { pattern: /Header/i,                 role: 'ui', weight: 3 },
  { pattern: /Tab/i,                    role: 'ui', weight: 2 },
  { pattern: /Border/i,                 role: 'ui', weight: 1 },

  // Accents — small pops of color
  { pattern: /Cursor/i,                 role: 'accent', weight: 2 },
  { pattern: /Selection/i,             role: 'accent', weight: 2 },
  { pattern: /Highlight/i,             role: 'accent', weight: 2 },
  { pattern: /VU/i,                     role: 'accent', weight: 1 },
  { pattern: /Meter/i,                  role: 'accent', weight: 1 },
  { pattern: /Solo/i,                   role: 'accent', weight: 1 },
  { pattern: /Mute/i,                   role: 'accent', weight: 1 },
];

/**
 * Given a tag name like "Main_Back", return { role, weight }
 */
function classifyElement(tagName) {
  const name = tagName.includes('›') ? tagName.split('›').pop().trim() : tagName;

  if (EXCLUDE_PATTERNS.some(p => p.test(name))) return null;

  for (const rule of ROLE_RULES) {
    if (rule.pattern.test(name)) {
      return { role: rule.role, weight: rule.weight };
    }
  }
  return { role: 'ui', weight: 1 };
}

/**
 * Recursively walk parsed XML and collect all leaf values
 */
function extractLeafValues(obj, path = '', results = []) {
  if (obj === null || obj === undefined) return results;

  if (typeof obj !== 'object') {
    results.push({ path, value: String(obj) });
    return results;
  }

  for (const key of Object.keys(obj)) {
    const val = obj[key];
    const currentPath = path ? `${path} › ${key}` : key;

    if (Array.isArray(val)) {
      val.forEach((item, i) => extractLeafValues(item, `${currentPath}[${i}]`, results));
    } else if (typeof val === 'object' && val !== null) {
      extractLeafValues(val, currentPath, results);
    } else {
      results.push({ path: currentPath, value: String(val) });
    }
  }
  return results;
}

/**
 * Parse string → 6-char hex or null
 */
function parseColor(str) {
  str = str.trim();

  // Decimal R,G,B
  const decMatch = str.match(/^(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})$/);
  if (decMatch) {
    const r = parseInt(decMatch[1], 10);
    const g = parseInt(decMatch[2], 10);
    const b = parseInt(decMatch[3], 10);
    if (r <= 255 && g <= 255 && b <= 255) {
      return (
        r.toString(16).padStart(2, '0') +
        g.toString(16).padStart(2, '0') +
        b.toString(16).padStart(2, '0')
      ).toUpperCase();
    }
  }

  // 0xRR,0xGG,0xBB
  const hexComma = str.match(/^0x([0-9A-Fa-f]{2})\s*,\s*0x([0-9A-Fa-f]{2})\s*,\s*0x([0-9A-Fa-f]{2})$/);
  if (hexComma) {
    return (hexComma[1] + hexComma[2] + hexComma[3]).toUpperCase();
  }

  if (str.startsWith('#')) str = str.slice(1);
  if (/^[0-9A-Fa-f]{6}$/.test(str)) return str.toUpperCase();
  if (/^[0-9A-Fa-f]{8}$/.test(str)) return str.slice(0, 6).toUpperCase();

  return null;
}

/**
 * Parse a Renoise .xrnc theme file
 * Returns colors grouped by role with weights
 */
export function parseThemeFile(filePath) {
  const xml = fs.readFileSync(filePath, 'utf-8');

  const parser = new XMLParser({
    ignoreAttributes: true,
    parseTagValue: false,
    trimValues: true,
    commentPropName: false,
    processEntities: false,        // Disable entity expansion (prevents XXE)
    ignoreDeclaration: true,       // Ignore XML declarations
    ignorePiTags: true             // Ignore processing instructions
  });

  const parsed = parser.parse(xml);
  const leaves = extractLeafValues(parsed);

  const colorEntries = [];   // every color found
  const uniqueMap = {};       // hex → { weight, roles, names }

  for (const { path, value } of leaves) {
    const hex = parseColor(value);
    if (!hex) continue;

    const classification = classifyElement(path);
    if (!classification) continue;
    const { role, weight } = classification;
    colorEntries.push({ name: path, hex, role, weight });

    if (!uniqueMap[hex]) {
      uniqueMap[hex] = { hex, weight: 0, roles: new Set(), names: [] };
    }
    uniqueMap[hex].weight += weight;
    uniqueMap[hex].roles.add(role);
    uniqueMap[hex].names.push(path);
  }

  // Convert to array and sort by weight (most prominent first)
  const weighted = Object.values(uniqueMap)
    .map(c => ({
      ...c,
      roles: [...c.roles]
    }))
    .sort((a, b) => b.weight - a.weight);

  // Group by role for structured output
  const groups = {
    background: colorEntries.filter(c => c.role === 'background'),
    text:       colorEntries.filter(c => c.role === 'text'),
    ui:         colorEntries.filter(c => c.role === 'ui'),
    accent:     colorEntries.filter(c => c.role === 'accent')
  };

  // Build element-name → [r,g,b] map for preview renderer
  // Uses the FIRST color found for each element (Renois typically defines each element once)
  const elementColorMap = {};
  for (const entry of colorEntries) {
    const elementName = entry.name.includes('›') ? entry.name.split('›').pop().trim() : entry.name;
    if (!elementColorMap[elementName]) {
      const hex = entry.hex;
      elementColorMap[elementName] = [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16)
      ];
    }
  }

  return {
    totalColors: colorEntries.length,
    uniqueColors: weighted.map(c => c.hex),
    weighted,
    groups,
    colorEntries,
    elementColorMap
  };
}
