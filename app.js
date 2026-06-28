import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import SQLiteStore from 'connect-sqlite3';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { parseThemeFile } from './lib/parser.js';
import { categorizeColors } from './lib/categorize.js';
import { generatePaletteSVG } from './lib/palette.js';
import { generatePreviews } from './lib/preview-renderer.js';
import { generateXrnc } from './lib/xrnc-generator.js';
import { sendPasswordReset, sendWelcome, sendVerificationEmail } from './lib/email.js';
import { GROUPS as ELEMENT_GROUPS } from './lib/element-groups.js';
import { CLUSTERS, VU_METER_PRESETS, buildSlaveMap } from './lib/element-clusters.js';
import { ARCHETYPES, ARCHETYPE_LIST } from './lib/archetype-seeds.js';
import {
  insertFeedback, getFeedback, markFeedbackRead,
  saveTheme, listThemes, listThemesPage, countThemes,
  getTheme, getThemeBySlug, listTags,
  likeTheme, unlikeTheme, trackDownload,
  addComment, getThemeComments, getFeaturedThemes,
  getPopularThemes, registerUser, authenticateUser, getUserById,
  createPasswordResetToken, validateResetToken, consumeResetToken,
  searchThemes, countSearchThemes,
  getThemesByAuthor, getThemesByAuthorPublic, updateThemeDescription, updateTheme, deleteTheme,
  getProfileComments, addProfileComment, deleteProfileComment,
  getUserStats, deleteUser, publishTheme, unpublishTheme,
  createVerificationToken, verifyEmailToken,
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

// Skip all rate limits for user "MENE"
function skipForMene(req) {
  return !!(req.session && req.session.user && req.session.user.username === 'MENE');
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 12,
  skip: skipForMene,
  message: 'Too many attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

const downloadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  skip: skipForMene,
  message: 'Too many downloads, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

const previewLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  skip: skipForMene,
  message: 'Too many preview requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

const likeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  skip: skipForMene,
  message: 'Too many likes, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

const commentLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  skip: skipForMene,
  message: 'Too many comments, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  skip: skipForMene,
  message: 'Too many reset attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  skip: skipForMene,
  message: 'Too many uploads, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// ── App configuration ──────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'templates'));
app.use(express.static('public'));
app.use('/docs', express.static('docs'));
app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.set('trust proxy', 1);

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      upgradeInsecureRequests: null,
    },
  },
  hsts: false,
  crossOriginEmbedderPolicy: false,
}));

// Session with hardened cookie flags + SQLite persistence (survives restarts)
const SQLiteSessionStore = SQLiteStore(session);
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: new SQLiteSessionStore({
    db: 'sessions.db',
    dir: path.join(__dirname, 'db'),
  }),
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

// Cache the CSS files in memory for inlining (mobile can't fetch external CSS)
let _cssCache = null;
function getInlineCss() {
  if (!_cssCache) {
    try {
      const main = fs.readFileSync(path.join(__dirname, 'public/css/style.css'), 'utf-8');
      const wheel = fs.readFileSync(path.join(__dirname, 'public/css/reinvented-color-wheel.css'), 'utf-8');
      _cssCache = main + '\n' + wheel;
    } catch (e) {
      _cssCache = '/* css unavailable */';
    }
  }
  return _cssCache;
}

