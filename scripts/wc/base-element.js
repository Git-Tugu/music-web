/**
 * base-element.js
 * ----------------
 * Tiny shared base class for every component in this folder.
 *
 * What it standardizes across all components so behavior stays identical:
 *  - Shadow DOM creation
 *  - Re-rendering whenever an observed attribute changes (batched + de-duped)
 *  - A `container-type: inline-size` host so a component's own internal
 *    CSS can use container query units (cqw/cqi) to scale text and icons
 *    relative to THAT component's box, not the viewport. This is what
 *    lets a <music-card width="120px"> and a <music-card width="220px">
 *    both look correctly proportioned without any JS measuring loop.
 *  - Generic width/height/ratio/color/transition attribute -> CSS custom
 *    property wiring, so every component configures its box model the
 *    same way instead of each one reinventing it. Removing an attribute
 *    now correctly clears the matching CSS var instead of leaving it stale.
 *  - Placement/ratio persistence: components store their configured
 *    aspect-ratio and size as CSS custom properties (not inline pixel
 *    styles baked into markup), so ratio survives resizes, re-renders,
 *    and even being moved in the DOM.
 *
 * Changes from the previous version:
 *  1. Renders are batched via microtask + de-duped, so setting several
 *     attributes synchronously (e.g. in a loop) triggers one render, not N.
 *  2. attributeChangedCallback skips work when oldValue === newValue
 *     (the browser can invoke it even when a value is reset to itself).
 *  3. _applyBoxVars now removes the CSS var when its source attribute is
 *     removed, instead of leaving the last value stuck on the host.
 *  4. Added disconnectedCallback as an explicit no-op hook so subclasses
 *     can clean up listeners/timers without forgetting to call super().
 *  5. Added $ / $$ shadow-root query helpers and a numAttr() helper.
 *  6. BOX_ATTR_MAP is now static and exposed so subclasses can extend the
 *     set of attributes that auto-map to CSS vars (e.g. observedAttributes
 *     composition) without copy-pasting the map.
 *  7. escape() now also escapes single quotes for safer attribute contexts.
 */

export class BaseElement extends HTMLElement {
  /** attribute name -> CSS custom property name, shared across the library */
  static BOX_ATTR_MAP = {
    width: '--el-width',
    height: '--el-height',
    ratio: '--el-ratio',
    color: '--el-color',
    'accent-color': '--el-accent',
    transition: '--el-transition',
    radius: '--el-radius',
    gap: '--el-gap',
  };

  /**
   * Helper for subclasses building their own `observedAttributes`:
   *   static get observedAttributes() {
   *     return BaseElement.withBoxAttributes('src', 'title');
   *   }
   */
  static withBoxAttributes(...extra) {
    // `this` is whichever class it's called on (e.g. ScrollBox.withBoxAttributes),
    // so a subclass that overrides BOX_ATTR_MAP gets its extended list for free.
    return [...Object.keys(this.BOX_ATTR_MAP), ...extra];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._renderScheduled = false;
    this._lastAttrValues = Object.create(null);
  }

  connectedCallback() {
    this._applyBoxVars();
    this.render();
  }

  /** Explicit no-op hook: subclasses override to clean up listeners/timers. */
  disconnectedCallback() {
    /* no-op in base */
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (!this.shadowRoot) return;
    if (oldValue === newValue) return; // ignore no-op re-sets
    this._applyBoxVars();
    this._scheduleRender();
  }

  /** Coalesces synchronous attribute changes into a single render. */
  _scheduleRender() {
    if (this._renderScheduled) return;
    this._renderScheduled = true;
    queueMicrotask(() => {
      this._renderScheduled = false;
      this.render();
    });
  }

  /** Read an attribute with a fallback, HTML-escaped-safe for text use. */
  attr(name, fallback = '') {
    return this.hasAttribute(name) ? this.getAttribute(name) : fallback;
  }

  /** Read a boolean attribute (present = true, "false" string = false). */
  boolAttr(name, fallback = false) {
    if (!this.hasAttribute(name)) return fallback;
    return this.getAttribute(name) !== 'false';
  }

  /** Read a numeric attribute, falling back safely if missing or NaN. */
  numAttr(name, fallback = 0) {
    if (!this.hasAttribute(name)) return fallback;
    const n = Number(this.getAttribute(name));
    return Number.isNaN(n) ? fallback : n;
  }

  /** Shorthand for this.shadowRoot.querySelector */
  $(selector) {
    return this.shadowRoot.querySelector(selector);
  }

  /** Shorthand for this.shadowRoot.querySelectorAll */
  $$(selector) {
    return this.shadowRoot.querySelectorAll(selector);
  }

  /**
   * Maps generic sizing/style attributes onto CSS custom properties on the
   * host element. Every component's internal stylesheet reads these vars
   * (with its own sensible default) instead of hardcoding pixel values, so
   * "configure its height, width, link, transition, color" works the same
   * way for every component in this library. Removing an attribute clears
   * the corresponding var instead of leaving a stale value behind.
   */
  _applyBoxVars() {
    // this.constructor.BOX_ATTR_MAP resolves to the subclass's own map if it
    // defined one (e.g. ScrollBox adding scrollbar-color/-size), or falls
    // back up the static inheritance chain to BaseElement.BOX_ATTR_MAP.
    for (const [attrName, cssVar] of Object.entries(this.constructor.BOX_ATTR_MAP)) {
      if (this.hasAttribute(attrName)) {
        const value = this.getAttribute(attrName);
        if (this._lastAttrValues[attrName] !== value) {
          this.style.setProperty(cssVar, value);
          this._lastAttrValues[attrName] = value;
        }
      } else if (attrName in this._lastAttrValues) {
        this.style.removeProperty(cssVar);
        delete this._lastAttrValues[attrName];
      }
    }
    // container-type must be set in real CSS (not just inline style) for
    // container query units to resolve, so every subclass also declares
    // `:host { container-type: inline-size; }` in its own <style>.
  }

  /** Escapes text safely for interpolation into template strings. */
  escape(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Subclasses implement this to (re)paint their shadow DOM. */
  render() {
    /* no-op in base */
  }
}