import {BaseElement} from './base-element.js';

export class TransparentContainer extends BaseElement {
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
                </style>
                <div class="wrap" part="wrap"></div>
            `;
            this._wrap = this.$('.wrap');
        }
    }
}
customElements.define('transparent-container', TransparentContainer);