app.use((req, res, next) => {
  res.locals.uiTheme = req.cookies.theme === 'light' ? 'light' : 'dark';
  res.locals.marquee = getMarquee();
  res.locals.user = req.session.user || null;
  res.locals.csrfToken = generateCsrfToken(req);
  res.locals._css = getInlineCss();
  res.setHeader('Cache-Control', 'no-cache');
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

const ALLOWED_IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];

const fileFilter = (req, file, cb) => {
  if (file.fieldname === 'theme') {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, ext === '.xrnc' || ext === '.xml');
  } else if (file.fieldname === 'screenshots') {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowed = file.mimetype.startsWith('image/') && ALLOWED_IMAGE_EXTS.includes(ext);
    cb(null, allowed);
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

const USERNAME_REGEX = /^[a-zA-Z0-9_-]{2,30}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

app.post('/register', authLimiter, csrfProtection, async (req, res) => {
  if (req.session.user) return res.redirect('/');

  const { username, email, password, passwordConfirm } = req.body;

  if (!username || !email || !password || !passwordConfirm) {
    return res.render('register', { error: 'All fields are required', success: null });
  }

  if (!USERNAME_REGEX.test(username)) {
    return res.render('register', { error: 'Username must be 2-30 characters (letters, numbers, _ or -)', success: null });
  }

  if (!EMAIL_REGEX.test(email)) {
    return res.render('register', { error: 'Please enter a valid email address', success: null });
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

    // Regenerate session to prevent session fixation
    // Generate verification token
    const verifyToken = crypto.randomBytes(32).toString('hex');
    createVerificationToken(result.userId, verifyToken);
    const verifyUrl = req.protocol + '://' + req.get('host') + '/verify-email/' + verifyToken;

    // Send verification email
    sendVerificationEmail(email, username, verifyUrl).then(() => {
      console.log('[EMAIL] Verification sent to', email);
    }).catch(err => {
      console.error('[EMAIL] Verification email failed:', err);
    });

    res.render('register', {
      success: 'Account created! We sent a verification link to <strong>' + email + '</strong>. Check your inbox (and spam folder).',
      error: null
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.render('register', { error: 'Registration failed. Please try again.', success: null });
  }
});

app.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('login', { error: null, success: null });
});

app.post('/login', authLimiter, csrfProtection, async (req, res) => {
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

    // Check email verification
    if (!result.emailVerified) {
      return res.render('login', { 
        error: 'Please verify your email before logging in.',
        verifyEmail: result.email,
        verifyUsername: result.username,
        success: null 
      });
    }

    // Regenerate session to prevent session fixation
    req.session.regenerate((err) => {
      if (err) {
        console.error('Session regeneration error:', err);
        return res.render('login', { error: 'Login failed. Please try again.', success: null });
      }
      req.session.user = result.user;
      res.redirect('/');
    });
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

// ── Password Recovery ──────────────────────────────────

app.get('/forgot-password', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('forgot-password', { error: null, success: null });
});

app.post('/forgot-password', resetLimiter, csrfProtection, async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.render('forgot-password', { error: 'Please enter your email address', success: null });
  }

  try {
    const result = await createPasswordResetToken(email);
    // Always show success (don't reveal if email exists)
    if (result) {
      const resetUrl = `${req.protocol}://${req.get('host')}/reset-password/${result.token}`;
      await sendPasswordReset(email, resetUrl);
    }
    res.render('forgot-password', {
      error: null,
      success: 'If that email is registered, a reset link has been sent.'
    });
  } catch (err) {
    console.error('Password reset error:', err);
    res.render('forgot-password', { error: 'Something went wrong. Please try again.', success: null });
  }
});

app.get('/reset-password/:token', (req, res) => {
  if (req.session.user) return res.redirect('/');
  const tokenRow = validateResetToken(req.params.token);
  if (!tokenRow) {
    return res.render('reset-password', { error: 'Invalid or expired reset link. Please request a new one.', token: null });
  }
  res.render('reset-password', { error: null, token: req.params.token });
});

app.post('/reset-password/:token', resetLimiter, csrfProtection, async (req, res) => {
  const tokenRow = validateResetToken(req.params.token);
  if (!tokenRow) {
    return res.render('reset-password', { error: 'Invalid or expired reset link.', token: null });
  }

  const { password, passwordConfirm } = req.body;
  if (!password || !passwordConfirm) {
    return res.render('reset-password', { error: 'Both fields are required.', token: req.params.token });
  }
  if (password !== passwordConfirm) {
    return res.render('reset-password', { error: 'Passwords do not match.', token: req.params.token });
  }
  if (password.length < 8) {
    return res.render('reset-password', { error: 'Password must be at least 8 characters.', token: req.params.token });
  }

  try {
    await consumeResetToken(tokenRow, password);
    res.render('login', { error: null, success: 'Password reset successful! You can now log in.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.render('reset-password', { error: 'Something went wrong. Please try again.', token: req.params.token });
  }
});

// ── Dashboard / Backstage legacy redirect ───────────────

app.get('/dashboard', requireAuth, (req, res) => {
  res.redirect('/backstage');
});

app.get('/theme/:slug/edit', requireAuth, (req, res) => {
  const theme = getThemeBySlug(req.params.slug);
  if (!theme) return res.status(404).send('Theme not found');
  if (theme.author !== req.session.user.username) {
    return res.status(403).send('You can only edit your own themes');
  }
  res.render('edit-theme', { theme, error: null, success: null });
});

app.post('/theme/:slug/edit', requireAuth, csrfProtection, (req, res) => {
  const theme = getThemeBySlug(req.params.slug);
  if (!theme) return res.status(404).send('Theme not found');
  if (theme.author !== req.session.user.username) {
    return res.status(403).send('You can only edit your own themes');
  }

  const { description } = req.body;
  updateThemeDescription(theme.id, description || '', theme.screenshots);
  res.redirect(`/theme/${theme.slug}`);
});

// ── Edit Colors ────────────────────────────────────────

app.get('/theme/:slug/edit-colors', requireAuth, (req, res) => {
  const theme = getThemeBySlug(req.params.slug);
  if (!theme) return res.status(404).send('Theme not found');
  if (theme.author !== req.session.user.username) {
    return res.status(403).send('You can only edit your own themes');
  }

  const filePath = path.join(__dirname, 'public/uploads/themes', theme.filename);
  let editDefaults = {};
  try {
    const parsed = parseThemeFile(filePath);
    for (const [name, rgb] of Object.entries(parsed.elementColorMap)) {
      editDefaults[name] = rgb[0].toString(16).padStart(2, '0') + rgb[1].toString(16).padStart(2, '0') + rgb[2].toString(16).padStart(2, '0');
    }
  } catch (e) {
    console.error('Failed to parse theme for editing:', e);
  }

  const SLAVE_MAP = buildSlaveMap();
  res.render('create', {
    defaults: editDefaults,
    ELEMENT_GROUPS, COVERAGE_MAP, CLUSTERS, VU_METER_PRESETS, SLAVE_MAP,
    editSlug: theme.slug,
    editName: theme.name
  });
});

app.post('/api/save-edited-theme', requireAuth, previewLimiter, csrfProtection, async (req, res) => {
  try {
    const { slug, elementColorMap } = req.body;
    if (!slug || !elementColorMap) {
      return res.status(400).json({ success: false, error: 'Missing slug or colors' });
    }

    const theme = getThemeBySlug(slug);
    if (!theme) return res.status(404).json({ success: false, error: 'Theme not found' });
    if (theme.author !== req.session.user.username) {
      return res.status(403).json({ success: false, error: 'Not your theme' });
    }

    // Normalize colors
    const normalized = {};
    for (const [name, val] of Object.entries(elementColorMap)) {
      if (Array.isArray(val) && val.length === 3) {
        normalized[name] = val;
      } else if (typeof val === 'string') {
        const hex = val.replace('#', '');
        normalized[name] = [
          parseInt(hex.substring(0, 2), 16),
          parseInt(hex.substring(2, 4), 16),
          parseInt(hex.substring(4, 6), 16)
        ];
      }
    }

    // Generate XRNC
    const xrnc = generateXrnc(normalized);
    const filename = `${Date.now()}-${slug}.xrnc`;
    const themesDir = path.join(__dirname, 'public/uploads/themes');
    const filePath = path.join(themesDir, filename);
    fs.writeFileSync(filePath, xrnc);

    // Parse for metadata
    const parsed = parseThemeFile(filePath);
    const { tags, stats } = categorizeColors(parsed.weighted);

    // Palette SVG
    const palettesDir = path.join(__dirname, 'public/uploads/palettes');
    const paletteName = filename.replace('.xrnc', '.svg');
    generatePaletteSVG(parsed.weighted, path.join(palettesDir, paletteName));

    // Previews
    const previewSlug = filename.replace('.xrnc', '');
    const previewDir = path.join(__dirname, 'public/uploads/previews', previewSlug);
    const previews = await generatePreviews(parsed.elementColorMap, previewDir);
    const previewViews = Object.keys(previews);

    const topColors = parsed.weighted.slice(0, 6).map(c => ({
      hex: c.hex, weight: c.weight, roles: c.roles
    }));

    // Delete old files
    try {
      const oldPath = path.join(themesDir, theme.filename);
      if (fs.existsSync(oldPath) && oldPath !== filePath) fs.unlinkSync(oldPath);
      const oldPalette = path.join(palettesDir, theme.filename.replace('.xrnc', '.svg'));
      if (fs.existsSync(oldPalette)) fs.unlinkSync(oldPalette);
      const oldPreviewDir = path.join(__dirname, 'public/uploads/previews', theme.preview_slug);
      if (fs.existsSync(oldPreviewDir)) fs.rmSync(oldPreviewDir, { recursive: true, force: true });
    } catch (e) { /* ignore cleanup errors */ }

    // Update DB
    updateTheme(theme.id, {
      filename,
      originalName: `${slug}.xrnc`,
      paletteSVG: `/uploads/palettes/${paletteName}`,
      previewSlug,
      previewViews,
      previewError: null,
      totalColorEntries: parsed.totalColors,
      stats,
      tags,
      topColors
    });

    res.json({ success: true, slug });
  } catch (err) {
    console.error('Save edited theme error:', err);
    res.status(500).json({ success: false, error: process.env.NODE_ENV === 'production' ? 'Internal error' : err.message });
  }
});

// ── Remix Theme ───────────────────────────────────────

app.get('/theme/:slug/remix', requireAuth, (req, res) => {
  const theme = getThemeBySlug(req.params.slug);
  if (!theme) return res.status(404).send('Theme not found');

  const filePath = path.join(__dirname, 'public/uploads/themes', theme.filename);
  let remixDefaults = {};
  try {
    const parsed = parseThemeFile(filePath);
    for (const [name, rgb] of Object.entries(parsed.elementColorMap)) {
      remixDefaults[name] = rgb[0].toString(16).padStart(2, '0') + rgb[1].toString(16).padStart(2, '0') + rgb[2].toString(16).padStart(2, '0');
    }
  } catch (e) {
    console.error('Failed to parse theme for remix:', e);
  }

  const SLAVE_MAP = buildSlaveMap();
  res.render('create', {
    defaults: remixDefaults,
    ELEMENT_GROUPS, COVERAGE_MAP, CLUSTERS, VU_METER_PRESETS, SLAVE_MAP,
    showPaletteGen: true
  });
});

app.post('/theme/:slug/delete', requireAuth, csrfProtection, (req, res) => {
  const theme = getThemeBySlug(req.params.slug);
  if (!theme) return res.status(404).send('Theme not found');
  if (theme.author !== req.session.user.username) {
    return res.status(403).send('You can only delete your own themes');
  }

  deleteTheme(theme.id);
  res.redirect('/dashboard');
});

// ── Publish / Unpublish ──────────────────────────────

app.post('/theme/:slug/publish', requireAuth, csrfProtection, (req, res) => {
  const theme = getThemeBySlug(req.params.slug);
  if (!theme) return res.status(404).send('Theme not found');
  if (theme.author !== req.session.user.username) {
    return res.status(403).send('You can only publish your own themes');
  }
  publishTheme(theme.id);
  invalidateMarquee();
  res.redirect(`/theme/${theme.slug}`);
});

app.post('/theme/:slug/unpublish', requireAuth, csrfProtection, (req, res) => {
  const theme = getThemeBySlug(req.params.slug);
  if (!theme) return res.status(404).send('Theme not found');
  if (theme.author !== req.session.user.username) {
    return res.status(403).send('You can only unpublish your own themes');
  }
  unpublishTheme(theme.id);
  invalidateMarquee();
  res.redirect(`/theme/${theme.slug}`);
});

// ── Account Deletion ──────────────────────────────────

app.get('/account/delete', requireAuth, (req, res) => {
  res.render('account-delete');
});

app.post('/account/delete', requireAuth, csrfProtection, (req, res) => {
  const username = req.session.user.username;
  const success = deleteUser(username);
  if (success) {
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.redirect('/?deleted=1');
    });
  } else {
    res.render('account-delete', { error: 'Something went wrong. Please try again.' });
  }
});

// ── Admin ──────────────────────────────────────────────

app.post('/admin/reload-maps', requireAdmin, async (req, res) => {
  try {
    const pr = await import('./lib/preview-renderer.js');
    pr.invalidateRendererCache();
    await pr.initRenderers(); // Force reload to validate maps immediately
    res.json({ success: true, message: 'Preview maps reloaded successfully' });
  } catch (err) {
    console.error('Admin reload-maps error:', err);
    res.status(500).json({ success: false, error: process.env.NODE_ENV === 'production' ? 'Internal error' : err.message });
  }
});

// ── Documentation ──────────────────────────────────────

app.get('/how-it-works', (req, res) => {
  res.render('how-it-works');
});

app.get('/tutorial', (req, res) => {
  res.render('tutorial');
});

// ── Theme Creator ──────────────────────────────────────

// Element pixel coverage rankings (precomputed from pixel maps)
// Total matched pixels: 4,868,286 across all 3 views
const ELEMENT_COVERAGE = [
  { name: 'Main_Back',           pct: 46.38 },
  { name: 'Body_Back',           pct: 31.50 },
  { name: 'Button_Back',         pct:  6.61 },
  { name: 'ValueBox_Back',       pct:  4.10 },
  { name: 'Pattern_Default_Back',pct:  3.51 },
  { name: 'Main_Font',           pct:  2.53 },
  { name: 'Scrollbar',           pct:  1.32 },
  { name: 'Selected_Button_Back',pct:  0.99 },
  { name: 'StandBy_Selection_Back',pct: 0.66 },
  { name: 'Pattern_CenterBar_Back',pct: 0.40 },
  { name: 'Pattern_Highlighted_Back',pct: 0.32 },
  { name: 'Slider',              pct:  0.30 },
  { name: 'Body_Font',           pct:  0.26 },
  { name: 'ValueBox_Font',       pct:  0.19 },
  { name: 'Selection_Back',      pct:  0.18 },
  { name: 'VuMeter_Meter',       pct:  0.12 },
  { name: 'Strong_Body_Font',    pct:  0.09 },
  { name: 'Automation_Line_Fill',pct:  0.09 },
  { name: 'VuMeter_Meter_Low',   pct:  0.08 },
  { name: 'Automation_Grid',     pct:  0.07 },
  { name: 'Button_Font',         pct:  0.07 },
  { name: 'Automation_Marker_Single',pct: 0.02 },
  { name: 'Pattern_Default_Font_Volume',pct: 0.02 },
  { name: 'VuMeter_Back_Normal', pct:  0.02 },
  { name: 'Selection_Font',      pct:  0.02 },
  { name: 'Folder',              pct:  0.02 },
  { name: 'Selected_Button_Font',pct:  0.02 },
  { name: 'Pattern_Mute_State',  pct:  0.01 },
  { name: 'VuMeter_Peak',        pct:  0.01 },
  { name: 'StandBy_Selection_Font',pct: 0.01 },
  { name: 'Pattern_Default_Font',pct:  0.01 },
  { name: 'Pattern_PlayPosition_Back',pct: 0.01 },
  { name: 'Midi_Mapping_Font',   pct:  0.01 },
  { name: 'Automation_Line_Edge',pct:  0.01 },
  { name: 'Pattern_Default_Font_Unused',pct: 0.01 },
  { name: 'VuMeter_Meter_Middle',pct:  0.01 },
  { name: 'Pattern_Default_Font_Other',pct: 0.01 },
  { name: 'Pattern_Highlighted_Font_Delay',pct: 0.01 },
  { name: 'Automation_Marker_Play',pct: 0.01 },
  { name: 'Pattern_Default_Font_Delay',pct: 0.00 },
  { name: 'Pattern_CenterBar_Font',pct: 0.00 },
  { name: 'Pattern_Highlighted_Font',pct: 0.00 },
  { name: 'ToolTip_Back',        pct:  0.00 },
  { name: 'VuMeter_Back_Clipped',pct:  0.00 },
  { name: 'Pattern_Highlighted_Font_Panning',pct: 0.00 },
  { name: 'Pattern_Default_Font_DspFx',pct: 0.00 },
  { name: 'Pattern_CenterBar_Back_StandBy',pct: 0.00 },
  { name: 'Pattern_Highlighted_Font_Unused',pct: 0.00 },
  { name: 'Automation_Marker_Diamond',pct: 0.00 },
  { name: 'Pattern_Selection',   pct:  0.00 },
  { name: 'Pattern_CenterBar_Font_StandBy',pct: 0.00 },
];

// Remaining elements with zero mapped coverage (purely font/marker elements
// that fall in UNMATCHED text regions)
const COVERAGE_ZERO = [
  'Alternate_Main_Back','Alternate_Main_Font',
  'Button_Highlight_Font','Midi_Mapping_Back','ToolTip_Font',
  'ValueBox_Font_Icons',
  'Pattern_Default_Font_Panning','Pattern_Default_Font_Pitch','Pattern_Default_Font_Global',
  'Pattern_Highlighted_Font_Volume','Pattern_Highlighted_Font_Pitch','Pattern_Highlighted_Font_Global',
  'Pattern_Highlighted_Font_Other','Pattern_Highlighted_Font_DspFx',
  'Pattern_PlayPosition_Font','Pattern_StandBy_Selection','Automation_Point',
  'Automation_Marker_Pair',
  'VuMeter_Meter_High'
];

// Build full ordered list: coverage-ranked first, zero-coverage last
const ALL_ELEMENTS_ORDERED = [
  ...ELEMENT_COVERAGE.map(e => e.name),
  ...COVERAGE_ZERO
];

const COVERAGE_MAP = {};
ELEMENT_COVERAGE.forEach(e => { COVERAGE_MAP[e.name] = e.pct; });

// Parse default theme colors for the creator page
function getDefaultColors() {
  try {
    const defaultPath = path.join(__dirname, 'Default.xrnc');
    if (!fs.existsSync(defaultPath)) return {};
    const parsed = parseThemeFile(defaultPath);
    const map = {};
    for (const [name, rgb] of Object.entries(parsed.elementColorMap)) {
      map[name] = rgb[0].toString(16).padStart(2,'0') + rgb[1].toString(16).padStart(2,'0') + rgb[2].toString(16).padStart(2,'0');
    }
    return map;
  } catch (e) {
    return {};
  }
}

// ── Backstage (user profile) ───────────────────────────

app.get('/backstage/:username', (req, res) => {
  const stats = getUserStats(req.params.username);
  if (!stats) return res.status(404).send('User not found');
  const isOwner = req.session.user && req.session.user.username === req.params.username;
  const themes = isOwner ? getThemesByAuthor(req.params.username) : getThemesByAuthorPublic(req.params.username);
  const comments = getProfileComments(req.params.username);
  res.render('backstage', { stats, themes, comments, isOwner });
});

app.post('/backstage/:username/comment', requireAuth, csrfProtection, (req, res) => {
  const { message } = req.body;
  if (!message || !message.trim()) return res.status(400).send('Message is required');
  addProfileComment(req.params.username, req.session.user.username, message.trim().substring(0, 1000));
  res.redirect(`/backstage/${req.params.username}`);
});

app.post('/backstage/:username/comment/:id/delete', requireAuth, csrfProtection, (req, res) => {
  if (req.session.user.username !== req.params.username) return res.status(403).send('Not authorized');
  deleteProfileComment(req.params.id);
  res.redirect(`/backstage/${req.params.username}`);
});

app.get('/backstage', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  res.redirect(`/backstage/${req.session.user.username}`);
});

