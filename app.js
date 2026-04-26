import express from 'express';
import multer from 'multer';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { parseThemeFile } from './lib/parser.js';
import { categorizeColors } from './lib/categorize.js';
import { generatePaletteSVG } from './lib/palette.js';
import { generatePreviews } from './lib/preview-renderer.js';
import {
  saveTheme, listThemes, listThemesPage, countThemes,
  getTheme, getThemeBySlug, listTags,
  likeTheme, unlikeTheme, trackDownload,
  addComment, getThemeComments, getFeaturedThemes,
  getPopularThemes, registerUser, authenticateUser, getUserById,
  db
} from './lib/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Startup validation (MUST be first) ──────────────────
if (!process.env.SESSION_SECRET) {
  console.error('FATAL: SESSION_SECRET environment variable must be set');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;

// ── Rate limiting ──────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: 'Too many attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

const downloadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  message: 'Too many downloads, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// ── App configuration ──────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'templates'));
app.use(express.static('public'));
app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.set('trust proxy', 1);

// Session with hardened cookie flags
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    httpOnly: true
  }
}));

// ── CSRF protection (double-submit cookie pattern) ─────
// Generates a fresh CSRF secret per-session and a per-request token.
const CSRF_COOKIE = 'csrf-token';

function generateCsrfToken(req) {
  if (!req.session.csrfSecret) {
    req.session.csrfSecret = crypto.randomBytes(32).toString('hex');
  }
  // Token = HMAC of "csrf" with per-session secret + timestamp for rotation
  const ts = Math.floor(Date.now() / (1000 * 60 * 60)); // rotates hourly
  const hmac = crypto.createHmac('sha256', req.session.csrfSecret);
  hmac.update(`csrf:${ts}`);
  return hmac.digest('hex');
}

function verifyCsrfToken(req) {
  const token = req.body._csrf || req.headers['x-csrf-token'];
  if (!token) return false;
  // Compare against any valid token in the last 2 hours (handles clock skew / rotation window)
  const now = Math.floor(Date.now() / (1000 * 60 * 60));
  for (let ts = now - 1; ts <= now; ts++) {
    const hmac = crypto.createHmac('sha256', req.session.csrfSecret || '');
    hmac.update(`csrf:${ts}`);
    if (crypto.timingSafeEqual(Buffer.from(hmac.digest('hex')), Buffer.from(token))) {
      return true;
    }
  }
  return false;
}

function csrfProtection(req, res, next) {
  // Skip for GET/HEAD/OPTIONS
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  // Skip for API endpoints that use AJAX (CSRF handled by same-origin + custom header)
  if (req.path.startsWith('/api/') && req.headers['x-requested-with'] === 'XMLHttpRequest') {
    return next();
  }
  if (!verifyCsrfToken(req)) {
    console.warn(`CSRF validation failed for ${req.method} ${req.path}`);
    return res.status(403).send('Invalid or missing CSRF token');
  }
  next();
}

// ── Global middleware ──────────────────────────────────
// Cached marquee (popular themes) — 5 minute TTL, invalidated on relevant events
let marqueeCache = { data: null, ts: 0 };
const MARQUEE_TTL = 5 * 60 * 1000; // 5 minutes

function getMarquee() {
  if (!marqueeCache.data || Date.now() - marqueeCache.ts > MARQUEE_TTL) {
    marqueeCache = { data: getPopularThemes(12), ts: Date.now() };
  }
  return marqueeCache.data;
}

function invalidateMarquee() {
  marqueeCache.ts = 0;
}

app.use((req, res, next) => {
  res.locals.uiTheme = req.cookies.theme === 'light' ? 'light' : 'dark';
  res.locals.marquee = getMarquee();
  res.locals.user = req.session.user || null;
  res.locals.csrfToken = generateCsrfToken(req);
  next();
});

const PAGE_SIZE = 24;

// ── Upload config ──────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'theme') cb(null, 'public/uploads/themes');
    else if (file.fieldname === 'screenshots') cb(null, 'public/uploads/screenshots');
  },
  filename: (req, file, cb) => {
    // Sanitize original name to prevent path traversal
    const safeName = path.basename(file.originalname);
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1000) + '-' + safeName);
  }
});

const fileFilter = (req, file, cb) => {
  if (file.fieldname === 'theme') {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, ext === '.xrnc' || ext === '.xml');
  } else if (file.fieldname === 'screenshots') {
    cb(null, file.mimetype.startsWith('image/'));
  }
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } });

// ── Auth middleware ────────────────────────────────────
function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.rank_level < 10) {
    return res.status(403).send('Admin access required');
  }
  next();
}

// ===================== AUTHENTICATION =====================

app.get('/register', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('register', { error: null, success: null });
});

