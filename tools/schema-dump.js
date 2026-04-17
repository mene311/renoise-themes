import { XMLParser } from 'fast-xml-parser';
import fs from 'fs';

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node tools/schema-dump.js <path-to-xrnc>');
  process.exit(1);
}

const xml = fs.readFileSync(filePath, 'utf-8');
const parser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: false,
  trimValues: true
});

const parsed = parser.parse(xml);

function rgbToHex(str) {
  const parts = str.split(',').map(n => parseInt(n.trim()));
  if (parts.length !== 3 || parts.some(n => isNaN(n) || n > 255)) return null;
  const hex = '#' + parts.map(c => c.toString(16).padStart(2, '0')).join('');
  return hex;
}

function walk(obj, depth = 0) {
  if (obj === null || obj === undefined) return;

  for (const key of Object.keys(obj)) {
    if (key.startsWith('@_') || key === '#comment') continue;

    const val = obj[key];
    const indent = '  '.repeat(depth);

    if (typeof val === 'object' && val !== null) {
      console.log(`${indent}📂 ${key}`);
      walk(val, depth + 1);
    } else {
      const str = String(val);
      const hex = rgbToHex(str);
      if (hex) {
        console.log(`${indent}🎨 ${key.padEnd(40)} ${str.padEnd(15)} ${hex}`);
      } else {
        console.log(`${indent}📄 ${key.padEnd(40)} ${str}`);
      }
    }
  }
}

console.log('\n══════════════════════════════════════════════');
console.log(' WHAT\'S INSIDE YOUR .xrnc FILE');
console.log('══════════════════════════════════════════════\n');

walk(parsed);
