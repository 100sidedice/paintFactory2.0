import { composeMaskedFrame } from '../Helpers/imageHelpers.js';
import { intHex, stringHex } from '../Helpers/colorHelpers.js';
import { joinDots } from '../Helpers/pathHelpers.js';
import { customPrompt } from '../World/CustomPrompt.js';

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

        this.goals = [];
        this._collisionExpireMs = 1500;
        this._goalAnimReq = null;
        this._timeExpired = false;

        this._recentGoals = new Set();
        this._recentGoalTimeouts = {};
        this._speedBoostDurationMs = 3000;
        this._speedBoostMultiplier = 10;
        this._speedBoostActive = false;
        this._speedBoostAvailable = false;
        this._speedBoostListeners = [];
        
        // Store input manager for goal click handling
        this.input = levelManager?.input || null;

        const sb = this.levelManager.sidebarManager;
        if (sb) {
            const origRefresh = sb._refreshAllSlots?.bind(sb);
            if (origRefresh) {
                sb._refreshAllSlots = (...a) => {
                    origRefresh(...a);
                    this._refreshAllGoals();
                };
            }

            const origUpdate = sb._updateSlotCountDisplay?.bind(sb);
            if (origUpdate) {
                sb._updateSlotCountDisplay = (...a) => {
                    origUpdate(...a);
                    this._refreshAllGoals();
                };
            }
        }
    }

    addSpeedBoostListener(fn) {
        if (typeof fn !== 'function') return;
        this._speedBoostListeners.push(fn);
    }

    _notifySpeedBoostListeners() {
        for (const fn of this._speedBoostListeners) {
            fn({
                available: this._speedBoostAvailable,
                active: this._speedBoostActive
            });
        }
    }

    toggleSpeedBoost() {
        if (this._speedBoostActive) {
            this._deactivateSpeedBoost();
        } else if (this._speedBoostAvailable) {
            this._activateSpeedBoost();
        }
    }

    populate(goalObj) {
        this._stopGoalAnimLoop();

        this.goals = [];
        this.container.innerHTML = '';

        for (const k of Object.keys(this._recentGoalTimeouts || {})) {
            const t = this._recentGoalTimeouts[k];
            if (t) clearTimeout(t);
        }

        this._recentGoals = new Set();
        this._recentGoalTimeouts = {};
        this._timeExpired = false;
        this._winTriggered = false;

        const existingOverlay = document.getElementById('time-up-overlay');
        if (existingOverlay) existingOverlay.remove();

        if (!goalObj) return;

        const normalizedGoalObj = this._normalizeGoalObject(goalObj);
        const keys = Object.keys(normalizedGoalObj || {});
        console.log(`GoalManager.populate: ${keys.length} goals`);

        for (const k of keys) {
            const need = parseInt(normalizedGoalObj[k], 10) || 0;

            if (String(k).toLowerCase() === 'time') {
                const entry = this._createEntry({
                    kind: 'time',
                    key: k,
                    need
                });

                this.container.appendChild(entry.el);
                this.goals.push(entry);
                this._attachGoalClickHandler(entry);
                console.log(`GoalManager: attached handler to time goal`);

            } else if (String(k).startsWith('#')) {
                let colorInt = intHex(k);
                const css = stringHex(colorInt);

                const entry = this._createEntry({
                    kind: 'color',
                    key: k,
                    colorInt,
                    colorCss: css,
                    need
                });

                this.container.appendChild(entry.el);
                this.goals.push(entry);
                this._attachGoalClickHandler(entry);
                console.log(`GoalManager: attached handler to color goal ${k}`);

            } else {
                const type = String(k);

                const entry = this._createEntry({
                    kind: 'machine',
                    key: type,
                    need
                });

                this.container.appendChild(entry.el);
                this.goals.push(entry);
                this._attachGoalClickHandler(entry);
                console.log(`GoalManager: attached handler to machine goal ${k}`);
            }
        }

        this._refreshAllGoals();
        this._startGoalAnimLoop();
    }

    _attachGoalClickHandler(entry) {
        if (!entry || !entry.el) return;
        
        // Use the element's click handler with pointer-events and custom approach for Firefox compatibility
        entry.el.style.cursor = 'pointer';
        entry.el.addEventListener('click', async (ev) => {
            console.log(`Goal entry clicked: ${entry.key}`, ev);
            if (!this.levelManager?.devMode) {
                console.log(`devMode is ${this.levelManager?.devMode}, skipping`);
                return;
            }
            ev.stopPropagation();
            
            const key = entry.key;
            const kind = entry.kind;
            
            // Build sample text based on goal kind
            let sample = '';
            if (kind === 'time') {
                sample = `time, ${entry.need || 0}`;
            } else if (kind === 'color') {
                sample = `dye, ${entry.key}, ${entry.need || 0}`;
            } else if (kind === 'machine') {
                sample = `machine, ${entry.key}, ${entry.need || 0}`;
            }
            
            const input = await customPrompt('Edit goal (or press Delete)', sample);
            if (!input) return;

            // support the prompt's delete button token
            if (input === '__PROMPT_DELETE__') {
                // Remove this goal
                const goalObjRef = this.levelManager.currentLevelData = this.levelManager.currentLevelData || {};
                goalObjRef.Goal = goalObjRef.Goal || goalObjRef.goal || {};
                 const actualKey = Object.keys(goalObjRef.Goal || {}).find(k => String(k).toLowerCase() === String(key).toLowerCase()) || key;
                 delete goalObjRef.Goal[actualKey];
                this.populate(goalObjRef.Goal);
                return;
            }
            
            const lower = input.trim().toLowerCase();
            if (lower === 'del' || lower === 'delete' || lower === 'remove' || lower === 'rm') {
                // Remove this goal (text typed)
                const goalObjRef = this.levelManager.currentLevelData = this.levelManager.currentLevelData || {};
                goalObjRef.Goal = goalObjRef.Goal || goalObjRef.goal || {};
                 const actualKey = Object.keys(goalObjRef.Goal || {}).find(k => String(k).toLowerCase() === String(key).toLowerCase()) || key;
                 delete goalObjRef.Goal[actualKey];
                this.populate(goalObjRef.Goal);
                return;
            }
            
            // Parse and update goal
            const parts = input.split(',').map(p=>p.trim()).filter(p=>p!=='');
            if (!parts || parts.length === 0) return;
            
            const cmd = parts[0].toLowerCase();
            const goalObjRef = this.levelManager.currentLevelData = this.levelManager.currentLevelData || {};
            goalObjRef.Goal = goalObjRef.Goal || goalObjRef.goal || {};
            const goalsRef = goalObjRef.Goal;

            // Single-number input should shift this goal's position (1-based index)
            // rather than replace the key or modify amounts. Example: entering
            // "3" moves this goal to slot 3, shifting others.
            if (parts.length === 1 && /^[0-9]+$/.test(parts[0])) {
                const desired = parseInt(parts[0], 10);
                if (Number.isFinite(desired) && desired > 0) {
                    const oldKeys = Object.keys(goalsRef || {});
                        const matchKey = oldKeys.find(k => String(k).toLowerCase() === String(actualKey).toLowerCase()) || actualKey;
                        if (oldKeys.includes(matchKey)) {
                            const filtered = oldKeys.filter(k => String(k).toLowerCase() !== String(matchKey).toLowerCase());
                        const insertIdx = Math.max(0, Math.min(filtered.length, desired - 1));
                            filtered.splice(insertIdx, 0, matchKey);
                        const newGoals = {};
                        for (const k of filtered) newGoals[k] = goalsRef[k];
                        goalObjRef.Goal = newGoals;
                        this.populate(newGoals);
                        return;
                    }
                }
            }

            if (cmd === 'dye' || cmd === 'color' || cmd === '#') {
                const col = parts[1] ? (parts[1].startsWith('#') ? parts[1].toUpperCase() : `#${parts[1].toUpperCase()}`) : null;
                const cnt = parseInt(parts[2], 10) || 0;
                // Remove old key if it changed
                    const matchKey = Object.keys(goalsRef || {}).find(k => String(k).toLowerCase() === String(actualKey).toLowerCase()) || actualKey;
                    if (col && matchKey !== col) delete goalsRef[matchKey];
                if (col) goalsRef[col] = cnt;
            } else if (cmd === 'machine' || cmd === 'm') {
                const m = parts[1] || null;
                const cnt = parseInt(parts[2], 10) || 0;
                // Remove old key if it changed
                    const matchKey = Object.keys(goalsRef || {}).find(k => String(k).toLowerCase() === String(actualKey).toLowerCase()) || actualKey;
                    if (m && matchKey !== m) delete goalsRef[matchKey];
                if (m) goalsRef[m] = cnt;
            } else if (cmd === 'time') {
                const cnt = parseInt(parts[1], 10) || 0;
                // Remove old time if present
                delete goalsRef['time'];
                delete goalsRef['Time'];
                goalsRef['time'] = cnt;
            } else {
                const maybeName = parts[0];
                const maybeCnt = parseInt(parts[1], 10) || 0;
                // Remove old key if it changed
                    const matchKey = Object.keys(goalsRef || {}).find(k => String(k).toLowerCase() === String(actualKey).toLowerCase()) || actualKey;
                    if (maybeName && matchKey !== maybeName) delete goalsRef[matchKey];
                goalsRef[maybeName] = maybeCnt;
            }
            
            this.populate(goalsRef);
        });
    }

    _normalizeGoalObject(goalObj) {
        if (!goalObj || typeof goalObj !== 'object') return goalObj;

        const normalized = { ...goalObj };

        const timeValue = normalized.time ?? normalized.Time;

        if (timeValue !== undefined) {
            normalized.time = timeValue;
        }

        delete normalized.Time;

        return normalized;
    }

    _createEntry(opts) {
        const wrap = document.createElement('div');
        wrap.className = 'goal-entry';

        const sw = document.createElement('canvas');
        sw.width = 36;
        sw.height = 36;
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

        if (opts.kind === 'machine') {
            const type = opts.key;

            sw.dataset.machineType = String(type);

            this._drawMachineFrame(sw, type, performance.now());

            wrap.appendChild(sw);
            wrap.appendChild(text);

            return {
                kind: 'machine',
                key: opts.key,
                need: opts.need || 0,
                have: 0,
                el: wrap,
                haveEl: haveSpan,
                collidedCells: new Set(),
                _cellTimers: {},
                swCanvas: sw
            };

        } else if (opts.kind === 'time') {
            const seconds = opts.need || 0;

            haveSpan.textContent = String(seconds);
            sep.textContent = '';
            needSpan.textContent = '';

            wrap.appendChild(sw);
            wrap.appendChild(text);

            const start = performance.now();

            const entry = {
                kind: 'time',
                key: opts.key,
                need: seconds,
                el: wrap,
                haveEl: haveSpan,
                swCanvas: sw,
                startTimeMs: start,
                endTimeMs: start + (seconds * 1000),
                remaining: seconds
            };

            this._drawTimeFrame(sw, entry, start);

            return entry;

        } else {
            const colorInt = opts.colorInt ?? null;
            const colorCss = opts.colorCss ?? stringHex(colorInt);

            const img = this.assetManager.get('color');

            if (img) {
                const sprite = composeMaskedFrame(
                    img,
                    16,
                    [1, 0],
                    [0, 0],
                    colorInt,
                    0x00FF00FF
                );

                const ctx = sw.getContext('2d');
                ctx.imageSmoothingEnabled = false;

                ctx.drawImage(
                    sprite,
                    0,
                    0,
                    sprite.width,
                    sprite.height,
                    0,
                    0,
                    sw.width,
                    sw.height
                );

            } else {
                const ctx = sw.getContext('2d');
                ctx.fillStyle = colorCss || '#FFFFFF';
                ctx.fillRect(0, 0, sw.width, sw.height);
            }

            wrap.appendChild(sw);
            wrap.appendChild(text);

            return {
                kind: 'color',
                key: opts.key,
                colorInt: opts.colorInt,
                colorCss: opts.colorCss,
                need: opts.need || 0,
                have: 0,
                el: wrap,
                haveEl: haveSpan
            };
        }
    }

    _drawMachineFrame(sw, type, nowMs) {
        const ctx = sw.getContext('2d');

        ctx.clearRect(0, 0, sw.width, sw.height);

        const img = this.assetManager.get('machines-image');
        if (!img) return;

        const data = this.levelManager.dataManager.getData(
            joinDots('machineData', type)
        ) ?? {};

        const row = (data.texture && data.texture.row) ?? 0;

        const tw = 16;
        const th = 16;

        const cols = Math.max(1, Math.floor(img.width / tw));
        const tileIndex = row * cols;

        let fps = (data.texture && data.texture.fps) ?? 0;

        if (!fps || fps <= 0) fps = 4;

        const frameCount = Math.max(
            1,
            data.texture?.frameCount ?? cols
        );

        const frameLimit = Math.min(cols, frameCount);

        const frame = Math.floor((nowMs * fps) / 1000) % frameLimit;

        const sx = frame * tw;
        const sy = Math.floor(tileIndex / cols) * th;

        ctx.imageSmoothingEnabled = false;

        ctx.drawImage(
            img,
            sx,
            sy,
            tw,
            th,
            0,
            0,
            sw.width,
            sw.height
        );
    }

    _drawTimeFrame(sw, g, nowMs) {
        const ctx = sw.getContext('2d');

        ctx.clearRect(0, 0, sw.width, sw.height);

        const img = this.assetManager.get('hourglass');
        if (!img) return;

        const rows = 2;
        const th = Math.max(1, Math.floor(img.height / rows));
        const tw = th;

        const cols = Math.max(1, Math.floor(img.width / tw));

        const totalMs = Math.max(1, (g.need || 0) * 1000);

        const devMode = !!this.levelManager?.devMode;
        const paused = !!this.factoryManager?.paused;

        // FREEZE TIMER DURING DEV MODE OR PAUSE
        const shouldFreeze = devMode || paused;

        if (shouldFreeze) {
            if (!g._timerFrozen) {
                g._timerFrozen = true;

                g._frozenRemainingMs = Math.max(
                    0,
                    (g.endTimeMs || 0) - nowMs
                );
            }
        } else if (g._timerFrozen) {
            const remaining = Math.max(
                0,
                g._frozenRemainingMs ??
                Math.max(0, (g.endTimeMs || 0) - nowMs)
            );

            g.endTimeMs = nowMs + remaining;

            g._timerFrozen = false;

            delete g._frozenRemainingMs;
        }

        let remainingMs;

        if (shouldFreeze) {
            remainingMs = Math.max(
                0,
                g._frozenRemainingMs ??
                Math.max(0, (g.endTimeMs || 0) - nowMs)
            );
        } else {
            remainingMs = Math.max(
                0,
                (g.endTimeMs || 0) - nowMs
            );
        }

        const remainingSec = Math.ceil(remainingMs / 1000);

        g.remaining = remainingSec;

        if (g.haveEl) {
            g.haveEl.textContent = String(remainingSec);
        }

        if (remainingMs > 0) {
            const frac = Math.max(
                0,
                Math.min(1, remainingMs / totalMs)
            );

            const frame = Math.floor(
                (1 - frac) * (cols - 1)
            );

            const sx = frame * tw;
            const sy = 0;

            ctx.imageSmoothingEnabled = false;

            ctx.drawImage(
                img,
                sx,
                sy,
                tw,
                th,
                0,
                0,
                sw.width,
                sw.height
            );

        } else {
            const sx = 0;
            const sy = th;

            ctx.imageSmoothingEnabled = false;

            ctx.drawImage(
                img,
                sx,
                sy,
                tw,
                th,
                0,
                0,
                sw.width,
                sw.height
            );
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
                    const sw = g.swCanvas ??
                        g.el.querySelector('canvas.goal-swatch');

                    if (!sw) continue;

                    this._drawMachineFrame(sw, String(g.key), ts);

                } else if (g.kind === 'time') {
                    const sw = g.swCanvas ??
                        g.el.querySelector('canvas.goal-swatch');

                    if (!sw) continue;

                    this._drawTimeFrame(sw, g, ts);

                    // DON'T EXPIRE WHILE PAUSED
                    if (
                        !this.levelManager?.devMode &&
                        !this.factoryManager?.paused &&
                        (g.endTimeMs || 0) <= ts &&
                        !this._timeExpired
                    ) {
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
        const machineGoals = this.goals.filter(g => g.kind === 'machine');
        // if any machine goals are not met, don't count sales towards color goals yet, to encourage completing machine goals first
        const unmetMachineGoals = machineGoals.filter(g => (g.have || 0) < (g.need || 0));
        if (unmetMachineGoals.length > 0) return;
        if (color === null || color === undefined) return;
        let colInt = intHex(color);
        if (colInt === null || colInt === undefined) return;
        // find matching goal (compare integer values)
        for (const g of this.goals) {
            if (g.kind === 'color' && g.colorInt === colInt) {
                g.have = (g.have || 0) + 1;
                if (g.haveEl) g.haveEl.textContent = String(g.have);
                this._updateGoalState(g);
                // mark this goal as recently received and check whether all goals are recent
                this._markGoalRecent(g.key);
                return;
            }
        }
    }

    _activateSpeedBoost() {
        // enable multiplier on factoryManager
        this.factoryManager.speedMultiplier = this._speedBoostMultiplier;
        this._speedBoostActive = true;
        this._speedBoostAvailable = true;
        this._notifySpeedBoostListeners();
    }

    _deactivateSpeedBoost() {
        if (this.factoryManager) this.factoryManager.speedMultiplier = 1;
        this._speedBoostActive = false;
        this._speedBoostAvailable = false;
        this._notifySpeedBoostListeners();
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
            // mark machine goal as recently active for speed-boost considerations
            this._markGoalRecent(g.key);
        }
    }

    _markGoalRecent(key) {
        if (!key) return;
        const prev = this._recentGoalTimeouts?.[key];
        if (prev) clearTimeout(prev);
        this._recentGoals.add(String(key));
        this._recentGoalTimeouts[String(key)] = setTimeout(() => {
            this._recentGoals.delete(String(key));
            delete this._recentGoalTimeouts[String(key)];
            this._checkAllRecentGoals();
        }, this._speedBoostDurationMs);
        this._checkAllRecentGoals();
    }

    _checkAllRecentGoals() {
        const relevantGoals = this.goals.filter(x => x.kind !== 'time');
        if (!relevantGoals || relevantGoals.length === 0) {
            // nothing to consider
            return;
        }
        const allRecent = relevantGoals.every(g => this._recentGoals.has(String(g.key)));
        const prevAvailable = this._speedBoostAvailable;
        if (allRecent) {
            this._speedBoostAvailable = true;
            // do not auto-activate; wait for user to toggle
        } else {
            this._speedBoostAvailable = false;
            if (this._speedBoostActive) this._deactivateSpeedBoost();
        }
        if (prevAvailable !== this._speedBoostAvailable) this._notifySpeedBoostListeners();
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
        const overlay = document.createElement('div');
        overlay.id = 'time-up-overlay';
        overlay.className = 'goal-overlay time-up';
        const inner = document.createElement('p');
        inner.className = 'goal-message';
        inner.textContent = "Time's up!";
        overlay.appendChild(inner);
        document.body.appendChild(overlay);
    }

    _onAllGoalsMet() {
        if (this._winTriggered) return;
        this._winTriggered = true;
        // confetti for a few seconds, then fade to black and navigate to win.html
        const pm = this.levelManager.particleManager;
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
            // create fade overlay (use shared goal-overlay styles)
            const overlay = document.createElement('div');
            overlay.id = 'goal-win-fade';
            overlay.className = 'goal-overlay win-fade';
            // helper to persist selected level and navigate
            const persistAndNavigate = () => {
                let levelParam = this.levelManager.currentLevelKey ?? '';
                let levelNumber = null;
                const levels = this.levelManager.assetManager.get('Levels') || {};
                const keys = Object.keys(levels || {});
                const idx = keys.indexOf(this.levelManager.currentLevelKey);
                if (idx !== -1) levelNumber = idx + 1; // 1-based index used by levelSelect
                if (levelNumber == null && typeof this.levelManager.currentLevelKey === 'string') {
                    // attempt to parse trailing digits from key like 'level12'
                    const m = String(this.levelManager.currentLevelKey).match(/(\d+)$/);
                    if (m) levelNumber = parseInt(m[1], 10);
                }

                // persist selected level as before
                let storeVal = null;
                if (typeof levelNumber === 'number') storeVal = 'level' + levelNumber;
                else if (typeof levelParam === 'string' && levelParam.length > 0) storeVal = levelParam;
                else storeVal = this.levelManager.currentLevelKey || 'level1';
                localStorage.setItem('pf_selectedLevel', storeVal);

                // persist completed levels list (array of 1-based numbers)
                if (typeof levelNumber === 'number') {
                    const key = 'pf_completedLevels';
                    let arr = JSON.parse(localStorage.getItem(key) || '[]') || [];
                    if (!Array.isArray(arr)) arr = [];
                    if (!arr.includes(levelNumber)) arr.push(levelNumber);
                    localStorage.setItem(key, JSON.stringify(arr));
                }

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