app.post('/register', authLimiter, async (req, res) => {
  if (req.session.user) return res.redirect('/');

  const { username, email, password, passwordConfirm } = req.body;

  if (!username || !email || !password || !passwordConfirm) {
    return res.render('register', { error: 'All fields are required', success: null });
  }

  if (password !== passwordConfirm) {
    return res.render('register', { error: 'Passwords do not match', success: null });
  }

  if (password.length < 8) {
    return res.render('register', { error: 'Password must be at least 8 characters', success: null });
  }

  try {
    const result = await registerUser(username, email, password);
    if (!result.success) {
      return res.render('register', { error: result.error, success: null });
    }

    req.session.user = { id: result.userId, username, email };
    res.redirect('/');
  } catch (err) {
    console.error('Registration error:', err);
    res.render('register', { error: 'Registration failed. Please try again.', success: null });
  }
});

app.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('login', { error: null, success: null });
});

app.post('/login', authLimiter, async (req, res) => {
  if (req.session.user) return res.redirect('/');

  const { username, password } = req.body;

  if (!username || !password) {
    return res.render('login', { error: 'Username and password are required', success: null });
  }

  try {
    const result = await authenticateUser(username, password);
    if (!result.success) {
      return res.render('login', { error: result.error, success: null });
    }

    req.session.user = result.user;
    res.redirect('/');
  } catch (err) {
    console.error('Login error:', err);
    res.render('login', { error: 'Login failed. Please try again.', success: null });
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Logout error:', err);
    }
    res.redirect('/');
  });
});

// ===================== PAGES =====================

app.get('/', (req, res) => {
  const filterTag = req.query.tag || null;
  const searchQuery = (req.query.q || '').trim();
  const sort = req.query.sort || 'newest';

  let themes, totalCount;
  if (searchQuery) {
    const all = listThemes(filterTag, sort);
    const q = searchQuery.toLowerCase();
    const filtered = all.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.author.toLowerCase().includes(q) ||
      t.tags.some(tag => tag.includes(q))
    );
    themes = filtered;
    totalCount = filtered.length;
  } else {
    themes = listThemesPage(filterTag, sort, 0, PAGE_SIZE);
    totalCount = countThemes(filterTag);
  }

  const allTags = listTags();
  const featured = (!filterTag && !searchQuery && sort === 'newest')
    ? getFeaturedThemes() : [];

  res.render('index', { themes, totalCount, allTags, filterTag, searchQuery, sort, featured });
});

app.get('/api/themes', (req, res) => {
  const filterTag = req.query.tag || null;
  const sort = req.query.sort || 'newest';
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
  const limit = Math.min(60, Math.max(1, parseInt(req.query.limit, 10) || PAGE_SIZE));

  const themes = listThemesPage(filterTag, sort, offset, limit);
  let html = '';
  let pending = themes.length;
  if (pending === 0) return res.json({ html: '', count: 0 });

  themes.forEach((theme, idx) => {
    app.render('partials/theme-card', { theme }, (err, str) => {
      if (err) return res.status(500).json({ error: err.message });
      themes[idx]._html = str;
      if (--pending === 0) {
        res.json({ html: themes.map(t => t._html).join(''), count: themes.length });
      }
    });
  });
});

app.get('/set-theme/:theme', (req, res) => {
  const t = req.params.theme === 'light' ? 'light' : 'dark';
  res.cookie('theme', t, { maxAge: 365 * 24 * 60 * 60 * 1000, httpOnly: false });
  res.redirect(req.get('Referer') || '/');
});

app.get('/upload', requireAuth, (req, res) => {
  res.render('upload', { error: null, success: null });
});

