// playlist-view.js
// Renders the user's playlists into #playlist-list and lets #playlist-view-toggle
// switch between a compact "list" layout and a tiled "grid" layout, the same way
// playlist-resizer.js persists its own state to localStorage.

(function () {
  const STORAGE_KEY = 'playlistViewMode';

  // Palette pulled straight from app-colors.css so placeholder thumbnails stay
  // on-brand until real cover art is wired in.
  const THUMB_COLORS = [
    'var(--main-orange-100)',
    'var(--main-blue-200)',
    'var(--main-red-200)',
    'var(--main-cyan-100)',
    'var(--main-green-200)',
    'var(--main-yellow-100)',
    'var(--main-pink-200)',
    'var(--main-purple-300)',
    'var(--bored-blue-100)',
    'var(--main-orange-200)',
    'var(--main-blue-400)',
    'var(--main-red-100)',
  ];

  // Placeholder data until this is wired up to real playlist data.
  const PLAYLISTS = [
    { name: 'Liked Songs', pinned: true, meta: '485 songs', liked: true },
    { name: 'DBMS', meta: 'Tuguldur Kanzen' },
    { name: 'genshin impact', meta: 'Tuguldur Kanzen' },
    { name: 'j', meta: 'Tuguldur Kanzen' },
    { name: 'light', meta: 'Tuguldur Kanzen' },
    { name: 'Linkin park', meta: 'Tuguldur Kanzen' },
    { name: 'my new era', meta: 'Tuguldur Kanzen' },
    { name: 'My Playlist #3', meta: 'Tuguldur Kanzen' },
    { name: 'Python tutorial', meta: 'Tuguldur Kanzen' },
    { name: 'Song', meta: 'Tuguldur Kanzen' },
    { name: 'a a', meta: 'Tuguldur Kanzen' },
    { name: 'Хөгжим', meta: 'Tuguldur Kanzen' },
    { name: 'Шинэ жил 11A', meta: 'Tuguldur Kanzen' },
    { name: 'Liked Songs', pinned: true, meta: '485 songs', liked: true },
    { name: 'DBMS', meta: 'Tuguldur Kanzen' },
    { name: 'genshin impact', meta: 'Tuguldur Kanzen' },
    { name: 'j', meta: 'Tuguldur Kanzen' },
    { name: 'light', meta: 'Tuguldur Kanzen' },
    { name: 'Linkin park', meta: 'Tuguldur Kanzen' },
    { name: 'my new era', meta: 'Tuguldur Kanzen' },
    { name: 'My Playlist #3', meta: 'Tuguldur Kanzen' },
    { name: 'Python tutorial', meta: 'Tuguldur Kanzen' },
    { name: 'Song', meta: 'Tuguldur Kanzen' },
    { name: 'a a', meta: 'Tuguldur Kanzen' },
    { name: 'Хөгжим', meta: 'Tuguldur Kanzen' },
    { name: 'Шинэ жил 11A', meta: 'Tuguldur Kanzen' },
  ];

  // Icons are built as <img> tags (data-URI src) to match the rest of the
  // project's convention of <img src="./assets/icons/*.svg">. Swap the `src`
  // for a real file under ./assets/icons/ any time — e.g.
  // src="./assets/icons/heart.svg" — once those assets exist; the markup and
  // sizing stay the same either way.
  function svgDataUri(pathD, fill, viewBox) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox || '0 0 24 24'}" fill="${fill}"><path d="${pathD}"/></svg>`;
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  function makeIcon(src, alt, className) {
    const img = document.createElement('img');
    img.src = src;
    img.alt = alt;
    if (className) img.className = className;
    return img;
  }

  function heartIcon() {
    const src = svgDataUri('M12 21s-6.7-4.35-9.33-8.2C.86 10.1 1.4 6.6 4.3 5.1c2.2-1.14 4.7-.4 6.1 1.4l1.6 2 1.6-2c1.4-1.8 3.9-2.54 6.1-1.4 2.9 1.5 3.44 5 1.63 7.7C18.7 16.65 12 21 12 21z', '#ffffff');
    return makeIcon(src, '', 'thumb-icon');
  }

  function noteIcon() {
    const src = svgDataUri('M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm12-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0z', '#ffffff');
    return makeIcon(src, '', 'thumb-icon');
  }

  function pinIcon() {
    const src = svgDataUri('M14.5 2a1 1 0 0 1 .7 1.7L14 4.9V9l2.6 2.9a1 1 0 0 1-.75 1.66H13v6a1 1 0 0 1-2 0v-6H7.15a1 1 0 0 1-.75-1.66L9 9V4.9L7.8 3.7A1 1 0 0 1 8.5 2h6z', '#3DF3B4');
    return makeIcon(src, 'pinned', 'pin-icon');
  }

  function buildItem(playlist, index) {
    const item = document.createElement('div');
    item.className = 'playlist-item';
    item.setAttribute('role', 'button');
    item.setAttribute('tabindex', '0');

    const thumb = document.createElement('div');
    thumb.className = 'playlist-thumb';
    if (playlist.liked) {
      thumb.style.background = 'linear-gradient(135deg, var(--light-purple-100), var(--main-blue-300))';
      thumb.appendChild(heartIcon());
    } else {
      thumb.style.background = THUMB_COLORS[index % THUMB_COLORS.length];
      thumb.appendChild(noteIcon());
    }

    const info = document.createElement('div');
    info.className = 'playlist-info';

    const name = document.createElement('span');
    name.className = 'playlist-name textMedium';
    name.textContent = playlist.name;

    const meta = document.createElement('span');
    meta.className = 'playlist-meta textSmall';
    if (playlist.pinned) meta.appendChild(pinIcon());
    meta.appendChild(document.createTextNode('Playlist' + (playlist.meta ? ' • ' + playlist.meta : '')));

    info.appendChild(name);
    info.appendChild(meta);
    item.appendChild(thumb);
    item.appendChild(info);

    return item;
  }

  function render(container) {
    container.innerHTML = '';
    const frag = document.createDocumentFragment();
    PLAYLISTS.forEach((p, i) => frag.appendChild(buildItem(p, i)));
    container.appendChild(frag);
  }

  function getSavedMode() {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      return v === 'grid' ? 'grid' : 'list';
    } catch (e) { return 'list'; }
  }

  function saveMode(mode) {
    try { localStorage.setItem(STORAGE_KEY, mode); } catch (e) {}
  }

  function install() {
    const container = document.getElementById('playlist-list');
    const toggle = document.getElementById('playlist-view-toggle');
    if (!container || !toggle) return;

    render(container);

    function applyMode(mode) {
      container.classList.remove('list-view', 'grid-view');
      container.classList.add(mode + '-view');
      const isGrid = mode === 'grid';
      toggle.setAttribute('aria-pressed', String(isGrid));
      toggle.setAttribute('aria-label', isGrid ? 'Switch to list view' : 'Switch to grid view');
      saveMode(mode);
    }

    function toggleMode() {
      const current = container.classList.contains('grid-view') ? 'grid' : 'list';
      applyMode(current === 'grid' ? 'list' : 'grid');
    }

    applyMode(getSavedMode());

    toggle.addEventListener('click', toggleMode);
    toggle.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleMode();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install);
  } else {
    install();
  }
})();