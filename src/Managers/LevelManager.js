import { joinDots } from "../Helpers/pathHelpers.js";

export default class LevelManager {
    constructor(assetManager, input, factoryManager, dataManager, particleManager) {
        this.assetManager = assetManager;
        this.input = input;
        this.factoryManager = factoryManager;
        this.dataManager = dataManager;
        this.particleManager = particleManager;
        this.sidebar = document.getElementById('machine_sidebar');
        this.slots = [];
        this.selectedIndex = -1;
    }

    async init(levelKey = null) {
        const levels = this.assetManager.get('Levels');
        const levelData = levels[levelKey];
        if (!levelData) {
            console.error(`Level data not found for key: ${levelKey}`);
            return;
        }
        this._setupInputBindings();
        this.populateSidebar(levelData);
    }

    populateSidebar(levelData) {
        // stop any running icon animations while rebuilding
        this._stopIconAnimationLoop();
        this.sidebar.innerHTML = '';
        this.slots = [];
        const machines = levelData.Machines || [];

        // Group variants by base name (prefix before '-') while preserving first appearance order
        // initialize initial counts from level data: map type -> allowed count
        this.initialCounts = {};
        for (let i = 0; i < machines.length; i++) {
            const t = machines[i][0];
            const count = machines[i][1] || 0;
            this.initialCounts[t] = count;
        }

        const seenBases = new Set();
        for (let i = 0; i < machines.length; i++) {
            const machineType = machines[i][0];
            const base = machineType.split('-')[0];
            if (seenBases.has(base)) continue;
            // collect all variants of this base that appear in level data, in order
            const variants = [];
            for (let j = 0; j < machines.length; j++) {
                const t = machines[j][0];
                if (t.split('-')[0] === base) variants.push(t);
            }
            seenBases.add(base);
            this._addSlot(variants);
        }

        // start animating icons (if any)
        this._startIconAnimationLoop();

    }

    _addSlot(variants) {
        if (!variants || variants.length === 0) return;
        // if the only variant is "none", skip
        if (variants.length === 1 && variants[0] === 'none') return;

        const slot = document.createElement('div');
        slot.className = 'machine';
        slot.dataset.variants = JSON.stringify(variants);
        slot.dataset.variantIndex = '0';
        slot.dataset.machineType = variants[0];

        const icon = document.createElement('canvas');
        icon.classList.add('machine-icon');
        icon.width = 16;
        icon.height = 16;
        icon.imageSmoothingEnabled = false;

        // rotation preview: store logical rotation and an animated rotation (anim can exceed 0-360)
        slot.dataset.rot = '0';
        slot.dataset.animRot = '0';
        icon.style.setProperty('--rot-anim', '0deg');

        // draw initially
        this._drawIcon(icon, variants[0]);

        // variant indicator (if multiple variants)
        if (variants.length > 1) {
            const indicator = document.createElement('div');
            indicator.className = 'variant-indicator';
            for (let v = 0; v < variants.length; v++) {
                const dot = document.createElement('div');
                dot.className = 'variant-dot';
                if (v === 0) dot.classList.add('active');
                indicator.appendChild(dot);
            }
            slot.appendChild(indicator);
        }

        // remaining count display (top-left)
        const countEl = document.createElement('div');
        countEl.className = 'machine-count';
        slot.appendChild(countEl);
        // set initial count display
        this._updateSlotCountDisplay(slot);

        // wheel on the icon rotates the preview (only affects this slot)
        icon.addEventListener('wheel', (e) => {
            e.preventDefault();
            const deltaY = e.deltaY;
            const delta = deltaY > 0 ? 90 : -90;
            // update anim rotation (can be outside 0-360 to allow smooth directional animation)
            let anim = parseInt(slot.dataset.animRot || '0', 10) || 0;
            anim = anim + delta;
            slot.dataset.animRot = String(anim);
            icon.style.setProperty('--rot-anim', `${anim}deg`);

            // update logical rotation used for placement (0..359)
            const cur = parseInt(slot.dataset.rot || '0', 10) || 0;
            const next = (cur + delta + 360) % 360;
            slot.dataset.rot = String(next);
        }, { passive: false });

        // after the transition completes, normalize animRot to the logical 0..359 value
        icon.addEventListener('transitionend', (ev) => {
            if (ev.propertyName !== 'transform') return;
            const logical = parseInt(slot.dataset.rot || '0', 10) || 0;
            let anim = parseInt(slot.dataset.animRot || '0', 10) || 0;
            // if anim modulo 360 already equals logical, normalize to logical to keep numbers small
            if (((anim % 360) + 360) % 360 !== logical) return;
            // set anim to logical without transition so it snaps from e.g. 360->0
            slot.dataset.animRot = String(logical);
            icon.style.transition = 'none';
            icon.style.setProperty('--rot-anim', `${logical}deg`);
            // force reflow then restore transition
            void icon.offsetWidth;
            icon.style.transition = 'transform 0.1s ease';
        });

        slot.appendChild(icon);

        const index = this.slots.length;
        slot.addEventListener('click', () => {
            if (this.selectedIndex === index) {
                this._cycleSlotVariant(index);
            } else {
                this.setSelection(index);
            }
        });

        this.sidebar.appendChild(slot);
        this.slots.push(slot);
    }

