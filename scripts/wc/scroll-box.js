/**
 * scroll-box.js
 * -------------
 * A scrollable container (row or column) that remembers where it was
 * scrolled to. Built on BaseElement, so it inherits width/height/color/
 * radius/transition/gap attribute -> CSS var wiring for free.
 *
 * Usage:
 *   <scroll-row key="homepage-carousel" width="140px">
 *     <img src="a.jpg"><img src="b.jpg"><img src="c.jpg">
 *   </scroll-row>
 *
 *   <scroll-col key="sidebar-list" height="400px">
 *     <li>...</li> <li>...</li>
 *   </scroll-col>
 *
 * Attributes:
 *   direction     "row" | "column"      (scroll-row / scroll-col set this for you)
 *   key           string                storage key; REQUIRED for persistence.
 *                                        Without it, scroll position is not saved
 *                                        (avoids collisions between anonymous instances).
 *   persist       "session" | "local" | "none"   default "session"
 *   snap          boolean attribute      turns on CSS scroll-snap along the axis
 *   side-space    pixels (or any CSS length, e.g. "24px")
 *                                        extra room left on BOTH ends of the
 *                                        scrollable axis, so the first/last item
 *                                        isn't flush against the edge. The space
 *                                        itself is still scrollable-into.
 *   mist-color    color                 fades the edge (start and/or end) toward
 *                                        this color whenever there's content
 *                                        hidden past that edge - i.e. content
 *                                        "goes under" a soft shadow/mist as it's
 *                                        scrolled out of view. No color set = no
 *                                        effect (default is fully transparent).
 *   side-arrows   "<size> <color>"      e.g. side-arrows="28px rgba(0,0,0,.55)".
 *                                        Renders a chevron-left / chevron-right
 *                                        button over each edge. A given side's
 *                                        button only appears (on hover) while
 *                                        that side still has more content to
 *                                        reveal - i.e. it's hidden once that
 *                                        side is scrolled to its last item.
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
 *
 * How edge state (mist + arrows) works:
 *   - `_updateEdgeState()` reads the scroller's current position/extent and
 *     derives two booleans: canScrollStart / canScrollEnd (is there content
 *     hidden past that edge right now). Both the mist opacity and the arrow
 *     visibility are driven off this single computation so they never
 *     disagree with each other.
 *   - It's called on every scroll event, after every restore attempt, and
 *     whenever the scroller's content resizes (same ResizeObserver trigger
 *     as restoration - images loading in, items added/removed, etc).
 *   - The mist/arrow elements live in `.wrap`, *outside* `.scroll`, so they
 *     never become part of the scrollable content themselves.
 */

import { BaseElement } from './base-element.js';

const RESTORE_TIMEOUT_MS = 2000;
const RESTORE_STABLE_HITS = 2;
const EDGE_EPSILON_PX = 1;
// Caps how solid the mist gradient gets at its strongest (right at the
// edge). 1 reads as a hard block of color; this keeps it a soft hint
// instead. Override by setting --el-mist-opacity on the element if a
// stronger/weaker fade is wanted.
const MIST_MAX_OPACITY = '0.45';

const CHEVRON_LEFT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>`;
const CHEVRON_RIGHT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`;

export class ScrollBox extends BaseElement {
  // Extends the shared width/height/color/etc. map with scrollbar-specific
  // and mist/side-space vars, so these attributes get the same free
  // attr->CSS-var wiring as width/height do, via BaseElement's (now
  // polymorphic) _applyBoxVars. `side-arrows` is deliberately NOT here -
  // it's a compound "<size> <color>" value, so it's parsed by hand in
  // render(), same treatment as the `scrollbar` boolean attribute.
  static BOX_ATTR_MAP = {
    ...BaseElement.BOX_ATTR_MAP,
    'scrollbar-color': '--el-scrollbar-color',
    'scrollbar-track-color': '--el-scrollbar-track',
    'scrollbar-size': '--el-scrollbar-size',
    'side-space': '--el-side-space',
    'mist-color': '--el-mist-color',
  };

  static get observedAttributes() {
    // `scrollbar` and `side-arrows` aren't plain passthroughs (compound /
    // boolean values that drive more than one underlying CSS mechanism -
    // see render()), so they're listed explicitly rather than living in
    // BOX_ATTR_MAP.
    return this.withBoxAttributes('direction', 'key', 'persist', 'snap', 'scrollbar', 'side-arrows');
  }