app.get('/create', requireAuth, (req, res) => {
  const SLAVE_MAP = buildSlaveMap();
  res.render('create', { defaults: getDefaultColors(), ELEMENT_GROUPS, COVERAGE_MAP, CLUSTERS, VU_METER_PRESETS, SLAVE_MAP });
});

app.get('/studio', requireAdmin, (req, res) => {
  const SLAVE_MAP = buildSlaveMap();
  res.render('studio', {
    mode: 'studio',
    defaults: getDefaultColors(),
    ELEMENT_GROUPS,
    COVERAGE_MAP,
    CLUSTERS,
    VU_METER_PRESETS,
    SLAVE_MAP,
    ARCHETYPES,
    ARCHETYPE_LIST
  });
});

app.post('/api/render-preview', previewLimiter, csrfProtection, async (req, res) => {
  try {
    const { elementColorMap } = req.body;
    if (!elementColorMap || Object.keys(elementColorMap).length === 0) {
      return res.status(400).json({ success: false, error: 'No colors provided' });
    }

    // Normalize: ensure values are [r,g,b] arrays
    const normalized = {};
    for (const [name, val] of Object.entries(elementColorMap)) {
      if (Array.isArray(val) && val.length === 3) {
        normalized[name] = val;
      } else if (typeof val === 'string') {
        const hex = val.replace('#', '');
        normalized[name] = [
          parseInt(hex.substring(0, 2), 16),
          parseInt(hex.substring(2, 4), 16),
          parseInt(hex.substring(4, 6), 16)
        ];
      }
    }

    const slug = 'creator-' + Date.now();
    const previewDir = path.join('public/uploads/previews', slug);

    const previews = await generatePreviews(normalized, previewDir);
    const views = Object.keys(previews);

    // Build URLs relative to public dir
    const previewUrls = {};
    for (const [view, filePath] of Object.entries(previews)) {
      previewUrls[view] = '/uploads/previews/' + slug + '/' + path.basename(filePath);
    }

    res.json({ success: true, previewSlug: slug, views, previews: previewUrls });
  } catch (err) {
    console.error('Preview render error:', err);
    res.status(500).json({ success: false, error: process.env.NODE_ENV === 'production' ? 'Internal error' : err.message });
  }
});

