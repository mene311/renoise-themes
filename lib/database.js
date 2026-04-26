import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';

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
    preview_error   TEXT,
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

  CREATE TABLE IF NOT EXISTS users (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    username         TEXT UNIQUE NOT NULL,
    email            TEXT UNIQUE NOT NULL,
    password_hash    TEXT NOT NULL,
    title            TEXT,
    rank_level       INTEGER DEFAULT 1,
    total_score      INTEGER DEFAULT 0,
    themes_uploaded  INTEGER DEFAULT 0,
    themes_received  INTEGER DEFAULT 0,
    ranks_given      INTEGER DEFAULT 0,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ── Safe migrations ───────────────────────────────────
try { db.exec(`ALTER TABLE themes ADD COLUMN likes INTEGER DEFAULT 0`); } catch(e) {}
try { db.exec(`ALTER TABLE themes ADD COLUMN downloads INTEGER DEFAULT 0`); } catch(e) {}
try { db.exec(`ALTER TABLE themes ADD COLUMN description TEXT DEFAULT ''`); } catch(e) {}
try { db.exec(`ALTER TABLE themes ADD COLUMN screenshots TEXT DEFAULT '[]'`); } catch(e) {}
try { db.exec(`ALTER TABLE themes ADD COLUMN preview_slug TEXT DEFAULT ''`); } catch(e) {}
try { db.exec(`ALTER TABLE themes ADD COLUMN preview_views TEXT DEFAULT '[]'`); } catch(e) {}
try { db.exec(`ALTER TABLE themes ADD COLUMN slug TEXT DEFAULT ''`); } catch(e) {}
try { db.exec(`ALTER TABLE themes ADD COLUMN preview_error TEXT`); } catch(e) {}

// ── Prepared statements ───────────────────────────────

const insertTheme = db.prepare(`
  INSERT INTO themes (
    name, slug, filename, original_name, author, description, screenshots, palette_svg,
    preview_slug, preview_views, preview_error,
    total_colors, unique_colors, avg_lightness, avg_saturation,
    contrast_range, chromatic_count, top_colors
  ) VALUES (
    @name, @slug, @filename, @originalName, @author, @description, @screenshots, @paletteSVG,
    @previewSlug, @previewViews, @previewError,
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

// Pre-prepared sort queries (avoids per-call compilation)
const sortNewest = db.prepare(`SELECT * FROM themes ORDER BY uploaded_at DESC LIMIT ? OFFSET ?`);
const sortOldest = db.prepare(`SELECT * FROM themes ORDER BY uploaded_at ASC LIMIT ? OFFSET ?`);
const sortPopular = db.prepare(`SELECT * FROM themes ORDER BY likes DESC, uploaded_at DESC LIMIT ? OFFSET ?`);
const sortDownloads = db.prepare(`SELECT * FROM themes ORDER BY downloads DESC, uploaded_at DESC LIMIT ? OFFSET ?`);

const sortNewestAll = db.prepare(`SELECT * FROM themes ORDER BY uploaded_at DESC`);
const sortOldestAll = db.prepare(`SELECT * FROM themes ORDER BY uploaded_at ASC`);
const sortPopularAll = db.prepare(`SELECT * FROM themes ORDER BY likes DESC, uploaded_at DESC`);
const sortDownloadsAll = db.prepare(`SELECT * FROM themes ORDER BY downloads DESC, uploaded_at DESC`);

const sortNewestByTag = db.prepare(`SELECT th.* FROM themes th JOIN theme_tags tt ON th.id = tt.theme_id JOIN tags t ON tt.tag_id = t.id WHERE t.name = ? ORDER BY th.uploaded_at DESC LIMIT ? OFFSET ?`);
const sortOldestByTag = db.prepare(`SELECT th.* FROM themes th JOIN theme_tags tt ON th.id = tt.theme_id JOIN tags t ON tt.tag_id = t.id WHERE t.name = ? ORDER BY th.uploaded_at ASC LIMIT ? OFFSET ?`);
const sortPopularByTag = db.prepare(`SELECT th.* FROM themes th JOIN theme_tags tt ON th.id = tt.theme_id JOIN tags t ON tt.tag_id = t.id WHERE t.name = ? ORDER BY th.likes DESC, th.uploaded_at DESC LIMIT ? OFFSET ?`);
const sortDownloadsByTag = db.prepare(`SELECT th.* FROM themes th JOIN theme_tags tt ON th.id = tt.theme_id JOIN tags t ON tt.tag_id = t.id WHERE t.name = ? ORDER BY th.downloads DESC, th.uploaded_at DESC LIMIT ? OFFSET ?`);

const sortNewestByTagAll = db.prepare(`SELECT th.* FROM themes th JOIN theme_tags tt ON th.id = tt.theme_id JOIN tags t ON tt.tag_id = t.id WHERE t.name = ? ORDER BY th.uploaded_at DESC`);
const sortOldestByTagAll = db.prepare(`SELECT th.* FROM themes th JOIN theme_tags tt ON th.id = tt.theme_id JOIN tags t ON tt.tag_id = t.id WHERE t.name = ? ORDER BY th.uploaded_at ASC`);
const sortPopularByTagAll = db.prepare(`SELECT th.* FROM themes th JOIN theme_tags tt ON th.id = tt.theme_id JOIN tags t ON tt.tag_id = t.id WHERE t.name = ? ORDER BY th.likes DESC, th.uploaded_at DESC`);
const sortDownloadsByTagAll = db.prepare(`SELECT th.* FROM themes th JOIN theme_tags tt ON th.id = tt.theme_id JOIN tags t ON tt.tag_id = t.id WHERE t.name = ? ORDER BY th.downloads DESC, th.uploaded_at DESC`);

const incrementLikes = db.prepare(`UPDATE themes SET likes = likes + 1 WHERE id = ?`);
const decrementLikes = db.prepare(`UPDATE themes SET likes = MAX(0, likes - 1) WHERE id = ?`);
const incrementDownloads = db.prepare(`UPDATE themes SET downloads = downloads + 1 WHERE id = ?`);
const bumpStatsStmt = db.prepare(`UPDATE themes SET likes = likes + ?, downloads = downloads + ? WHERE id = ?`);
const getPopular = db.prepare(`SELECT * FROM themes ORDER BY (likes * 2 + downloads) DESC, uploaded_at DESC LIMIT ?`);
const countAll = db.prepare(`SELECT COUNT(*) as n FROM themes`);
const countByTag = db.prepare(`SELECT COUNT(*) as n FROM themes th JOIN theme_tags tt ON th.id = tt.theme_id JOIN tags t ON tt.tag_id = t.id WHERE t.name = ?`);

const insertComment = db.prepare(`INSERT INTO comments (theme_id, author, message) VALUES (?, ?, ?)`);
const getComments = db.prepare(`SELECT * FROM comments WHERE theme_id = ? ORDER BY created_at DESC`);
const getFeatured = db.prepare(`SELECT * FROM themes WHERE likes > 0 ORDER BY likes DESC LIMIT 4`);

// Batched tag lookup: returns { theme_id, name } for all given theme IDs
const getTagsBatch = db.prepare(`
  SELECT tt.theme_id, t.name
  FROM theme_tags tt JOIN tags t ON tt.tag_id = t.id
  WHERE tt.theme_id IN (SELECT value FROM json_each(?))
`);

// Batched comment counts: returns { theme_id, count } for all given theme IDs
const getCommentCountsBatch = db.prepare(`
  SELECT theme_id, COUNT(*) as count
  FROM comments
  WHERE theme_id IN (SELECT value FROM json_each(?))
  GROUP BY theme_id
`);

// ── Sort dispatch map ─────────────────────────────────
const SORT_PAGE = {
  newest:    sortNewest,
  oldest:    sortOldest,
  popular:   sortPopular,
  downloads: sortDownloads,
};

const SORT_ALL = {
  newest:    sortNewestAll,
  oldest:    sortOldestAll,
  popular:   sortPopularAll,
  downloads: sortDownloadsAll,
};

const SORT_TAG_PAGE = {
  newest:    sortNewestByTag,
  oldest:    sortOldestByTag,
  popular:   sortPopularByTag,
  downloads: sortDownloadsByTag,
};

const SORT_TAG_ALL = {
  newest:    sortNewestByTagAll,
  oldest:    sortOldestByTagAll,
  popular:   sortPopularByTagAll,
  downloads: sortDownloadsByTagAll,
};

// ── Batched attachMeta (fixes N+1) ────────────────────
function attachMetaBulk(themes) {
  if (themes.length === 0) return [];

  const ids = themes.map(t => t.id);
  const idJson = JSON.stringify(ids);

  // Single query for all tags
  const tagRows = getTagsBatch.all(idJson);
  const tagsByTheme = {};
  for (const row of tagRows) {
    if (!tagsByTheme[row.theme_id]) tagsByTheme[row.theme_id] = [];
    tagsByTheme[row.theme_id].push(row.name);
  }

  // Single query for all comment counts
  const countRows = getCommentCountsBatch.all(idJson);
  const countsByTheme = {};
  for (const row of countRows) {
    countsByTheme[row.theme_id] = row.count;
  }

  return themes.map(theme => ({
    ...theme,
    slug: theme.slug || '',
    tags: tagsByTheme[theme.id] || [],
    topColors: JSON.parse(theme.top_colors || '[]'),
    screenshots: JSON.parse(theme.screenshots || '[]'),
    previewViews: JSON.parse(theme.preview_views || '[]'),
    previewSlug: theme.preview_slug || '',
    previewError: theme.preview_error || null,
    commentCount: countsByTheme[theme.id] || 0
  }));
}

// Single-theme attachMeta (for detail page, non-batched)
function attachMeta(theme) {
  if (!theme) return null;
  return attachMetaBulk([theme])[0];
}

// ── Public API ────────────────────────────────────────

export function saveTheme({ name, filename, originalName, author, description, screenshots, paletteSVG, previewSlug, previewViews, previewError, totalColorEntries, stats, tags, topColors }) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const result = insertTheme.run({
    name, slug, filename, originalName, author,
    description: description || '',
    screenshots: JSON.stringify(screenshots || []),
    paletteSVG,
    previewSlug: previewSlug || '',
    previewViews: JSON.stringify(previewViews || []),
    previewError: previewError || null,
    totalColors: totalColorEntries || stats.totalUnique,
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
  const safeSort = sort in SORT_ALL ? sort : 'newest';
  const themes = filterTag
    ? SORT_TAG_ALL[safeSort].all(filterTag)
    : SORT_ALL[safeSort].all();
  return attachMetaBulk(themes);
}

export function listThemesPage(filterTag, sort, offset, limit) {
  const safeSort = sort in SORT_PAGE ? sort : 'newest';
  const rows = filterTag
    ? SORT_TAG_PAGE[safeSort].all(filterTag, limit, offset)
    : SORT_PAGE[safeSort].all(limit, offset);
  return attachMetaBulk(rows);
}

export function countThemes(filterTag = null) {
  return filterTag ? countByTag.get(filterTag).n : countAll.get().n;
}

export function getPopularThemes(limit = 12) {
  const themes = getPopular.all(limit);
  return attachMetaBulk(themes);
}

export function bumpStats(id, likes, downloads) {
  bumpStatsStmt.run(likes, downloads, id);
}

export function getTheme(id) {
  const theme = getThemeById.get(id);
  return attachMeta(theme);
}

export function getThemeBySlug(slug) {
  const theme = getThemeBySlugQuery.get(slug);
  return attachMeta(theme);
}

export function listTags()           { return getAllTags.all(); }
export function likeTheme(id)        { incrementLikes.run(id);   return getThemeById.get(id)?.likes || 0; }
export function unlikeTheme(id)      { decrementLikes.run(id);   return getThemeById.get(id)?.likes || 0; }
export function trackDownload(id)    { incrementDownloads.run(id); }
export function addComment(tid, a, m){ insertComment.run(tid, a || 'Anonymous', m); }
export function getThemeComments(id) { return getComments.all(id); }
export function getFeaturedThemes()  { return attachMetaBulk(getFeatured.all()); }

// ── Authentication functions ──────────────────────────
const getUserByUsername = db.prepare('SELECT * FROM users WHERE username = ?');
const getUserByEmail = db.prepare('SELECT * FROM users WHERE email = ?');
const createUser = db.prepare(`
  INSERT INTO users (username, email, password_hash)
  VALUES (?, ?, ?)
`);
const updateUserScore = db.prepare('UPDATE users SET total_score = total_score + ? WHERE id = ?');

export async function registerUser(username, email, password) {
  const existingUser = getUserByUsername.get(username);
  if (existingUser) return { success: false, error: 'Username already exists' };

  const existingEmail = getUserByEmail.get(email);
  if (existingEmail) return { success: false, error: 'Email already exists' };

  const salt = await bcrypt.genSalt(12);
  const hash = await bcrypt.hash(password, salt);

  const result = createUser.run(username, email, hash);
  return { success: true, userId: result.lastInsertRowid };
}

export async function authenticateUser(username, password) {
  const user = getUserByUsername.get(username);
  if (!user) return { success: false, error: 'Invalid credentials' };

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) return { success: false, error: 'Invalid credentials' };

  return {
    success: true,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      title: user.title,
      rank_level: user.rank_level,
      total_score: user.total_score,
      themes_uploaded: user.themes_uploaded,
      themes_received: user.themes_received
    }
  };
}

export function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

export { db };
export default db;
