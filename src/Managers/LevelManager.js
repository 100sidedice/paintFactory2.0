import SidebarManager from "./SidebarManager.js";
import GoalManager from "./GoalManager.js";
import { customPrompt } from "../World/CustomPrompt.js";

export default class LevelManager {
    constructor(assetManager, input, factoryManager, dataManager, particleManager) {
        this.assetManager = assetManager;
        this.input = input;
        this.factoryManager = factoryManager;
        this.dataManager = dataManager;
        this.particleManager = particleManager;
        this.sidebarManager = new SidebarManager(this.assetManager, this.input, this.factoryManager, this.dataManager, this.particleManager);
        this.goalManager = new GoalManager(this.assetManager, this.factoryManager, this);
        this._originalFunnyText = '';
        // Listen for speed-boost availability/active changes and update funny-text accordingly
        this.goalManager.addSpeedBoostListener(({ available, active }) => {
            const el = document.querySelector('#funny-text');
            if (!el) return;
            if (active) {
                el.textContent = 'Click here to slow down';
                el.style.cursor = 'pointer';
            } else if (available) {
                el.textContent = 'Press here to speed up';
                el.style.cursor = 'pointer';
            } else {
                el.textContent = this.currentLevelData?.funny ?? this._originalFunnyText ?? '';
                el.style.cursor = 'default';
            }
        });
        // Use Input manager instead of DOM clicks: register a mouse:left:press binding
        this.input.addBinding('mouse', 'left', 'press', () => {
            const funnyEl = document.querySelector('#funny-text');
            if (!funnyEl) return;
            const rect = funnyEl.getBoundingClientRect();
            const mx = this.input.mousePos.x; 
            const my = this.input.mousePos.y;
            if (mx >= rect.left && mx <= rect.right && my >= rect.top && my <= rect.bottom) {
                this.goalManager.toggleSpeedBoost();
            }
        }, 'funny-area', 1);
    }
    
    async init(levelKey = null) {
        const levels = this.assetManager.get('Levels');
        const defaultKey = levelKey || 'level1';
        const levelData = levels[defaultKey];
        if (!levelData) {
            console.error(`Level data not found for key: ${defaultKey}`);
            return;
        }
        this.factoryManager.levelManager = this;
        this.sidebarManager.setupInputBindings();
        this.sidebarManager.populateSidebar(levelData);
        // setup level manager specific input bindings (key to cycle levels)
        this.setupInputBindings();
        await this.switchLevel(defaultKey); // default level on load
    }