    _drawIcon(icon, type) {
        // static draw (used for initial draw or explicit redraw)
        const ctx = icon.getContext('2d');
        ctx.clearRect(0, 0, icon.width, icon.height);
        if (type === 'delete') {
            const deleteImg = this.assetManager.get('delete');
            if (deleteImg) ctx.drawImage(deleteImg, 0, 0, icon.width, icon.height);
            return;
        }
        const img = this.assetManager.get('machines-image');
        if (!img || !this.dataManager) return;
        const data = this.dataManager.getData(joinDots('machineData', type)) || {};
        const row = (data.texture && data.texture.row) || 0;
        const tw = 16; const th = 16;
        const cols = Math.max(1, Math.floor(img.width / tw));
        const tileIndex = row * cols; // assume one-tile-per-row layout
        const sx = 0;
        const sy = Math.floor(tileIndex / cols) * th;
        ctx.drawImage(img, sx, sy, tw, th, 0, 0, icon.width, icon.height);
    }

    _drawIconFrame(icon, type, nowMs) {
        const ctx = icon.getContext('2d');
        ctx.clearRect(0, 0, icon.width, icon.height);
        if (type === 'delete') {
            const deleteImg = this.assetManager.get('delete');
            if (deleteImg) ctx.drawImage(deleteImg, 0, 0, icon.width, icon.height);
            return;
        }
        
        const img = this.assetManager.get('machines-image');
        if (!img || !this.dataManager) return;
        const data = this.dataManager.getData(joinDots('machineData', type)) || {};
        const row = (data.texture && data.texture.row) || 0;
        const tw = 16; const th = 16;
        const cols = Math.max(1, Math.floor(img.width / tw));
        const tileIndex = row * cols; // assume one-tile-per-row layout
        let fps = (data.texture && data.texture.fps) || 1;
        try {
            const remaining = this._getRemainingCount(type);
            if (remaining <= 0) fps = fps * 0.7; // slow down by 30% when depleted
        } catch (e) {}
        const frame = Math.floor((nowMs * fps) / 1000) % cols;
        const sx = frame * tw;
        const sy = Math.floor(tileIndex / cols) * th;
        ctx.drawImage(img, sx, sy, tw, th, 0, 0, icon.width, icon.height);
    }

    _getSlotRemaining(slot) {
        if (!slot) return 0;
        // For UX clarity we keep counts per-variant. A slot may contain multiple variants
        // but the displayed/used remaining is for the currently selected variant.
        const type = slot.dataset.machineType || (() => {
            try { const vs = JSON.parse(slot.dataset.variants||'[]'); const vi = parseInt(slot.dataset.variantIndex||'0',10)||0; return vs[vi]; } catch(e){return null}
        })();
        return this._getRemainingCount(type);
    }

    _getRemainingCount(type) {
        if (!type) return 0;
        // remaining = initial allowed - currently placed in the world
        const allowed = this.initialCounts[type] || 0;
        const placed = this._countPlacedOfType(type);
        return Math.max(0, allowed - placed);
    }

    _countPlacedOfType(type) {
        if (!this.factoryManager || !this.factoryManager.grid) return 0;
        let cnt = 0;
        const grid = this.factoryManager.grid;
        for (let x = 0; x < grid.length; x++) {
            const col = grid[x] || [];
            for (let y = 0; y < col.length; y++) {
                const m = col[y];
                if (!m) continue;
                const name = m.name || (m.data && m.data.type) || null;
                if (!name) continue;
                if (name === type) cnt++;
            }
        }
        return cnt;
    }

