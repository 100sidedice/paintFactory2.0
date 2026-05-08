/**
 * Custom <pf-prompt> web component to replace window.prompt()
 * Usage: await customPrompt('Title', 'default value')
 */
class CustomPrompt extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._resolvePromise = null;
    }

    connectedCallback() {
        // If no resolve promise is set, auto-close the prompt (happens on page reload)
        setTimeout(() => {
            if (!this._resolvePromise) {
                this.remove();
            }
        }, 0);
        this.render();
    }

    render() {
        const title = this.getAttribute('title') || 'Enter value';
        const defaultValue = this.getAttribute('value') || '';

        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    --primary-color: #4a90e2;
                    --bg-color: #2a2a2a;
                    --border-color: #444444;
                    --text-color: #ffffff;
                    --button-hover: #357abd;
                    --button-bg: #353535;
                    --button-hover-bg: #404040;
                }

                .overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.75);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 10000;
                    font-family: system-ui, -apple-system, sans-serif;
                }

                .dialog {
                    background: var(--bg-color);
                    border: 1px solid var(--border-color);
                    border-radius: 8px;
                    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
                    padding: 20px;
                    min-width: 300px;
                    max-width: 90vw;
                }

                .title {
                    font-size: 16px;
                    font-weight: 600;
                    color: var(--text-color);
                    margin-bottom: 12px;
                }

                .content {
                    margin-bottom: 16px;
                }

                input {
                    width: 100%;
                    padding: 8px 10px;
                    border: 1px solid var(--border-color);
                    border-radius: 4px;
                    font-size: 14px;
                    color: var(--text-color);
                    background: #1b1b1b;
                    box-sizing: border-box;
                    font-family: inherit;
                }

                input:focus {
                    outline: none;
                    border-color: var(--primary-color);
                    box-shadow: 0 0 4px rgba(74, 144, 226, 0.4);
                }

                .buttons {
                    display: flex;
                    gap: 10px;
                    justify-content: flex-end;
                }

                button {
                    padding: 8px 16px;
                    border: 1px solid var(--border-color);
                    border-radius: 4px;
                    background: var(--button-bg);
                    color: var(--text-color);
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 500;
                    transition: all 0.15s ease;
                }

                button:hover {
                    background: var(--button-hover-bg);
                    border-color: #555555;
                }

                button.ok {
                    background: var(--primary-color);
                    border-color: var(--primary-color);
                }

                button.ok:hover {
                    background: var(--button-hover);
                    border-color: var(--button-hover);
                }

                button:active {
                    transform: scale(0.98);
                }
            </style>

            <div class="overlay">
                <div class="dialog">
                    <div class="title"></div>
                    <div class="content">
                        <input type="text" />
                    </div>
                    <div class="buttons">
                        <button class="cancel">Cancel</button>
                        <button class="del">Delete</button>
                        <button class="ok">OK</button>
                    </div>
                </div>
            </div>
        `;

        const titleEl = this.shadowRoot.querySelector('.title');
        const input = this.shadowRoot.querySelector('input');
        const cancelBtn = this.shadowRoot.querySelector('button.cancel');
        const delBtn = this.shadowRoot.querySelector('button.del');
        const okBtn = this.shadowRoot.querySelector('button.ok');

        titleEl.textContent = title;
        input.value = defaultValue;

        // Focus input and select all text
        input.focus();
        input.select();

        // Handle OK button
        okBtn.addEventListener('click', () => this.resolve(input.value));

        // Handle Cancel button
        cancelBtn.addEventListener('click', () => this.resolve(null));

        // Handle Delete button (returns a special token)
        delBtn.addEventListener('click', () => this.resolve('__PROMPT_DELETE__'));

        // Handle Enter key
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.stopPropagation();
                e.preventDefault();
                this.resolve(input.value);
            } else if (e.key === 'Escape') {
                e.stopPropagation();
                e.preventDefault();
                this.resolve(null);
            } else {
                // Allow normal typing - only stop propagation, not default
                e.stopPropagation();
            }
        });

        // Handle Escape key on dialog
        this.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.resolve(null);
            }
        });
    }

    resolve(value) {
        if (this._resolvePromise) {
            this._resolvePromise(value);
        }
        // Re-enable Input manager if it was blocked
        if (window._inputManagerBlocked) {
            window._inputManager?.unblock?.();
            window._inputManagerBlocked = false;
        }
        // Remove element from DOM
        this.remove();
    }

    static async show(title, defaultValue = '') {
        const prompt = document.createElement('pf-prompt');
        prompt.setAttribute('title', title);
        prompt.setAttribute('value', defaultValue);
        
        // Block Input manager while prompt is open
        if (window._inputManager) {
            window._inputManager.block?.();
            window._inputManagerBlocked = true;
        }
        
        document.body.appendChild(prompt);

        return new Promise((resolve) => {
            prompt._resolvePromise = resolve;
        });
    }
}

customElements.define('pf-prompt', CustomPrompt);

/**
 * Convenience function to match window.prompt() API
 * Returns null if cancelled, string if confirmed
 */
export async function customPrompt(title, defaultValue = '') {
    return await CustomPrompt.show(title, defaultValue);
}

export default CustomPrompt;
