/**
 * svg-icon.js
 * -----------
 * Loads an SVG file by URL and inlines its markup into the shadow DOM
 * (rather than using <img src="...">), which is what lets `color` actually
 * recolor the icon — an <img> can't be restyled with CSS, an inlined
 * <svg> can.
 *
 * Usage:
 *   <svg-icon src="/icons/search.svg" width="20px" height="20px" color="#666"></svg-icon>
 *   <svg-icon src="/icons/star.svg" color="gold" force-color label="Favorite"></svg-icon>
 *
 * Attributes:
 *   src           URL of the .svg file to load (same-origin or CORS-enabled)
 *   width/height  any CSS length; both default to "1em" so the icon
 *                 sizes with the surrounding text by default
 *   color         any CSS color; inherited by the SVG via `fill: currentColor`
 *   force-color   boolean attribute — recolors an SVG that already hardcodes
 *                 its own fill/stroke colors, overriding them to currentColor.
 *                 Not needed for well-behaved icon sets (Feather, Heroicons,
 *                 Lucide, etc.) that already omit fill or use currentColor.
 *   label         optional accessible name. Present -> role="img" +
 *                 aria-label. Absent -> icon is aria-hidden (decorative),
 *                 which is the right default for icons paired with visible text.
 *
 * Events:
 *   "load"  detail: { src }              fired once the icon has rendered
 *   "error" detail: { src, error }       fired if fetch/parsing failed
 *
 * Notes:
 *   - Responses are cached per URL (module-level Map) so multiple
 *     <svg-icon> instances pointing at the same file only fetch it once.
 *   - Fetched markup is sanitized before insertion: <script>/<foreignObject>
 *     are stripped, as are on* event handler attributes and javascript:
 *     URLs. This is defense-in-depth, not a substitute for only pointing
 *     `src` at SVGs you trust — treat it the same as any other externally
 *     sourced HTML.
 *   - Rapid src changes (e.g. swapping icons in a loop) are race-safe: a
 *     stale fetch resolving after a newer one won't clobber the display.
 */

import { BaseElement } from './base-element.js';

const iconCache = new Map(); // absolute-ish src string -> Promise<string> sanitized <svg> markup

function fetchSvg(src) {
  if (iconCache.has(src)) return iconCache.get(src);
  const promise = fetch(src, { credentials: 'same-origin' })
    .then((res) => {
      if (!res.ok) throw new Error(`svg-icon: failed to load "${src}" (${res.status})`);
      return res.text();
    })
    .then(sanitizeSvg);
  iconCache.set(src, promise);
  promise.catch(() => iconCache.delete(src)); // don't cache failures
  return promise;
}

function sanitizeSvg(text) {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const svg = doc.documentElement;
  if (!svg || svg.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) {
    throw new Error('svg-icon: response is not a valid <svg> document');
  }

  svg.querySelectorAll('script, foreignObject').forEach((n) => n.remove());

  const stripUnsafeAttrs = (el) => {
    [...el.attributes].forEach((attr) => {
      const name = attr.name.toLowerCase();
      const isEventHandler = name.startsWith('on');
      const isJsUrl = (name === 'href' || name === 'xlink:href') && /^\s*javascript:/i.test(attr.value);
      if (isEventHandler || isJsUrl) el.removeAttribute(attr.name);
    });
    [...el.children].forEach(stripUnsafeAttrs);
  };
  stripUnsafeAttrs(svg);

  // Drop fixed sizing so the host's CSS vars are what control display size.
  svg.removeAttribute('width');
  svg.removeAttribute('height');

  return svg.outerHTML;
}

export class SvgIcon extends BaseElement {
  static get observedAttributes() {
    return BaseElement.withBoxAttributes('src', 'label', 'force-color');
  }

  constructor() {
    super();
    this._wrap = null;
    this._currentSrc = null;
    this._token = 0; // guards against a stale async fetch overwriting a newer one
  }

  render() {
    if (!this._wrap) {
      this.shadowRoot.innerHTML = `
        <style>
          :host {
            display: inline-block;
            line-height: 0;
            color: var(--el-color, currentColor);
          }
          .wrap {
            width: var(--el-width, 1em);
            height: var(--el-height, 1em);
            display: inline-block;
          }
          .wrap svg {
            width: 100%;
            height: 100%;
            display: block;
            fill: currentColor; /* covers icons that omit fill / use currentColor already */
          }
          .wrap[data-state="error"] {
            outline: 1px dashed currentColor;
            opacity: 0.4;
          }
        </style>
        <div class="wrap" part="wrap"></div>
      `;
      this._wrap = this.$('.wrap');
    }

    this._updateAria();

    const src = this.attr('src', '');
    if (src && src !== this._currentSrc) {
      this._currentSrc = src;
      this._load(src);
    } else if (!src) {
      this._currentSrc = null;
      this._token += 1; // invalidate any in-flight load
      this._wrap.innerHTML = '';
      this._wrap.dataset.state = 'empty';
    } else {
      // src unchanged: only cosmetic attrs (color, force-color, label) changed
      this._applyForceColor();
    }
  }

  _updateAria() {
    const label = this.attr('label', '');
    if (label) {
      this._wrap.setAttribute('role', 'img');
      this._wrap.setAttribute('aria-label', label);
      this._wrap.removeAttribute('aria-hidden');
    } else {
      this._wrap.removeAttribute('role');
      this._wrap.removeAttribute('aria-label');
      this._wrap.setAttribute('aria-hidden', 'true');
    }
  }

  async _load(src) {
    const token = ++this._token;
    this._wrap.dataset.state = 'loading';
    try {
      const markup = await fetchSvg(src);
      if (token !== this._token) return; // superseded by a later src change
      this._wrap.innerHTML = markup;
      this._wrap.dataset.state = 'loaded';
      this._applyForceColor();
      this.dispatchEvent(new CustomEvent('load', { detail: { src } }));
    } catch (error) {
      if (token !== this._token) return;
      this._wrap.innerHTML = '';
      this._wrap.dataset.state = 'error';
      this.dispatchEvent(new CustomEvent('error', { detail: { src, error } }));
    }
  }

  /** Overrides an icon's own hardcoded fill/stroke colors with currentColor. */
  _applyForceColor() {
    const svg = this._wrap && this._wrap.querySelector('svg');
    if (!svg || !this.boolAttr('force-color', false)) return;
    svg.querySelectorAll('[fill]:not([fill="none"])').forEach((el) => el.setAttribute('fill', 'currentColor'));
    svg.querySelectorAll('[stroke]:not([stroke="none"])').forEach((el) => el.setAttribute('stroke', 'currentColor'));
  }
}

customElements.define('svg-icon', SvgIcon);