    _decrementCount(type) {
        // legacy helper retained (no-op with new dynamic counting).
        return;
    }

    _incrementCount(type) {
        // legacy helper retained (no-op with new dynamic counting). Keep for compatibility.
        return;
    }

    _updateSlotCountDisplay(slot) {
        if (!slot) return;
        const countEl = slot.querySelector('.machine-count');
        const icon = slot.querySelector('canvas.machine-icon');
        const count = this._getSlotRemaining(slot);
        if (countEl) {
            countEl.textContent = String(count);
            countEl.style.color = (count <= 0) ? 'red' : 'white';
        }
        if (icon) {
            if (count <= 0) icon.style.filter = 'grayscale(100%)';
            else icon.style.filter = '';
        }
        // mark depleted state on the slot element so CSS can adjust hover/visuals
        if (count <= 0) slot.classList.add('depleted');
        else slot.classList.remove('depleted');
        // If this slot is currently selected, update its selection border color immediately
        const sel = (typeof this.selectedIndex === 'number' && this.selectedIndex >= 0) ? this.slots[this.selectedIndex] : null;
        if (sel === slot) {
            const type = slot.dataset.machineType || (() => { try { const vs = JSON.parse(slot.dataset.variants||'[]'); const vi = parseInt(slot.dataset.variantIndex||'0',10)||0; return vs[vi]; } catch(e){return null} })();
            const remaining = this._getRemainingCount(type);
            if (remaining <= 0) slot.style.setProperty('--border_color', '#FFA500FF');
            else slot.style.setProperty('--border_color', '#00FF00FF');
        }
    }

    // _consumeFromSlot removed: counts are computed dynamically from the world grid.

    // Public helper for external code (e.g., script.js) to query how many placements remain for a slot
    getSlotRemaining(index) {
        if (index < 0 || index >= this.slots.length) return 0;
        return this._getSlotRemaining(this.slots[index]);
    }

    _startIconAnimationLoop() {
        if (this._iconAnimReq) return; // already running
        const loop = (ts) => {
            // ts is DOMHighResTimeStamp in ms
            for (let i = 0; i < this.slots.length; i++) {
                const slot = this.slots[i];
                const icon = slot.querySelector('canvas.machine-icon');
                if (!icon) continue;
                const type = slot.dataset.machineType;
                this._drawIconFrame(icon, type, ts);
                // update dynamic UI for this slot (count badge, grayscale)
                this._updateSlotCountDisplay(slot);
                // if slot has variant indicator, update each dot according to that variant's remaining
                const indicator = slot.querySelector('.variant-indicator');
                if (indicator) {
                    let variants = [];
                    try { variants = JSON.parse(slot.dataset.variants || '[]'); } catch (e) { variants = []; }
                    const dots = Array.from(indicator.children);
                    for (let vi = 0; vi < variants.length; vi++) {
                        const v = variants[vi];
                        const remaining = this._getRemainingCount(v);
                        const dot = dots[vi];
                        if (!dot) continue;
                        if (remaining <= 0) {
                            const activeIndex = parseInt(slot.dataset.variantIndex || '0', 10) || 0;
                            if (vi === activeIndex) {
                                // selected depleted variant: bright red
                                dot.style.background = '#FF4444';
                            } else {
                                // non-selected depleted variant: dark red
                                dot.style.background = '#8B0000';
                            }
                            dot.style.boxShadow = 'inset 0 0 0 1px rgba(0,0,0,0.25)';
                        } else {
                            dot.style.background = (vi === parseInt(slot.dataset.variantIndex||'0',10)) ? '#00FFFF' : '#666';
                            dot.style.boxShadow = '';
                        }
                    }
                }
            }
            this._iconAnimReq = requestAnimationFrame(loop);
        };
        this._iconAnimReq = requestAnimationFrame(loop);
    }

    _stopIconAnimationLoop() {
        if (this._iconAnimReq) {
            cancelAnimationFrame(this._iconAnimReq);
            this._iconAnimReq = null;
        }
    }

