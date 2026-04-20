document.addEventListener('DOMContentLoaded', () => {

  function showToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg; t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2000);
  }

  // ── Search ─────────────────────────────
  const si = document.getElementById('searchInput');
  const grid = document.getElementById('themeGrid');
  const tc = document.getElementById('themeCount');

  if (si && grid) {
    si.addEventListener('input', () => {
      const q = si.value.toLowerCase().trim();
      let v = 0;
      grid.querySelectorAll('.theme-card').forEach(c => {
        const m = !q || [c.dataset.name, c.dataset.author, c.dataset.tags].some(d => (d||'').includes(q));
        c.classList.toggle('hidden', !m);
        if (m) v++;
      });
      if (tc) tc.textContent = `${v} theme${v !== 1 ? 's' : ''}`;
    });
  }

  // ── Infinite scroll ────────────────────
  const sentinel = document.getElementById('loadMoreSentinel');
  if (grid && sentinel) {
    let loading = false;
    let done = false;
    let loaded = parseInt(grid.dataset.loaded, 10) || 0;
    const total = parseInt(grid.dataset.total, 10) || 0;
    const tag = grid.dataset.tag || '';
    const q = grid.dataset.q || '';
    const sort = grid.dataset.sort || 'newest';

    if (q || loaded >= total) {
      sentinel.remove();
      done = true;
    }

    const loadMore = async () => {
      if (loading || done) return;
      loading = true;
      sentinel.classList.add('loading');
      try {
        const params = new URLSearchParams({ offset: String(loaded), limit: '24', sort });
        if (tag) params.set('tag', tag);
        const r = await fetch('/api/themes?' + params.toString());
        const data = await r.json();
        if (data.count > 0) {
          grid.insertAdjacentHTML('beforeend', data.html);
          loaded += data.count;
          if (tc) tc.textContent = `${loaded} theme${loaded !== 1 ? 's' : ''}`;
        }
        if (data.count < 24 || loaded >= total) {
          done = true;
          sentinel.remove();
        }
      } catch (e) { console.error('Load more failed', e); }
      loading = false;
      sentinel.classList.remove('loading');
    };

    const obs = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) loadMore();
    }, { rootMargin: '400px' });
    obs.observe(sentinel);
  }

  // ── Like ───────────────────────────────
  const likeBtn = document.getElementById('likeBtn');
  if (likeBtn) {
    const id = likeBtn.dataset.id;
    const icon = document.getElementById('likeIcon');
    const cnt = document.getElementById('likeCount');
    const strip = document.getElementById('likeCountStrip');
    const store = JSON.parse(localStorage.getItem('likedThemes') || '{}');
    let liked = !!store[id];

    const sync = () => { likeBtn.classList.toggle('liked', liked); icon.textContent = liked ? '❤️' : '🤍'; };
    sync();

    likeBtn.addEventListener('click', async () => {
      try {
        const r = await fetch(`/api/themes/${id}/${liked ? 'unlike' : 'like'}`, { method: 'POST' });
        const d = await r.json();
        liked = !liked;
        if (liked) store[id] = true; else delete store[id];
        localStorage.setItem('likedThemes', JSON.stringify(store));
        cnt.textContent = d.likes;
        if (strip) strip.textContent = d.likes;
        sync();
        likeBtn.style.transform = 'scale(1.15)';
        setTimeout(() => likeBtn.style.transform = '', 150);
        showToast(liked ? 'Liked! ❤️' : 'Unliked');
      } catch (e) { console.error(e); }
    });
  }

  // ── Share ──────────────────────────────
  const shareBtn = document.getElementById('shareBtn');
  if (shareBtn) {
    shareBtn.addEventListener('click', async () => {
      const url = window.location.href;
      if (navigator.share) { try { await navigator.share({ title: document.title, url }); return; } catch(e) {} }
      try { await navigator.clipboard.writeText(url); } catch(e) {
        const i = document.createElement('input'); i.value = url;
        document.body.appendChild(i); i.select(); document.execCommand('copy'); document.body.removeChild(i);
      }
      showToast('Link copied! 📋');
    });
  }

  // ── Copy color ─────────────────────────
  document.querySelectorAll('.sb-color').forEach(el => {
    el.addEventListener('click', async () => {
      const c = el.dataset.color; if (!c) return;
      try { await navigator.clipboard.writeText(c); } catch(e) {}
      showToast(`Copied ${c}`);
    });
  });

  // ── Gallery → swap hero ────────────────
  const hero = document.getElementById('heroImage');
  document.querySelectorAll('.gallery-thumb').forEach(t => {
    t.addEventListener('click', () => {
      if (hero && t.dataset.src) {
        hero.src = t.dataset.src;
        document.querySelectorAll('.gallery-thumb').forEach(g => g.classList.remove('gallery-active'));
        t.classList.add('gallery-active');
      }
    });
  });

  // ── Lightbox ───────────────────────────
  const lbox = document.getElementById('lightbox');
  const limg = document.getElementById('lightboxImg');

  if (hero && lbox) {
    hero.addEventListener('click', () => { limg.src = hero.src; lbox.classList.add('open'); });
  }
  document.querySelectorAll('.gallery-thumb').forEach(t => {
    t.addEventListener('dblclick', () => {
      if (lbox && limg && t.dataset.src) { limg.src = t.dataset.src; lbox.classList.add('open'); }
    });
  });
  if (lbox) {
    lbox.addEventListener('click', () => lbox.classList.remove('open'));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') lbox.classList.remove('open'); });
  }

  // ══════════════════════════════════════
  // UPLOAD PAGE — fixed click + fast preview
  // ══════════════════════════════════════

  // ── Theme file: click drop zone → open file picker (1 click!) ──
  const dropZone = document.getElementById('dropZone');
  const themeInput = document.getElementById('theme');
  const fileName = document.getElementById('fileName');

  if (dropZone && themeInput) {
    // Single click opens file browser
    dropZone.addEventListener('click', () => themeInput.click());

    // Drag & drop
    ['dragenter', 'dragover'].forEach(e =>
      dropZone.addEventListener(e, ev => { ev.preventDefault(); dropZone.classList.add('drag-over'); })
    );
    ['dragleave', 'drop'].forEach(e =>
      dropZone.addEventListener(e, ev => { ev.preventDefault(); dropZone.classList.remove('drag-over'); })
    );
    dropZone.addEventListener('drop', e => {
      const files = e.dataTransfer.files;
      if (files.length) {
        themeInput.files = files;
        showThemeFile(files[0].name);
      }
    });

    // When file is picked via dialog
    themeInput.addEventListener('change', () => {
      if (themeInput.files.length) showThemeFile(themeInput.files[0].name);
    });

    function showThemeFile(name) {
      if (fileName) fileName.textContent = '📄 ' + name;
      dropZone.classList.add('has-file');
    }
  }

  // ── Screenshots: click picker → open dialog, instant preview ──
  const ssPicker = document.getElementById('ssPicker');
  const ssInput = document.getElementById('screenshots');
  const ssPreview = document.getElementById('screenshotPreview');

  if (ssPicker && ssInput) {
    ssPicker.addEventListener('click', () => ssInput.click());

    ssInput.addEventListener('change', () => {
      if (!ssPreview) return;
      ssPreview.innerHTML = '';

      // Use createObjectURL — instant, no FileReader blocking
      const files = Array.from(ssInput.files).slice(0, 5);
      files.forEach((file, i) => {
        const url = URL.createObjectURL(file);
        const wrap = document.createElement('div');
        wrap.className = 'ss-thumb';
        if (i === 0) wrap.classList.add('ss-main');

        const img = document.createElement('img');
        img.src = url;
        img.onload = () => URL.revokeObjectURL(url); // free memory after loaded

        const label = document.createElement('span');
        label.textContent = i === 0 ? 'Main' : `#${i + 1}`;

        wrap.appendChild(img);
        wrap.appendChild(label);
        ssPreview.appendChild(wrap);
      });

      ssPicker.querySelector('span').textContent = `📸 ${files.length} screenshot${files.length !== 1 ? 's' : ''} selected`;
    });
  }

  // ── Upload loading state ───────────────
  const form = document.getElementById('uploadForm');
  const subBtn = document.getElementById('submitBtn');
  if (form && subBtn) {
    form.addEventListener('submit', () => { subBtn.disabled = true; subBtn.textContent = '⏳ Analyzing...'; });
  }

});

