import SidebarManager from "./SidebarManager.js";
import GoalManager from "./GoalManager.js";

export default class LevelManager {
    constructor(assetManager, input, factoryManager, dataManager, particleManager) {
        this.assetManager = assetManager;
        this.input = input;
        this.factoryManager = factoryManager;
        this.dataManager = dataManager;
        this.particleManager = particleManager;
        this.sidebarManager = new SidebarManager(this.assetManager, this.input, this.factoryManager, this.dataManager, this.particleManager);
        this.goalManager = new GoalManager(this.assetManager, this.factoryManager, this);
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
        const gw = levelData.gridWidth || levelData.width || 16;
        const gh = levelData.gridHeight || levelData.height || 16;
        this.factoryManager.generateGrid(gw, gh);
        this.factoryManager.items = {};
        this.factoryManager.generateQueue();
        this.sidebarManager.populateSidebar(levelData);
        // populate goal UI
        try { this.goalManager.populate(levelData.Goal || levelData.goal || {}); } catch (e) { /* ignore */ }

        // place machines from levelData.Placed (or placed) into the grid
        const placedObj = levelData.Placed ?? levelData.placed ?? null;
        if (placedObj && this.factoryManager) {
            try {
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
                    try {
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
                    } catch (e) { /* ignore */ }
                }
                if (typeof this.factoryManager.generateQueue === 'function') this.factoryManager.generateQueue();
            } catch (e) {
                console.warn('LevelManager: error placing machines from Placed', e);
            }
        }

        // finally, show level description. By default use typewriter, but allow skipping for resets
        const desc = levelData.Description ?? 'No description provided for this level.';
        const head = levelData.Header ?? 'No header provided for this level.';
        const funny = levelData.funny ?? '';
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
        return true;
    }

    getSlotRemaining(index) {
        return this.sidebarManager.getSlotRemaining(index);
    }

    getSpawnerRemaining(color) {
        return this.sidebarManager.getSpawnerRemaining(color);
    }

    // compatibility accessors relied on elsewhere in the codebase
    get selectedIndex() { return this.sidebarManager?.selectedIndex ?? -1; }
    get slots() { return this.sidebarManager?.slots ?? []; }

    // Register input bindings for level switching.
    setupInputBindings() {
        this.input.addBinding('keyboard', 'KeyL', 'press', () => {this.cycleLevel(true); }, 'level-manager', 0);
        // F8: export placed machines as level JSON to clipboard
        this.input.addBinding('keyboard', 'F8', 'press', () => { this.exportPlacedToClipboard(); }, 'level-manager', 0);
    }

    // Cycle levels. If `forward` is true advance, otherwise go backwards.
    cycleLevel(forward = true) {
        const levels = this.assetManager.get('Levels') || {};
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

    // Export current placed machines into a JSON snippet and copy to clipboard.
    exportPlacedToClipboard() {
        try {
            if (!this.factoryManager || !this.factoryManager.grid) return;
            const placed = {};
            const w = this.factoryManager.grid.length;
            const h = this.factoryManager.grid[0]?.length || 0;
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
            // Build a pretty JSON string but keep `Machines` and `spawner-items` compact
            const indent = (s, pad = 4) => s.split('\n').map((line, i) => (i===0? '': ' '.repeat(pad)) + line).join('\n');
            const parts = [];
            parts.push(`"Header": ${JSON.stringify(out.Header)}`);
            parts.push(`"Description": ${JSON.stringify(out.Description)}`);
            parts.push(`"funny": ${JSON.stringify(out.funny)}`);
            parts.push(`"Hints": ${indent(JSON.stringify(out.Hints || [], null, 4))}`);
            parts.push(`"Goal": ${indent(JSON.stringify(out.Goal || {}, null, 4))}`);
            // compact machines / spawner-items
            parts.push(`"Machines": ${JSON.stringify(out.Machines || [])}`);
            parts.push(`"spawner-items": ${JSON.stringify(out['spawner-items'] || [])}`);
            // Placed - pretty
            parts.push(`"Placed": ${indent(JSON.stringify(out.Placed || {}, null, 4))}`);
            // assemble with proper indentation
            const json = "{\n    " + parts.join(",\n    ") + "\n}";
            if (navigator && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                navigator.clipboard.writeText(json).then(() => {
                    console.debug('LevelManager: copied placed JSON to clipboard');
                }).catch(err => {
                    console.warn('LevelManager: clipboard write failed', err);
                    prompt('Level JSON (copy manually):', json);
                });
            } else {
                prompt('Level JSON (copy manually):', json);
            }
        } catch (e) {
            console.warn('LevelManager: exportPlacedToClipboard failed', e);
        }
    }
}
