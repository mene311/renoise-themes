document.addEventListener('DOMContentLoaded', () => {
// Welcome banner — shown once per visitor  (() => {    const banner = document.getElementById("welcomeBanner");    const closeBtn = document.getElementById("closeWelcome");    if (banner && closeBtn && !localStorage.getItem("welcomeDismissed")) {      banner.hidden = false;      closeBtn.addEventListener("click", () => {        banner.hidden = true;        localStorage.setItem("welcomeDismissed", "1");      });    }  })();

  // ════════════════════════════════════════════
  // UTILITIES
  // ════════════════════════════════════════════

  function showToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2000);
  }

  // ════════════════════════════════════════════
  // DYNAMIC ACCENT COLOR (detail page)
  // ════════════════════════════════════════════
  const detailLayout = document.querySelector('.detail-layout[data-accent]');
  if (detailLayout) {
    const accent = detailLayout.dataset.accent;
    if (accent) document.body.dataset.accent = accent;
  }

  // ════════════════════════════════════════════
  // KEYBOARD NAVIGATION (theme list)
  // ════════════════════════════════════════════
  const themeGrid = document.getElementById('themeGrid');
  let focusedRowIndex = -1;

  function getVisibleRows() {
    if (!themeGrid) return [];
    return Array.from(themeGrid.querySelectorAll('.theme-card:not(.hidden)'));
  }

  function focusRow(index) {
    const rows = getVisibleRows();
    if (!rows.length) return;
    // Clamp index
    if (index < 0) index = 0;
    if (index >= rows.length) index = rows.length - 1;
    focusedRowIndex = index;
    rows.forEach((r, i) => {
      r.classList.toggle('active-row', i === index);
      if (i === index) {
        r.focus();
        r.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    });
  }

  function bindRowHandlers() {
    if (!themeGrid) return;
    const rows = getVisibleRows();
    rows.forEach((row, i) => {
      if (row.dataset.bound === '1') return;
      row.dataset.bound = '1';
      row.setAttribute('tabindex', '0');
      row.addEventListener('click', () => {
        focusedRowIndex = i;
        getVisibleRows().forEach((r, j) => r.classList.toggle('active-row', j === i));
      });
      row.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); focusRow(focusedRowIndex + 1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); focusRow(focusedRowIndex - 1); }
        else if (e.key === 'Enter') { window.location.href = row.href; }
      });
    });
  }

  if (themeGrid) {
    bindRowHandlers();

    document.addEventListener('keydown', (e) => {
      // Ignore if inside an input/textarea
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return;

      if (e.key === '/') {
        e.preventDefault();
        const searchInput = document.getElementById('searchInput');
        if (searchInput) searchInput.focus();
      }
      if (e.key === 'ArrowDown' && focusedRowIndex === -1 && getVisibleRows().length) {
        e.preventDefault();
        focusRow(0);
      }
    });
  }

  // ════════════════════════════════════════════
  // SEARCH (client-side filter on index)
  // ════════════════════════════════════════════
  const si = document.getElementById('searchInput');
  const tc = document.getElementById('themeCount');

  if (si && themeGrid) {
    si.addEventListener('input', () => {
      const q = si.value.toLowerCase().trim();
      let v = 0;
      const rows = themeGrid.querySelectorAll('.theme-card');
      rows.forEach(r => {
        const m = !q || [r.dataset.name, r.dataset.author, r.dataset.tags].some(d => (d || '').includes(q));
        r.classList.toggle('hidden', !m);
        if (m) v++;
      });
      if (tc) tc.textContent = `${v}`;
      focusedRowIndex = -1;
      rows.forEach(r => r.classList.remove('active-row'));
    });

    si.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        si.blur();
        const rows = getVisibleRows();
        if (rows.length) rows[0].focus();
      }
    });
  }

  // ════════════════════════════════════════════
  // INFINITE SCROLL
  // ════════════════════════════════════════════
  const sentinel = document.getElementById('loadMoreSentinel');
  if (themeGrid && sentinel) {
    let loading = false;
    let done = false;
    let loaded = parseInt(themeGrid.dataset.loaded, 10) || 0;
    const total = parseInt(themeGrid.dataset.total, 10) || 0;
    const tag = themeGrid.dataset.tag || '';
    const q = themeGrid.dataset.q || '';
    const sort = themeGrid.dataset.sort || 'newest';

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
          themeGrid.insertAdjacentHTML('beforeend', data.html);
          loaded += data.count;
          if (tc) tc.textContent = `${loaded}`;
          bindRowHandlers();
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

  // ════════════════════════════════════════════
  // LIKE
  // ════════════════════════════════════════════
  const likeBtn = document.getElementById('likeBtn');
  if (likeBtn) {
    const id = likeBtn.dataset.id;
    const icon = document.getElementById('likeIcon');
    const cnt = document.getElementById('likeCount');
    const strip = document.getElementById('likeCountStrip');
    const store = JSON.parse(localStorage.getItem('likedThemes') || '{}');
    let liked = !!store[id];

    const sync = () => {
      likeBtn.classList.toggle('liked', liked);
      icon.textContent = liked ? '♥' : '♡';
    };
    sync();

    likeBtn.addEventListener('click', async () => {
      try {
        const r = await fetch(`/api/themes/${id}/${liked ? 'unlike' : 'like'}`, {
          method: 'POST',
          headers: { 'X-Requested-With': 'XMLHttpRequest' }
        });
        const d = await r.json();
        liked = !liked;
        if (liked) store[id] = true; else delete store[id];
        localStorage.setItem('likedThemes', JSON.stringify(store));
        cnt.textContent = d.likes;
        if (strip) strip.textContent = d.likes;
        sync();
        showToast(liked ? 'Liked ♥' : 'Unliked');
      } catch (e) { console.error(e); }
    });
  }

  // ════════════════════════════════════════════
  // SHARE
  // ════════════════════════════════════════════
  const shareBtn = document.getElementById('shareBtn');
  if (shareBtn) {
    shareBtn.addEventListener('click', async () => {
      const url = window.location.href;
      if (navigator.share) {
        try { await navigator.share({ title: document.title, url }); return; } catch (e) {}
      }
      try { await navigator.clipboard.writeText(url); } catch (e) {
        const i = document.createElement('input'); i.value = url;
        document.body.appendChild(i); i.select(); document.execCommand('copy'); document.body.removeChild(i);
      }
      showToast('Link copied');
    });
  }

  // ════════════════════════════════════════════
  // COPY COLOR
  // ════════════════════════════════════════════
  document.querySelectorAll('.color-swatch').forEach(el => {
    const copy = async () => {
      const c = el.dataset.color;
      if (!c) return;
      try { await navigator.clipboard.writeText(c); } catch (e) {}
      showToast(`Copied ${c}`);
    };
    el.addEventListener('click', copy);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); copy(); }
    });
  });

  // ════════════════════════════════════════════
  // GALLERY → SWAP HERO (detail page screenshot main)
  // ════════════════════════════════════════════
  const hero = document.getElementById('heroImage');
  document.querySelectorAll('.gallery-thumb').forEach(t => {
    const activate = () => {
      if (hero && t.dataset.src) {
        hero.src = t.dataset.src;
        document.querySelectorAll('.gallery-thumb').forEach(g => g.classList.remove('gallery-active'));
        t.classList.add('gallery-active');
      }
    };
    t.addEventListener('click', activate);
    t.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
    });
  });

  // ════════════════════════════════════════════
  // LIGHTBOX
  // ════════════════════════════════════════════
  const lbox = document.getElementById('lightbox');
  const limg = document.getElementById('lightboxImg');

  if (hero && lbox) {
    hero.addEventListener('click', () => { limg.src = hero.src; lbox.classList.add('open'); limg.alt = hero.alt || ''; });
  }
  document.querySelectorAll('.gallery-thumb').forEach(t => {
    t.addEventListener('dblclick', () => {
      if (lbox && limg && t.dataset.src) { limg.src = t.dataset.src; lbox.classList.add('open'); limg.alt = t.querySelector('img')?.alt || ''; }
    });
  });
  if (lbox) {
    lbox.addEventListener('click', () => lbox.classList.remove('open'));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') lbox.classList.remove('open'); });
  }

  // ════════════════════════════════════════════
  // ════════════════════════════════════════════
  // UPLOAD PAGE
  // ════════════════════════════════════════════

  // Theme file drop zone
  const dropZone = document.getElementById('dropZone');
  const themeInput = document.getElementById('theme');
  const fileName = document.getElementById('fileName');

  if (dropZone && themeInput) {
    dropZone.addEventListener('click', () => themeInput.click());
    dropZone.setAttribute('tabindex', '0');
    dropZone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); themeInput.click(); }
    });

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
    themeInput.addEventListener('change', () => {
      if (themeInput.files.length) showThemeFile(themeInput.files[0].name);
    });

    function showThemeFile(name) {
      if (fileName) fileName.textContent = '📄 ' + name;
      dropZone.classList.add('has-file');
    }
  }

  // Screenshot picker
  const ssPicker = document.getElementById('ssPicker');
  const ssInput = document.getElementById('screenshots');
  const ssPreview = document.getElementById('screenshotPreview');

  if (ssPicker && ssInput) {
    ssPicker.addEventListener('click', () => ssInput.click());
    ssPicker.setAttribute('tabindex', '0');
    ssPicker.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ssInput.click(); }
    });

    ssInput.addEventListener('change', () => {
      if (!ssPreview) return;
      ssPreview.innerHTML = '';
      const files = Array.from(ssInput.files).slice(0, 5);
      files.forEach((file, i) => {
        const url = URL.createObjectURL(file);
        const wrap = document.createElement('div');
        wrap.className = 'ss-thumb';
        if (i === 0) wrap.classList.add('ss-main');

        const img = document.createElement('img');
        img.src = url;
        img.onload = () => URL.revokeObjectURL(url);

        const label = document.createElement('span');
        label.textContent = i === 0 ? 'Main' : `#${i + 1}`;

        wrap.appendChild(img);
        wrap.appendChild(label);
        ssPreview.appendChild(wrap);
      });
      ssPicker.querySelector('span').textContent = `📸 ${files.length} screenshot${files.length !== 1 ? 's' : ''} selected`;
    });
  }

  // Upload loading state
  const uploadForm = document.getElementById('uploadForm');
  const submitBtn = document.getElementById('submitBtn');
  const progressEl = document.getElementById('uploadProgress');
  if (uploadForm && submitBtn) {
    uploadForm.addEventListener('submit', () => {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Processing…';
      if (progressEl) {
        progressEl.style.display = 'block';
        const steps = progressEl.querySelectorAll('.progress-step');
        if (steps.length >= 1) { setTimeout(() => steps[0].classList.add('active'), 300); }
        if (steps.length >= 2) { setTimeout(() => steps[1].classList.add('active'), 1500); }
        if (steps.length >= 3) { setTimeout(() => steps[2].classList.add('active'), 3000); }
      }
    });
  }

  // ════════════════════════════════════════════
  // PREVIEW TAB SWITCHING (lazy load)
  // ════════════════════════════════════════════
  document.querySelectorAll('.preview-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const view = tab.dataset.view;
      const img = document.getElementById('preview-' + view);
      if (img && img.dataset.src && img.src !== img.dataset.src) {
        img.src = img.dataset.src;
      }
      document.querySelectorAll('.preview-tab').forEach(t => {
        t.classList.remove('preview-tab-active');
        t.setAttribute('aria-selected', 'false');
      });
      document.querySelectorAll('.preview-render').forEach(i => i.classList.remove('preview-render-active'));
      tab.classList.add('preview-tab-active');
      tab.setAttribute('aria-selected', 'true');
      if (img) img.classList.add('preview-render-active');
    });
  });

  // ════════════════════════════════════════════
  // FEATURED SCROLLER
  // ════════════════════════════════════════════
  const track = document.getElementById('featuredTrack');
  if (track) {
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

  // ════════════════════════════════════════════
  // HEADER SEARCH
  // ════════════════════════════════════════════
  const hsi = document.getElementById('headerSearchInput');
  if (hsi) {
    hsi.addEventListener('keydown', e => {
      if (e.key === 'Enter' && hsi.value.trim()) {
        window.location.href = '/?q=' + encodeURIComponent(hsi.value.trim());
      }
    });
  }

  // ════════════════════════════════════════════
  // THEME TOGGLE (dark/light — server-side)
  // ════════════════════════════════════════════
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const currentTheme = document.documentElement.dataset.theme;
      const nextTheme = currentTheme === 'light' ? 'dark' : 'light';
      window.location.href = '/set-theme/' + nextTheme;
    });
  }

});