app.post('/api/download-xrnc', downloadLimiter, csrfProtection, (req, res) => {
  try {
    const { elementColorMap } = req.body;
    if (!elementColorMap || Object.keys(elementColorMap).length === 0) {
      return res.status(400).json({ error: 'No colors provided' });
    }

    // Normalize
    const normalized = {};
    for (const [name, val] of Object.entries(elementColorMap)) {
      if (Array.isArray(val) && val.length === 3) {
        normalized[name] = val;
      } else if (typeof val === 'string') {
        const hex = val.replace('#', '');
        normalized[name] = [
          parseInt(hex.substring(0, 2), 16),
          parseInt(hex.substring(2, 4), 16),
          parseInt(hex.substring(4, 6), 16)
        ];
      }
    }

    const xrnc = generateXrnc(normalized);
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', 'attachment; filename="my-theme.xrnc"');
    res.send(xrnc);
  } catch (err) {
    console.error('XRNC generation error:', err);
    res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'Internal error' : err.message });
  }
});

// ── Save Theme (from creator, saves to user's profile) ──────────

app.post('/api/save-theme', requireAuth, previewLimiter, csrfProtection, async (req, res) => {
  try {
    const { name, elementColorMap } = req.body;
    if (!elementColorMap || Object.keys(elementColorMap).length === 0) {
      return res.status(400).json({ success: false, error: 'No colors provided' });
    }

    const displayName = (name || '').trim().substring(0, 100) || 'Untitled Theme';
    const author = req.session.user.username;

    // Normalize colors
    const normalized = {};
    for (const [name, val] of Object.entries(elementColorMap)) {
      if (Array.isArray(val) && val.length === 3) {
        normalized[name] = val;
      } else if (typeof val === 'string') {
        const hex = val.replace('#', '');
        normalized[name] = [
          parseInt(hex.substring(0, 2), 16),
          parseInt(hex.substring(2, 4), 16),
          parseInt(hex.substring(4, 6), 16)
        ];
      }
    }

    // Generate XRNC file
    const xrnc = generateXrnc(normalized);
    const ts = Date.now();
    const filename = `${ts}-${author}.xrnc`;
    const themesDir = path.join(__dirname, 'public/uploads/themes');
    const filePath = path.join(themesDir, filename);
    fs.writeFileSync(filePath, xrnc);

    // Parse for metadata
    const parsed = parseThemeFile(filePath);
    const { tags, stats } = categorizeColors(parsed.weighted);

    // Palette SVG
    const palettesDir = path.join(__dirname, 'public/uploads/palettes');
    const paletteName = filename.replace('.xrnc', '.svg');
    generatePaletteSVG(parsed.weighted, path.join(palettesDir, paletteName));

    // Previews
    const previewSlug = filename.replace('.xrnc', '');
    const previewDir = path.join(__dirname, 'public/uploads/previews', previewSlug);
    let previewViews = [];
    let previewError = null;
    try {
      const previews = await generatePreviews(parsed.elementColorMap, previewDir);
      previewViews = Object.keys(previews);
      if (previewViews.length < 3) {
        previewError = `Partial render: ${previewViews.length}/3 views succeeded`;
      }
    } catch (err) {
      previewError = err.message;
    }

    const topColors = parsed.weighted.slice(0, 6).map(c => ({
      hex: c.hex, weight: c.weight, roles: c.roles
    }));

    const themeId = saveTheme({
      name: displayName,
      filename,
      originalName: `${author}-theme.xrnc`,
      author,
      description: '',
      screenshots: [],
      paletteSVG: `/uploads/palettes/${paletteName}`,
      previewSlug,
      previewViews,
      previewError,
      totalColorEntries: parsed.totalColors,
      stats, tags, topColors,
      status: 'draft'
    });

    // Retrieve the saved theme to get its slug
    const savedTheme = getTheme(themeId);
    invalidateMarquee();

    res.json({ success: true, slug: savedTheme.slug, id: themeId });
  } catch (err) {
    console.error('Save theme error:', err);
    res.status(500).json({ success: false, error: process.env.NODE_ENV === 'production' ? 'Internal error' : err.message });
  }
});