  constructor() {
    super();
    this._scrollEl = null;
    this._wrapEl = null;
    this._arrowStartEl = null;
    this._arrowEndEl = null;
    this._onScroll = this._onScroll.bind(this);
    this._onWheel = this._onWheel.bind(this);
    this._onArrowStartClick = () => this._scrollByArrow(-1);
    this._onArrowEndClick = () => this._scrollByArrow(1);
    this._writeFrame = null;
    this._resizeObserver = null;
    this._edgeResizeObserver = null;
    this._restoreState = null; // { target, hits, deadline }
  }

  connectedCallback() {
    super.connectedCallback();
    this._beginRestore();
    this._updateEdgeState();
  }

  disconnectedCallback() {
    if (this._scrollEl) {
      this._scrollEl.removeEventListener('scroll', this._onScroll);
      this._scrollEl.removeEventListener('wheel', this._onWheel);
    }
    if (this._arrowStartEl) this._arrowStartEl.removeEventListener('click', this._onArrowStartClick);
    if (this._arrowEndEl) this._arrowEndEl.removeEventListener('click', this._onArrowEndClick);
    if (this._resizeObserver) this._resizeObserver.disconnect();
    if (this._edgeResizeObserver) this._edgeResizeObserver.disconnect();
    if (this._writeFrame) cancelAnimationFrame(this._writeFrame);
    this._resizeObserver = null;
    this._edgeResizeObserver = null;
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
    this._updateEdgeState();

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

  /**
   * Native scroll-chaining (letting an unhandled wheel delta bubble to the
   * next scrollable ancestor once this box can't consume it) is unreliable
   * across browsers/trackpads: a trackpad's tiny cross-axis jitter is often
   * enough for the browser to "commit" the whole gesture to this box and
   * never chain the rest up, even though the cross axis has nothing to
   * scroll. So instead of hoping for that, explicitly detect it here: if the
   * gesture's dominant axis isn't this box's own scrolling axis (e.g. a
   * mostly-vertical wheel over a horizontal scroll-row), hand the delta to
   * the nearest ancestor ScrollBox that scrolls along that axis and stop
   * the event here.
   */
  _onWheel(e) {
    if (!this._scrollEl) return;
    const dominantAxis = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? 'y' : 'x';
    const ownAxis = this.direction === 'column' ? 'y' : 'x';
    if (dominantAxis === ownAxis) return; // this box's own scroller handles it natively

    let node = this.parentElement;
    let target = null;
    while (node) {
      if (node instanceof ScrollBox && node._scrollEl) {
        const theirAxis = node.direction === 'column' ? 'y' : 'x';
        if (theirAxis === dominantAxis) {
          target = node;
          break;
        }
      }
      node = node.parentElement;
    }
    if (!target) return; // no matching ancestor - let the browser do whatever it would anyway

    e.preventDefault();
    if (dominantAxis === 'y') target._scrollEl.scrollTop += e.deltaY;
    else target._scrollEl.scrollLeft += e.deltaX;
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

    this._updateEdgeState();
  }

  /**
   * Figures out whether either edge currently has content hidden past it,
   * and drives BOTH the mist fade and the nav-arrow visibility off that -
   * single source of truth so they can never disagree.
   */
  _updateEdgeState() {
    if (!this._scrollEl) return;
    const el = this._scrollEl;
    const isColumn = this.direction === 'column';
    const pos = isColumn ? el.scrollTop : el.scrollLeft;
    const extent = (isColumn ? el.scrollHeight : el.scrollWidth) - (isColumn ? el.clientHeight : el.clientWidth);

    const canStart = pos > EDGE_EPSILON_PX;
    const canEnd = pos < extent - EDGE_EPSILON_PX;

    this.style.setProperty('--el-mist-start-opacity', canStart ? 'var(--el-mist-opacity, ' + MIST_MAX_OPACITY + ')' : '0');
    this.style.setProperty('--el-mist-end-opacity', canEnd ? 'var(--el-mist-opacity, ' + MIST_MAX_OPACITY + ')' : '0');

    if (this._wrapEl) {
      this._wrapEl.classList.toggle('can-start', canStart);
      this._wrapEl.classList.toggle('can-end', canEnd);
    }
  }

  /** Parses the compound `side-arrows="<size> <color>"` attribute value. */
  _parseSideArrows() {
    const raw = this.attr('side-arrows', '').trim();
    if (!raw) return null;
    const match = raw.match(/^(\S+)\s+(.+)$/);
    if (!match) return null;
    return { size: match[1], color: match[2].trim() };
  }

  /** Scrolls all the way to the start (-1) or end (+1) edge. */
  _scrollByArrow(dir) {
    if (!this._scrollEl) return;
    const el = this._scrollEl;
    const isColumn = this.direction === 'column';
    const prop = isColumn ? 'top' : 'left';
    const extent = isColumn ? el.scrollHeight - el.clientHeight : el.scrollWidth - el.clientWidth;
    el.scrollTo({ [prop]: dir < 0 ? 0 : extent, behavior: 'smooth' });
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

          /* .wrap sits outside the scroller and is purely a positioning
             context for the mist/arrow overlays - it takes its size from
             .scroll (its only in-flow child) rather than declaring its own,
             so it never fights the width/height vars below. */
          .wrap {
            /* Sizing lives HERE, not on .scroll. .wrap's containing block is
               the shadow host itself (a real element with a definite size
               from outer page layout, e.g. a flex item elsewhere), so
               width/height vars - including percentages like --el-height:
               100% - resolve correctly against it. If they lived on .scroll
               instead, .scroll's containing block would be .wrap, which has
               no size of its own (auto) - and a percentage height against
               an auto-height parent resolves to auto, silently breaking the
               whole "make this scroller a bounded box" contract. */
            position: relative;
            width: var(--el-width, 100%);
            height: var(--el-height, auto);
            border-radius: var(--el-radius, 0);
            overflow: hidden;
          }

          .scroll {
            display: flex;
            flex-direction: var(--el-flow, row);
            gap: var(--el-gap, 0.5em);
            /* Only the scrolling axis is a scroll container. If both axes
               used a blanket 'overflow: auto', the cross axis (e.g. vertical
               on a scroll-row, which never actually overflows) would still
               count as "scrollable, permanently at both boundaries" — and
               with overscroll-behavior: contain below, wheel input on that
               axis gets swallowed right there instead of bubbling up to an
               ancestor scroller (e.g. scrolling down while hovering a
               horizontal scroll-row inside a vertical scroll-col). */
            overflow-x: var(--el-overflow-x, auto);
            overflow-y: var(--el-overflow-y, auto);
            overscroll-behavior: contain;
            scroll-snap-type: var(--el-snap, none);
            width: 100%;
            height: 100%;
            border-radius: var(--el-radius, 0);
            transition: var(--el-transition, none);
            scrollbar-width: thin;
          }
          ::slotted(*) { flex: none; scroll-snap-align: start; }

          /* side-space: extra scrollable room at both ends of the axis, so
             the first/last item isn't flush against the edge. Deliberately
             NOT padding-inline/-block: padding at the trailing edge of an
             overflowing flex container gets silently dropped by browsers
             once you scroll (a long-standing Chromium/WebKit flex+overflow
             bug), so "end" space would work at rest but vanish as soon as
             there's real overflow. Real flex-item spacers aren't affected,
             and flex-basis always follows the main axis regardless of
             row/column, so no direction-specific logic is needed either. */
          .scroll::before,
          .scroll::after {
            content: '';
            flex: 0 0 var(--el-side-space, 0px);
          }

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

          /* mist: a soft fade toward mist-color over each edge, shown only
             while that edge actually has hidden content (opacity is driven
             by --el-mist-*-opacity, set in _updateEdgeState()). Defaults to
             a transparent gradient, so setting no mist-color is a no-op. */
          .mist {
            position: absolute;
            pointer-events: none;
            z-index: 1;
            transition: opacity 0.15s ease;
          }
          .mist-start { opacity: var(--el-mist-start-opacity, 0); }
          .mist-end { opacity: var(--el-mist-end-opacity, 0); }
          .wrap:not(.col) .mist-start {
            top: 0; bottom: 0; left: 0;
            width: var(--el-mist-size, 40px);
            background: linear-gradient(to right, var(--el-mist-color, transparent), transparent);
          }
          .wrap:not(.col) .mist-end {
            top: 0; bottom: 0; right: 0;
            width: var(--el-mist-size, 40px);
            background: linear-gradient(to left, var(--el-mist-color, transparent), transparent);
          }
          .wrap.col .mist-start {
            left: 0; right: 0; top: 0;
            height: var(--el-mist-size, 40px);
            background: linear-gradient(to bottom, var(--el-mist-color, transparent), transparent);
          }
          .wrap.col .mist-end {
            left: 0; right: 0; bottom: 0;
            height: var(--el-mist-size, 40px);
            background: linear-gradient(to top, var(--el-mist-color, transparent), transparent);
          }

          /* side-arrows: a chevron button per edge. Hidden entirely unless
             'side-arrows' is set (.arrows-enabled) AND that side still has
             more content to reveal (.can-start / .can-end, from the same
             edge-state computation the mist uses) - then it only becomes
             visible on hover of the box. */
          .arrow {
            display: none;
            align-items: center;
            justify-content: center;
            position: absolute;
            width: var(--el-arrow-size, 28px);
            height: var(--el-arrow-size, 28px);
            border: none;
            border-radius: 50%;
            background: var(--el-arrow-color, rgba(0, 0, 0, 0.5));
            color: #fff;
            cursor: pointer;
            opacity: 0;
            pointer-events: none;
            z-index: 2;
            transition: opacity 0.15s ease;
            padding: 0;
          }
          .arrow svg { width: 60%; height: 60%; }
          .wrap.arrows-enabled.can-start .arrow-start { display: flex; }
          .wrap.arrows-enabled.can-end .arrow-end { display: flex; }
          .wrap.arrows-enabled:hover .arrow-start,
          .wrap.arrows-enabled:hover .arrow-end {
            opacity: 1;
            pointer-events: auto;
          }
          .wrap:not(.col) .arrow-start { left: 4px; top: 50%; transform: translateY(-50%); }
          .wrap:not(.col) .arrow-end { right: 4px; top: 50%; transform: translateY(-50%); }
          .wrap.col .arrow-start { top: 4px; left: 50%; transform: translateX(-50%); }
          .wrap.col .arrow-end { bottom: 4px; left: 50%; transform: translateX(-50%); }
        </style>
        <div class="wrap" part="wrap">
          <div class="scroll" part="scroll"><slot></slot></div>
          <div class="mist mist-start" part="mist-start"></div>
          <div class="mist mist-end" part="mist-end"></div>
          <button class="arrow arrow-start" part="arrow-start" type="button" aria-label="Scroll back">${CHEVRON_LEFT}</button>
          <button class="arrow arrow-end" part="arrow-end" type="button" aria-label="Scroll forward">${CHEVRON_RIGHT}</button>
        </div>
      `;
      this._wrapEl = this.$('.wrap');
      this._scrollEl = this.$('.scroll');
      this._arrowStartEl = this.$('.arrow-start');
      this._arrowEndEl = this.$('.arrow-end');

      this._scrollEl.addEventListener('scroll', this._onScroll, { passive: true });
      this._scrollEl.addEventListener('wheel', this._onWheel, { passive: false });
      this._arrowStartEl.addEventListener('click', this._onArrowStartClick);
      this._arrowEndEl.addEventListener('click', this._onArrowEndClick);

      this._edgeResizeObserver = new ResizeObserver(() => this._updateEdgeState());
      this._edgeResizeObserver.observe(this._scrollEl);
    }

    const isColumn = this.direction === 'column';

    this.style.setProperty('--el-flow', isColumn ? 'column' : 'row');
    this.style.setProperty(
      '--el-snap',
      this.boolAttr('snap', false) ? (isColumn ? 'y mandatory' : 'x mandatory') : 'none'
    );
    // Only the element's own scrolling axis becomes a scroll container —
    // the cross axis is left non-scrolling (see .scroll comment above) so
    // wheel/touch input in that direction chains to an ancestor scroller
    // instead of being captured here.
    this.style.setProperty('--el-overflow-x', isColumn ? 'hidden' : 'auto');
    this.style.setProperty('--el-overflow-y', isColumn ? 'auto' : 'hidden');

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

    // Flex axis (not writing-mode) determines which edges "start"/"end"
    // mean for the mist/arrow overlays, so it's a structural class rather
    // than a logical-property trick.
    if (this._wrapEl) {
      this._wrapEl.classList.toggle('col', isColumn);
    }

    // side-arrows: compound "<size> <color>" attribute. Absent/unparsable
    // -> arrows stay off (.arrows-enabled not set), regardless of edge state.
    const arrows = this._parseSideArrows();
    if (arrows) {
      this.style.setProperty('--el-arrow-size', arrows.size);
      this.style.setProperty('--el-arrow-color', arrows.color);
    }
    if (this._wrapEl) {
      this._wrapEl.classList.toggle('arrows-enabled', !!arrows);
    }

    // Content (images, fonts, etc.) may still be loading in; re-attempt so
    // the restored position isn't clamped away before layout settles.
    this._beginRestore();
    this._updateEdgeState();
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