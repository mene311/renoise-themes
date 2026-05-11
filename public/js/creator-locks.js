/**
 * Lock System for Renoise Theme Creator.
 *
 * Lets users pin individual colors (or whole groups) so Random
 * iterations preserve them while the rest of the palette scrambles.
 *
 * Depends on window.__creator.lockedElements (Set<string> from creator.js).
 * Load after creator.js, before creator-palette.js.
 */

document.addEventListener('DOMContentLoaded', () => {
  const creator = window.__creator;
  if (!creator || !creator.form) return;

  const { form, lockedElements } = creator;

  // ── Helpers ──────────────────────────────────

  function isLocked(el) {
    return lockedElements.has(el);
  }

  function toggleLock(el) {
    if (lockedElements.has(el)) {
      lockedElements.delete(el);
    } else {
      lockedElements.add(el);
    }
    syncLockUI();
    updateRandomBtn();
  }

  function toggleGroup(groupId) {
    const details = document.querySelector(`details[data-group-id="${CSS.escape(groupId)}"]`);
    if (!details) return;
    const lockBtns = details.querySelectorAll('.lock-btn');
    const allLocked = Array.from(lockBtns).every(btn => isLocked(btn.dataset.lockEl));

    for (const btn of lockBtns) {
      if (allLocked) {
        lockedElements.delete(btn.dataset.lockEl);
      } else {
        lockedElements.add(btn.dataset.lockEl);
      }
    }
    syncLockUI();
    updateRandomBtn();
  }

  // ── Sync: push Set state → DOM ───────────────

  function syncLockUI() {
    // Per-element lock buttons + swatch visual
    form.querySelectorAll('input[data-element]').forEach(input => {
      const el = input.dataset.element;
      const swatch = document.querySelector(`.color-swatch[data-el="${CSS.escape(el)}"]`);
      const lockBtn = document.querySelector(`.lock-btn[data-lock-el="${CSS.escape(el)}"]`);

      if (swatch) {
        swatch.classList.toggle('locked', isLocked(el));
      }
      if (lockBtn) {
        lockBtn.textContent = isLocked(el) ? '🔒' : '🔓';
        lockBtn.classList.toggle('lock-btn--locked', isLocked(el));
        lockBtn.title = isLocked(el) ? 'Unpin color' : 'Pin color';
      }
    });

    // Group summary buttons — compute state from child lock buttons
    document.querySelectorAll('details[data-group-id]').forEach(details => {
      const btn = details.querySelector('.group-lock-btn');
      if (!btn) return;
      const lockBtns = details.querySelectorAll('.lock-btn');
      const lockedCount = Array.from(lockBtns).filter(b => isLocked(b.dataset.lockEl)).length;
      const total = lockBtns.length;

      btn.classList.remove('group-lock-btn--partial', 'group-lock-btn--all');
      if (lockedCount === 0) {
        btn.textContent = '🔓';
        btn.title = 'Lock all';
      } else if (lockedCount === total) {
        btn.textContent = '🔒';
        btn.title = 'Unlock all';
        btn.classList.add('group-lock-btn--all');
      } else {
        btn.textContent = '🔐';
        btn.title = 'Lock all';
        btn.classList.add('group-lock-btn--partial');
      }
    });
  }

  // ── Random button state ──────────────────────

  function updateRandomBtn() {
    const randomBtn = document.getElementById('paletteRandom');
    if (!randomBtn) return;

    // Count lockable elements (any swatch that has a lock-btn)
    const totalLockable = document.querySelectorAll('.lock-btn').length;
    const totalLocked = lockedElements.size;

    if (totalLockable > 0 && totalLocked >= totalLockable) {
      randomBtn.disabled = true;
      randomBtn.textContent = '🎲 All pinned';
    } else if (totalLocked > 0) {
      randomBtn.disabled = false;
      randomBtn.textContent = `🎲 Randomize (${totalLocked} pinned)`;
    } else {
      randomBtn.disabled = false;
      randomBtn.textContent = '🎲 Randomize';
    }
  }

  function clearAllLocks() {
    lockedElements.clear();
    syncLockUI();
    updateRandomBtn();
  }

  // ── Keyboard shortcut ────────────────────────

  document.addEventListener('keydown', (e) => {
    // L toggles lock on active swatch when wheel is open
    if ((e.key === 'l' || e.key === 'L') &&
        document.querySelector('.wheel-panel--visible')) {
      const activeSwatch = document.querySelector('.color-swatch.active');
      if (activeSwatch && activeSwatch.dataset.el) {
        e.preventDefault();
        toggleLock(activeSwatch.dataset.el);
      }
    }
  });

  // ── Event Delegation ─────────────────────────

  // Per-element lock toggle
  form.addEventListener('click', (e) => {
    const lockBtn = e.target.closest('.lock-btn');
    if (lockBtn && lockBtn.dataset.lockEl) {
      e.preventDefault();
      toggleLock(lockBtn.dataset.lockEl);
    }
  });

  // Group lock toggle
  document.querySelectorAll('.group-lock-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      toggleGroup(btn.dataset.lockGroup);
    });
  });

  // ── Expose on __creator for preset hooks & color-wheel auto-unlock ──

  creator.isLocked = isLocked;
  creator.toggleLock = toggleLock;
  creator.clearAllLocks = clearAllLocks;

  // ── Initial sync ─────────────────────────────

  syncLockUI();
  updateRandomBtn();
});