    _cycleSlotVariant(index) {
        const slot = this.slots[index];
        if (!slot) return;
        const variants = JSON.parse(slot.dataset.variants || '[]');
        if (variants.length <= 1) return;
        let cur = parseInt(slot.dataset.variantIndex || '0', 10) || 0;
        cur = (cur + 1) % variants.length;
        slot.dataset.variantIndex = String(cur);
        const newType = variants[cur];
        slot.dataset.machineType = newType;
        const icon = slot.querySelector('canvas.machine-icon');
        if (icon) this._drawIcon(icon, newType);
        // update indicator active dot
        const indicator = slot.querySelector('.variant-indicator');
        if (indicator) {
            const dots = Array.from(indicator.children);
            dots.forEach((d, i) => d.classList.toggle('active', i === cur));
        }
    }

    setSelection(index) {
        if (index < 0 || index >= this.slots.length) return;
        if (this.selectedIndex === index) return;
        if (this.selectedIndex >= 0) {
            const prev = this.slots[this.selectedIndex];
            prev.style.setProperty('--border_color', '#00000066');
        }
        const el = this.slots[index];
        // determine selected slot's type and remaining count
        const type = el.dataset.machineType || (() => {
            try { const vs = JSON.parse(el.dataset.variants||'[]'); const vi = parseInt(el.dataset.variantIndex||'0',10)||0; return vs[vi]; } catch(e){return null}
        })();
        const remaining = this._getRemainingCount(type);
        if (remaining <= 0) {
            // orange when none left
            el.style.setProperty('--border_color', '#FFA500FF');
        } else {
            el.style.setProperty('--border_color', '#00FF00FF');
        }
        this.selectedIndex = index;
        // Future: emit event to the world with selected machine type
    }

