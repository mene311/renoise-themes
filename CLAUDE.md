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
node db/migrations/001-create-users.js # Add users table and columns (safe to run multiple times)
```

User authentication implemented — express-session + bcrypt, register/login/logout routes, requireAuth middleware.

## Architecture

This is a Node.js/Express web app for browsing and previewing Renoise color themes (`.xrnc` files). The core innovation is a pixel-accurate theme preview system that recolors reference screenshots using binary pixel maps — no Renoise installation needed.

### Upload Processing Pipeline

When a `.xrnc` file is uploaded (`app.js` → Multer), it flows through:

1. **`lib/parser.js`** — Parses XML (element names → RGB values), matches elements against `ROLE_RULES` regex patterns, assigns semantic roles (`background/text/ui/accent`) with weights. `Main_Back` gets weight 10 (dominates ~47% of pixels). Also exports `elementColorMap` (`{elementName: [r,g,b]}`) for the preview renderer — this is the single source of truth for color parsing, preventing XML parsing divergence.

2. **`lib/categorize.js`** — Converts colors to HSL, runs weighted analysis to auto-tag themes (dark/light/medium, neon/pastel/monochrome, warm/cool/mixed, color families).

3. **`lib/palette.js`** — Generates an SVG palette strip by tiering colors into MAIN/SECONDARY/UI/ACCENTS bands based on accumulated weight.

4. **`lib/preview-renderer.js`** — Renders 3 PNG previews (Pattern Editor, Mixer, Waveform) using a 3-pass pixel painting algorithm:
   - **Pass 1**: Paint pixels mapped to known Renoise elements using the theme's colors. Uses pre-flattened `colorByIndex[]` array for O(1) lookups.
   - **Pass 2**: Fill UNMATCHED pixels (index 255) by averaging 8-connected neighbor colors. Reads from the immutable pixel map (not the output buffer) to prevent propagation artifacts.
   - **Pass 3**: Composite text/icon pixels using cached B/W text-theme screenshots as anti-aliasing guides. Uses Rec.601 perceptual luminance (`0.299R + 0.587G + 0.114B`) for accurate alpha. Skips text compositing on known non-text UI elements (scrollbars, sliders, meters, etc.).
   - Text-theme PNGs are cached at startup in `initRenderers()`, not reloaded per upload.
   - Partial failure is handled per-view — if one view fails, the others are still saved.

5. **`lib/database.js`** — Stores theme metadata, SVG palette, preview paths, preview errors, and tags in SQLite (WAL mode). All queries are pre-prepared statements. `attachMetaBulk` batches tag and comment-count queries into single SQL calls (eliminates N+1).

### Security

- **CSRF protection**: HMAC-based double-submit cookie pattern with 1-hour token rotation, timing-safe comparison, applied to all POST routes (upload/comment/login/register)
- **Session hardening**: `secure: true` (production), `sameSite: 'lax'`, `httpOnly: true`
- **Rate limiting**: Auth routes (5/15min), download endpoint (30/min)
- **Path traversal**: `path.basename()` on all user-supplied filenames
- **Password policy**: Minimum 8 characters, bcrypt 12 rounds
- **SESSION_SECRET**: Validated at startup (before any imports or middleware)

### Pixel Map System (`maps/`)

The `.bin` files are flat `uint8` arrays (one value per pixel). Each value is an index into the companion `.json` array of element names. Value 255 = UNMATCHED (text, icons, thin borders). These maps were built by the "rainbow theme trick" in `tools/build-maps.js`: generate 4 rainbow variant themes (A/B/C/D) where each Renoise element gets a unique, distinct color — screenshot the UI — then identify which element owns each pixel via majority voting across the 4 variants.

The text-masking theme (`text-theme.xrnc`, `tools/generate-text-theme.js`) renders everything black/white to distinguish UI chrome from text/icon pixels. These are cached at startup in `initRenderers()`.

The `maps/*.svg` files are vector outlines of the element regions — ready for an SVG-based preview renderer.

### Frontend

- **Templates**: EJS, PicoCSS framework, vanilla JS
- **Lazy-loading**: Preview tab images load on first click (data-src pattern) — saves ~66% bandwidth on detail page
- **Preview error states**: `preview-warning` (partial) and `preview-unavailable` (total failure) shown on detail page
- **Upload progress**: 3-step staged indicator with staggered animation (Parsing → Analyzing → Rendering)
- **CSRF tokens**: Hidden `_csrf` fields in all forms; AJAX API requests use `X-Requested-With` header exemption
- **Marquee cache**: Popular themes cached in memory (5-min TTL), invalidated on upload/like/download events

### Key Design Constraint

The weight system in `parser.js` is load-bearing for correctness. `Main_Back` (background) typically covers ~47% of screen area — if it's not weighted highest, tags and palette ordering become misleading. Before changing any weight values, read `Renoise Theme Design Principles` for the full element hierarchy.

### Environment

Required in `.env` (see `.env.example`):
```
SESSION_SECRET=<at-least-32-char-random-string>
NODE_ENV=development|production
PORT=3000
```
