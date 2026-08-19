/**
 * music-player.js
 * ----------------
 * A sticky, bottom-of-page player bar. Drop one <music-player> anywhere in
 * the document; it wires itself up to every <music-card> on the page
 * automatically via events — no manual queue building required.
 *
 * Usage:
 *   <music-player></music-player>
 *   ... any number of <music-card> elements anywhere on the page ...
 *
 * How the queue works:
 *   When a <music-card>'s play button is clicked, it dispatches
 *   "music-track-play-toggle". <music-player> catches that (listening on
 *   document), and at that moment builds its queue by reading every
 *   <music-card id title artist cover duration src saved> currently in the
 *   DOM, in document order. Next/Previous walk that list. If your cards
 *   are added/removed dynamically, the queue simply rebuilds the next time
 *   any card is played — you don't need to keep it in sync manually.
 *
 *   Prefer to manage the queue yourself (e.g. tracks that aren't rendered
 *   as <music-card>s)? Call `player.setQueue(tracks, startIndex)` and
 *   `player.play()` directly — the DOM auto-discovery only kicks in on the
 *   card-originated event.
 *
 * Public API (for scripting beyond what <music-card> triggers):
 *   setQueue(tracks, startIndex = 0)
 *   play(track?)      play the given track, or resume the current one
 *   pause()
 *   toggle()
 *   next() / previous()
 *   seek(seconds)
 *   setVolume(0..1)
 *   toggleMute()
 *   toggleShuffle()
 *   cycleRepeat()      off -> all -> one -> off
 *
 * Events dispatched (on document, so <music-card> can hear them anywhere):
 *   "music-player-state"      detail: { id, playing, currentTime, duration }
 *   "music-track-save-toggle" detail: { id, saved }   (when the player's own heart is clicked)
 */

import { BaseElement } from './base-element.js';

const ICONS = {
  shuffle:
    '<svg viewBox="0 0 24 24"><path d="M4 6h3.5l7 12H18v-3l4 4-4 4v-3h-4.5l-7-12H4V6zm10.5 0H18V3l4 4-4 4V8h-3.5l-2-3.4 1.2-2 1.3 2.4z"/></svg>',
  previous: '<svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6L20 6v12z"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M7 6l10 6-10 6zM15 6h2v12h-2z"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>',
  repeat:
    '<svg viewBox="0 0 24 24"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>',
  heartOutline:
    '<svg viewBox="0 0 24 24"><path d="M12 20.5s-7-4.35-9.5-8.6C.7 8.4 2.4 5 5.9 5c1.9 0 3.3 1 4.1 2.3.4.6.6.9 2 .9s1.6-.3 2-.9C15 6 16.4 5 18.3 5c3.5 0 5.2 3.4 3.4 6.9C19 16.15 12 20.5 12 20.5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  heartFilled:
    '<svg viewBox="0 0 24 24"><path d="M12 20.5s-7-4.35-9.5-8.6C.7 8.4 2.4 5 5.9 5c1.9 0 3.3 1 4.1 2.3.4.6.6.9 2 .9s1.6-.3 2-.9C15 6 16.4 5 18.3 5c3.5 0 5.2 3.4 3.4 6.9C19 16.15 12 20.5 12 20.5z"/></svg>',
  queue:
    '<svg viewBox="0 0 24 24"><path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h10v2H4z"/></svg>',
  volume:
    '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 5V4L8 9zm11.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z"/></svg>',
  muted:
    '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 5V4L8 9zm12.7-1.3-1.4 1.4 2 2-2 2 1.4 1.4 2-2 2 2 1.4-1.4-2-2 2-2-1.4-1.4-2 2z"/></svg>',
};

function eq(el, html) {
  el.innerHTML = html;
}

function fmtTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export class MusicPlayer extends BaseElement {
  static get observedAttributes() {
    return BaseElement.withBoxAttributes();
  }

  constructor() {
    super();
    this._queue = [];
    this._index = -1;
    this._playing = false;
    this._shuffle = false;
    this._shuffleOrder = [];
    this._repeat = 'off'; // off | all | one
    this._volume = 0.8;
    this._muted = false;
    this._queueOpen = false;

    this._onCardPlayToggle = this._onCardPlayToggle.bind(this);
    this._onSaveToggle = this._onSaveToggle.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('music-track-play-toggle', this._onCardPlayToggle);
    document.addEventListener('music-track-save-toggle', this._onSaveToggle);
  }

  disconnectedCallback() {
    document.removeEventListener('music-track-play-toggle', this._onCardPlayToggle);
    document.removeEventListener('music-track-save-toggle', this._onSaveToggle);
  }

  get currentTrack() {
    return this._index >= 0 ? this._queue[this._index] : null;
  }

  // ---- public API -------------------------------------------------------

  setQueue(tracks, startIndex = 0) {
    this._queue = tracks.slice();
    this._index = this._queue.length ? Math.min(Math.max(startIndex, 0), this._queue.length - 1) : -1;
    this._rebuildShuffleOrder();
    this._loadCurrent({ autoplay: false });
    this._renderQueuePanel();
  }

  play(track) {
    if (track) {
      const idx = this._queue.findIndex((t) => t.id === track.id);
      if (idx === -1) {
        this._queue.push(track);
        this._index = this._queue.length - 1;
        this._rebuildShuffleOrder();
      } else {
        this._index = idx;
      }
      this._loadCurrent({ autoplay: true });
      return;
    }
    if (!this.currentTrack) return;
    this._audio.play().catch(() => {});
  }

  pause() {
    this._audio.pause();
  }

  toggle() {
    if (this._playing) this.pause();
    else this.play();
  }

  next() {
    if (!this._queue.length) return;
    const order = this._shuffle ? this._shuffleOrder : this._queue.map((_, i) => i);
    const pos = order.indexOf(this._index);
    let nextPos = pos + 1;
    if (nextPos >= order.length) {
      if (this._repeat !== 'all') return this._stopAtEnd();
      nextPos = 0;
    }
    this._index = order[nextPos];
    this._loadCurrent({ autoplay: true });
  }

  previous() {
    if (!this._queue.length) return;
    // restart current track if we're more than 3s in, like most players
    if (this._audio.currentTime > 3) {
      this._audio.currentTime = 0;
      return;
    }
    const order = this._shuffle ? this._shuffleOrder : this._queue.map((_, i) => i);
    const pos = order.indexOf(this._index);
    const prevPos = pos <= 0 ? order.length - 1 : pos - 1;
    this._index = order[prevPos];
    this._loadCurrent({ autoplay: true });
  }

  seek(seconds) {
    this._audio.currentTime = seconds;
  }

  setVolume(v) {
    this._volume = Math.min(1, Math.max(0, v));
    this._muted = this._volume === 0;
    this._audio.volume = this._volume;
    this._audio.muted = this._muted;
    this._updateVolumeUI();
  }

  toggleMute() {
    this._muted = !this._muted;
    this._audio.muted = this._muted;
    this._updateVolumeUI();
  }

  toggleShuffle() {
    this._shuffle = !this._shuffle;
    this._rebuildShuffleOrder();
    this._updateToggleButtons();
  }

  cycleRepeat() {
    this._repeat = { off: 'all', all: 'one', one: 'off' }[this._repeat];
    this._updateToggleButtons();
  }

  toggleSaveCurrent() {
    const track = this.currentTrack;
    if (!track) return;
    track.saved = !track.saved;
    this._updateHeart();
    document.dispatchEvent(
      new CustomEvent('music-track-save-toggle', { detail: { id: track.id, saved: track.saved } })
    );
  }

  // ---- internal: reacting to cards / global events -----------------------

  _onCardPlayToggle(e) {
    const track = e.detail;
    const cardsInOrder = [...document.querySelectorAll('music-card')].map((el) => ({
      id: el.getAttribute('id') || '',
      title: el.getAttribute('title') || '',
      artist: el.getAttribute('artist') || '',
      cover: el.getAttribute('cover') || '',
      duration: Number(el.getAttribute('duration')) || 0,
      src: el.getAttribute('src') || '',
      saved: el.hasAttribute('saved'),
    }));
    const startIndex = Math.max(
      cardsInOrder.findIndex((t) => t.id === track.id),
      0
    );

    if (this.currentTrack && this.currentTrack.id === track.id) {
      this.toggle();
      return;
    }
    this.setQueue(cardsInOrder.length ? cardsInOrder : [track], startIndex);
    this.play();
  }

  _onSaveToggle(e) {
    const track = this.currentTrack;
    if (!track || !e.detail || e.detail.id !== track.id) return;
    track.saved = !!e.detail.saved;
    this._updateHeart();
  }

  // ---- internal: playback plumbing --------------------------------------

  _rebuildShuffleOrder() {
    const order = this._queue.map((_, i) => i);
    if (this._shuffle) {
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      // keep the currently playing track first so shuffle doesn't jump away mid-listen
      const cur = order.indexOf(this._index);
      if (cur > 0) {
        order.splice(cur, 1);
        order.unshift(this._index);
      }
    }
    this._shuffleOrder = order;
  }

  _loadCurrent({ autoplay }) {
    const track = this.currentTrack;
    if (!this._els) return;
    if (!track) {
      this._audio.removeAttribute('src');
      this._updateTrackInfo(null);
      return;
    }
    if (this._audio.dataset.trackId !== track.id) {
      this._audio.src = track.src;
      this._audio.dataset.trackId = track.id;
    }
    this._updateTrackInfo(track);
    if (autoplay) this._audio.play().catch(() => {});
    this._broadcastState();
  }

  _stopAtEnd() {
    this._audio.pause();
    this._audio.currentTime = 0;
    this._playing = false;
    this._updatePlayButton();
    this._broadcastState();
  }

  _broadcastState() {
    const track = this.currentTrack;
    document.dispatchEvent(
      new CustomEvent('music-player-state', {
        detail: {
          id: track ? track.id : null,
          playing: this._playing,
          currentTime: this._audio.currentTime,
          duration: this._audio.duration || (track ? track.duration : 0),
        },
      })
    );
  }

  // ---- rendering ----------------------------------------------------------

  render() {
    if (!this._els) {
      this.shadowRoot.innerHTML = `
        <style>
          :host {
            position: sticky;
            bottom: 0;
            left: 0;
            display: block;
            width: 100%;
            font-family: 'Nunito', sans-serif;
            z-index: 100;
          }
          .bar {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
            align-items: center;
            gap: var(--padding-lg, 16px);
            padding: var(--padding-md, 12px) var(--padding-lg, 16px);
            background: var(--dark-purple-200, #221b39);
            color: var(--white-100, #fcfcff);
            border-radius: var(--box-radius-xxxl, 20px);
            margin: var(--padding-sm, 8px);
            box-shadow: 0 8px 30px color-mix(in srgb, var(--pure-black, #000) 35%, transparent);
          }

          /* --- now playing --- */
          .now-playing { display: flex; align-items: center; gap: var(--padding-sm, 8px); min-width: 0; }
          .cover {
            width: 48px;
            height: 48px;
            border-radius: var(--box-radius-lg, 8px);
            object-fit: cover;
            background: linear-gradient(135deg, var(--main-purple-100, #905ee8), var(--main-purple-400, #7a7af0));
            flex: none;
          }
          .track-text { min-width: 0; }
          .track-title {
            font-weight: var(--font-weight-semi-bold, 700);
            font-size: var(--font-size-md, 1rem);
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          }
          .track-artist {
            font-size: var(--font-size-sm, 0.875rem);
            color: var(--dark-purple-500, #9387b6);
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          }
          .icon-btn {
            border: none; background: none; cursor: pointer; padding: 6px;
            display: inline-flex; align-items: center; justify-content: center;
            color: var(--white-100, #fcfcff); opacity: 0.75;
            border-radius: var(--box-radius-circle, 50%);
            transition: opacity var(--transition-fast, .1s) ease, background var(--transition-fast, .1s) ease;
          }
          .icon-btn:hover { opacity: 1; background: color-mix(in srgb, var(--white-100, #fcfcff) 12%, transparent); }
          .icon-btn svg { width: var(--svg-height-sm, 16px); height: var(--svg-height-sm, 16px); fill: currentColor; }
          .icon-btn.is-active { color: var(--main-purple-400, #7a7af0); opacity: 1; }
          .heart-btn.is-saved { color: var(--main-red-100, #f3205d); opacity: 1; }

          /* --- transport --- */
          .transport { display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 280px; }
          .controls { display: flex; align-items: center; gap: var(--padding-md, 12px); }
          .play-btn {
            width: 40px; height: 40px; border-radius: 50%; border: none; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            background: var(--main-purple-100, #905ee8); color: var(--white-100, #fcfcff);
            transition: transform var(--transition-fast, .1s) ease;
          }
          .play-btn:hover { transform: scale(1.05); }
          .play-btn svg { width: 18px; height: 18px; fill: currentColor; }
          .seek-row { display: flex; align-items: center; gap: var(--padding-sm, 8px); width: 100%; }
          .time { font-size: var(--font-size-xs, 0.75rem); color: var(--dark-purple-500, #9387b6); flex: none; width: 32px; }
          .time.end { text-align: right; }

          input[type="range"] {
            -webkit-appearance: none; appearance: none;
            width: 100%; height: 4px; border-radius: 999px;
            background: var(--thumb-track-100, #5A546A);
            accent-color: var(--thumb-purple-100, #A88BFA);
          }
          input[type="range"]::-webkit-slider-thumb {
            -webkit-appearance: none; width: 12px; height: 12px; border-radius: 50%;
            background: var(--thumb-purple-100, #A88BFA); cursor: pointer;
          }
          input[type="range"]::-moz-range-thumb {
            width: 12px; height: 12px; border-radius: 50%; border: none;
            background: var(--thumb-purple-100, #A88BFA); cursor: pointer;
          }
          input[type="range"].volume-slider { width: 90px; }

          /* --- right cluster --- */
          .right-cluster { display: flex; align-items: center; justify-content: flex-end; gap: var(--padding-sm, 8px); position: relative; }

          /* --- queue panel --- */
          .queue-panel {
            position: absolute;
            bottom: calc(100% + var(--padding-sm, 8px));
            right: 0;
            width: 260px;
            max-height: 320px;
            overflow-y: auto;
            background: var(--dark-purple-300, #312153);
            border-radius: var(--box-radius-lg, 8px);
            box-shadow: 0 8px 24px color-mix(in srgb, var(--pure-black, #000) 40%, transparent);
            padding: var(--padding-sm, 8px);
            display: none;
            z-index: 10;
          }
          .queue-panel.open { display: block; }
          .queue-item {
            display: flex; gap: var(--padding-sm, 8px); align-items: center;
            padding: var(--padding-xs, 4px) var(--padding-sm, 8px);
            border-radius: var(--box-radius-sm, 4px);
            cursor: pointer; font-size: var(--font-size-sm, 0.875rem);
          }
          .queue-item:hover { background: color-mix(in srgb, var(--white-100, #fcfcff) 10%, transparent); }
          .queue-item.is-current { color: var(--main-purple-400, #7a7af0); font-weight: var(--font-weight-semi-bold, 700); }
        </style>
        <div class="bar" part="bar">
          <div class="now-playing">
            <img class="cover" part="cover" alt="">
            <div class="track-text">
              <div class="track-title">Nothing playing</div>
              <div class="track-artist"></div>
            </div>
            <button class="icon-btn heart-btn" type="button" aria-label="Save">${ICONS.heartOutline}</button>
          </div>

          <div class="transport">
            <div class="controls">
              <button class="icon-btn shuffle-btn" type="button" aria-label="Shuffle">${ICONS.shuffle}</button>
              <button class="icon-btn prev-btn" type="button" aria-label="Previous">${ICONS.previous}</button>
              <button class="play-btn" type="button" aria-label="Play">${ICONS.play}</button>
              <button class="icon-btn next-btn" type="button" aria-label="Next">${ICONS.next}</button>
              <button class="icon-btn repeat-btn" type="button" aria-label="Repeat">${ICONS.repeat}</button>
            </div>
            <div class="seek-row">
              <span class="time start">0:00</span>
              <input class="seek" type="range" min="0" max="100" step="0.1" value="0">
              <span class="time end">0:00</span>
            </div>
          </div>

          <div class="right-cluster">
            <button class="icon-btn queue-btn" type="button" aria-label="Queue">${ICONS.queue}</button>
            <div class="queue-panel"></div>
            <button class="icon-btn volume-btn" type="button" aria-label="Mute">${ICONS.volume}</button>
            <input class="volume-slider" type="range" min="0" max="1" step="0.01" value="0.8">
          </div>
        </div>
        <audio></audio>
      `;

      this._audio = this.$('audio');
      this._els = {
        cover: this.$('.cover'),
        title: this.$('.track-title'),
        artist: this.$('.track-artist'),
        heartBtn: this.$('.heart-btn'),
        shuffleBtn: this.$('.shuffle-btn'),
        prevBtn: this.$('.prev-btn'),
        playBtn: this.$('.play-btn'),
        nextBtn: this.$('.next-btn'),
        repeatBtn: this.$('.repeat-btn'),
        seek: this.$('.seek'),
        timeStart: this.$('.time.start'),
        timeEnd: this.$('.time.end'),
        queueBtn: this.$('.queue-btn'),
        queuePanel: this.$('.queue-panel'),
        volumeBtn: this.$('.volume-btn'),
        volumeSlider: this.$('.volume-slider'),
      };
      this._wireEvents();
      this.setVolume(this._volume);
    }
  }

  _wireEvents() {
    const e = this._els;
    e.playBtn.addEventListener('click', () => this.toggle());
    e.nextBtn.addEventListener('click', () => this.next());
    e.prevBtn.addEventListener('click', () => this.previous());
    e.shuffleBtn.addEventListener('click', () => this.toggleShuffle());
    e.repeatBtn.addEventListener('click', () => this.cycleRepeat());
    e.heartBtn.addEventListener('click', () => this.toggleSaveCurrent());
    e.volumeBtn.addEventListener('click', () => this.toggleMute());
    e.volumeSlider.addEventListener('input', (ev) => this.setVolume(Number(ev.target.value)));
    e.queueBtn.addEventListener('click', () => {
      this._queueOpen = !this._queueOpen;
      e.queuePanel.classList.toggle('open', this._queueOpen);
    });

    let wasPlayingBeforeScrub = false;
    e.seek.addEventListener('pointerdown', () => {
      wasPlayingBeforeScrub = this._playing;
      this._audio.pause();
    });
    e.seek.addEventListener('input', (ev) => {
      this._audio.currentTime = Number(ev.target.value);
      e.timeStart.textContent = fmtTime(this._audio.currentTime);
    });
    e.seek.addEventListener('change', () => {
      if (wasPlayingBeforeScrub) this._audio.play().catch(() => {});
    });

    this._audio.addEventListener('play', () => {
      this._playing = true;
      this._updatePlayButton();
      this._broadcastState();
    });
    this._audio.addEventListener('pause', () => {
      this._playing = false;
      this._updatePlayButton();
      this._broadcastState();
    });
    this._audio.addEventListener('timeupdate', () => this._updateSeekUI());
    this._audio.addEventListener('loadedmetadata', () => this._updateSeekUI());
    this._audio.addEventListener('ended', () => {
      if (this._repeat === 'one') {
        this._audio.currentTime = 0;
        this._audio.play().catch(() => {});
        return;
      }
      this.next();
    });
  }

  _updateTrackInfo(track) {
    const e = this._els;
    e.title.textContent = track ? track.title : 'Nothing playing';
    e.artist.textContent = track ? track.artist : '';
    e.cover.src = track ? track.cover : '';
    e.seek.max = track ? track.duration || 0 : 0;
    e.timeEnd.textContent = fmtTime(track ? track.duration : 0);
    this._updateHeart();
    this._renderQueuePanel();
  }

  _updateHeart() {
    const track = this.currentTrack;
    const saved = !!(track && track.saved);
    this._els.heartBtn.innerHTML = saved ? ICONS.heartFilled : ICONS.heartOutline;
    this._els.heartBtn.classList.toggle('is-saved', saved);
  }

  _updatePlayButton() {
    eq(this._els.playBtn, this._playing ? ICONS.pause : ICONS.play);
    this._els.playBtn.setAttribute('aria-label', this._playing ? 'Pause' : 'Play');
  }

  _updateToggleButtons() {
    this._els.shuffleBtn.classList.toggle('is-active', this._shuffle);
    this._els.repeatBtn.classList.toggle('is-active', this._repeat !== 'off');
    this._els.repeatBtn.style.opacity = this._repeat === 'one' ? '1' : '';
    this._els.repeatBtn.title = { off: 'Repeat off', all: 'Repeat all', one: 'Repeat one' }[this._repeat];
  }

  _updateSeekUI() {
    const e = this._els;
    const duration = this._audio.duration || (this.currentTrack ? this.currentTrack.duration : 0);
    e.seek.max = duration || 0;
    e.seek.value = this._audio.currentTime || 0;
    e.timeStart.textContent = fmtTime(this._audio.currentTime);
    e.timeEnd.textContent = fmtTime(duration);
    this._broadcastState();
  }

  _updateVolumeUI() {
    eq(this._els.volumeBtn, this._muted ? ICONS.muted : ICONS.volume);
    this._els.volumeSlider.value = this._muted ? 0 : this._volume;
  }

  _renderQueuePanel() {
    if (!this._els) return;
    this._els.queuePanel.innerHTML = this._queue
      .map(
        (t, i) => `
          <div class="queue-item ${i === this._index ? 'is-current' : ''}" data-index="${i}">
            ${this.escape(t.title)} — <span style="opacity:.7">${this.escape(t.artist)}</span>
          </div>`
      )
      .join('');
    this._els.queuePanel.querySelectorAll('.queue-item').forEach((row) => {
      row.addEventListener('click', () => {
        this._index = Number(row.dataset.index);
        this._loadCurrent({ autoplay: true });
      });
    });
  }
}

customElements.define('music-player', MusicPlayer);