    _setupInputBindings() {
        if (!this.input) return;
        // Numeric hotkeys Digit1..Digit7 -> slots 0..6
        for (let i = 1; i <= 7; i++) {
            const code = `Digit${i}`;
            this.input.addBinding('keyboard', code, 'press', () => {
                const idx = i - 1;
                if (idx < this.slots.length) this.setSelection(idx);
            });
        }

        // Left mouse held: place selected machine (unless delete selected)
        this.input.addBinding('mouse', 'left', 'held', () => {
            if (!this.factoryManager) return;
            if (this.selectedIndex < 0 || this.selectedIndex >= this.slots.length) return;
            const slot = this.slots[this.selectedIndex];
            const type = slot.dataset.machineType;
            const rot = parseInt(slot.dataset.rot || '0', 10) || 0;
            const pos = this.input.getPos();
            const gridX = Math.floor(pos.x / window.innerHeight * 9);
            const gridY = Math.floor(pos.y / window.innerHeight * 9);
            if (type === 'delete') {
                const removed = this.factoryManager.removeMachine(gridX, gridY);
                if (removed && this.particleManager) {
                    try {
                        const size = window.innerHeight / 9;
                        const cx = gridX * size + size / 2;
                        const cy = gridY * size + size / 2;
                        this.particleManager.spawnAt(cx, cy, { count: 10, colors: ['#FFC800', '#494949'], size: 10, speed: 300, life: 700 });
                    } catch (e) {}
                }
            } else {
                // check remaining count for this variant
                if (this._getRemainingCount(type) <= 0) return;
                this.factoryManager.addMachine(type, gridX, gridY, rot);
                // remaining is computed from the world grid; no manual decrement
                // if placement succeeded and this was the last allowed, spawn particles at cursor
                const placed = this.factoryManager.grid && this.factoryManager.grid[gridX] && this.factoryManager.grid[gridX][gridY];
                const placedType = placed ? (placed.name || (placed.data && placed.data.type)) : null;
                if (placedType === type) {
                    const remainingAfter = this._getRemainingCount(type);
                    if (remainingAfter === 0 && this.particleManager) {
                        // spawn particles at the center of the placed grid cell
                        try {
                            const size = window.innerHeight / 9;
                            const cx = gridX * size + size / 2;
                            const cy = gridY * size + size / 2;
                            this.particleManager.spawnAt(cx, cy, { count: 20, colors: ['#fbff00','#ff5144','#ffa600'], size: 5, speed: 500, life: 900 });
                        } catch (e) {}
                    }
                }
            }
        });

        // Middle click: copy machine at cursor into selection (type + rotation)
        this.input.addBinding('mouse', 'middle', 'held', () => {
            if (!this.factoryManager) return;
            const pos = this.input.getPos();
            const gridX = Math.floor(pos.x / window.innerHeight * 9);
            const gridY = Math.floor(pos.y / window.innerHeight * 9);
            if (gridX < 0 || gridY < 0) return;
            const grid = this.factoryManager.grid;
            if (!grid || !grid[gridX] || gridX >= grid.length || gridY >= (grid[0]?.length||0)) return;
            const machine = grid[gridX][gridY];
            if (!machine) return;
            const type = machine.name || (machine.data && machine.data.type) || null;
            const rot = (machine.data && machine.data.rot) || 0;

            if (!type) return;

            // find a slot whose variants include this type
            for (let i = 0; i < this.slots.length; i++) {
                const slot = this.slots[i];
                const variants = JSON.parse(slot.dataset.variants || '[]');
                const idx = variants.indexOf(type);
                if (idx !== -1) {
                    // select slot and set variant+rotation
                    this.setSelection(i);
                    slot.dataset.variantIndex = String(idx);
                    slot.dataset.machineType = variants[idx];
                    slot.dataset.rot = String(rot);
                    slot.dataset.animRot = String(rot);
                    const icon = slot.querySelector('canvas.machine-icon');
                    if (icon) {
                        this._drawIcon(icon, variants[idx]);
                        icon.style.setProperty('--rot-anim', `${rot}deg`);
                        icon.style.setProperty('--rot', `${rot}deg`);
                    }
                    const indicator = slot.querySelector('.variant-indicator');
                    if (indicator) {
                        const dots = Array.from(indicator.children);
                        dots.forEach((d, j) => d.classList.toggle('active', j === idx));
                    }
                    this._updateSlotCountDisplay(slot);
                    return;
                }
            }

            // If no exact variant found, try matching base name
            const base = type.split('-')[0];
            for (let i = 0; i < this.slots.length; i++) {
                const slot = this.slots[i];
                const variants = JSON.parse(slot.dataset.variants || '[]');
                for (let j = 0; j < variants.length; j++) {
                    if (variants[j].split('-')[0] === base) {
                        this.setSelection(i);
                        slot.dataset.variantIndex = String(j);
                        slot.dataset.machineType = variants[j];
                        slot.dataset.rot = String(rot);
                        slot.dataset.animRot = String(rot);
                        const icon = slot.querySelector('canvas.machine-icon');
                        if (icon) {
                            this._drawIcon(icon, variants[j]);
                            icon.style.setProperty('--rot-anim', `${rot}deg`);
                            icon.style.setProperty('--rot', `${rot}deg`);
                        }
                        const indicator = slot.querySelector('.variant-indicator');
                        if (indicator) {
                            const dots = Array.from(indicator.children);
                            dots.forEach((d, k) => d.classList.toggle('active', k === j));
                        }
                        this._updateSlotCountDisplay(slot);
                        return;
                    }
                }
            }
        });

        // Right mouse held: remove machine (always acts as delete)
        this.input.addBinding('mouse', 'right', 'held', () => {
            if (!this.factoryManager) return;
            const pos = this.input.getPos();
            const gridX = Math.floor(pos.x / window.innerHeight * 9);
            const gridY = Math.floor(pos.y / window.innerHeight * 9);
            const removed = this.factoryManager.removeMachine(gridX, gridY);
            if (removed && this.particleManager) {
                try {
                    const size = window.innerHeight / 9;
                    const cx = gridX * size + size / 2;
                    const cy = gridY * size + size / 2;
                    this.particleManager.spawnAt(cx, cy, { count: 10, colors: ['#FFC800', '#494949'], size: 10, speed: 300, life: 700 });
                } catch (e) {}
            }
        }, ["delete"]);

        // Wheel to rotate selected machine
        this.input.addBinding('wheel', 'scroll', 'press', (payload) => {
            if (!this.factoryManager) return;
            const gridPos = this.input.getPos();
            const gridX = Math.floor(gridPos.x / window.innerHeight * 9);
            const gridY = Math.floor(gridPos.y / window.innerHeight * 9);
            this.factoryManager.setMachineProperty(gridX, gridY, 'rot',
                (this.factoryManager.getMachineProperty(gridX, gridY, 'rot') + 90) % 360
            );
        });

        // Key R to reset factory
        this.input.addBinding('keyboard', 'KeyR', 'press', () => {
            if (!this.factoryManager) return;
            this.factoryManager.resetFactory();
        });
    }

    destroy() {
        // Input unbinding not implemented; rely on Input lifecycle or page unload
    }
}