// ===================== PAGES =====================

app.get('/', (req, res) => {
  const filterTag = req.query.tag || null;
  const searchQuery = (req.query.q || '').trim();
  const sort = req.query.sort || 'newest';

  let themes, totalCount;
  if (searchQuery) {
    themes = searchThemes(searchQuery.toLowerCase(), filterTag, 0, PAGE_SIZE);
    totalCount = countSearchThemes(searchQuery.toLowerCase(), filterTag);
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

app.post('/upload', requireAuth, uploadLimiter, csrfProtection,
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
    const author = (req.body.author || 'Anonymous').trim().substring(0, 50) || 'Anonymous';
    const description = (req.body.description || '').trim().substring(0, 2000);
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

      const publishNow = req.body.publish === 'on';
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
        stats, tags, topColors,
        status: publishNow ? 'published' : 'draft'
      });

      const savedTheme = getTheme(themeId);
      invalidateMarquee();
      console.log(`💾 Saved theme #${themeId} with ${screenshots.length} screenshot(s), ${previewViews.length} preview(s)`);
      res.redirect(`/theme/${savedTheme.slug || themeId}`);

    } catch (err) {
      console.error('❌ Parse error:', err);
      res.render('upload', { error: `Could not parse theme: ${err.message}`, success: null });
    }
  }
);

