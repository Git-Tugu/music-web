/**
 * music-card.js
 * -------------
 * A single track's card: cover art, title, artist. On hover, a play/pause
 * button appears centered on the cover, and a like (heart) indicator
 * appears in the corner. Clicking play asks the page's <music-player> to
 * play this track; clicking the heart toggles "saved" and lets any
 * listener (a backend call, <music-player>, etc.) react.
 *
 * This component doesn't talk to <music-player> directly — it only
 * dispatches events. That keeps cards and the player decoupled: drop a
 * <music-player> anywhere on the page and any <music-card> "just works",
 * with no manual wiring required.
 *
 * Usage:
 *   <music-card
 *     id="track-1"
 *     title="XYH"
 *     artist="mxrningstar"
 *     cover="/covers/xyh.jpg"
 *     duration="213"
 *     src="/audio/xyh.mp3"
 *     color1="#6528c6"
 *     color2="#a15de9"
 *   ></music-card>
 *
 * Attributes:
 *   id        unique track id (also used as the DOM element id; required
 *             for the play/save events and for <music-player> to identify
 *             "is this card's track the one currently playing")
 *   title     track title
 *   artist    artist name
 *   cover     album art image URL (optional — if omitted, or if the image
 *             fails to load, the card just shows the color1/color2 gradient)
 *   duration  track length in seconds (used as a display fallback before
 *             the player has loaded real audio metadata)
 *   src       audio file URL
 *   saved     boolean attribute — whether this track is "liked"/saved
 *   color1    optional hex or CSS color for gradient start background
 *   color2    optional hex or CSS color for gradient end background
 *
 * Events dispatched (bubble, composed — cross shadow boundaries freely):
 *   "music-track-play-toggle"  detail: { id, title, artist, cover, duration, src, color1, color2 }
 *      Fired on click of the hover play button. <music-player> decides
 *      whether that means "start this track" or "toggle pause" based on
 *      whether it's already the active track.
 *   "music-track-save-toggle"  detail: { id, saved }
 *      Fired on click of the heart. The card has already updated its own
 *      `saved` attribute by the time this fires; the event just lets other
 *      interested parties (a <music-player> showing the same track, a
 *      backend sync call) react.
 *
 * Events listened for (on document):
 *   "music-player-state"  detail: { id, playing }
 *      Broadcast by <music-player> whenever what's playing changes. If
 *      detail.id matches this card's id, the hover button shows pause
 *      (and stays visible, not just on hover) instead of play.
 *   "music-track-save-toggle"  detail: { id, saved }
 *      Lets a save toggled from <music-player> (for the currently-playing
 *      track) sync back to the matching card, and vice versa.
 */

import { BaseElement } from './base-element.js';

const PLAY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>';
const PAUSE_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>';
const HEART_OUTLINE_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7-4.35-9.5-8.6C.7 8.4 2.4 5 5.9 5c1.9 0 3.3 1 4.1 2.3.4.6.6.9 2 .9s1.6-.3 2-.9C15 6 16.4 5 18.3 5c3.5 0 5.2 3.4 3.4 6.9C19 16.15 12 20.5 12 20.5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';
const HEART_FILLED_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7-4.35-9.5-8.6C.7 8.4 2.4 5 5.9 5c1.9 0 3.3 1 4.1 2.3.4.6.6.9 2 .9s1.6-.3 2-.9C15 6 16.4 5 18.3 5c3.5 0 5.2 3.4 3.4 6.9C19 16.15 12 20.5 12 20.5z"/></svg>';

export class MusicCard extends BaseElement {
  static get observedAttributes() {
    return BaseElement.withBoxAttributes('id', 'title', 'artist', 'cover', 'duration', 'src', 'saved', 'color1', 'color2');
  }

  constructor() {
    super();
    this._playing = false;
    this._onGlobalPlayerState = this._onGlobalPlayerState.bind(this);
    this._onGlobalSaveToggle = this._onGlobalSaveToggle.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('music-player-state', this._onGlobalPlayerState);
    document.addEventListener('music-track-save-toggle', this._onGlobalSaveToggle);
  }