// ── Preview tab switching ─────────────
document.querySelectorAll('.preview-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.preview-tab').forEach(t => t.classList.remove('preview-tab-active'));
    document.querySelectorAll('.preview-render').forEach(i => i.classList.remove('preview-render-active'));
    tab.classList.add('preview-tab-active');
    document.getElementById('preview-' + tab.dataset.view).classList.add('preview-render-active');
  });
});

// ── Featured Scroller ───────────────────────
const track = document.getElementById('featuredTrack');
if (track) {
  const inner = track.querySelector('.scroller-inner');
  const itemWidth = 220 + 16;
  let currentIndex = 0;

  track.addEventListener('mousedown', e => {
    track.classList.add('dragging');
    track.dataset.startX = e.pageX - track.offsetLeft;
    track.dataset.scrollLeft = track.scrollLeft;
  });
  track.addEventListener('mouseleave', () => track.classList.remove('dragging'));
  track.addEventListener('mouseup', () => track.classList.remove('dragging'));
  track.addEventListener('mousemove', e => {
    if (!track.classList.contains('dragging')) return;
    e.preventDefault();
    const x = e.pageX - track.offsetLeft;
    const walk = (x - parseFloat(track.dataset.startX)) * 1.5;
    track.scrollLeft = parseFloat(track.dataset.scrollLeft) - walk;
  });

  document.querySelector('.scroller-prev')?.addEventListener('click', () => {
    currentIndex = Math.max(0, currentIndex - 1);
    track.scrollTo({ left: currentIndex * itemWidth, behavior: 'smooth' });
  });
  document.querySelector('.scroller-next')?.addEventListener('click', () => {
    const maxScroll = track.scrollWidth - track.clientWidth;
    currentIndex = Math.min(currentIndex + 1, Math.floor(maxScroll / itemWidth));
    track.scrollTo({ left: currentIndex * itemWidth, behavior: 'smooth' });
  });
}

// ── Header Search ───────────────────────────
const hsi = document.getElementById('headerSearchInput');
if (hsi) {
  hsi.addEventListener('keydown', e => {
    if (e.key === 'Enter' && hsi.value.trim()) {
      window.location.href = '/?q=' + encodeURIComponent(hsi.value.trim());
    }
  });
}