    /**
     * Switch the active level to `levelKey`.
     * Returns true on success, false if level key not found.
     */
    async switchLevel(levelKey = null, options = {}) {
        const levels = this.assetManager.get('Levels');
        const levelData = levels && levels[levelKey];
        if (!levelData) {
            console.error(`Level data not found for key: ${levelKey}`);
            return false;
        }
        // update references
        this.factoryManager.levelManager = this;

        // store current level info
        this.currentLevelKey = levelKey;
        this.currentLevelData = levelData;

        // attempt a light reset of factory state so new level can be applied
        // regenerate grid if possible using level dimensions if provided
        const tileSize = (window.innerHeight || 1) / 9;
        const defaultGw = Math.max(1, Math.ceil((window.innerWidth || 1) / tileSize));
        const defaultGh = 9;
        const gw = levelData.gridWidth || levelData.width || defaultGw;
        const gh = levelData.gridHeight || levelData.height || defaultGh;
        this.factoryManager.generateGrid(gw, gh);
        this.factoryManager.items = {};
        this.factoryManager.generateQueue();
        this.sidebarManager.populateSidebar(levelData);
        // populate goal UI
        this.goalManager.populate(levelData.Goal || levelData.goal || {});

        // place machines from levelData.Placed (or placed) into the grid
        const placedObj = levelData.Placed ?? levelData.placed ?? null;
        if (placedObj) {
            for (const coordKey of Object.keys(placedObj)) {
                const raw = placedObj[coordKey];
                let parts = null;
                if (coordKey.indexOf(',') !== -1) parts = coordKey.split(',');
                else if (coordKey.indexOf('.') !== -1) parts = coordKey.split('.');
                if (!parts || parts.length < 2) continue;
                const x = parseInt(parts[0], 10);
                const y = parseInt(parts[1], 10);
                if (Number.isNaN(x) || Number.isNaN(y)) continue;
                let type = null; let rot = 0;
                if (typeof raw === 'string') type = raw;
                else if (raw && typeof raw === 'object') { type = raw.type || raw.name || null; rot = raw.rot || 0; }
                if (!type) continue;
                const placedMachine = this.factoryManager.addMachine(type.split(' ')[0], x, y, rot);
                // if the type string includes a color token (e.g. "spawner #RRGGBBAA"), parse and apply
                const tokens = String(type).trim().split(/\s+/);
                const last = tokens[tokens.length-1];
                const colorMatch = /^#?[0-9A-Fa-f]{8}$/.test(last) ? last.replace(/^#/, '') : null;
                if (colorMatch && placedMachine) {
                    // convert to integer 32-bit
                    const intVal = parseInt(colorMatch, 16) >>> 0;
                    placedMachine.data = placedMachine.data || {};
                    placedMachine.data.color = intVal;
                    placedMachine.color = intVal;
                }
            }
        }

        // finally, show level description. By default use typewriter, but allow skipping for resets
        const desc = levelData.Description ?? 'No description provided for this level.';
        const head = levelData.Header ?? 'No header provided for this level.';
        const funny = levelData.funny ?? '';
        this._originalFunnyText = funny;
        // clear all three's text before typing or setting them directly
        document.querySelector('#level-id').textContent = '';
        document.querySelector('#level-text').textContent = '';
        document.querySelector('#funny-text').textContent = '';
        if (options && options.skipTypewriter) {
            document.querySelector('#level-id').textContent = head;
            document.querySelector('#level-text').textContent = desc;
            document.querySelector('#funny-text').textContent = funny;
        } else {
            await this.typeText('#level-id', head, 100);
            await this.typeText('#level-text', desc, 30);
            await this.typeText('#funny-text', funny, 30);
        }
        // Ensure the funny-text element has click wiring after it's present in DOM
        this._ensureFunnyHandler();
        // attach dev-mode editable handlers for header and description and funny
        const attachEditable = (selector, keyName) => {
            const el = document.querySelector(selector);
            if (!el) {
                console.warn(`attachEditable: Element not found: ${selector}`);
                return;
            }
            console.log(`attachEditable: Found ${selector}, attaching listener`);
            
            // Don't clone - use capture phase to catch event early
            el.addEventListener('mouseup', async (ev) => {
                console.log(`mouseup fired on ${selector}`, ev);
                if (!this.devMode) {
                    console.log(`devMode is ${this.devMode}, skipping`);
                    return;
                }
                ev.stopPropagation();
                ev.preventDefault();
                console.log(`Clicked ${selector}`);
                const cur = this.currentLevelData || {};
                const curVal = cur[keyName] ?? '';
                const input = await customPrompt(`Edit ${keyName}`, curVal);
                if (input === null) return;
                cur[keyName] = input;
                // update DOM immediately
                if (selector === '#level-id') {
                    const el = document.querySelector('#level-id');
                    if (el) el.textContent = input;
                }
                if (selector === '#level-text') {
                    const el = document.querySelector('#level-text');
                    if (el) el.textContent = input;
                }
                if (selector === '#funny-text') {
                    const el = document.querySelector('#funny-text');
                    if (el) {
                        el.textContent = input;
                        this._originalFunnyText = input;
                    }
                }
            });
        };
        attachEditable('#level-id', 'Header');
        attachEditable('#level-text', 'Description');
        attachEditable('#funny-text', 'funny');
        return true;
    }

    getSlotRemaining(index) {
        return this.sidebarManager.getSlotRemaining(index);
    }

    getSpawnerRemaining(color) {
        return this.sidebarManager.getSpawnerRemaining(color);
    }

    // compatibility accessors relied on elsewhere in the codebase
    get selectedIndex() { return this.sidebarManager.selectedIndex; }
    get slots() { return this.sidebarManager.slots; }

