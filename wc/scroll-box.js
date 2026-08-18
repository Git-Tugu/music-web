/**
 * scroll-box.js
 * -------------
 * A scrollable container (row or column) that remembers where it was
 * scrolled to. Built on BaseElement, so it inherits width/height/color/
 * radius/transition/gap attribute -> CSS var wiring for free.
 *
 * Usage:
 *   <scroll-row key="homepage-carousel" height="140px">
 *     <img src="a.jpg"><img src="b.jpg"><img src="c.jpg">
 *   </scroll-row>
 *
 *   <scroll-col key="sidebar-list" height="400px">
 *     <li>...</li> <li>...</li>
 *   </scroll-col>
 *
 * Attributes:
 *   direction   "row" | "column"      (scroll-row / scroll-col set this for you)
 *   key         string                storage key; REQUIRED for persistence.
 *                                      Without it, scroll position is not saved
 *                                      (avoids collisions between anonymous instances).
 *   persist     "session" | "local" | "none"   default "session"
 *   snap        boolean attribute      turns on CSS scroll-snap along the axis
 *
 * How scroll memory works:
 *   - On every scroll event (rAF-throttled) the current scrollLeft/scrollTop
 *     is written to sessionStorage/localStorage under `scroll-box:<key>`.
 *   - On connect, and again whenever the scrollable content's size changes
 *     (via ResizeObserver, e.g. images finishing loading), the saved
 *     position is re-applied — clamped restores from before content has
 *     finished laying out would otherwise get silently dropped by the
 *     browser. Restoration gives up once the position holds for a couple
 *     of consecutive checks or after ~2s, whichever comes first.
 *   - Re-renders triggered by unrelated attribute changes (e.g. changing
 *     `color`) never rebuild the scrollable element itself, so the browser
 *     never resets its native scroll position or drops the listener.
 */

import { BaseElement } from './base-element.js';

const RESTORE_TIMEOUT_MS = 2000;
const RESTORE_STABLE_HITS = 2;

export class ScrollBox extends BaseElement {
  // Extends the shared width/height/color/etc. map with scrollbar-specific
  // vars, so `scrollbar-color="..."` etc. get the same free attr->CSS-var
  // wiring as width/height do, via BaseElement's (now polymorphic) _applyBoxVars.
  static BOX_ATTR_MAP = {
    ...BaseElement.BOX_ATTR_MAP,
    'scrollbar-color': '--el-scrollbar-color',
    'scrollbar-track-color': '--el-scrollbar-track',
    'scrollbar-size': '--el-scrollbar-size',
  };

  static get observedAttributes() {
    // `scrollbar` itself isn't a plain passthrough (it's a boolean that
    // toggles two different underlying CSS mechanisms - see render()), so
    // it's listed explicitly rather than living in BOX_ATTR_MAP.
    return this.withBoxAttributes('direction', 'key', 'persist', 'snap', 'scrollbar');
  }

  constructor() {
    super();
    this._scrollEl = null;
    this._onScroll = this._onScroll.bind(this);
    this._writeFrame = null;
    this._resizeObserver = null;
    this._restoreState = null; // { target, hits, deadline }
  }

  connectedCallback() {
    super.connectedCallback();
    this._beginRestore();
  }

  disconnectedCallback() {
    if (this._scrollEl) this._scrollEl.removeEventListener('scroll', this._onScroll);
    if (this._resizeObserver) this._resizeObserver.disconnect();
    if (this._writeFrame) cancelAnimationFrame(this._writeFrame);
    this._resizeObserver = null;
    this._restoreState = null;
  }

  get direction() {
    return this.attr('direction', 'row') === 'column' ? 'column' : 'row';
  }

  get storageKey() {
    const key = this.attr('key', '');
    return key ? `scroll-box:${key}` : null;
  }

  get storage() {
    const mode = this.attr('persist', 'session');
    if (mode === 'none') return null;
    try {
      return mode === 'local' ? window.localStorage : window.sessionStorage;
    } catch (_) {
      return null; // storage disabled (e.g. private mode edge cases)
    }
  }

  _scrollProp() {
    return this.direction === 'column' ? 'scrollTop' : 'scrollLeft';
  }

  _onScroll() {
    const storage = this.storage;
    const key = this.storageKey;
    if (!storage || !key || !this._scrollEl) return;
    // Once the user scrolls manually, any in-flight auto-restore attempts
    // should stop clobbering their position.
    this._restoreState = null;
    if (this._writeFrame) cancelAnimationFrame(this._writeFrame);
    this._writeFrame = requestAnimationFrame(() => {
      try {
        storage.setItem(key, String(this._scrollEl[this._scrollProp()]));
      } catch (_) {
        /* storage full/unavailable - ignore */
      }
    });
  }