  disconnectedCallback() {
    document.removeEventListener('music-player-state', this._onGlobalPlayerState);
    document.removeEventListener('music-track-save-toggle', this._onGlobalSaveToggle);
  }

  _track() {
    return {
      id: this.attr('id', ''),
      title: this.attr('title', ''),
      artist: this.attr('artist', ''),
      cover: this.attr('cover', ''),
      duration: this.numAttr('duration', 0),
      src: this.attr('src', ''),
      color1: this.attr('color1', ''),
      color2: this.attr('color2', ''),
    };
  }

  _onGlobalPlayerState(e) {
    const isThisTrack = e.detail.id && e.detail.id === this.attr('id', '');
    const nowPlaying = isThisTrack && e.detail.playing;
    if (nowPlaying !== this._playing) {
      this._playing = nowPlaying;
      this._updatePlayButton();
    }
    this._toggleAttr('active', isThisTrack);
  }

  _onGlobalSaveToggle(e) {
    if (!e.detail || e.detail.id !== this.attr('id', '')) return;
    this._toggleAttr('saved', !!e.detail.saved);
    this._updateHeart();
  }

  _toggleAttr(name, on) {
    if (on) this.setAttribute(name, '');
    else this.removeAttribute(name);
  }

  render() {
    if (!this._els) {
      this.shadowRoot.innerHTML = `
        <style>
          :host {
            display: inline-block;
            container-type: inline-size;
            width: var(--el-width, 150px);
            font-family: 'Nunito', sans-serif;
          }
          .card { display: block; }
          .cover-wrap {
            position: relative;
            aspect-ratio: var(--el-ratio, 1 / 1);
            border-radius: var(--box-radius-xxl, 16px);
            overflow: hidden;
            box-shadow:
              0 var(--box-shadow-length-long, 6px) 24px -8px
              color-mix(in srgb, var(--dark-purple-100, #1e0c41) 40%, transparent);
            background: linear-gradient(
              120deg, 
              var(--card-color1, var(--main-purple-200, #6528c6)), 
              var(--card-color2, var(--main-purple-100, #a15de9))
            );
          }
          .cover {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
          }
          .cover[hidden] { display: none; }
          .overlay {
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            background: color-mix(in srgb, var(--dark-purple-100, #1e0c41) 25%, transparent);
            opacity: 0;
            transition: opacity var(--transition-medium, 0.2s) ease;
          }
          :host(:hover) .overlay,
          :host([active]) .overlay {
            opacity: 1;
          }
          .play-btn {
            width: 44px;
            height: 44px;
            border-radius: var(--box-radius-circle, 50%);
            border: none;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--white-100, #fcfcff);
            color: var(--main-purple-200, #6528c6);
            cursor: pointer;
            box-shadow: 0 2px 8px color-mix(in srgb, var(--dark-purple-100, #1e0c41) 30%, transparent);
            transition: transform var(--transition-fast, 0.1s) ease;
          }
          .play-btn:hover { transform: scale(1.06); }
          .play-btn svg { width: 20px; height: 20px; fill: currentColor; margin-left: 2px; }
          .play-btn.is-playing svg { margin-left: 0; }

          .heart-btn {
            position: absolute;
            top: var(--padding-sm, 8px);
            right: var(--padding-sm, 8px);
            width: 28px;
            height: 28px;
            border-radius: var(--box-radius-circle, 50%);
            border: none;
            display: flex;
            align-items: center;
            justify-content: center;
            background: color-mix(in srgb, var(--white-100, #fcfcff) 85%, transparent);
            color: var(--dark-purple-200, #221b39);
            cursor: pointer;
            opacity: 0;
            transform: translateY(-4px);
            transition: opacity var(--transition-medium, 0.2s) ease, transform var(--transition-medium, 0.2s) ease;
          }
          :host(:hover) .heart-btn { opacity: 1; transform: translateY(0); }
          .heart-btn.is-saved { color: var(--main-red-100, #f3205d); }
          .heart-btn svg { width: 15px; height: 15px; }

          .meta { padding-top: var(--padding-sm, 8px); }
          .title {
            font-weight: var(--font-weight-bold, 600);
            font-size: var(--font-size-lg, 1.125rem);
            color: var(--dark-purple-100, #1e0c41);
            line-height: 1.2;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .artist {
            font-weight: var(--font-weight-regular, 400);
            font-size: var(--font-size-sm, 0.875rem);
            color: var(--dark-purple-500, #9387b6);
            line-height: 1.3;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
        </style>
        <div class="card" part="card">
          <div class="cover-wrap" part="cover-wrap">
            <img class="cover" part="cover" alt="">
            <div class="overlay">
              <button class="play-btn" type="button" aria-label="Play"></button>
            </div>
            <button class="heart-btn" type="button" aria-label="Save"></button>
          </div>
          <div class="meta">
            <div class="title" part="title"></div>
            <div class="artist" part="artist"></div>
          </div>
        </div>
      `;
      this._els = {
        coverWrap: this.$('.cover-wrap'),
        cover: this.$('.cover'),
        title: this.$('.title'),
        artist: this.$('.artist'),
        playBtn: this.$('.play-btn'),
        heartBtn: this.$('.heart-btn'),
      };
      this._els.playBtn.addEventListener('click', () => {
        this.dispatchEvent(
          new CustomEvent('music-track-play-toggle', { bubbles: true, composed: true, detail: this._track() })
        );
      });
      this._els.heartBtn.addEventListener('click', () => {
        const saved = !this.boolAttr('saved', false);
        this._toggleAttr('saved', saved);
        this._updateHeart();
        this.dispatchEvent(
          new CustomEvent('music-track-save-toggle', {
            bubbles: true,
            composed: true,
            detail: { id: this.attr('id', ''), saved },
          })
        );
      });
      this._els.cover.addEventListener('error', () => {
        // A cover URL that 404s or fails to load falls back to the
        // gradient too, not just a missing/empty cover attribute.
        this._els.cover.hidden = true;
      });
    }

    const track = this._track();

    if (track.color1) {
      this._els.coverWrap.style.setProperty('--card-color1', track.color1);
    } else {
      this._els.coverWrap.style.removeProperty('--card-color1');
    }

    if (track.color2) {
      this._els.coverWrap.style.setProperty('--card-color2', track.color2);
    } else {
      this._els.coverWrap.style.removeProperty('--card-color2');
    }

    if (track.cover) {
      this._els.cover.hidden = false;
      this._els.cover.src = track.cover;
    } else {
      // No cover art — hide the <img> entirely so the color1/color2
      // gradient background on .cover-wrap shows through instead of
      // a broken-image icon.
      this._els.cover.hidden = true;
      this._els.cover.removeAttribute('src');
    }
    this._els.cover.alt = track.title ? `${track.title} cover art` : '';
    this._els.title.textContent = track.title;
    this._els.title.title = track.title;
    this._els.artist.textContent = track.artist;
    this._els.artist.title = track.artist;
    this._updateHeart();
    this._updatePlayButton();
  }

  _updateHeart() {
    if (!this._els) return;
    const saved = this.boolAttr('saved', false);
    this._els.heartBtn.innerHTML = saved ? HEART_FILLED_ICON : HEART_OUTLINE_ICON;
    this._els.heartBtn.classList.toggle('is-saved', saved);
    this._els.heartBtn.setAttribute('aria-label', saved ? 'Remove from saved' : 'Save');
    this._els.heartBtn.setAttribute('aria-pressed', String(saved));
  }

  _updatePlayButton() {
    if (!this._els) return;
    this._els.playBtn.innerHTML = this._playing ? PAUSE_ICON : PLAY_ICON;
    this._els.playBtn.classList.toggle('is-playing', this._playing);
    this._els.playBtn.setAttribute('aria-label', this._playing ? 'Pause' : 'Play');
  }
}

customElements.define('music-card', MusicCard);