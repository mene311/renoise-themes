/**
 * Seed 8 synthetic themes for render engine testing.
 * Generates .xrnc files and runs them through the full pipeline.
 *
 * Usage:  node tools/seed-themes.js
 */

import fs from 'fs';
import path from 'path';
import { parseThemeFile } from '../lib/parser.js';
import { categorizeColors } from '../lib/categorize.js';
import { generatePaletteSVG } from '../lib/palette.js';
import { generatePreviews } from '../lib/preview-renderer.js';
import { saveTheme } from '../lib/database.js';

// ── Color helpers ─────────────────────────────────────────────────────────────

function rgb(r, g, b) { return [r, g, b]; }

function lighten([r, g, b], amt) {
  return [Math.min(255, r + amt), Math.min(255, g + amt), Math.min(255, b + amt)];
}
function darken([r, g, b], amt) {
  return [Math.max(0, r - amt), Math.max(0, g - amt), Math.max(0, b - amt)];
}
function mix([r1, g1, b1], [r2, g2, b2], t = 0.5) {
  return [(r1 + (r2 - r1) * t) | 0, (g1 + (g2 - g1) * t) | 0, (b1 + (b2 - b1) * t) | 0];
}

// ── Theme palette definitions ─────────────────────────────────────────────────

const THEMES = [
  {
    name: 'Deep Ocean',
    author: 'Seed',
    description: 'Dark navy blues with cyan highlights — calm, deep-water aesthetic.',
    bg:      rgb(8, 18, 34),
    altBg:   rgb(12, 28, 52),
    bodyBg:  rgb(16, 36, 64),
    btnBg:   rgb(22, 50, 88),
    fg:      rgb(180, 220, 255),
    accent:  rgb(0, 180, 220),
    accent2: rgb(0, 140, 200),
    dim:     rgb(80, 120, 160),
    sel:     rgb(0, 90, 150),
    vu:      { low: rgb(0, 200, 150), mid: rgb(0, 180, 220), high: rgb(255, 100, 50), peak: rgb(255, 30, 30) },
    pattern: { back: rgb(6, 14, 28), hi: rgb(10, 22, 44), play: rgb(0, 120, 180), bar: rgb(0, 90, 140) },
    colors:  ['#1a3a6e', '#0e2a5a', '#1a5080', '#0e3060', '#0a2040', '#153060', '#1e4070', '#163560', '#0c2848', '#1a3a6e', '#1a4070', '#143060', '#0e2850', '#1a3060', '#203a70', '#163868'],
  },
  {
    name: 'Synthwave',
    author: 'Seed',
    description: 'Dark void with neon magenta and electric purple — retro-futurist vibes.',
    bg:      rgb(13, 2, 33),
    altBg:   rgb(20, 5, 50),
    bodyBg:  rgb(25, 8, 60),
    btnBg:   rgb(40, 10, 80),
    fg:      rgb(255, 200, 255),
    accent:  rgb(247, 37, 133),
    accent2: rgb(114, 9, 183),
    dim:     rgb(120, 60, 160),
    sel:     rgb(90, 0, 160),
    vu:      { low: rgb(76, 201, 240), mid: rgb(247, 37, 133), high: rgb(255, 0, 100), peak: rgb(255, 50, 50) },
    pattern: { back: rgb(10, 2, 26), hi: rgb(20, 5, 46), play: rgb(180, 0, 120), bar: rgb(130, 0, 90) },
    colors:  ['#4a0070', '#3d0060', '#550080', '#400068', '#380060', '#440070', '#4e0078', '#420065', '#3a0062', '#4a0070', '#4e0072', '#400065', '#3a0060', '#480070', '#520076', '#460068'],
  },
  {
    name: 'Forest Night',
    author: 'Seed',
    description: 'Deep forest darkness with bioluminescent greens.',
    bg:      rgb(5, 16, 8),
    altBg:   rgb(8, 24, 12),
    bodyBg:  rgb(10, 32, 16),
    btnBg:   rgb(14, 44, 20),
    fg:      rgb(180, 255, 190),
    accent:  rgb(50, 205, 80),
    accent2: rgb(30, 160, 60),
    dim:     rgb(60, 120, 70),
    sel:     rgb(20, 100, 40),
    vu:      { low: rgb(50, 220, 80), mid: rgb(180, 230, 50), high: rgb(255, 160, 0), peak: rgb(255, 40, 40) },
    pattern: { back: rgb(4, 12, 6), hi: rgb(8, 20, 10), play: rgb(30, 130, 50), bar: rgb(20, 100, 40) },
    colors:  ['#0a3010', '#083008', '#0c3812', '#0a320e', '#083008', '#0c300e', '#0e3410', '#0a2e0e', '#08280a', '#0a3010', '#0e3412', '#0a2e0a', '#08280c', '#0a2e0e', '#0e3210', '#0c300e'],
  },
  {
    name: 'Ember',
    author: 'Seed',
    description: 'Smoldering dark browns with volcanic orange and red accents.',
    bg:      rgb(20, 8, 2),
    altBg:   rgb(32, 12, 4),
    bodyBg:  rgb(40, 16, 6),
    btnBg:   rgb(55, 22, 8),
    fg:      rgb(255, 210, 170),
    accent:  rgb(255, 100, 10),
    accent2: rgb(200, 60, 0),
    dim:     rgb(140, 70, 30),
    sel:     rgb(140, 40, 0),
    vu:      { low: rgb(50, 220, 80), mid: rgb(255, 200, 0), high: rgb(255, 100, 0), peak: rgb(255, 30, 30) },
    pattern: { back: rgb(16, 6, 2), hi: rgb(28, 10, 4), play: rgb(180, 60, 0), bar: rgb(140, 40, 0) },
    colors:  ['#501a04', '#461804', '#5a1c06', '#4c1a04', '#401604', '#4e1804', '#541c06', '#4a1804', '#401402', '#501a04', '#541e06', '#4a1604', '#401404', '#4c1804', '#561c06', '#4e1806'],
  },
  {
    name: 'Arctic',
    author: 'Seed',
    description: 'Clean icy whites and steel blues — a rare bright Renoise theme.',
    bg:      rgb(230, 240, 250),
    altBg:   rgb(215, 228, 242),
    bodyBg:  rgb(200, 218, 238),
    btnBg:   rgb(185, 205, 228),
    fg:      rgb(20, 40, 70),
    accent:  rgb(0, 100, 180),
    accent2: rgb(0, 70, 140),
    dim:     rgb(100, 140, 180),
    sel:     rgb(0, 120, 200),
    vu:      { low: rgb(0, 190, 100), mid: rgb(0, 160, 220), high: rgb(255, 140, 0), peak: rgb(220, 20, 20) },
    pattern: { back: rgb(220, 232, 246), hi: rgb(205, 220, 240), play: rgb(0, 100, 180), bar: rgb(0, 80, 160) },
    colors:  ['#3060a0', '#2a5890', '#3468a8', '#2c5c98', '#285490', '#306298', '#3466a6', '#2c5e9a', '#285294', '#3060a0', '#3464a4', '#2c5c96', '#285090', '#2e5e9a', '#3264a4', '#2e6098'],
  },
  {
    name: 'Void Matrix',
    author: 'Seed',
    description: 'Pure black with phosphor green — terminal hacker aesthetic.',
    bg:      rgb(0, 4, 0),
    altBg:   rgb(0, 8, 0),
    bodyBg:  rgb(0, 12, 0),
    btnBg:   rgb(0, 18, 0),
    fg:      rgb(0, 255, 70),
    accent:  rgb(0, 220, 50),
    accent2: rgb(0, 160, 30),
    dim:     rgb(0, 100, 20),
    sel:     rgb(0, 80, 15),
    vu:      { low: rgb(0, 240, 60), mid: rgb(180, 255, 0), high: rgb(255, 160, 0), peak: rgb(255, 20, 20) },
    pattern: { back: rgb(0, 2, 0), hi: rgb(0, 6, 0), play: rgb(0, 140, 30), bar: rgb(0, 100, 20) },
    colors:  ['#003000', '#002800', '#003800', '#003200', '#002c00', '#003400', '#003600', '#003000', '#002a00', '#003000', '#003600', '#002e00', '#002800', '#003200', '#003800', '#003200'],
  },
  {
    name: 'Sakura Dusk',
    author: 'Seed',
    description: 'Dark rose twilight with cherry blossom pinks and soft magentas.',
    bg:      rgb(22, 6, 16),
    altBg:   rgb(34, 10, 26),
    bodyBg:  rgb(44, 14, 34),
    btnBg:   rgb(58, 18, 46),
    fg:      rgb(255, 210, 235),
    accent:  rgb(255, 105, 180),
    accent2: rgb(200, 60, 130),
    dim:     rgb(150, 70, 110),
    sel:     rgb(140, 30, 90),
    vu:      { low: rgb(255, 120, 180), mid: rgb(255, 180, 100), high: rgb(255, 80, 80), peak: rgb(255, 20, 50) },
    pattern: { back: rgb(18, 4, 14), hi: rgb(30, 8, 24), play: rgb(180, 60, 120), bar: rgb(140, 40, 90) },
    colors:  ['#5a1040', '#501038', '#621248', '#56103e', '#4c0e38', '#561040', '#5e1046', '#521040', '#4c0e38', '#5a1040', '#5e1044', '#541040', '#4e0e38', '#581040', '#601248', '#561040'],
  },
  {
    name: 'Amber Terminal',
    author: 'Seed',
    description: 'Warm amber-on-black reminiscent of vintage phosphor monitors.',
    bg:      rgb(10, 6, 0),
    altBg:   rgb(18, 10, 0),
    bodyBg:  rgb(24, 14, 0),
    btnBg:   rgb(34, 20, 0),
    fg:      rgb(255, 180, 0),
    accent:  rgb(255, 140, 0),
    accent2: rgb(200, 100, 0),
    dim:     rgb(140, 80, 0),
    sel:     rgb(100, 55, 0),
    vu:      { low: rgb(50, 220, 80), mid: rgb(255, 200, 0), high: rgb(255, 100, 0), peak: rgb(255, 30, 20) },
    pattern: { back: rgb(8, 4, 0), hi: rgb(16, 8, 0), play: rgb(180, 100, 0), bar: rgb(140, 70, 0) },
    colors:  ['#5a3000', '#502800', '#623400', '#562e00', '#4c2800', '#542e00', '#5e3200', '#543000', '#4c2800', '#5a3000', '#5e3200', '#542e00', '#4e2800', '#582e00', '#603200', '#563000'],
  },
];