  _beginRestore() {
    const storage = this.storage;
    const key = this.storageKey;
    if (!storage || !key || !this._scrollEl) return;
    const raw = storage.getItem(key);
    const target = raw == null ? null : Number(raw);
    if (target == null || Number.isNaN(target)) return;

    this._restoreState = { target, hits: 0, deadline: Date.now() + RESTORE_TIMEOUT_MS };
    this._applyRestore();

    if (!this._resizeObserver) {
      this._resizeObserver = new ResizeObserver(() => this._applyRestore());
      this._resizeObserver.observe(this._scrollEl);
    }
  }

  /** Re-applies the saved scroll position until it "sticks" or times out. */
  _applyRestore() {
    const state = this._restoreState;
    if (!state || !this._scrollEl) return;

    const prop = this._scrollProp();
    this._scrollEl[prop] = state.target;
    const landed = this._scrollEl[prop] === state.target;

    if (landed) {
      state.hits += 1;
    } else {
      state.hits = 0;
    }

    if (state.hits >= RESTORE_STABLE_HITS || Date.now() > state.deadline) {
      this._restoreState = null;
      if (this._resizeObserver) {
        this._resizeObserver.disconnect();
        this._resizeObserver = null;
      }
    }
  }

  render() {
    // Build the wrapper markup only once. Rebuilding it on every render
    // (e.g. when an unrelated attribute like `color` changes) would create
    // a brand-new scrollable div, silently resetting its scroll position
    // and detaching the scroll listener — so after the first build, render()
    // only tweaks CSS vars on the existing element.
    if (!this._scrollEl) {
      this.shadowRoot.innerHTML = `
        <style>
          :host { display: block; container-type: inline-size; }
          .scroll {
            display: flex;
            flex-direction: var(--el-flow, row);
            gap: var(--el-gap, 0.5em);
            overflow: auto;
            overscroll-behavior: contain;
            scroll-snap-type: var(--el-snap, none);
            width: var(--el-width, 100%);
            height: var(--el-height, auto);
            border-radius: var(--el-radius, 0);
            transition: var(--el-transition, none);
            scrollbar-width: thin;
          }
          ::slotted(*) { flex: none; scroll-snap-align: start; }

          /* Scrollbar: hidden by default (--el-scrollbar-mode/-size default
             to none/0px below). Setting the 'scrollbar' boolean attribute
             flips both the standard property (Firefox) and the WebKit
             pseudo-elements (Chrome/Safari/Edge) on at once. */
          .scroll {
            scrollbar-width: var(--el-scrollbar-mode, none);
            scrollbar-color: var(--el-scrollbar-color, transparent) var(--el-scrollbar-track, transparent);
          }
          .scroll::-webkit-scrollbar {
            width: var(--el-scrollbar-visible-size, 0px);
            height: var(--el-scrollbar-visible-size, 0px);
          }
          .scroll::-webkit-scrollbar-track {
            background: var(--el-scrollbar-track, transparent);
          }
          .scroll::-webkit-scrollbar-thumb {
            background: var(--el-scrollbar-color, rgba(0, 0, 0, 0.35));
            border-radius: 999px;
          }
        </style>
        <div class="scroll" part="scroll"><slot></slot></div>
      `;
      this._scrollEl = this.$('.scroll');
      this._scrollEl.addEventListener('scroll', this._onScroll, { passive: true });
    }

    this.style.setProperty('--el-flow', this.direction === 'column' ? 'column' : 'row');
    this.style.setProperty(
      '--el-snap',
      this.boolAttr('snap', false) ? (this.direction === 'column' ? 'y mandatory' : 'x mandatory') : 'none'
    );

    // Scrollbar is hidden unless explicitly turned on. When on, the visible
    // thickness reads from --el-scrollbar-size (set via the `scrollbar-size`
    // attribute, defaulting to 8px) - referencing it here via var() rather
    // than resolving it in JS keeps it reactive if that attribute changes later.
    const showScrollbar = this.boolAttr('scrollbar', false);
    this.style.setProperty('--el-scrollbar-mode', showScrollbar ? 'thin' : 'none');
    this.style.setProperty(
      '--el-scrollbar-visible-size',
      showScrollbar ? 'var(--el-scrollbar-size, 8px)' : '0px'
    );

    // Content (images, fonts, etc.) may still be loading in; re-attempt so
    // the restored position isn't clamped away before layout settles.
    this._beginRestore();
  }
}

/** <scroll-row> — convenience subclass, always horizontal. */
export class ScrollRow extends ScrollBox {
  get direction() {
    return 'row';
  }
}

/** <scroll-col> — convenience subclass, always vertical. */
export class ScrollCol extends ScrollBox {
  get direction() {
    return 'column';
  }
}

customElements.define('scroll-box', ScrollBox);
customElements.define('scroll-row', ScrollRow);
customElements.define('scroll-col', ScrollCol);