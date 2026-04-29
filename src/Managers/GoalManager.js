import { composeMaskedFrame } from '../Helpers/imageHelpers.js';
import { intHex, stringHex } from '../Helpers/colorHelpers.js';
import { joinDots } from '../Helpers/pathHelpers.js';

export default class GoalManager {
    constructor(assetManager, factoryManager, levelManager) {
        this.assetManager = assetManager;
        this.factoryManager = factoryManager;
        this.levelManager = levelManager;

        this.container = document.getElementById('goal_sidebar');
        if (!this.container) {
            this.container = document.createElement('aside');
            this.container.id = 'goal_sidebar';
            document.body.appendChild(this.container);
        }

        this.goals = []; // { kind: 'color'|'machine', key, colorInt, colorCss, need, have, el, haveEl }

        // Hook into SidebarManager updates so machine counts refresh when sidebar changes
        const sb = this.levelManager?.sidebarManager;
        if (sb) {
            const origRefresh = sb._refreshAllSlots?.bind(sb);
            if (origRefresh) sb._refreshAllSlots = (...a) => { origRefresh(...a); try { this._refreshAllGoals(); } catch (e) {} };
            const origUpdate = sb._updateSlotCountDisplay?.bind(sb);
            if (origUpdate) sb._updateSlotCountDisplay = (...a) => { origUpdate(...a); try { this._refreshAllGoals(); } catch (e) {} };
        }
    }

    populate(goalObj) {
        this.goals = [];
        this.container.innerHTML = '';
        if (!goalObj) return;
        const keys = Object.keys(goalObj || {});
        // Goal keys expected to be hex strings like "#RRGGBBAA" or machine names
        for (const k of keys) {
            const need = parseInt(goalObj[k], 10) || 0;
            // determine goal kind: color if key starts with '#', otherwise assume machine name
            if (String(k).startsWith('#')) {
                let colorInt = null;
                try { colorInt = intHex(k); } catch (e) {
                    const n = parseInt(k, 10);
                    colorInt = Number.isNaN(n) ? null : n;
                }
                const css = stringHex(colorInt);
                const entry = this._createEntry({ kind: 'color', key: k, colorInt, colorCss: css, need });
                this.container.appendChild(entry.el);
                this.goals.push(entry);
            } else {
                const type = String(k);
                const entry = this._createEntry({ kind: 'machine', key: type, need });
                this.container.appendChild(entry.el);
                this.goals.push(entry);
            }
        }
        // initial refresh to populate counts
        this._refreshAllGoals();
    }
    _createEntry(opts) {
        const wrap = document.createElement('div');
        wrap.className = 'goal-entry';

        const sw = document.createElement('canvas');
        // scale canvas intrinsic size ~1.5x to match CSS scaling (24 -> 36)
        sw.width = 36; sw.height = 36;
        sw.className = 'goal-swatch';

        const text = document.createElement('div');
        text.className = 'goal-text';
        const haveSpan = document.createElement('span');
        haveSpan.className = 'goal-have';
        haveSpan.textContent = '0';
        const sep = document.createElement('span');
        sep.className = 'goal-sep';
        sep.textContent = ' / ';
        const needSpan = document.createElement('span');
        needSpan.className = 'goal-need';
        needSpan.textContent = String(opts.need || 0);

        text.appendChild(haveSpan);
        text.appendChild(sep);
        text.appendChild(needSpan);

        // draw depending on kind
        if (opts.kind === 'machine') {
            // draw machine texture instead of item texture
            const type = opts.key;
            const img = this.assetManager.get('machines-image');
            const data = this.levelManager?.dataManager?.getData(joinDots('machineData', type)) ?? {};
            if (img && data && data.texture) {
                const row = data.texture.row || 0;
                const tw = 16; const th = 16;
                const cols = Math.max(1, Math.floor(img.width / tw));
                const tileIndex = row * cols;
                const sx = 0;
                const sy = Math.floor(tileIndex / cols) * th;
                const ctx = sw.getContext('2d');
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(img, sx, sy, tw, th, 0, 0, sw.width, sw.height);
            } else {
                const ctx = sw.getContext('2d');
                ctx.fillStyle = '#333333';
                ctx.fillRect(0,0,sw.width,sw.height);
            }
            wrap.appendChild(sw);
            wrap.appendChild(text);
            return { kind: 'machine', key: opts.key, need: opts.need||0, have: 0, el: wrap, haveEl: haveSpan };
        } else {
            // color goal
            const colorInt = opts.colorInt ?? null;
            const colorCss = opts.colorCss ?? stringHex(colorInt);
            const img = this.assetManager.get('color');
            if (img) {
                const sprite = composeMaskedFrame(img, 16, [1,0], [0,0], colorInt, 0x00FF00FF);
                const ctx = sw.getContext('2d');
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(sprite, 0, 0, sprite.width, sprite.height, 0, 0, sw.width, sw.height);
            } else {
                const ctx = sw.getContext('2d');
                ctx.fillStyle = colorCss || '#FFFFFF';
                ctx.fillRect(0,0,sw.width,sw.height);
            }
            wrap.appendChild(sw);
            wrap.appendChild(text);
            return { kind: 'color', key: opts.key, colorInt: opts.colorInt, colorCss: opts.colorCss, need: opts.need||0, have: 0, el: wrap, haveEl: haveSpan };
        }
    }