// ── XRNC generator ────────────────────────────────────────────────────────────

function c([r, g, b]) { return `${r},${g},${b}`; }

function buildXrnc(t) {
  const fg2    = mix(t.fg, t.accent, 0.3);
  const fg3    = mix(t.fg, t.dim, 0.4);
  const btnFg  = t.fg;
  const altBg2 = mix(t.altBg, t.btnBg, 0.5);
  const selFg  = lighten(t.fg, 20);

  return `<?xml version="1.0" encoding="UTF-8"?>
<SkinColors doc_version="12">
  <Main_Back>${c(t.bg)}</Main_Back>
  <Main_Font>${c(t.fg)}</Main_Font>
  <Alternate_Main_Back>${c(t.altBg)}</Alternate_Main_Back>
  <Alternate_Main_Font>${c(mix(t.fg, t.dim, 0.2))}</Alternate_Main_Font>
  <Body_Back>${c(t.bodyBg)}</Body_Back>
  <Body_Font>${c(t.fg)}</Body_Font>
  <Strong_Body_Font>${c(t.accent)}</Strong_Body_Font>
  <Button_Back>${c(t.btnBg)}</Button_Back>
  <Button_Font>${c(btnFg)}</Button_Font>
  <Button_Highlight_Font>${c(t.accent)}</Button_Highlight_Font>
  <Selected_Button_Back>${c(t.accent2)}</Selected_Button_Back>
  <Selected_Button_Font>${c(t.fg)}</Selected_Button_Font>
  <Selection_Back>${c(t.sel)}</Selection_Back>
  <Selection_Font>${c(t.fg)}</Selection_Font>
  <StandBy_Selection_Back>${c(mix(t.sel, t.bg, 0.5))}</StandBy_Selection_Back>
  <StandBy_Selection_Font>${c(fg3)}</StandBy_Selection_Font>
  <Midi_Mapping_Back>${c(mix(t.accent2, t.bg, 0.3))}</Midi_Mapping_Back>
  <Midi_Mapping_Font>${c(t.fg)}</Midi_Mapping_Font>
  <ToolTip_Back>${c(t.btnBg)}</ToolTip_Back>
  <ToolTip_Font>${c(t.fg)}</ToolTip_Font>
  <ValueBox_Back>${c(altBg2)}</ValueBox_Back>
  <ValueBox_Font>${c(t.accent)}</ValueBox_Font>
  <ValueBox_Font_Icons>${c(t.fg)}</ValueBox_Font_Icons>
  <Scrollbar>${c(mix(t.accent, t.dim, 0.4))}</Scrollbar>
  <Slider>${c(t.accent)}</Slider>
  <Folder>${c(mix(t.accent, t.fg, 0.3))}</Folder>
  <Pattern_Default_Back>${c(t.pattern.back)}</Pattern_Default_Back>
  <Pattern_Default_Font>${c(t.fg)}</Pattern_Default_Font>
  <Pattern_Default_Font_Volume>${c(mix(t.accent, rgb(100,200,100), 0.5))}</Pattern_Default_Font_Volume>
  <Pattern_Default_Font_Panning>${c(mix(t.accent, rgb(100,150,255), 0.5))}</Pattern_Default_Font_Panning>
  <Pattern_Default_Font_Pitch>${c(mix(t.accent, rgb(255,220,80), 0.5))}</Pattern_Default_Font_Pitch>
  <Pattern_Default_Font_Delay>${c(mix(t.accent, rgb(200,100,255), 0.5))}</Pattern_Default_Font_Delay>
  <Pattern_Default_Font_Global>${c(t.accent)}</Pattern_Default_Font_Global>
  <Pattern_Default_Font_Other>${c(fg2)}</Pattern_Default_Font_Other>
  <Pattern_Default_Font_DspFx>${c(mix(t.accent, rgb(255,160,60), 0.5))}</Pattern_Default_Font_DspFx>
  <Pattern_Default_Font_Unused>${c(t.dim)}</Pattern_Default_Font_Unused>
  <Pattern_Highlighted_Back>${c(t.pattern.hi)}</Pattern_Highlighted_Back>
  <Pattern_Highlighted_Font>${c(lighten(t.fg, 30))}</Pattern_Highlighted_Font>
  <Pattern_Highlighted_Font_Volume>${c(mix(t.accent, rgb(150,255,150), 0.4))}</Pattern_Highlighted_Font_Volume>
  <Pattern_Highlighted_Font_Panning>${c(mix(t.accent, rgb(150,190,255), 0.4))}</Pattern_Highlighted_Font_Panning>
  <Pattern_Highlighted_Font_Pitch>${c(mix(t.accent, rgb(255,240,120), 0.4))}</Pattern_Highlighted_Font_Pitch>
  <Pattern_Highlighted_Font_Delay>${c(mix(t.accent, rgb(220,140,255), 0.4))}</Pattern_Highlighted_Font_Delay>
  <Pattern_Highlighted_Font_Global>${c(lighten(t.accent, 30))}</Pattern_Highlighted_Font_Global>
  <Pattern_Highlighted_Font_Other>${c(lighten(fg2, 20))}</Pattern_Highlighted_Font_Other>
  <Pattern_Highlighted_Font_DspFx>${c(mix(t.accent, rgb(255,200,100), 0.4))}</Pattern_Highlighted_Font_DspFx>
  <Pattern_Highlighted_Font_Unused>${c(lighten(t.dim, 20))}</Pattern_Highlighted_Font_Unused>
  <Pattern_PlayPosition_Back>${c(t.pattern.play)}</Pattern_PlayPosition_Back>
  <Pattern_PlayPosition_Font>${c(t.fg)}</Pattern_PlayPosition_Font>
  <Pattern_CenterBar_Back>${c(t.pattern.bar)}</Pattern_CenterBar_Back>
  <Pattern_CenterBar_Font>${c(t.fg)}</Pattern_CenterBar_Font>
  <Pattern_CenterBar_Back_StandBy>${c(mix(t.pattern.bar, t.pattern.back, 0.5))}</Pattern_CenterBar_Back_StandBy>
  <Pattern_CenterBar_Font_StandBy>${c(fg3)}</Pattern_CenterBar_Font_StandBy>
  <Pattern_Selection>${c(t.sel)}</Pattern_Selection>
  <Pattern_StandBy_Selection>${c(mix(t.sel, t.bg, 0.6))}</Pattern_StandBy_Selection>
  <Pattern_Mute_State>${c(t.dim)}</Pattern_Mute_State>
  <Automation_Grid>${c(lighten(t.bg, 10))}</Automation_Grid>
  <Automation_Line_Edge>${c(t.accent)}</Automation_Line_Edge>
  <Automation_Line_Fill>${c(mix(t.accent, t.bg, 0.5))}</Automation_Line_Fill>
  <Automation_Point>${c(lighten(t.accent, 30))}</Automation_Point>
  <Automation_Marker_Play>${c(t.accent)}</Automation_Marker_Play>
  <Automation_Marker_Single>${c(t.accent2)}</Automation_Marker_Single>
  <Automation_Marker_Pair>${c(mix(t.accent, t.accent2, 0.5))}</Automation_Marker_Pair>
  <Automation_Marker_Diamond>${c(lighten(t.accent, 20))}</Automation_Marker_Diamond>
  <VuMeter_Meter>${c(t.vu.low)}</VuMeter_Meter>
  <VuMeter_Meter_Low>${c(t.vu.low)}</VuMeter_Meter_Low>
  <VuMeter_Meter_Middle>${c(t.vu.mid)}</VuMeter_Meter_Middle>
  <VuMeter_Meter_High>${c(t.vu.high)}</VuMeter_Meter_High>
  <VuMeter_Peak>${c(t.vu.peak)}</VuMeter_Peak>
  <VuMeter_Back_Normal>${c(darken(t.bg, 2))}</VuMeter_Back_Normal>
  <VuMeter_Back_Clipped>${c(mix(t.vu.peak, t.bg, 0.3))}</VuMeter_Back_Clipped>
${t.colors.map((hex, i) => {
    const n = String(i + 1).padStart(2, '0');
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `  <Default_Color_${n}>${r},${g},${b}</Default_Color_${n}>`;
  }).join('\n')}
  <ButtonBevalAmount>1.07599998</ButtonBevalAmount>
  <BodyBevalAmount>1.0679996</BodyBevalAmount>
  <ContrastAdjustment>0.26000002</ContrastAdjustment>
  <TextureSet>Default</TextureSet>
</SkinColors>`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const THEMES_DIR  = 'public/uploads/themes';
const PALETTES_DIR = 'public/uploads/palettes';
const PREVIEWS_DIR = 'public/uploads/previews';
fs.mkdirSync(THEMES_DIR,   { recursive: true });
fs.mkdirSync(PALETTES_DIR, { recursive: true });
fs.mkdirSync(PREVIEWS_DIR, { recursive: true });

let ok = 0;
for (const theme of THEMES) {
  const slug     = theme.name.toLowerCase().replace(/\s+/g, '-');
  const ts       = Date.now() + ok;  // unique timestamp
  const filename = `${ts}-seed-${slug}.xrnc`;
  const xrncPath = path.join(THEMES_DIR, filename);

  fs.writeFileSync(xrncPath, buildXrnc(theme));

  try {
    const parsed = parseThemeFile(xrncPath);
    const { tags, stats } = categorizeColors(parsed.weighted);

    const paletteName = filename.replace('.xrnc', '.svg');
    const palettePath = path.join(PALETTES_DIR, paletteName);
    generatePaletteSVG(parsed.weighted, palettePath);

    const previewSlug = filename.replace('.xrnc', '');
    const previewDir  = path.join(PREVIEWS_DIR, previewSlug);
    const previews    = await generatePreviews(xrncPath, previewDir);
    const previewViews = Object.keys(previews);

    const topColors = parsed.weighted.slice(0, 6).map(c => ({
      hex: c.hex, weight: c.weight, roles: c.roles
    }));

    const id = saveTheme({
      name: theme.name,
      filename,
      originalName: `${slug}.xrnc`,
      author: theme.author,
      description: theme.description,
      screenshots: [],
      paletteSVG: `/uploads/palettes/${paletteName}`,
      previewSlug,
      previewViews,
      stats,
      tags,
      topColors,
    });

    console.log(`✓ #${id} ${theme.name}  tags: [${tags.join(', ')}]  previews: ${previewViews.join(', ')}`);
    ok++;
  } catch (err) {
    console.error(`✗ ${theme.name}: ${err.message}`);
  }
}

console.log(`\nSeeded ${ok}/${THEMES.length} themes`);
