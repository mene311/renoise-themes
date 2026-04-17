# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev   # Start server on http://localhost:3000 with --watch auto-reload
npm test      # No tests configured yet
```

The app uses ES modules (`"type": "module"` in package.json) — all files use `import`/`export`.

## Architecture

A server-rendered Express.js web app for uploading, browsing, and previewing Renoise color themes (`.xrnc` files).

**Request flow:**
- `app.js` — all routes, Multer upload config, top-level orchestration
- `lib/` — pure processing pipeline called during upload:
  1. `parser.js` — parses `.xrnc` XML, extracts colors, assigns semantic roles (background/text/ui/accent) and weights via pattern-matching on element names
  2. `categorize.js` — converts colors to HSL, runs weighted analysis to auto-generate tags (dark/light, neon/pastel, warm/cool, color families)
  3. `palette.js` — generates an SVG color palette from weighted color tiers
  4. `preview-renderer.js` — renders PNG previews by loading reference screenshots + binary pixel maps (`/maps/*.bin`) that link each pixel to a UI element name, then recoloring mapped pixels
  5. `database.js` — saves everything to SQLite (`/db/themes.db`)

**Templates:** EJS files in `/templates/` with partials in `/templates/partials/`. Server-side rendered only.

**Client JS:** Single file `public/js/main.js` — vanilla JS handling search filtering, likes (localStorage), clipboard copy, gallery/lightbox, upload UX, and preview tab switching.

## Key Data Structures

`parseThemeFile()` returns `colors[]` where each entry has `{ hex, role, weight, name }`. Higher weight = more visually prominent. Roles: `background`, `text`, `ui`, `accent`.

`categorizeColors()` returns `{ tags: string[], stats: { avgLightness, avgSaturation, contrastRange, ... } }`.

The `themes` table stores `screenshots` and `preview_views` as JSON strings (array of relative paths).

## Preview Generation

Preview rendering depends on three binary/JSON map files per view (`pattern`, `mixer`, `waveform`) in `/maps/`. Each `.bin` file is a flat array of uint32 indices; the matching `.json` maps those indices to Renoise element names. Reference screenshots are in `/public/previews/Default/`.

## File Storage

Uploaded files go under `/public/uploads/` in subdirectories: `themes/`, `screenshots/`, `palettes/`, `previews/{slug}/`. These directories are git-ignored (only `.gitkeep` files are tracked).

## Database

`better-sqlite3` with WAL mode. All queries use prepared statements defined at module load time in `database.js`. The DB file is created automatically at `/db/themes.db` on first run.
