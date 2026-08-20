// playlist-resizer.js
// Enables grab-and-resize behavior for the #playlist sidebar.

(function () {
  const root = document.documentElement;
  const playlist = () => document.getElementById('playlist');
  const adjuster = () => document.getElementById('adjuster');
  const playlistCollapseBtn = document.getElementById('playlist-collapse-btn');
  const playlistSearchButton = document.getElementById('playlist-search-btn')
  const STORAGE_KEY = 'playlistWidth';

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function getSavedWidth() {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      return v ? Number(v) : null;
    } catch (e) { return null; }
  }

  function saveWidth(px) {
    try { localStorage.setItem(STORAGE_KEY, String(Math.round(px))); } catch (e) {}
  }

  function applyWidth(px) {
    root.style.setProperty('--playlist-sidebar-width', px + 'px');
  }

  function initFromStorage() {
    const w = getSavedWidth();
    if (w && !Number.isNaN(w)) applyWidth(w);
  }

  function install() {
    const adj = adjuster();
    const pls = playlist();
    if (!adj || !pls) return;

    let dragging = false;
    let startX = 0;
    let startW = 0;
    const MIN_W = 200;
    const COLLAPSED_W = 70; // width when collapsed
    const COLLAPSE_EDGE = 40; // pixels from left edge to trigger collapse
    const MAX_W = Math.max(300, Math.min(800, window.innerWidth - 200));

    playlistCollapseBtn.addEventListener('click', () => {
        if (getSavedWidth() == COLLAPSED_W) {
            localStorage.removeItem(STORAGE_KEY);
            // restore to CSS variable default via removing inline property
            root.style.removeProperty('--playlist-sidebar-width');
            pls.classList.remove('collapsed');
        } else {
            applyWidth(COLLAPSED_W);
            saveWidth(COLLAPSED_W);
            pls.classList.add('collapsed');
        }
    });

    playlistSearchButton.addEventListener('dblclick', () => {
        if (getSavedWidth() == COLLAPSED_W) {
            localStorage.removeItem(STORAGE_KEY);
            // restore to CSS variable default via removing inline property
            root.style.removeProperty('--playlist-sidebar-width');
            pls.classList.remove('collapsed');
        } else {
            applyWidth(COLLAPSED_W);
            saveWidth(COLLAPSED_W);
            pls.classList.add('collapsed');
        }
    });

    // apply saved width after constants are known so we can compare collapsed state
    initFromStorage();
    const saved = getSavedWidth();
    if (Number(saved) === COLLAPSED_W) pls.classList.add('collapsed');

    function onMove(clientX) {
      // If user drags all the way to the left edge, collapse into narrow view
      if (clientX <= COLLAPSE_EDGE) {
        applyWidth(COLLAPSED_W);
        pls.classList.add('collapsed');
        saveWidth(COLLAPSED_W);
        return;
      }

      const dx = clientX - startX;
      let newW = startW + dx;
      // prevent resizing smaller than MIN_W unless collapsed
      newW = clamp(newW, MIN_W, MAX_W);
      pls.classList.remove('collapsed');
      applyWidth(newW);
      saveWidth(newW);
    }

    function onMouseMove(e) {
      if (!dragging) return;
      onMove(e.clientX);
    }

    function onMouseUp() {
      if (!dragging) return;
      dragging = false;
      document.body.style.userSelect = '';
      adj.classList.remove('grabbing');
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }

    function onMouseDown(e) {
      dragging = true;
      startX = e.clientX;
      startW = pls.getBoundingClientRect().width;
      document.body.style.userSelect = 'none';
      adj.classList.add('grabbing');
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
      e.preventDefault();
    }

    // Touch handlers
    function onTouchMove(e) {
      if (!dragging) return;
      const t = e.touches[0];
      if (t) onMove(t.clientX);
    }

    function onTouchEnd() {
      if (!dragging) return;
      dragging = false;
      document.body.style.userSelect = '';
      adj.classList.remove('grabbing');
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    }

    function onTouchStart(e) {
      const t = e.touches[0];
      if (!t) return;
      dragging = true;
      startX = t.clientX;
      startW = pls.getBoundingClientRect().width;
      document.body.style.userSelect = 'none';
      adj.classList.add('grabbing');
      window.addEventListener('touchmove', onTouchMove, { passive: false });
      window.addEventListener('touchend', onTouchEnd);
      e.preventDefault();
    }

    adj.addEventListener('mousedown', onMouseDown);
    adj.addEventListener('touchstart', onTouchStart, { passive: false });

    // Reset on double-click
    adj.addEventListener('dblclick', () => {
      localStorage.removeItem(STORAGE_KEY);
      // restore to CSS variable default via removing inline property
      root.style.removeProperty('--playlist-sidebar-width');
      pls.classList.remove('collapsed');
    });
  }

  // Wait for DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install);
  } else {
    install();
  }

})();