import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseThemeFile } from './lib/parser.js';
import { categorizeColors } from './lib/categorize.js';
import { generatePaletteSVG } from './lib/palette.js';
import { generatePreviews } from './lib/preview-renderer.js';
import {
  saveTheme, listThemes, getTheme, listTags,
  likeTheme, unlikeTheme, trackDownload,
  addComment, getThemeComments, getFeaturedThemes
} from './lib/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'templates'));
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Upload config ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'theme') cb(null, 'public/uploads/themes');
    else if (file.fieldname === 'screenshots') cb(null, 'public/uploads/screenshots');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1000) + '-' + file.originalname);
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

// ===================== PAGES =====================

app.get('/', (req, res) => {
  const filterTag = req.query.tag || null;
  const searchQuery = (req.query.q || '').trim();
  const sort = req.query.sort || 'newest';

  let themes = listThemes(filterTag, sort);

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    themes = themes.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.author.toLowerCase().includes(q) ||
      t.tags.some(tag => tag.includes(q))
    );
  }

  const allTags = listTags();
  const featured = (!filterTag && !searchQuery && sort === 'newest')
    ? getFeaturedThemes() : [];

  res.render('index', { themes, allTags, filterTag, searchQuery, sort, featured });
});

app.get('/upload', (req, res) => {
  res.render('upload', { error: null, success: null });
});

app.post('/upload',
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
    const displayName = path.basename(themeFile.originalname, path.extname(themeFile.originalname));

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

      const topColors = parsed.weighted.slice(0, 6).map(c => ({
        hex: c.hex, weight: c.weight, roles: c.roles
      }));

      // Generate Renoise UI previews
      const previewSlug = themeFile.filename.replace(/\.[^.]+$/, '');
      const previewDir = path.join('public/uploads/previews', previewSlug);
      let previewViews = [];
      try {
        const previews = await generatePreviews(themeFile.path, previewDir);
        previewViews = Object.keys(previews);
        console.log(`🖼️  Generated ${previewViews.length} preview renders`);
      } catch (err) {
        console.warn('⚠️  Preview generation failed:', err.message);
      }

      const screenshots = screenshotFiles.map(f => f.filename);

      const themeId = saveTheme({
        name: displayName,
        filename: themeFile.filename,
        originalName: themeFile.originalname,
        author, description, screenshots,
        paletteSVG: `/uploads/palettes/${paletteName}`,
        previewSlug,
        previewViews,
        stats, tags, topColors
      });

      console.log(`💾 Saved theme #${themeId} with ${screenshots.length} screenshot(s), ${previewViews.length} preview(s)`);
      res.redirect(`/theme/${themeId}`);

    } catch (err) {
      console.error('❌ Parse error:', err);
      res.render('upload', { error: `Could not parse theme: ${err.message}`, success: null });
    }
  }
);

app.get('/theme/:id', (req, res) => {
  const theme = getTheme(Number(req.params.id));
  if (!theme) return res.status(404).send('Theme not found');
  const comments = getThemeComments(theme.id);
  res.render('detail', { theme, comments });
});

app.get('/download/:id', (req, res) => {
  const theme = getTheme(Number(req.params.id));
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

app.post('/theme/:id/comment', (req, res) => {
  const themeId = Number(req.params.id);
  const { author, message } = req.body;
  if (!message || !message.trim()) return res.redirect(`/theme/${themeId}`);
  addComment(themeId, author || 'Anonymous', message.trim());
  res.redirect(`/theme/${themeId}`);
});

// Multer error handler
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err.message) {
    return res.render('upload', { error: err.message, success: null });
  }
  next(err);
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server running at http://localhost:${PORT}`));
