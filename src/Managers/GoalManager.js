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
        this._collisionExpireMs = 1500; // ms after last collision to stop tracking a cell
        this._goalAnimReq = null;
        this._timeExpired = false;

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
        this._stopGoalAnimLoop();
        this.goals = [];
        this.container.innerHTML = '';
        this._timeExpired = false;
        this._winTriggered = false;
        const existingOverlay = document.getElementById('time-up-overlay');
        if (existingOverlay) existingOverlay.remove();
        if (!goalObj) return;
        const keys = Object.keys(goalObj || {});
        // Goal keys expected to be hex strings like "#RRGGBBAA" or machine names
        for (const k of keys) {
            const need = parseInt(goalObj[k], 10) || 0;
            // determine goal kind: color if key starts with '#', 'time' if key is time, otherwise assume machine name
            if (String(k).toLowerCase() === 'time') {
                const entry = this._createEntry({ kind: 'time', key: k, need });
                this.container.appendChild(entry.el);
                this.goals.push(entry);
            } else if (String(k).startsWith('#')) {
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
        // start animating machine swatches (if any)
        this._startGoalAnimLoop();
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
            // store type on canvas for animation frame updates
            sw.dataset.machineType = String(type);
            const data = this.levelManager?.dataManager?.getData(joinDots('machineData', type)) ?? {};
            if (img && data && data.texture) {
                // draw first frame immediately; animation loop will update later
                this._drawMachineFrame(sw, type, performance.now());
            } else {
                const ctx = sw.getContext('2d');
                ctx.fillStyle = '#333333';
                ctx.fillRect(0,0,sw.width,sw.height);
            }
            wrap.appendChild(sw);
            wrap.appendChild(text);
            return { kind: 'machine', key: opts.key, need: opts.need||0, have: 0, el: wrap, haveEl: haveSpan, collidedCells: new Set(), _cellTimers: {}, swCanvas: sw };
        } else if (opts.kind === 'time') {
            // time goal: show hourglass animation + remaining seconds
            const seconds = opts.need || 0;
            const img = this.assetManager.get('hourglass');
            // use haveSpan as remaining display and hide slash/need
            haveSpan.textContent = String(seconds);
            sep.textContent = '';
            needSpan.textContent = '';
            wrap.appendChild(sw);
            wrap.appendChild(text);
            const start = performance.now();
            const entry = { kind: 'time', key: opts.key, need: seconds, el: wrap, haveEl: haveSpan, swCanvas: sw, startTimeMs: start, endTimeMs: start + (seconds * 1000), remaining: seconds };
            if (img) this._drawTimeFrame(sw, entry, start);
            return entry;
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

    _drawMachineFrame(sw, type, nowMs) {
        const ctx = sw.getContext('2d');
        ctx.clearRect(0,0,sw.width,sw.height);
        const img = this.assetManager.get('machines-image');
        if (!img) return;
        const data = this.levelManager?.dataManager?.getData(joinDots('machineData', type)) ?? {};
        const row = (data.texture && data.texture.row) ?? 0;
        const tw = 16; const th = 16;
        const cols = Math.max(1, Math.floor(img.width / tw));
        const tileIndex = row * cols;
        let fps = (data.texture && data.texture.fps) ?? 0;
        if (!fps || fps <= 0) fps = 4;
        const frame = Math.floor((nowMs * fps) / 1000) % cols;
        const sx = frame * tw;
        const sy = Math.floor(tileIndex / cols) * th;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, sx, sy, tw, th, 0, 0, sw.width, sw.height);
    }

    _drawTimeFrame(sw, g, nowMs) {
        const ctx = sw.getContext('2d');
        ctx.clearRect(0,0,sw.width,sw.height);
        const img = this.assetManager.get('hourglass');
        if (!img) {
            ctx.fillStyle = '#333333';
            ctx.fillRect(0,0,sw.width,sw.height);
            return;
        }
        const rows = 2;
        const th = Math.max(1, Math.floor(img.height / rows));
        const tw = th; // assume square frames
        const cols = Math.max(1, Math.floor(img.width / tw));
        const totalMs = Math.max(1, (g.need || 0) * 1000);
        const remainingMs = Math.max(0, (g.endTimeMs || 0) - nowMs);
        const remainingSec = Math.ceil(remainingMs / 1000);
        g.remaining = remainingSec;
        if (g.haveEl) g.haveEl.textContent = String(remainingSec);

        if (remainingMs > 0) {
            // map remaining fraction to first-row frames (0..cols-1)
            // frames should advance as time elapses, so invert the remaining fraction
            const frac = Math.max(0, Math.min(1, remainingMs / totalMs));
            const frame = Math.floor((1 - frac) * (cols - 1));
            const sx = frame * tw;
            const sy = 0;
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img, sx, sy, tw, th, 0, 0, sw.width, sw.height);
        } else {
            // time up frame: second row, first column
            const sx = 0;
            const sy = th;
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img, sx, sy, tw, th, 0, 0, sw.width, sw.height);
        }
    }

    _startGoalAnimLoop() {
        if (this._goalAnimReq) return;
        const loop = (ts) => {
            if (!this.goals || this.goals.length === 0) {
                this._goalAnimReq = requestAnimationFrame(loop);
                return;
            }
            for (const g of this.goals) {
                if (g.kind === 'machine') {
                    const sw = g.swCanvas ?? g.el.querySelector('canvas.goal-swatch');
                    if (!sw) continue;
                    const type = String(g.key);
                    this._drawMachineFrame(sw, type, ts);
                } else if (g.kind === 'time') {
                    const sw = g.swCanvas ?? g.el.querySelector('canvas.goal-swatch');
                    if (!sw) continue;
                    this._drawTimeFrame(sw, g, ts);
                    // if time expired and not yet handled, trigger expiry
                    if ((g.endTimeMs || 0) <= ts && !this._timeExpired) {
                        this._onTimeExpired();
                    }
                }
            }
            this._goalAnimReq = requestAnimationFrame(loop);
        };
        this._goalAnimReq = requestAnimationFrame(loop);
    }

    _stopGoalAnimLoop() {
        if (this._goalAnimReq) {
            cancelAnimationFrame(this._goalAnimReq);
            this._goalAnimReq = null;
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

    // record an item colliding with a machine at grid cell (x,y)
    // Adds the cell to the tracked set immediately, and (re)starts an expiry timer
    recordMachineCollision(type, x, y, itemId) {
        if (!type || x === undefined || y === undefined) return;
        const cellKey = `${x},${y}`;
        for (const g of this.goals) {
            if (g.kind !== 'machine') continue;
            if (String(g.key) !== String(type)) continue;
            g.collidedCells = g.collidedCells || new Set();
            g._cellTimers = g._cellTimers || {};
            // if not already tracked, add immediately
            if (!g.collidedCells.has(cellKey)) {
                g.collidedCells.add(cellKey);
                g.have = (g.have || 0) + 1;
                if (g.haveEl) g.haveEl.textContent = String(g.have);
                this._updateGoalState(g);
            }
            // clear previous timeout if present
            const prev = g._cellTimers[cellKey];
            if (prev && prev.timeoutId) {
                clearTimeout(prev.timeoutId);
            }
            // set new expiry to remove tracking if no collision occurs within expire window
            const timeoutId = setTimeout(() => {
                // remove the cell from tracked set and decrement have
                if (g.collidedCells && g.collidedCells.has(cellKey)) {
                    g.collidedCells.delete(cellKey);
                    g.have = Math.max(0, (g.have || 1) - 1);
                    if (g.haveEl) g.haveEl.textContent = String(g.have);
                    this._updateGoalState(g);
                }
            }, this._collisionExpireMs);
            g._cellTimers[cellKey] = { timeoutId, lastSeen: Date.now() };
        }
    }

    _refreshAllGoals() {
        for (const g of this.goals) {
            if (g.kind === 'machine') {
                // count machines satisfied via collision-tracking (per-grid-cell)
                g.collidedCells = g.collidedCells || new Set();
                g.have = g.collidedCells.size || 0;
                if (g.haveEl) g.haveEl.textContent = String(g.have);
                this._updateGoalState(g);
            } else if (g.kind === 'color') {
                // color goals are only updated via recordSale(), but ensure UI reflects current have
                if (g.haveEl) g.haveEl.textContent = String(g.have || 0);
                this._updateGoalState(g);
            } else if (g.kind === 'time') {
                // initialize display for time
                g.remaining = g.need || 0;
                if (g.haveEl) g.haveEl.textContent = String(g.remaining || 0);
                this._updateGoalState(g);
            }
        }
    }

    _updateGoalState(g) {
        const met = (g.kind === 'time') ? true : ((g.have || 0) >= (g.need || 0));
        const textEl = g.el.querySelector('.goal-text');
        if (textEl) textEl.style.color = met ? '#00FF00' : '#FFFFFF';
        // compute all non-time goals met
        const relevantGoals = this.goals.filter(x => x.kind !== 'time');
        const allMet = relevantGoals.length > 0 && relevantGoals.every(x => (x.have || 0) >= (x.need || 0));
        if (allMet && !this._timeExpired) this._onAllGoalsMet();
    }

    _onTimeExpired() {
        if (this._timeExpired) return;
        this._timeExpired = true;
        // show a simple overlay informing player time is up
        try {
            const overlay = document.createElement('div');
            overlay.id = 'time-up-overlay';
            overlay.style.position = 'fixed';
            overlay.style.left = '0';
            overlay.style.top = '0';
            overlay.style.width = '100%';
            overlay.style.height = '100%';
            overlay.style.display = 'flex';
            overlay.style.alignItems = 'center';
            overlay.style.justifyContent = 'center';
            overlay.style.background = 'rgba(0,0,0,0.8)';
            overlay.style.zIndex = '2000';
            const inner = document.createElement('div');
            inner.style.color = '#FFFFFF';
            inner.style.fontSize = '36px';
            inner.style.textAlign = 'center';
            inner.textContent = "Time's up!";
            overlay.appendChild(inner);
            document.body.appendChild(overlay);
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
                let levelNumber = null;
                try {
                    const levels = this.levelManager?.assetManager?.get('Levels') || {};
                    const keys = Object.keys(levels || {});
                    const idx = keys.indexOf(this.levelManager?.currentLevelKey);
                    if (idx !== -1) levelNumber = idx + 1; // 1-based index used by levelSelect
                    if (levelNumber == null && typeof this.levelManager?.currentLevelKey === 'string') {
                        // attempt to parse trailing digits from key like 'level12'
                        const m = String(this.levelManager.currentLevelKey).match(/(\d+)$/);
                        if (m) levelNumber = parseInt(m[1], 10);
                    }
                } catch (e) {}

                // persist selected level as before
                try {
                    let storeVal = null;
                    if (typeof levelNumber === 'number') storeVal = 'level' + levelNumber;
                    else if (typeof levelParam === 'string' && levelParam.length > 0) storeVal = levelParam;
                    else storeVal = this.levelManager?.currentLevelKey || 'level1';
                    localStorage.setItem('pf_selectedLevel', storeVal);
                } catch (e) {}

                // persist completed levels list (array of 1-based numbers)
                try {
                    if (typeof levelNumber === 'number') {
                        const key = 'pf_completedLevels';
                        let arr = [];
                        try { arr = JSON.parse(localStorage.getItem(key) || '[]') || []; } catch (e) { arr = []; }
                        if (!Array.isArray(arr)) arr = [];
                        if (!arr.includes(levelNumber)) arr.push(levelNumber);
                        localStorage.setItem(key, JSON.stringify(arr));
                    }
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