app.get('/theme/:slug', (req, res) => {
  try {
    const theme = getThemeBySlug(req.params.slug);
    if (!theme) {
      if (/^\d+$/.test(req.params.slug)) {
        const legacyTheme = getTheme(Number(req.params.slug));
        if (legacyTheme) return res.redirect(301, `/theme/${legacyTheme.slug || legacyTheme.id}`);
      }
      return res.status(404).send('Theme not found');
    }

    // Only the author and admins can view draft/unpublished themes
    const isAuthor = req.session.user && req.session.user.username === theme.author;
    const isAdmin = req.session.user && req.session.user.rank_level >= 10;
    if (theme.status === 'draft' && !isAuthor && !isAdmin) {
      return res.status(404).send('Theme not found');
    }

    const comments = getThemeComments(theme.id);
    const ogImage = theme.previewSlug && theme.previewViews && theme.previewViews.includes('pattern')
      ? `${req.protocol}://${req.get('host')}/uploads/previews/${theme.previewSlug}/pattern.png?t=${Date.parse(theme.uploaded_at) || Date.now()}`
      : null;
    res.render('detail', { theme, comments, ogImage });
  } catch (err) {
    console.error('Detail page error:', err);
    res.status(500).send('Internal server error');
  }
});

app.get('/download/:slug', downloadLimiter, (req, res) => {
  const theme = getThemeBySlug(req.params.slug);
  if (!theme) {
    if (/^\d+$/.test(req.params.slug)) {
      const legacyTheme = getTheme(Number(req.params.slug));
      if (legacyTheme) return res.redirect(301, `/download/${legacyTheme.slug || legacyTheme.id}`);
    }
    return res.status(404).send('Theme not found');
  }
  // Only allow download of published themes, unless you're the author or admin
  const isAuthor = req.session.user && req.session.user.username === theme.author;
  const isAdmin = req.session.user && req.session.user.rank_level >= 10;
  if (theme.status === 'draft' && !isAuthor && !isAdmin) {
    return res.status(404).send('Theme not found');
  }
  trackDownload(theme.id);
  const filePath = path.join(__dirname, 'public/uploads/themes', theme.filename);
  res.download(filePath, theme.original_name);
});