    // Register input bindings for level switching.
    setupInputBindings() {
        this.input.addBinding('keyboard', 'KeyL', 'press', () => {this.cycleLevel(true); }, 'level-manager', 0);
        // F8: export placed machines as level JSON to clipboard
        this.input.addBinding('keyboard', 'F8', 'press', () => { this.exportPlacedToClipboard(); }, 'level-manager', 0);
        // F4: toggle developer mode
        this.devMode = false;
        this.input.addBinding('keyboard', 'F4', 'press', () => {
            this.devMode = !this.devMode;
            document.body.classList.toggle('dev-mode', this.devMode);
            console.debug('LevelManager: devMode ->', this.devMode);
        }, 'level-manager', 0);
        // F3: prompt to add a new goal when in dev mode
        this.input.addBinding('keyboard', 'F5', 'press', async () => {
            if (!this.devMode) return;
            const input = await customPrompt('Add goal (examples: dye,#RRGGBBAA,100 OR machine,conveyor,10 OR time,100)');
            if (!input) return;
            const parts = input.split(',').map(p=>p.trim()).filter(p=>p!=='');
            if (!parts || parts.length === 0) return;
            const cmd = parts[0].toLowerCase();
            const goalObjRef = this.currentLevelData = this.currentLevelData || {};
            goalObjRef.Goal = goalObjRef.Goal || goalObjRef.goal || {};
            const goalsRef = goalObjRef.Goal;
            if (cmd === 'dye' || cmd === 'color' || cmd === '#') {
                const col = parts[1] ? (parts[1].startsWith('#') ? parts[1].toUpperCase() : `#${parts[1].toUpperCase()}`) : null;
                const cnt = parseInt(parts[2], 10) || 0;
                if (col) goalsRef[col] = cnt;
            } else if (cmd === 'machine' || cmd === 'm') {
                const m = parts[1] || null;
                const cnt = parseInt(parts[2], 10) || 0;
                if (m) goalsRef[m] = cnt;
            } else if (cmd === 'time') {
                const cnt = parseInt(parts[1], 10) || 0;
                goalsRef['time'] = cnt;
                delete goalsRef['Time'];
            } else if (cmd === 'del' || cmd === 'delete' || cmd === 'remove' || cmd === 'rm') {
                // no-op for add
            } else {
                const maybeName = parts[0];
                const maybeCnt = parseInt(parts[1], 10) || 0;
                goalsRef[maybeName] = maybeCnt;
            }
            if (this.goalManager && typeof this.goalManager.populate === 'function') this.goalManager.populate(goalsRef);
        }, 'level-manager', 0);
        // F5: prompt to add a new slot when in dev mode
        this.input.addBinding('keyboard', 'F3', 'press', async () => {
            if (!this.devMode) return;
            const input = await customPrompt('Add slot (examples: conveyor, 999 OR spawner, 999, [[#000000FF,999]])');
            if (!input) return;
            const added = this.sidebarManager?.addSlotFromSpec?.(input, this.currentLevelData);
            if (!added) console.debug('LevelManager: could not add slot from spec');
        }, 'level-manager', 0);
    }

    // Cycle levels. If `forward` is true advance, otherwise go backwards.
    cycleLevel(forward = true) {
        const levels = this.assetManager.get('Levels') ?? {};
        const keys = Object.keys(levels);
        if (!keys || keys.length === 0) return false;
        let idx = Math.max(0, keys.indexOf(this.currentLevelKey));
        if (idx === -1) idx = 0;
        idx = (idx + (forward ? 1 : -1) + keys.length) % keys.length;
        const nextKey = keys[idx];
        return this.switchLevel(nextKey);
    }

    // Typewriter effect: writes `text` into the element matched by `selector` one char at a time.
    // Returns a Promise which resolves when finished. Cancels any previous running typewriter.
    async typeText(selector, text = '', speed = 30) {
        if (!selector) return;
        // cancel any previous
        if (this._typewriterCancelToken) this._typewriterCancelToken.cancelled = true;
        const token = { cancelled: false };
        this._typewriterCancelToken = token;
        const el = document.querySelector(selector);
        el.textContent = '';
        for (let i = 0; i < text.length; i++) {
            if (token.cancelled) break;
            el.textContent += text[i];
            await new Promise(r => setTimeout(r, speed));
        }
        if (!token.cancelled) el.textContent = text;
        this._typewriterCancelToken = null;
    }

