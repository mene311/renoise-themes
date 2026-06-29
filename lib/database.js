import Database from 'better-sqlite3';
import path from 'path';
import crypto from 'crypto';
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

  CREATE TABLE IF NOT EXISTS profile_comments (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_username TEXT NOT NULL,
    author           TEXT NOT NULL,
    message          TEXT NOT NULL,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_profile_comments_profile ON profile_comments(profile_username);

  CREATE TABLE IF NOT EXISTS feedback (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT,
    email      TEXT,
    message    TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    read       INTEGER DEFAULT 0,
    reply_message TEXT,
    replied_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    token      TEXT UNIQUE NOT NULL,
    expires_at DATETIME NOT NULL,
    used       INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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
try { db.exec(`ALTER TABLE themes ADD COLUMN status TEXT DEFAULT 'draft'`); } catch(e) {}
try { db.exec(`ALTER TABLE themes ADD COLUMN views INTEGER DEFAULT 0`); } catch(e) {}
// Fix total_colors for all existing records (was storing unique count instead of total 70)
try { db.exec(`UPDATE themes SET total_colors = 70 WHERE total_colors < 70`); } catch(e) {}
try { db.exec(`ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0`); } catch(e) {}
try { db.exec(`CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    token      TEXT UNIQUE NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
)`); } catch(e) {}
// One-time migration: set existing themes to published (created before the draft system)
try {
  const publishedCount = db.prepare(`SELECT COUNT(*) as n FROM themes WHERE status = 'published'`).get().n;
  if (publishedCount === 0) {
    db.exec(`UPDATE themes SET status = 'published'`);
  }
} catch(e) { /* ignore migration errors */ }

// ── Prepared statements ───────────────────────────────

const insertTheme = db.prepare(`
  INSERT INTO themes (
    name, slug, filename, original_name, author, description, screenshots, palette_svg,
    preview_slug, preview_views, preview_error, status, source,
    total_colors, unique_colors, avg_lightness, avg_saturation,
    contrast_range, chromatic_count, top_colors
  ) VALUES (
    @name, @slug, @filename, @originalName, @author, @description, @screenshots, @paletteSVG,
    @previewSlug, @previewViews, @previewError, @status, @source,
    @totalColors, @uniqueColors, @avgLightness, @avgSaturation,
    @contrastRange, @chromaticCount, @topColors
  )
`);

const insertTag = db.prepare(`INSERT OR IGNORE INTO tags (name) VALUES (?)`);
const getTagId = db.prepare(`SELECT id FROM tags WHERE name = ?`);
const linkThemeTag = db.prepare(`INSERT OR IGNORE INTO theme_tags (theme_id, tag_id) VALUES (?, ?)`);

const getAllTags = db.prepare(`
  SELECT t.name, COUNT(th.id) as count
  FROM tags t
  LEFT JOIN theme_tags tt ON t.id = tt.tag_id
  LEFT JOIN themes th ON th.id = tt.theme_id AND th.status = 'published'
  GROUP BY t.id
  ORDER BY count DESC, t.name ASC
`);

const getThemeById = db.prepare(`SELECT * FROM themes WHERE id = ?`);
const getThemeBySlugQuery = db.prepare(`SELECT * FROM themes WHERE slug = ?`);
const getPublishedThemeSlugs = db.prepare(`
  SELECT slug, uploaded_at
  FROM themes
  WHERE status = 'published' AND slug != ''
  ORDER BY uploaded_at DESC
`);

function slugifyName(name) {
  return (name || 'theme')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'theme';
}

function makeUniqueSlug(name) {
  const base = slugifyName(name);
  let slug = base;
  let suffix = 2;
  while (getThemeBySlugQuery.get(slug)) {
    slug = `${base}-${suffix++}`;
  }
  return slug;
}

// Pre-prepared sort queries (avoids per-call compilation)
const sortNewest = db.prepare(`SELECT * FROM themes WHERE status = 'published' ORDER BY uploaded_at DESC LIMIT ? OFFSET ?`);
const sortOldest = db.prepare(`SELECT * FROM themes WHERE status = 'published' ORDER BY uploaded_at ASC LIMIT ? OFFSET ?`);
const sortPopular = db.prepare(`SELECT * FROM themes WHERE status = 'published' ORDER BY likes DESC, uploaded_at DESC LIMIT ? OFFSET ?`);
const sortDownloads = db.prepare(`SELECT * FROM themes WHERE status = 'published' ORDER BY downloads DESC, uploaded_at DESC LIMIT ? OFFSET ?`);
const sortViews = db.prepare(`SELECT * FROM themes WHERE status = 'published' ORDER BY views DESC, uploaded_at DESC LIMIT ? OFFSET ?`);

const sortNewestAll = db.prepare(`SELECT * FROM themes WHERE status = 'published' ORDER BY uploaded_at DESC`);
const sortOldestAll = db.prepare(`SELECT * FROM themes WHERE status = 'published' ORDER BY uploaded_at ASC`);
const sortPopularAll = db.prepare(`SELECT * FROM themes WHERE status = 'published' ORDER BY likes DESC, uploaded_at DESC`);
const sortDownloadsAll = db.prepare(`SELECT * FROM themes WHERE status = 'published' ORDER BY downloads DESC, uploaded_at DESC`);
const sortViewsAll = db.prepare(`SELECT * FROM themes WHERE status = 'published' ORDER BY views DESC, uploaded_at DESC`);

const sortNewestByTag = db.prepare(`SELECT th.* FROM themes th JOIN theme_tags tt ON th.id = tt.theme_id JOIN tags t ON tt.tag_id = t.id WHERE t.name = ? AND th.status = 'published' ORDER BY th.uploaded_at DESC LIMIT ? OFFSET ?`);
const sortOldestByTag = db.prepare(`SELECT th.* FROM themes th JOIN theme_tags tt ON th.id = tt.theme_id JOIN tags t ON tt.tag_id = t.id WHERE t.name = ? AND th.status = 'published' ORDER BY th.uploaded_at ASC LIMIT ? OFFSET ?`);
const sortPopularByTag = db.prepare(`SELECT th.* FROM themes th JOIN theme_tags tt ON th.id = tt.theme_id JOIN tags t ON tt.tag_id = t.id WHERE t.name = ? AND th.status = 'published' ORDER BY th.likes DESC, th.uploaded_at DESC LIMIT ? OFFSET ?`);
const sortDownloadsByTag = db.prepare(`SELECT th.* FROM themes th JOIN theme_tags tt ON th.id = tt.theme_id JOIN tags t ON tt.tag_id = t.id WHERE t.name = ? AND th.status = 'published' ORDER BY th.downloads DESC, th.uploaded_at DESC LIMIT ? OFFSET ?`);
const sortViewsByTag = db.prepare(`SELECT th.* FROM themes th JOIN theme_tags tt ON th.id = tt.theme_id JOIN tags t ON tt.tag_id = t.id WHERE t.name = ? AND th.status = 'published' ORDER BY th.views DESC, th.uploaded_at DESC LIMIT ? OFFSET ?`);

const sortNewestByTagAll = db.prepare(`SELECT th.* FROM themes th JOIN theme_tags tt ON th.id = tt.theme_id JOIN tags t ON tt.tag_id = t.id WHERE t.name = ? AND th.status = 'published' ORDER BY th.uploaded_at DESC`);
const sortOldestByTagAll = db.prepare(`SELECT th.* FROM themes th JOIN theme_tags tt ON th.id = tt.theme_id JOIN tags t ON tt.tag_id = t.id WHERE t.name = ? AND th.status = 'published' ORDER BY th.uploaded_at ASC`);
const sortPopularByTagAll = db.prepare(`SELECT th.* FROM themes th JOIN theme_tags tt ON th.id = tt.theme_id JOIN tags t ON tt.tag_id = t.id WHERE t.name = ? AND th.status = 'published' ORDER BY th.likes DESC, th.uploaded_at DESC`);
const sortDownloadsByTagAll = db.prepare(`SELECT th.* FROM themes th JOIN theme_tags tt ON th.id = tt.theme_id JOIN tags t ON tt.tag_id = t.id WHERE t.name = ? AND th.status = 'published' ORDER BY th.downloads DESC, th.uploaded_at DESC`);
const sortViewsByTagAll = db.prepare(`SELECT th.* FROM themes th JOIN theme_tags tt ON th.id = tt.theme_id JOIN tags t ON tt.tag_id = t.id WHERE t.name = ? AND th.status = 'published' ORDER BY th.views DESC, th.uploaded_at DESC`);

const incrementLikes = db.prepare(`UPDATE themes SET likes = likes + 1 WHERE id = ?`);
const decrementLikes = db.prepare(`UPDATE themes SET likes = MAX(0, likes - 1) WHERE id = ?`);
const incrementDownloads = db.prepare(`UPDATE themes SET downloads = downloads + 1 WHERE id = ?`);
const incrementViews = db.prepare(`UPDATE themes SET views = views + 1 WHERE id = ?`);
const bumpStatsStmt = db.prepare(`UPDATE themes SET likes = likes + ?, downloads = downloads + ? WHERE id = ?`);
const getPopular = db.prepare(`SELECT * FROM themes WHERE status = 'published' ORDER BY (views * 0.5 + downloads * 3 + likes * 2) DESC, uploaded_at DESC LIMIT ?`);
const countAll = db.prepare(`SELECT COUNT(*) as n FROM themes WHERE status = 'published'`);
const countByTag = db.prepare(`SELECT COUNT(*) as n FROM themes th JOIN theme_tags tt ON th.id = tt.theme_id JOIN tags t ON tt.tag_id = t.id WHERE t.name = ? AND th.status = 'published'`);


const createVerificationTokenStmt = db.prepare("INSERT INTO email_verification_tokens (user_id, token, expires_at) VALUES (?, ?, datetime('now', '+24 hours'))");
const verifyTokenStmt = db.prepare("SELECT * FROM email_verification_tokens WHERE token = ? AND expires_at > datetime('now')");
const consumeVerificationTokenStmt = db.prepare("UPDATE users SET email_verified = 1 WHERE id = ?");
const markTokenUsedStmt = db.prepare("DELETE FROM email_verification_tokens WHERE token = ?");
const insertFeedbackStmt = db.prepare("INSERT INTO feedback (name, email, message) VALUES (?, ?, ?)");
const getAllFeedbackStmt = db.prepare("SELECT * FROM feedback ORDER BY created_at DESC");
const getUnreadFeedbackStmt = db.prepare("SELECT * FROM feedback WHERE read = 0 ORDER BY created_at DESC");
const getReadFeedbackStmt = db.prepare("SELECT * FROM feedback WHERE read = 1 ORDER BY created_at DESC");
const markFeedbackReadStmt = db.prepare("UPDATE feedback SET read = 1 WHERE id = ?");
const insertComment = db.prepare(`INSERT INTO comments (theme_id, author, message) VALUES (?, ?, ?)`);
const getComments = db.prepare(`SELECT c.*, u.title AS author_title FROM comments c LEFT JOIN users u ON c.author = u.username WHERE c.theme_id = ? ORDER BY c.created_at DESC`);
const getFeatured = db.prepare(`SELECT * FROM themes WHERE status = 'published' AND likes > 0 ORDER BY likes DESC LIMIT 4`);

const searchThemesQuery = db.prepare(`
  SELECT * FROM themes
  WHERE status = 'published' AND (name LIKE ? OR author LIKE ?)
  ORDER BY uploaded_at DESC
  LIMIT ? OFFSET ?
`);

const searchThemesByTagQuery = db.prepare(`
  SELECT th.* FROM themes th
  JOIN theme_tags tt ON th.id = tt.theme_id
  JOIN tags t ON tt.tag_id = t.id
  WHERE th.status = 'published' AND (th.name LIKE ? OR th.author LIKE ? OR t.name LIKE ?)
  ORDER BY th.uploaded_at DESC
  LIMIT ? OFFSET ?
`);

const countSearchThemesStmt = db.prepare(`
  SELECT COUNT(*) as n FROM themes
  WHERE status = 'published' AND (name LIKE ? OR author LIKE ?)
`);

const countSearchThemesByTagStmt = db.prepare(`
  SELECT COUNT(DISTINCT th.id) as n FROM themes th
  JOIN theme_tags tt ON th.id = tt.theme_id
  JOIN tags t ON tt.tag_id = t.id
  WHERE th.status = 'published' AND (th.name LIKE ? OR th.author LIKE ? OR t.name LIKE ?)
`);

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
  views:     sortViews,
};

const SORT_ALL = {
  newest:    sortNewestAll,
  oldest:    sortOldestAll,
  popular:   sortPopularAll,
  downloads: sortDownloadsAll,
  views:     sortViewsAll,
};

const SORT_TAG_PAGE = {
  newest:    sortNewestByTag,
  oldest:    sortOldestByTag,
  popular:   sortPopularByTag,
  downloads: sortDownloadsByTag,
  views:     sortViewsByTag,
};

const SORT_TAG_ALL = {
  newest:    sortNewestByTagAll,
  oldest:    sortOldestByTagAll,
  popular:   sortPopularByTagAll,
  downloads: sortDownloadsByTagAll,
  views:     sortViewsByTagAll,
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

export function saveTheme({ name, filename, originalName, author, description, screenshots, paletteSVG, previewSlug, previewViews, previewError, totalColorEntries, stats, tags, topColors, status = 'draft', source = 'upload' }) {
  const slug = makeUniqueSlug(name);
  const result = insertTheme.run({
    name, slug, filename, originalName, author,
    description: description || '',
    screenshots: JSON.stringify(screenshots || []),
    paletteSVG,
    previewSlug: previewSlug || '',
    previewViews: JSON.stringify(previewViews || []),
    previewError: previewError || null,
    status,
    totalColors: totalColorEntries || stats.totalUnique,
    uniqueColors: stats.totalUnique,
    avgLightness: stats.avgLightness,
    avgSaturation: stats.avgSaturation,
    contrastRange: stats.contrastRange,
    chromaticCount: stats.chromaticCount,
    topColors: JSON.stringify(topColors),
    source
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

export function searchThemes(q, filterTag = null, offset = 0, limit = 24) {
  const like = `%${q}%`;
  const rows = filterTag
    ? searchThemesByTagQuery.all(like, like, like, limit, offset)
    : searchThemesQuery.all(like, like, limit, offset);
  return attachMetaBulk(rows);
}

export function countSearchThemes(q, filterTag = null) {
  const like = `%${q}%`;
  return filterTag
    ? countSearchThemesByTagStmt.get(like, like, like).n
    : countSearchThemesStmt.get(like, like).n;
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
export function listPublishedThemeSlugs() { return getPublishedThemeSlugs.all(); }
export function likeTheme(id)        { incrementLikes.run(id);   return getThemeById.get(id)?.likes || 0; }
export function unlikeTheme(id)      { decrementLikes.run(id);   return getThemeById.get(id)?.likes || 0; }
export function trackDownload(id)    { incrementDownloads.run(id); }
export function trackView(id)         { incrementViews.run(id); }
export function addComment(tid, a, m){ insertComment.run(tid, a || 'Anonymous', m); }
export function getThemeComments(id) { return getComments.all(id); }
export function getFeaturedThemes()  { return attachMetaBulk(getFeatured.all()); }

const publishThemeStmt = db.prepare(`UPDATE themes SET status = 'published' WHERE id = ?`);
const unpublishThemeStmt = db.prepare(`UPDATE themes SET status = 'draft' WHERE id = ?`);

export function publishTheme(id)  { publishThemeStmt.run(id); }
export function unpublishTheme(id) { unpublishThemeStmt.run(id); }

// ── Profile comments (Backstage guestbook) ─────────────
const insertProfileComment = db.prepare(`INSERT INTO profile_comments (profile_username, author, message) VALUES (?, ?, ?)`);
const getProfileCommentsQuery = db.prepare(`SELECT * FROM profile_comments WHERE profile_username = ? ORDER BY created_at DESC LIMIT 50`);
const deleteProfileCommentStmt = db.prepare(`DELETE FROM profile_comments WHERE id = ?`);

export function addProfileComment(profileUsername, author, message) {
  insertProfileComment.run(profileUsername, author, message);
}
export function getProfileComments(profileUsername) {
  const comments = getProfileCommentsQuery.all(profileUsername);
  // Attach flair from users table
  const userLookup = db.prepare('SELECT title FROM users WHERE username = ?');
  return comments.map(c => {
    const user = userLookup.get(c.author);
    return { ...c, authorTitle: user?.title || null };
  });
}
export function insertFeedback(name, email, message) {
  return insertFeedbackStmt.run(name || null, email || null, message.trim().substring(0, 5000));
}
export function getFeedback(readFilter) {
  if (readFilter === "unread") return getUnreadFeedbackStmt.all();
  if (readFilter === "read") return getReadFeedbackStmt.all();
  return getAllFeedbackStmt.all();
}
export function markFeedbackRead(id) {
  markFeedbackReadStmt.run(id);
}

export function deleteProfileComment(id) {
  deleteProfileCommentStmt.run(id);
}

// ── User stats ──────────────────────────────────────────
export function getUserStats(username) {
  const themes = db.prepare(`SELECT COALESCE(SUM(likes),0) as totalLikes, COALESCE(SUM(downloads),0) as totalDownloads, COUNT(*) as themeCount FROM themes WHERE author = ? AND status = 'published'`).get(username);
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) return null;
  return {
    username: user.username,
    title: user.title,
    rank_level: user.rank_level,
    created_at: user.created_at,
    themeCount: themes.themeCount,
    totalLikes: themes.totalLikes,
    totalDownloads: themes.totalDownloads
  };
}

// ── Theme management (by author) ──────────────────────
const getThemesByAuthorQuery = db.prepare(`SELECT * FROM themes WHERE author = ? ORDER BY uploaded_at DESC`);
const updateThemeDescStmt = db.prepare(`UPDATE themes SET description = ?, screenshots = ? WHERE id = ?`);
const deleteThemeStmt = db.prepare(`DELETE FROM themes WHERE id = ?`);
const deleteThemeCommentsStmt = db.prepare(`DELETE FROM comments WHERE theme_id = ?`);
const deleteThemeTagsStmt = db.prepare(`DELETE FROM theme_tags WHERE theme_id = ?`);

export function getThemesByAuthor(author) {
  const themes = getThemesByAuthorQuery.all(author);
  return attachMetaBulk(themes);
}

const getThemesByAuthorPublicQuery = db.prepare(`SELECT * FROM themes WHERE author = ? AND status = 'published' ORDER BY uploaded_at DESC`);

export function getThemesByAuthorPublic(author) {
  const themes = getThemesByAuthorPublicQuery.all(author);
  return attachMetaBulk(themes);
}

export function updateThemeDescription(id, description, screenshots) {
  updateThemeDescStmt.run(description, JSON.stringify(screenshots || []), id);
}

const updateThemeStmt = db.prepare(`
  UPDATE themes SET
    filename = @filename,
    original_name = @originalName,
    palette_svg = @paletteSVG,
    preview_slug = @previewSlug,
    preview_views = @previewViews,
    preview_error = @previewError,
    total_colors = @totalColors,
    unique_colors = @uniqueColors,
    avg_lightness = @avgLightness,
    avg_saturation = @avgSaturation,
    contrast_range = @contrastRange,
    chromatic_count = @chromaticCount,
    top_colors = @topColors,
    uploaded_at = CURRENT_TIMESTAMP
  WHERE id = @id
`);

const clearThemeTagsStmt = db.prepare(`DELETE FROM theme_tags WHERE theme_id = ?`);

export function updateTheme(id, { filename, originalName, paletteSVG, previewSlug, previewViews, previewError, totalColorEntries, stats, tags, topColors }) {
  updateThemeStmt.run({
    id,
    filename,
    originalName,
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
    topColors: JSON.stringify(topColors),
    source
  });
  clearThemeTagsStmt.run(id);
  for (const tagName of tags) {
    insertTag.run(tagName);
    const tag = getTagId.get(tagName);
    linkThemeTag.run(id, tag.id);
  }
}

export function deleteTheme(id) {
  deleteThemeTagsStmt.run(id);
  deleteThemeCommentsStmt.run(id);
  deleteThemeStmt.run(id);
}

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
  const user = db.prepare('SELECT id, username, email, password_hash, title, rank_level, total_score, themes_uploaded, themes_received, email_verified FROM users WHERE username = ?').get(username);
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
      themes_received: user.themes_received,
      email_verified: user.email_verified
    }
  };
}

export function createVerificationToken(userId, token) {
  createVerificationTokenStmt.run(userId, token);
}
export function verifyEmailToken(token) {
  const row = verifyTokenStmt.get(token);
  if (!row) return false;
  consumeVerificationTokenStmt.run(row.user_id);
  markTokenUsedStmt.run(token);
  return true;
}

export function deleteUser(username) {
  const user = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (!user) return false;
  db.prepare('DELETE FROM comments WHERE author = ? OR theme_id IN (SELECT id FROM themes WHERE author = ?)').run(username, username);
  db.prepare('DELETE FROM profile_comments WHERE profile_username = ? OR author = ?').run(username, username);
  db.prepare('DELETE FROM theme_tags WHERE theme_id IN (SELECT id FROM themes WHERE author = ?)').run(username);
  db.prepare('DELETE FROM themes WHERE author = ?').run(username);
  db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(user.id);
  db.prepare('DELETE FROM email_verification_tokens WHERE user_id = ?').run(user.id);
  db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
  return true;
}

export function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

// ── Password recovery ──────────────────────────────

const createResetTokenStmt = db.prepare(`
  INSERT INTO password_reset_tokens (user_id, token, expires_at)
  VALUES (?, ?, datetime('now', '+1 hour'))
`);

const findResetToken = db.prepare(`
  SELECT * FROM password_reset_tokens WHERE token = ? AND used = 0 AND expires_at > datetime('now')
`);

const consumeResetTokenStmt = db.prepare(`
  UPDATE password_reset_tokens SET used = 1 WHERE id = ?
`);

const updatePasswordStmt = db.prepare(`
  UPDATE users SET password_hash = ? WHERE id = ?
`);

export async function createPasswordResetToken(email) {
  const user = getUserByEmail.get(email);
  if (!user) return null; // Don't reveal if email exists

  const token = crypto.randomBytes(32).toString('hex');
  createResetTokenStmt.run(user.id, token);
  return { token, username: user.username };
}

export function validateResetToken(token) {
  return findResetToken.get(token) || null;
}

export async function consumeResetToken(row, newPassword) {
  const hash = await bcrypt.hash(newPassword, 12);
  updatePasswordStmt.run(hash, row.user_id);
  consumeResetTokenStmt.run(row.id);
  return true;
}

// ── Request logging (debug/analytics) ────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS request_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    path       TEXT NOT NULL,
    method     TEXT NOT NULL,
    status     INTEGER NOT NULL,
    referrer   TEXT,
    ip         TEXT,
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);
// Safe migrations for columns added after initial deploy
try { db.exec(`ALTER TABLE request_log ADD COLUMN ip TEXT`); } catch(e) {}
try { db.exec(`ALTER TABLE request_log ADD COLUMN user_agent TEXT`); } catch(e) {}

const logRequestStmt = db.prepare(`INSERT INTO request_log (path, method, status, referrer, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)`);
export function logRequest(path, method, status, referrer, ip, userAgent) {
  logRequestStmt.run(path, method, status, referrer || null, ip || null, userAgent || null);
}

export function getRecent404s(limit = 50) {
  return db.prepare(`SELECT path, referrer, ip, user_agent, COUNT(*) as hits, MAX(created_at) as last_seen FROM request_log WHERE status >= 400 GROUP BY path ORDER BY hits DESC LIMIT ?`).all(limit);
}

export function getPathDetails(path, limit = 20) {
  return db.prepare(`SELECT ip, user_agent, referrer, created_at FROM request_log WHERE path = ? ORDER BY created_at DESC LIMIT ?`).all(path, limit);
}

export function getTopReferrers(days = 7) {
  return db.prepare(`SELECT referrer, COUNT(*) as hits FROM request_log WHERE referrer IS NOT NULL AND referrer != '' AND created_at > datetime('now', '-' || ? || ' days') GROUP BY referrer ORDER BY hits DESC LIMIT 20`).all(days);
}

export function getDownloadsOverTime(days = 30) {
  return db.prepare(`SELECT date(created_at) as day, COUNT(*) as downloads FROM request_log WHERE path LIKE '/download/%' AND status < 400 AND created_at > datetime('now', '-' || ? || ' days') GROUP BY day ORDER BY day ASC`).all(days);
}

export function getRequestLogStats(days = 7) {
  const total = db.prepare(`SELECT COUNT(*) as n FROM request_log WHERE created_at > datetime('now', '-' || ? || ' days')`).get(days);
  const errors = db.prepare(`SELECT COUNT(*) as n FROM request_log WHERE status >= 400 AND created_at > datetime('now', '-' || ? || ' days')`).get(days);
  const downloads = db.prepare(`SELECT COUNT(*) as n FROM request_log WHERE path LIKE '/download/%' AND status < 400 AND created_at > datetime('now', '-' || ? || ' days')`).get(days);
  return { total: total.n, errors: errors.n, downloads: downloads.n };
}

export { db };
export default db;
export const rawDb = db;