// ===================== API =====================

app.post('/api/themes/:id/like', requireAuth, likeLimiter, csrfProtection, (req, res) => {
  res.json({ likes: likeTheme(Number(req.params.id)) });
});

app.post('/api/themes/:id/unlike', requireAuth, likeLimiter, csrfProtection, (req, res) => {
  res.json({ likes: unlikeTheme(Number(req.params.id)) });
});

app.post('/theme/:slug/comment', requireAuth, commentLimiter, csrfProtection, (req, res) => {
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
// ── Feedback ──────────────────────────────────────────

app.get('/feedback', (req, res) => {
  res.render('feedback', { success: null, error: null });
});

app.post('/feedback', (req, res) => {
  const { name, email, message } = req.body;
  if (!message || !message.trim()) {
    return res.render('feedback', { error: 'Message is required', success: null });
  }
  try {
    insertFeedback(name, email, message);
    res.render('feedback', { success: 'Thanks! Your feedback has been received.', error: null });
  } catch (err) {
    console.error('Feedback error:', err);
    res.render('feedback', { error: 'Something went wrong. Please try again.', success: null });
  }
});

app.get('/admin/feedback', requireAdmin, (req, res) => {
  const filter = req.query.filter || 'all';
  const items = filter === 'all' ? getFeedback(null) : filter === 'unread' ? getFeedback('unread') : getFeedback('read');
  res.render('admin-feedback', { items, filter });
});

app.post('/admin/feedback/:id/read', requireAdmin, (req, res) => {
  markFeedbackRead(Number(req.params.id));
  res.redirect('/admin/feedback?filter=' + (req.query.redirect || 'all'));
});

// ── Email Verification ─────────────────────────────────

app.get('/verify-email/:token', async (req, res) => {
  const ok = verifyEmailToken(req.params.token);
  if (ok) {
    res.render('login', { success: 'Email verified! You can now log in.', error: null });
  } else {
    res.render('login', { error: 'Invalid or expired verification link.', success: null });
  }
});

// ── Resend Verification Email ─────────────────────────

app.post('/resend-verification', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.render('login', { error: 'Email is required', success: null });

  const user = db.prepare('SELECT id, username, email, email_verified FROM users WHERE email = ?').get(email);
  if (!user) return res.render('login', { error: 'No account found with that email.', success: null });
  if (user.email_verified) return res.render('login', { success: 'Email already verified! You can log in.', error: null });

  const verifyToken = crypto.randomBytes(32).toString('hex');
  createVerificationToken(user.id, verifyToken);
  const verifyUrl = req.protocol + '://' + req.get('host') + '/verify-email/' + verifyToken;

  const sent = sendVerificationEmail(user.email, user.username, verifyUrl).then(() => true).catch(() => false);
  // Don't await — show message immediately
  res.render('login', {
    success: 'Verification email resent to <strong>' + user.email + '</strong>. Check your inbox.',
    error: null
  });
});

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

// ── Periodic cleanup: old creator preview dirs ─────────
function cleanupOldCreatorPreviews() {
  const previewsDir = path.join(__dirname, 'public/uploads/previews');
  if (!fs.existsSync(previewsDir)) return;
  const cutoff = Date.now() - 2 * 60 * 60 * 1000; // 2 hours
  let cleaned = 0;
  for (const entry of fs.readdirSync(previewsDir)) {
    if (!entry.startsWith('creator-')) continue;
    const fullPath = path.join(previewsDir, entry);
    try {
      const stat = fs.statSync(fullPath);
      if (stat.mtimeMs < cutoff) {
        fs.rmSync(fullPath, { recursive: true, force: true });
        cleaned++;
      }
    } catch (e) { /* ignore */ }
  }
  if (cleaned) console.log(`🧹 Cleaned ${cleaned} old creator preview dir(s)`);
}
setInterval(cleanupOldCreatorPreviews, 30 * 60 * 1000); // every 30 min
cleanupOldCreatorPreviews(); // run once at startup

// ── Deploy webhook ─────────────────────────────────────
const deployLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: 'Too many deploy requests',
  standardHeaders: true,
  legacyHeaders: false,
});

app.post('/deploy', deployLimiter, express.json(), async (req, res) => {
  const secret = process.env.DEPLOY_SECRET;
  if (!secret) {
    return res.status(503).json({ error: 'Deploy not configured' });
  }
  const auth = req.headers['x-deploy-secret'];
  // Timing-safe comparison to prevent brute-force timing attacks
  if (!auth || auth.length !== secret.length || !crypto.timingSafeEqual(Buffer.from(auth), Buffer.from(secret))) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('🚀 Deploy webhook triggered');
  res.json({ success: true, message: 'Deploy triggered' });

  // Run deploy in background so response returns immediately
  const { spawn } = await import('child_process');
  const deploy = spawn('bash', ['/var/www/renoisethemes/ops/deploy.sh'], {
    detached: true,
    stdio: 'inherit'
  });
  deploy.unref();
});

// ── Start server ───────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server running at http://localhost:${PORT}`));
