import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, '..', 'db', 'themes.db');

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS themes (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    filename        TEXT NOT NULL,
    original_name   TEXT NOT NULL,
    author          TEXT DEFAULT 'Anonymous',
    description     TEXT DEFAULT '',
    screenshots     TEXT DEFAULT '[]',
    palette_svg     TEXT,
    slug          TEXT DEFAULT '',
    preview_slug    TEXT DEFAULT '',
    preview_views   TEXT DEFAULT '[]',
    total_colors    INTEGER DEFAULT 0,
    unique_colors   INTEGER DEFAULT 0,
    avg_lightness   INTEGER DEFAULT 0,
    avg_saturation  INTEGER DEFAULT 0,
    contrast_range  INTEGER DEFAULT 0,
    chromatic_count INTEGER DEFAULT 0,
    top_colors      TEXT,
    likes           INTEGER DEFAULT 0,
    downloads       INTEGER DEFAULT 0,
    uploaded_at     DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tags (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
  );

  CREATE TABLE IF NOT EXISTS theme_tags (
    theme_id INTEGER NOT NULL,
    tag_id   INTEGER NOT NULL,
    PRIMARY KEY (theme_id, tag_id),
    FOREIGN KEY (theme_id) REFERENCES themes(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id)   REFERENCES tags(id)   ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS comments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    theme_id   INTEGER NOT NULL,
    author     TEXT DEFAULT 'Anonymous',
    message    TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (theme_id) REFERENCES themes(id) ON DELETE CASCADE
  );
`);

// Safe migrations
try { db.exec(`ALTER TABLE themes ADD COLUMN likes INTEGER DEFAULT 0`); } catch(e) {}
try { db.exec(`ALTER TABLE themes ADD COLUMN downloads INTEGER DEFAULT 0`); } catch(e) {}
try { db.exec(`ALTER TABLE themes ADD COLUMN description TEXT DEFAULT ''`); } catch(e) {}
try { db.exec(`ALTER TABLE themes ADD COLUMN screenshots TEXT DEFAULT '[]'`); } catch(e) {}
try { db.exec(`ALTER TABLE themes ADD COLUMN preview_slug TEXT DEFAULT ''`); } catch(e) {}
try { db.exec(`ALTER TABLE themes ADD COLUMN preview_views TEXT DEFAULT '[]'`); } catch(e) {}
try { db.exec(`ALTER TABLE themes ADD COLUMN slug TEXT DEFAULT ''`); } catch(e) {}

// ── Prepared statements ──────────────────────

const insertTheme = db.prepare(`
  INSERT INTO themes (
    name, slug, filename, original_name, author, description, screenshots, palette_svg,
    preview_slug, preview_views,
    total_colors, unique_colors, avg_lightness, avg_saturation,
    contrast_range, chromatic_count, top_colors
  ) VALUES (
    @name, @slug, @filename, @originalName, @author, @description, @screenshots, @paletteSVG,
    @previewSlug, @previewViews,
    @totalColors, @uniqueColors, @avgLightness, @avgSaturation,
    @contrastRange, @chromaticCount, @topColors
  )
`);

const insertTag = db.prepare(`INSERT OR IGNORE INTO tags (name) VALUES (?)`);
const getTagId = db.prepare(`SELECT id FROM tags WHERE name = ?`);
const linkThemeTag = db.prepare(`INSERT OR IGNORE INTO theme_tags (theme_id, tag_id) VALUES (?, ?)`);

const getAllTags = db.prepare(`
  SELECT t.name, COUNT(tt.theme_id) as count
  FROM tags t LEFT JOIN theme_tags tt ON t.id = tt.tag_id
  GROUP BY t.id ORDER BY count DESC
`);

const getThemeById = db.prepare(`SELECT * FROM themes WHERE id = ?`);
const getThemeBySlugQuery = db.prepare(`SELECT * FROM themes WHERE slug = ?`);

const getTagsForTheme = db.prepare(`
  SELECT t.name FROM tags t
  JOIN theme_tags tt ON t.id = tt.tag_id
  WHERE tt.theme_id = ?
`);

const SORT_QUERIES = {
  newest:    `SELECT * FROM themes ORDER BY uploaded_at DESC`,
  oldest:    `SELECT * FROM themes ORDER BY uploaded_at ASC`,
  popular:   `SELECT * FROM themes ORDER BY likes DESC, uploaded_at DESC`,
  downloads: `SELECT * FROM themes ORDER BY downloads DESC, uploaded_at DESC`,
};

const SORT_BY_TAG = {
  newest:    `SELECT th.* FROM themes th JOIN theme_tags tt ON th.id = tt.theme_id JOIN tags t ON tt.tag_id = t.id WHERE t.name = ? ORDER BY th.uploaded_at DESC`,
  oldest:    `SELECT th.* FROM themes th JOIN theme_tags tt ON th.id = tt.theme_id JOIN tags t ON tt.tag_id = t.id WHERE t.name = ? ORDER BY th.uploaded_at ASC`,
  popular:   `SELECT th.* FROM themes th JOIN theme_tags tt ON th.id = tt.theme_id JOIN tags t ON tt.tag_id = t.id WHERE t.name = ? ORDER BY th.likes DESC, th.uploaded_at DESC`,
  downloads: `SELECT th.* FROM themes th JOIN theme_tags tt ON th.id = tt.theme_id JOIN tags t ON tt.tag_id = t.id WHERE t.name = ? ORDER BY th.downloads DESC, th.uploaded_at DESC`,
};

const incrementLikes = db.prepare(`UPDATE themes SET likes = likes + 1 WHERE id = ?`);
const decrementLikes = db.prepare(`UPDATE themes SET likes = MAX(0, likes - 1) WHERE id = ?`);
const incrementDownloads = db.prepare(`UPDATE themes SET downloads = downloads + 1 WHERE id = ?`);
const bumpStatsStmt = db.prepare(`UPDATE themes SET likes = likes + ?, downloads = downloads + ? WHERE id = ?`);
const getPopular = db.prepare(`SELECT * FROM themes ORDER BY (likes * 2 + downloads) DESC, uploaded_at DESC LIMIT ?`);
const countAll = db.prepare(`SELECT COUNT(*) as n FROM themes`);
const countByTag = db.prepare(`SELECT COUNT(*) as n FROM themes th JOIN theme_tags tt ON th.id = tt.theme_id JOIN tags t ON tt.tag_id = t.id WHERE t.name = ?`);

const insertComment = db.prepare(`INSERT INTO comments (theme_id, author, message) VALUES (?, ?, ?)`);
const getComments = db.prepare(`SELECT * FROM comments WHERE theme_id = ? ORDER BY created_at DESC`);
const countComments = db.prepare(`SELECT COUNT(*) as count FROM comments WHERE theme_id = ?`);
const getFeatured = db.prepare(`SELECT * FROM themes WHERE likes > 0 ORDER BY likes DESC LIMIT 4`);

// ── Helpers ──────────────────────────────────

function attachMeta(theme) {
  return {
    ...theme,
    slug: theme.slug || '',
    tags: getTagsForTheme.all(theme.id).map(t => t.name),
    topColors: JSON.parse(theme.top_colors || '[]'),
    screenshots: JSON.parse(theme.screenshots || '[]'),
    previewViews: JSON.parse(theme.preview_views || '[]'),
    previewSlug: theme.preview_slug || '',
    commentCount: countComments.get(theme.id).count
  };
}

// ── Public API ───────────────────────────────

export function saveTheme({ name, filename, originalName, author, description, screenshots, paletteSVG, previewSlug, previewViews, stats, tags, topColors }) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const result = insertTheme.run({
    name, slug, filename, originalName, author,
    description: description || '',
    screenshots: JSON.stringify(screenshots || []),
    paletteSVG,
    previewSlug: previewSlug || '',
    previewViews: JSON.stringify(previewViews || []),
    totalColors: stats.totalUnique,
    uniqueColors: stats.totalUnique,
    avgLightness: stats.avgLightness,
    avgSaturation: stats.avgSaturation,
    contrastRange: stats.contrastRange,
    chromaticCount: stats.chromaticCount,
    topColors: JSON.stringify(topColors)
  });

  const themeId = result.lastInsertRowid;
  for (const tagName of tags) {
    insertTag.run(tagName);
    const tag = getTagId.get(tagName);
    linkThemeTag.run(themeId, tag.id);
  }
  return themeId;
}

export function listThemes(filterTag = null, sort = 'newest') {
  const safeSort = SORT_QUERIES[sort] ? sort : 'newest';
  const themes = filterTag
    ? db.prepare(SORT_BY_TAG[safeSort]).all(filterTag)
    : db.prepare(SORT_QUERIES[safeSort]).all();
  return themes.map(attachMeta);
}

export function listThemesPage(filterTag, sort, offset, limit) {
  const safeSort = SORT_QUERIES[sort] ? sort : 'newest';
  const sql = (filterTag ? SORT_BY_TAG[safeSort] : SORT_QUERIES[safeSort]) + ` LIMIT ? OFFSET ?`;
  const rows = filterTag
    ? db.prepare(sql).all(filterTag, limit, offset)
    : db.prepare(sql).all(limit, offset);
  return rows.map(attachMeta);
}

export function countThemes(filterTag = null) {
  return filterTag ? countByTag.get(filterTag).n : countAll.get().n;
}

export function getPopularThemes(limit = 12) {
  return getPopular.all(limit).map(attachMeta);
}

export function bumpStats(id, likes, downloads) {
  bumpStatsStmt.run(likes, downloads, id);
}

export function getTheme(id) {
  const theme = getThemeById.get(id);
  if (!theme) return null;
  return attachMeta(theme);
}

export function getThemeBySlug(slug) {
  const theme = getThemeBySlugQuery.get(slug);
  if (!theme) return null;
  return attachMeta(theme);
}

export function listTags()           { return getAllTags.all(); }
export function likeTheme(id)        { incrementLikes.run(id);   return getThemeById.get(id)?.likes || 0; }
export function unlikeTheme(id)      { decrementLikes.run(id);   return getThemeById.get(id)?.likes || 0; }
export function trackDownload(id)    { incrementDownloads.run(id); }
export function addComment(tid, a, m){ insertComment.run(tid, a || 'Anonymous', m); }
export function getThemeComments(id) { return getComments.all(id); }
export function getFeaturedThemes()  { return getFeatured.all().map(attachMeta); }

export default db;