    _ensureFunnyHandler() {
        if (this._funnyHandlerAttached) return;
        const funnyEl = document.querySelector('#funny-text');
        if (!funnyEl) return;
        if (!funnyEl.classList.contains('ui')) funnyEl.classList.add('ui');
        funnyEl.style.pointerEvents = 'auto';
        // avoid adding multiple listeners
        const handler = (ev) => {
            this.goalManager.toggleSpeedBoost();
            ev.stopPropagation();
        };
        funnyEl.addEventListener('click', handler);
        this._funnyHandlerAttached = true;
    }

    // Export current placed machines into a JSON snippet and copy to clipboard.
    exportPlacedToClipboard() {
        if (!this.factoryManager.grid) return;
        const placed = {};
        const w = this.factoryManager.grid.length;
        const h = this.factoryManager.grid[0]?.length ?? 0;
        for (let x = 0; x < w; x++) {
            for (let y = 0; y < h; y++) {
                const m = this.factoryManager.grid[x][y];
                if (!m) continue;
                const key = `${x}.${y}`;
                const type = m.name || (m.data && m.data.type) || null;
                const rot = (m.data && m.data.rot) || 0;
                if (!type) continue;
                // if spawner, include color in the exported name
                let outType = type;
                if (String(type).toLowerCase().startsWith('spawner')) {
                    const col = (m.data && (m.data.color ?? m.color)) ?? m.color ?? null;
                    if (col != null) {
                        // format as #RRGGBBAA
                        let hex = null;
                        if (typeof col === 'number') {
                            hex = ('00000000' + (col >>> 0).toString(16)).slice(-8).toUpperCase();
                            hex = `#${hex}`;
                        } else if (typeof col === 'string') {
                            hex = col.startsWith('#') ? col.toUpperCase() : (`#${col.toUpperCase()}`);
                        }
                        if (hex) outType = `${type} ${hex}`;
                    }
                }
                if (rot && rot !== 0) placed[key] = { type: outType, rot };
                else placed[key] = outType;
            }
        }
        const out = {
            Header: this.currentLevelData?.Header || this.currentLevelKey || 'New Level',
            Description: this.currentLevelData?.Description || this.currentLevelData?.description || '',
            funny: this.currentLevelData?.funny || this.currentLevelData?.Funny || '',
            Hints: this.currentLevelData?.Hints || this.currentLevelData?.hints || [],
            Goal: this.currentLevelData?.Goal || this.currentLevelData?.goal || {},
            Machines: this.currentLevelData?.Machines || this.currentLevelData?.machines || [],
            "spawner-items": this.currentLevelData?.['spawner-items'] || this.currentLevelData?.spawnerItems || [],
            Placed: placed
        };
        // Build a pretty JSON string with array items on separate lines
        const indent = (s, pad = 4) => s.split('\n').map((line, i) => (i===0? '': ' '.repeat(pad)) + line).join('\n');
        const formatArray = (arr) => {
            if (!arr || arr.length === 0) return '[]';
            const items = arr.map(item => JSON.stringify(item)).join(',\n        ');
            return `[\n        ${items}\n    ]`;
        };
        const parts = [];
        parts.push(`"Header": ${JSON.stringify(out.Header)}`);
        parts.push(`"Description": ${JSON.stringify(out.Description)}`);
        parts.push(`"funny": ${JSON.stringify(out.funny)}`);
        parts.push(`"Hints": ${indent(JSON.stringify(out.Hints || [], null, 4))}`);
        parts.push(`"Goal": ${indent(JSON.stringify(out.Goal || {}, null, 4))}`);
        // machines and spawner-items with items on separate lines
        parts.push(`"Machines": ${formatArray(out.Machines || [])}`);
        parts.push(`"spawner-items": ${formatArray(out['spawner-items'] || [])}`);
        // Placed - pretty
        parts.push(`"Placed": ${indent(JSON.stringify(out.Placed || {}, null, 4))}`);
        // assemble with proper indentation
        const json = "{\n    " + parts.join(",\n    ") + "\n}";
        if (navigator && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            navigator.clipboard.writeText(json).then(() => {
                console.debug('LevelManager: copied placed JSON to clipboard');
            }).catch(err => {
                console.warn('LevelManager: clipboard write failed', err);
                customPrompt('Level JSON (copy manually):', json);
            });
        } else {
            customPrompt('Level JSON (copy manually):', json);
        }
    }
}