app.post('/upload', requireAuth, csrfProtection,
  upload.fields([
    { name: 'theme', maxCount: 1 },
    { name: 'screenshots', maxCount: 5 }
  ]),
  async (req, res) => {
    if (!req.files || !req.files.theme) {
      return res.render('upload', { error: 'Please select a .xrnc theme file!', success: null });
    }

    const themeFile = req.files.theme[0];
    const screenshotFiles = req.files.screenshots || [];
    const author = req.body.author || 'Anonymous';
    const description = req.body.description || '';
    // Sanitize display name from original filename
    const safeOriginal = path.basename(themeFile.originalname);
    const displayName = path.basename(safeOriginal, path.extname(safeOriginal));

    try {
      const parsed = parseThemeFile(themeFile.path);
      console.log(`🎨 Found ${parsed.totalColors} colors (${parsed.weighted.length} unique)`);

      if (parsed.weighted.length === 0) {
        return res.render('upload', { error: 'No colors found. Is this a valid Renoise theme?', success: null });
      }

      const { tags, stats } = categorizeColors(parsed.weighted);
      console.log(`🏷  Tags: ${tags.join(', ')}`);

      const paletteName = themeFile.filename.replace(/\.[^.]+$/, '') + '.svg';
      const palettePath = path.join('public/uploads/palettes', paletteName);
      generatePaletteSVG(parsed.weighted, palettePath);

      const topColors = parsed.weighted.slice(0, 3).map(c => ({
        hex: c.hex, weight: c.weight, roles: c.roles
      }));

      // Generate Renoise UI previews using the unified elementColorMap (no redundant XML parsing)
      const previewSlug = themeFile.filename.replace(/\.[^.]+$/, '');
      const previewDir = path.join('public/uploads/previews', previewSlug);
      let previewViews = [];
      let previewError = null;

      try {
        const previews = await generatePreviews(parsed.elementColorMap, previewDir);
        previewViews = Object.keys(previews);
        const totalViews = previewViews.length;
        const expectedViews = 3;
        if (totalViews < expectedViews) {
          previewError = `Partial render: ${totalViews}/${expectedViews} views succeeded`;
        }
        console.log(`🖼️  Generated ${totalViews} preview renders`);
      } catch (err) {
        previewError = err.message;
        console.warn('⚠️  Preview generation failed:', err.message);
      }

      const screenshots = screenshotFiles.map(f => f.filename);

      const themeId = saveTheme({
        name: displayName,
        filename: themeFile.filename,
        originalName: safeOriginal,
        author, description, screenshots,
        paletteSVG: `/uploads/palettes/${paletteName}`,
        previewSlug,
        previewViews,
        previewError,
        totalColorEntries: parsed.totalColors,
        stats, tags, topColors
      });

      invalidateMarquee();
      console.log(`💾 Saved theme #${themeId} with ${screenshots.length} screenshot(s), ${previewViews.length} preview(s)`);
      res.redirect(`/theme/${themeId}`);

    } catch (err) {
      console.error('❌ Parse error:', err);
      res.render('upload', { error: `Could not parse theme: ${err.message}`, success: null });
    }
  }
);

app.get('/theme/:slug', (req, res) => {
  const theme = getThemeBySlug(req.params.slug);
  if (!theme) return res.status(404).send('Theme not found');
  const comments = getThemeComments(theme.id);
  res.render('detail', { theme, comments });
});

app.get('/download/:slug', downloadLimiter, (req, res) => {
  const theme = getThemeBySlug(req.params.slug);
  if (!theme) return res.status(404).send('Theme not found');
  trackDownload(theme.id);
  const filePath = path.join(__dirname, 'public/uploads/themes', theme.filename);
  res.download(filePath, theme.original_name);
});

// ===================== API =====================

app.post('/api/themes/:id/like', (req, res) => {
  res.json({ likes: likeTheme(Number(req.params.id)) });
});

app.post('/api/themes/:id/unlike', (req, res) => {
  res.json({ likes: unlikeTheme(Number(req.params.id)) });
});

app.post('/theme/:slug/comment', requireAuth, csrfProtection, (req, res) => {
  const theme = getThemeBySlug(req.params.slug);
  if (!theme) return res.status(404).send('Theme not found');
  const { message } = req.body;
  if (!message || !message.trim()) return res.redirect(`/theme/${req.params.slug}`);
  // Use logged-in user's username, not form input
  addComment(theme.id, req.session.user.username, message.trim().substring(0, 1000));
  res.redirect(`/theme/${req.params.slug}`);
});

// ── Legacy ID redirects ────────────────────────────────

// IMPORTANT: define /theme/:id AFTER /theme/:slug to avoid conflict
// Express matches routes in order, so specific patterns first
app.get('/theme/:id(\\d+)', (req, res) => {
  const theme = getTheme(Number(req.params.id));
  if (!theme) return res.status(404).send('Theme not found');
  res.redirect(`/theme/${theme.slug || theme.id}`);
});

app.get('/download/:id(\\d+)', (req, res) => {
  const theme = getTheme(Number(req.params.id));
  if (!theme) return res.status(404).send('Theme not found');
  res.redirect(`/download/${theme.slug || theme.id}`);
});

// ── Error handlers ─────────────────────────────────────

// Multer-specific errors (file too large, wrong type, etc.)
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.render('upload', { error: err.message, success: null });
  }
  next(err);
});

// Generic error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.stack || err.message);
  res.status(500).send('Internal server error');
});

// ── Health check ───────────────────────────────────────
app.get('/health', (req, res) => {
  let dbOk = false;
  try {
    db.prepare('SELECT 1').get();
    dbOk = true;
  } catch (e) {
    dbOk = false;
  }

  const checks = {
    database: dbOk,
    uploads: fs.existsSync(path.join(__dirname, 'public/uploads')),
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  };

  const healthy = checks.database && checks.uploads;
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'healthy' : 'unhealthy',
    checks,
  });
});

// ── Start server ───────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server running at http://localhost:${PORT}`));