    // record a sold item color (int hex or css); increments have count for matching goal if present
    recordSale(color) {
        if (color === null || color === undefined) return;
        let colInt = null;
        try { colInt = intHex(color); } catch (e) { colInt = Number(color); }
        if (colInt === null || colInt === undefined) return;
        // find matching goal (compare integer values)
        for (const g of this.goals) {
            if (g.kind === 'color' && g.colorInt === colInt) {
                g.have = (g.have || 0) + 1;
                if (g.haveEl) g.haveEl.textContent = String(g.have);
                this._updateGoalState(g);
                return;
            }
        }
    }

    _refreshAllGoals() {
        for (const g of this.goals) {
            if (g.kind === 'machine') {
                // use SidebarManager's count helper if available
                let placed = 0;
                try {
                    const sb = this.levelManager?.sidebarManager;
                    if (sb && typeof sb._countPlacedOfType === 'function') placed = sb._countPlacedOfType(g.key);
                    else {
                        // fallback: count via factory grid
                        const grid = this.factoryManager?.grid || [];
                        for (let x = 0; x < grid.length; x++) {
                            for (let y = 0; y < (grid[x] || []).length; y++) {
                                const m = grid[x][y];
                                if (!m) continue;
                                if ((m.name || (m.data && m.data.type)) === g.key) placed++;
                            }
                        }
                    }
                } catch (e) { placed = 0; }
                g.have = placed;
                if (g.haveEl) g.haveEl.textContent = String(g.have);
                this._updateGoalState(g);
            } else if (g.kind === 'color') {
                // color goals are only updated via recordSale(), but ensure UI reflects current have
                if (g.haveEl) g.haveEl.textContent = String(g.have || 0);
                this._updateGoalState(g);
            }
        }
    }

    _updateGoalState(g) {
        try {
            const met = (g.have || 0) >= (g.need || 0);
            const textEl = g.el.querySelector('.goal-text');
            if (textEl) textEl.style.color = met ? '#00FF00' : '#FFFFFF';
            // if all goals are met, trigger win sequence
            try {
                const allMet = this.goals.length > 0 && this.goals.every(x => (x.have || 0) >= (x.need || 0));
                if (allMet) this._onAllGoalsMet();
            } catch (e) {}
        } catch (e) {}
    }

    _onAllGoalsMet() {
        if (this._winTriggered) return;
        this._winTriggered = true;
        // confetti for a few seconds, then fade to black and navigate to win.html
        const lm = this.levelManager;
        const pm = lm?.particleManager || null;
        const canvas = document.getElementById('Draw');
        const cw = canvas ? canvas.width : (window.innerWidth || 800);
        const ch = canvas ? canvas.height : (window.innerHeight || 600);

        // spawn confetti from above across the canvas for 3 seconds
        const duration = 3000;
        const spawnInterval = 120; // ms
        const start = performance.now();
        const iid = setInterval(() => {
            const now = performance.now();
            if (now - start > duration) return;
            // spawn 3 bursts across random x positions near the top
            for (let i = 0; i < 3; i++) {
                const x = Math.random() * cw;
                const y = -10 - Math.random() * 30;
                pm.spawnAt(x, y, { count: 12, speed: 500, life: 2500, colors: [0xFF5555FF, 0x5555FFFF, 0xFFFF55FF, 0x55FF55FF], gravityStrength: 1500, size: 20 });
            }
        }, spawnInterval);

        // stop spawning after duration, then fade
        setTimeout(() => {
            clearInterval(iid);
            // create fade overlay
            const overlay = document.createElement('div');
            overlay.id = 'goal-win-fade';
            overlay.style.position = 'fixed';
            overlay.style.left = '0';
            overlay.style.top = '0';
            overlay.style.width = '100%';
            overlay.style.height = '100%';
            overlay.style.background = '#000';
            overlay.style.opacity = '0';
            overlay.style.transition = 'opacity 800ms ease-in-out';
            overlay.style.zIndex = '2000';
            // helper to persist selected level and navigate
            const persistAndNavigate = () => {
                let levelParam = this.levelManager?.currentLevelKey ?? '';
                try {
                    const levels = this.levelManager?.assetManager?.get('Levels') || {};
                    const keys = Object.keys(levels || {});
                    const idx = keys.indexOf(this.levelManager?.currentLevelKey);
                    if (idx !== -1) levelParam = idx + 1; // 1-based index used by levelSelect
                } catch (e) {}
                try {
                    let storeVal = null;
                    if (typeof levelParam === 'number') storeVal = 'level' + levelParam;
                    else if (typeof levelParam === 'string' && levelParam.length > 0) storeVal = levelParam;
                    else storeVal = this.levelManager?.currentLevelKey || 'level1';
                    localStorage.setItem('pf_selectedLevel', storeVal);
                } catch (e) {}
                window.location.href = 'win.html';
            };

            // Track whether we've already navigated (so fallback doesn't double-run)
            let navigated = false;
            const onTransitionEnd = () => { if (!navigated) { navigated = true; persistAndNavigate(); } };
            overlay.addEventListener('transitionend', onTransitionEnd, { once: true });
            document.body.appendChild(overlay);
            // force layout then start fade (listener attached before triggering)
            void overlay.offsetWidth;
            overlay.style.opacity = '1';
            // fallback: if transitionend missed for any reason, ensure we still persist+navigate
            setTimeout(() => { if (!navigated) { navigated = true; persistAndNavigate(); } }, 1600);
        }, duration + 200);
    }
}
