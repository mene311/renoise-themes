# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start Express server on port 3000 with --watch auto-reload
npm install        # Install dependencies (first run)

# One-off tools (run directly with node):
node tools/build-maps.js              # Rebuild pixel maps from 4 rainbow variant screenshots
node tools/generate-rainbow-variants.js  # Regenerate A/B/C/D test themes
node tools/generate-text-theme.js    # Regenerate B/W text-masking theme
node tools/render-preview.js         # Render preview for a single theme
node tools/generate-all-previews.js  # Batch regenerate previews for all DB themes
node tools/schema-dump.js            # Inspect current SQLite schema
```

No test suite is configured yet.

## Architecture

This is a Node.js/Express web app for browsing and previewing Renoise color themes (`.xrnc` files). The core innovation is a pixel-accurate theme preview system that recolors reference screenshots using binary pixel maps — no Renoise installation needed.

### Upload Processing Pipeline

When a `.xrnc` file is uploaded (`app.js` → Multer), it flows through:

1. **`lib/parser.js`** — Parses XML (element names → RGB values), matches elements against `ROLE_RULES` regex patterns, assigns semantic roles (`background/text/ui/accent`) with weights. `Main_Back` gets weight 10 (dominates ~47% of pixels); weights drive all downstream analysis.

2. **`lib/categorize.js`** — Converts colors to HSL, runs weighted analysis to auto-tag themes (dark/light/medium, neon/pastel/monochrome, warm/cool/mixed, color families). Tags are weighted so a saturated accent doesn't override a monochrome theme's character.

3. **`lib/palette.js`** — Generates an SVG palette strip by tiering colors into MAIN/SECONDARY/UI/ACCENTS bands based on accumulated weight.

4. **`lib/preview-renderer.js`** — Renders 3 PNG previews (Pattern Editor, Mixer, Waveform). For each pixel in the reference screenshot: looks up the element name from the binary map → looks up the theme color for that element → paints it. Unmapped pixels (text, icons) are preserved from the reference screenshot.

5. **`lib/database.js`** — Stores theme metadata, SVG palette, preview paths, and tags in SQLite (WAL mode). Normalized schema: `themes`, `tags`, `theme_tags` (junction), `comments`. All queries are prepared statements initialized at module load.

### Pixel Map System (`maps/`)

The `.bin` files are flat `uint32` arrays (one value per pixel). Each value is an index into the companion `.json` array of element names. These maps were built by the "rainbow theme trick" in `tools/build-maps.js`: generate 4 rainbow variant themes (A/B/C/D) where each Renoise element gets a unique, distinct color — screenshot the UI — then identify which element owns each pixel via majority voting across the 4 variants. The SVG files in `maps/` are vector outlines of the element regions.

The text-masking theme (`text-theme.xrnc`, `tools/generate-text-theme.js`) renders everything black/white to distinguish UI chrome from text/icon pixels, identifying which pixels should never be repainted.

### Stack

- **Backend**: Node.js, Express, Multer (uploads), better-sqlite3, fast-xml-parser
- **Rendering**: `@napi-rs/canvas` for pixel manipulation (PNG read/write, pixel painting)
- **Templates**: EJS (`templates/`)
- **Frontend**: Vanilla JS (`public/js/main.js`) — search, likes (localStorage), lightbox, upload UX
- **CSS**: PicoCSS framework

### Key Design Constraint

The weight system in `parser.js` is load-bearing for correctness. `Main_Back` (background) typically covers ~47% of screen area — if it's not weighted highest, tags and palette ordering become misleading. Before changing any weight values, read `Renoise Theme Design Principles` (in the repo root) for the full element hierarchy and visual impact percentages.
