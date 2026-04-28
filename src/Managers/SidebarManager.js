import { joinDots } from "../Helpers/pathHelpers.js";
import { cssHexToInt, intToCssHex } from "../Helpers/colorHelpers.js";

export default class SidebarManager {
    constructor(assetManager, input, factoryManager, dataManager, particleManager) {
        this.assetManager = assetManager;
        this.input = input;
        this.factoryManager = factoryManager;
        this.dataManager = dataManager;
        this.particleManager = particleManager;

        this.sidebar = document.getElementById('machine_sidebar');
        this.slots = [];
        this.selectedIndex = 0;
        this.lastRotate = performance.now();
        this._lastTap = { time: 0, x: -1, y: -1 };
        this._iconAnimReq = null;
    }

    populateSidebar(levelData) {
        this._stopIconAnimationLoop();
        this.sidebar.innerHTML = '';
        this.slots = [];
        const machines = levelData.Machines ?? [];
        this.spawnerItems = levelData['spawner-items'] ?? [];

        this.initialSpawnerCounts = {};
        this.initialSpawnerCountsInt = {};
        for (const si of this.spawnerItems) {
            const k = intToCssHex(cssHexToInt(si.color));
            this.initialSpawnerCounts[k] = si.count ?? 0;
            const n = cssHexToInt(si.color);
            this.initialSpawnerCountsInt[n] = si.count ?? 0;
        }

        this.initialCounts = {};
        const seenBases = new Set();
        for (let i = 0; i < machines.length; i++) {
            const t = machines[i][0];
            const count = machines[i][1] ?? 0;
            this.initialCounts[t] = count;

            const machineType = machines[i][0];
            const base = machineType.split('-')[0];
            if (seenBases.has(base)) continue;
            const variants = [];
            for (let j = 0; j < machines.length; j++) {
                const tt = machines[j][0];
                if (tt.split('-')[0] === base) variants.push(tt);
            }
            seenBases.add(base);
            this._addSlot(variants);
        }

        this._startIconAnimationLoop();
        this._refreshAllSlots();
    }

    _addSlot(variants) {
        if (!variants || variants.length === 0) return;
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

        slot.dataset.rot = '0';
        slot.dataset.animRot = '0';
        icon.style.setProperty('--rot-anim', '0deg');

        this._drawIcon(icon, variants[0]);

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

        const countEl = document.createElement('div');
        countEl.className = 'machine-count';
        slot.appendChild(countEl);
        this._updateSlotCountDisplay(slot);

        if (variants.indexOf('spawner') !== -1 && this.spawnerItems && this.spawnerItems.length) {
            const list = document.createElement('div');
            list.className = 'spawner-color-list';
            for (const si of this.spawnerItems) {
                const wrap = document.createElement('div');
                wrap.className = 'spawner-color-entry';
                const colorText = document.createElement('span');
                colorText.className = 'spawner-color';
                colorText.textContent = String(si.count ?? 0);
                colorText.style.color = si.color;
                const css = intToCssHex(cssHexToInt(si.color));
                colorText.dataset.color = css;
                wrap.appendChild(colorText);
                colorText.addEventListener('click', (e) => {
                    e.stopPropagation();
                    slot.dataset.spawnerColor = colorText.dataset.color;
                    const entries = Array.from(list.querySelectorAll('.spawner-color'));
                    entries.forEach(el => el.classList.toggle('selected', el.dataset.color === slot.dataset.spawnerColor));
                });
                list.appendChild(wrap);
            }
            slot.appendChild(list);
            if (!slot.dataset.spawnerColor) slot.dataset.spawnerColor = intToCssHex(cssHexToInt(this.spawnerItems[0].color));
        }

        icon.addEventListener('wheel', (e) => {
            if (performance.now() - this.lastRotate < 150) return;
            this.lastRotate = performance.now();
            e.preventDefault();
            const deltaY = e.deltaY;
            const delta = deltaY > 0 ? 90 : -90;
            let anim = parseInt(slot.dataset.animRot ?? '0', 10) || 0;
            anim = anim + delta;
            slot.dataset.animRot = String(anim);
            icon.style.setProperty('--rot-anim', `${anim}deg`);
            const cur = parseInt(slot.dataset.rot ?? '0', 10) || 0;
            const next = (cur + delta + 360) % 360;
            slot.dataset.rot = String(next);
        }, { passive: false });

        icon.addEventListener('transitionend', (ev) => {
            if (ev.propertyName !== 'transform') return;
            const logical = parseInt(slot.dataset.rot ?? '0', 10) || 0;
            let anim = parseInt(slot.dataset.animRot ?? '0', 10) || 0;
            if (((anim % 360) + 360) % 360 !== logical) return;
            slot.dataset.animRot = String(logical);
            icon.style.transition = 'none';
            icon.style.setProperty('--rot-anim', `${logical}deg`);
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
        const ctx = icon.getContext('2d');
        ctx.clearRect(0, 0, icon.width, icon.height);
        if (type === 'delete') {
            const deleteImg = this.assetManager.get('delete');
            if (deleteImg) ctx.drawImage(deleteImg, 0, 0, icon.width, icon.height);
            return;
        }
        const img = this.assetManager.get('machines-image');
        if (!img || !this.dataManager) return;
        const data = this.dataManager.getData(joinDots('machineData', type)) ?? {};
        const row = (data.texture && data.texture.row) ?? 0;
        const tw = 16; const th = 16;
        const cols = Math.max(1, Math.floor(img.width / tw));
        const tileIndex = row * cols;
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
        const data = this.dataManager.getData(joinDots('machineData', type)) ?? {};
        const row = (data.texture && data.texture.row) ?? 0;
        const tw = 16; const th = 16;
        const cols = Math.max(1, Math.floor(img.width / tw));
        const tileIndex = row * cols;
        let fps = (data.texture && data.texture.fps) ?? 1;
        const remaining = this._getRemainingCount(type);
        if (remaining <= 0) fps = fps * 0.7;
        const frame = Math.floor((nowMs * fps) / 1000) % cols;
        const sx = frame * tw;
        const sy = Math.floor(tileIndex / cols) * th;
        ctx.drawImage(img, sx, sy, tw, th, 0, 0, icon.width, icon.height);
    }

    _getSlotRemaining(slot) {
        if (!slot) return 0;
        const type = slot.dataset.machineType ?? (() => {
            const vs = JSON.parse(slot.dataset.variants ?? '[]');
            const vi = parseInt(slot.dataset.variantIndex ?? '0', 10) || 0;
            return vs[vi];
        })();
        return this._getRemainingCount(type);
    }

    _getRemainingCount(type) {
        if (!type) return 0;
        const allowed = this.initialCounts[type] ?? 0;
        const placed = this._countPlacedOfType(type);
        return Math.max(0, allowed - placed);
    }

    _getSpawnerRemaining(color) {
        if (color === null || color === undefined) return 0;
        let targetInt = null;
        if (typeof color === 'number') targetInt = color;
        else targetInt = cssHexToInt(String(color));
        if (targetInt === null || targetInt === undefined) return 0;
        const allowed = (this.initialSpawnerCountsInt && (this.initialSpawnerCountsInt[targetInt] ?? 0)) ?? 0;
        let placedSpawners = 0;
        const grid = this.factoryManager.grid;
        for (let x = 0; x < grid.length; x++) {
            const col = grid[x] ?? [];
            for (let y = 0; y < col.length; y++) {
                const m = col[y];
                if (!m) continue;
                const name = m.name ?? (m.data && m.data.type) ?? null;
                if (!name) continue;
                if (name !== 'spawner') continue;
                let mc = null;
                if (m.data && m.data.color !== undefined && m.data.color !== null) mc = m.data.color;
                else if (m.color !== undefined && m.color !== null) mc = m.color;
                if (mc === null || mc === undefined) continue;
                let mcInt = null;
                if (typeof mc === 'number') mcInt = mc;
                else mcInt = cssHexToInt(String(mc));
                if (mcInt === null || mcInt === undefined) continue;
                if (mcInt === targetInt) placedSpawners++;
            }
        }
        return Math.max(0, allowed - placedSpawners);
    }

    _countPlacedOfType(type) {
        let cnt = 0;
        const grid = this.factoryManager.grid;
        for (let x = 0; x < grid.length; x++) {
            const col = grid[x] ?? [];
            for (let y = 0; y < col.length; y++) {
                const m = col[y];
                if (!m) continue;
                const name = m.name ?? (m.data && m.data.type) ?? null;
                if (!name) continue;
                if (name === type) cnt++;
            }
        }
        return cnt;
    }

    _updateSlotCountDisplay(slot) {
        if (!slot) return;
        const countEl = slot.querySelector('.machine-count');
        const icon = slot.querySelector('canvas.machine-icon');
        const count = this._getSlotRemaining(slot);
        if (countEl) {
            if (slot.dataset.machineType !== 'delete') {
                countEl.textContent = String(count);
            } else {
                countEl.textContent = '(:';
            }
            countEl.style.color = (count <= 0) ? 'red' : 'white';
        }
        if (icon) {
            if (count <= 0) icon.style.filter = 'grayscale(100%)';
            else icon.style.filter = '';
        }
        if (count <= 0) slot.classList.add('depleted');
        else slot.classList.remove('depleted');
        const sel = this.slots[this.selectedIndex];
        if (sel === slot) {
            const type = slot.dataset.machineType ?? (() => {
                const vs = JSON.parse(slot.dataset.variants ?? '[]');
                const vi = parseInt(slot.dataset.variantIndex ?? '0', 10);
                return vs[vi];
            })();
            const remaining = this._getRemainingCount(type);
            if (remaining <= 0) slot.style.setProperty('--border_color', '#FFA500FF');
            else slot.style.setProperty('--border_color', '#00FF00FF');
        }
    }

    _refreshAllSlots() {
        if (!this.slots || !this.slots.length) return;
        for (let i = 0; i < this.slots.length; i++) {
            const s = this.slots[i];
            this._updateSlotCountDisplay(s);
            const spList = s.querySelector('.spawner-color-list');
            if (spList) {
                const entries = Array.from(spList.querySelectorAll('.spawner-color-entry'));
                for (const entry of entries) {
                    const colorEl = entry.querySelector('.spawner-color');
                    if (!colorEl) continue;
                    const color = colorEl.dataset.color;
                    const rem = this._getSpawnerRemaining(color);
                    colorEl.textContent = String(rem);
                    const sel = s.dataset.spawnerColor ?? null;
                    const isSel = sel && sel.toLowerCase() === color.toLowerCase();
                    colorEl.classList.toggle('selected', isSel);
                    if (isSel) {
                        colorEl.style.textShadow = `0 0 6px ${color}`;
                        colorEl.style.filter = `drop-shadow(0 0 6px ${color})`;
                    } else {
                        colorEl.style.textShadow = '';
                        colorEl.style.filter = '';
                    }
                }
            }
        }
    }

    getSlotRemaining(index) {
        if (index < 0 || index >= this.slots.length) return 0;
        return this._getSlotRemaining(this.slots[index]);
    }

    getSpawnerRemaining(color) {
        return this._getSpawnerRemaining(color);
    }

    _startIconAnimationLoop() {
        if (this._iconAnimReq) return;
        const loop = (ts) => {
            for (let i = 0; i < this.slots.length; i++) {
                const slot = this.slots[i];
                const icon = slot.querySelector('canvas.machine-icon');
                if (!icon) continue;
                const type = slot.dataset.machineType;
                this._drawIconFrame(icon, type, ts);
                this._updateSlotCountDisplay(slot);
                const indicator = slot.querySelector('.variant-indicator');
                if (indicator) {
                    let variants = JSON.parse(slot.dataset.variants ?? '[]');
                    const dots = Array.from(indicator.children);
                    for (let vi = 0; vi < variants.length; vi++) {
                        const v = variants[vi];
                        const remaining = this._getRemainingCount(v);
                        const dot = dots[vi];
                        if (!dot) continue;
                        if (remaining <= 0) {
                            const activeIndex = parseInt(slot.dataset.variantIndex ?? '0', 10) || 0;
                            if (vi === activeIndex) {
                                dot.style.background = '#FF4444';
                            } else {
                                dot.style.background = '#8B0000';
                            }
                            dot.style.boxShadow = 'inset 0 0 0 1px rgba(0,0,0,0.25)';
                        } else {
                            dot.style.background = (vi === parseInt(slot.dataset.variantIndex ?? '0', 10)) ? '#00FFFF' : '#666';
                            dot.style.boxShadow = '';
                        }
                    }
                }
                const spList = slot.querySelector('.spawner-color-list');
                if (spList) {
                    const entries = Array.from(spList.querySelectorAll('.spawner-color-entry'));
                    for (const entry of entries) {
                        const colorEl = entry.querySelector('.spawner-color');
                        if (!colorEl) continue;
                        const color = colorEl.dataset.color;
                        const rem = this._getSpawnerRemaining(color);
                        colorEl.textContent = String(rem);
                        const sel = slot.dataset.spawnerColor ?? null;
                        const isSel = sel && sel.toLowerCase() === color.toLowerCase();
                        colorEl.classList.toggle('selected', isSel);
                        if (isSel) {
                            colorEl.style.textShadow = `0 0 6px ${color}`;
                            colorEl.style.filter = `drop-shadow(0 0 6px ${color})`;
                        } else {
                            colorEl.style.textShadow = '';
                            colorEl.style.filter = '';
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
        const variants = JSON.parse(slot.dataset.variants ?? '[]');
        if (variants.length <= 1) return;
        let cur = parseInt(slot.dataset.variantIndex ?? '0', 10) || 0;
        cur = (cur + 1) % variants.length;
        slot.dataset.variantIndex = String(cur);
        const newType = variants[cur];
        slot.dataset.machineType = newType;
        const icon = slot.querySelector('canvas.machine-icon');
        this._drawIcon(icon, newType);
        const indicator = slot.querySelector('.variant-indicator');
        if (indicator) {
            const dots = Array.from(indicator.children);
            dots.forEach((d, i) => d.classList.toggle('active', i === cur));
        }
    }

    _handleDoubleTap(gridX, gridY) {
        if (!this.factoryManager) return;
        const machine = this.factoryManager.getMachine(gridX, gridY);
        if (!machine) return;
        const type = machine.name ?? (machine.data && machine.data.type) ?? null;
        if (!type) return;
        const base = type.split('-')[0];
        for (let i = 0; i < this.slots.length; i++) {
            const slot = this.slots[i];
            let variants = JSON.parse(slot.dataset.variants ?? '[]');
            if (!variants.some(v => v.split('-')[0] === base)) continue;
            let cur = variants.indexOf(type);
            if (cur === -1) cur = 0;
            for (let t = 1; t <= variants.length; t++) {
                const nextIdx = (cur + t) % variants.length;
                const newType = variants[nextIdx];
                if (newType === type) continue;
                if (this._getRemainingCount(newType) <= 0) continue;
                const rot = (machine.data && machine.data.rot) ?? 0;
                this.factoryManager.removeMachine(gridX, gridY);
                this.factoryManager.addMachine(newType, gridX, gridY, rot);
                this._updateSlotCountDisplay(slot);
                for (let s = 0; s < this.slots.length; s++) this._updateSlotCountDisplay(this.slots[s]);
                if (this.particleManager) {
                    const size = window.innerHeight / 9;
                    const cx = gridX * size + size / 2;
                    const cy = gridY * size + size / 2;
                    this.particleManager.spawnAt(cx, cy, { count: 8, colors: ['#00FFFF', '#FFA500'], size: 4, speed: 300, life: 500 });
                }
                const newVariantIndex = variants.indexOf(newType);
                if (newVariantIndex !== -1) {
                    slot.dataset.variantIndex = String(newVariantIndex);
                    slot.dataset.machineType = newType;
                    const icon = slot.querySelector('canvas.machine-icon');
                    if (icon) this._drawIcon(icon, newType);
                    const indicator = slot.querySelector('.variant-indicator');
                    if (indicator) {
                        const dots = Array.from(indicator.children);
                        dots.forEach((d, i) => d.classList.toggle('active', i === newVariantIndex));
                    }
                }
                return;
            }
            return;
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
        const type = el.dataset.machineType;
        const remaining = this._getRemainingCount(type);
        if (remaining <= 0) el.style.setProperty('--border_color', '#FFA500FF');
        else el.style.setProperty('--border_color', '#00FF00FF');
        this.selectedIndex = index;
    }

    setupInputBindings() {
        for (let i = 1; i <= 7; i++) {
            const code = `Digit${i}`;
            this.input.addBinding('keyboard', code, 'press', () => {
                const idx = i - 1;
                if (idx < this.slots.length) this.setSelection(idx);
            });
        }

        this.input.addBinding('mouse', 'left', 'held', () => {
            if (!this.factoryManager) return;
            if (this.selectedIndex < 0 || this.selectedIndex >= this.slots.length) return;
            const slot = this.slots[this.selectedIndex];
            const type = slot.dataset.machineType;
            const pos = this.input.getPos();
            const gridX = Math.floor(pos.x / window.innerHeight * 9);
            const gridY = Math.floor(pos.y / window.innerHeight * 9);
            if (!type) return;
            if (type === 'delete') {
                if (this.factoryManager.removeMachine(gridX, gridY)) {
                    const size = window.innerHeight / 9;
                    const cx = (gridX + 1/2) * size;
                    const cy = (gridY + 1/2) * size;
                    this.particleManager.spawnAt(cx, cy, { count: 10, colors: ['#FFC800', '#494949'], size: 10, speed: 300, life: 700 });
                    this._refreshAllSlots();
                }
                return;
            }
            if (this._getRemainingCount(type) <= 0) return;
            if (type.split('-')[0] === 'spawner') {
                if (this._getSpawnerRemaining(slot.dataset.spawnerColor) <= 0) return;
            }
            const placed = this.factoryManager.addMachine(type, gridX, gridY, slot.dataset.rot);
            if (type.split('-')[0] === 'spawner') {
                placed.data = placed.data || {};
                const n = cssHexToInt(slot.dataset.spawnerColor);
                placed.data.color = n;
                placed.color = n;
                this._refreshAllSlots();
            }
            if (this._getRemainingCount(type) === 0) {
                const size = window.innerHeight / 9;
                const cx = (gridX + 1/2) * size;
                const cy = (gridY + 1/2) * size;
                this.particleManager.spawnAt(cx, cy, { count: 20, colors: ['#fbff00','#ff5144','#ffa600'], size: 5, speed: 500, life: 900 });
            }
        }, ["world-edit"]);

        this.input.addBinding('mouse', 'left', 'press', () => {
            if (!this.factoryManager) return;
            const pos = this.input.getPos();
            const gridX = Math.floor(pos.x / window.innerHeight * 9);
            const gridY = Math.floor(pos.y / window.innerHeight * 9);
            if (gridX < 0 || gridY < 0) return;
            const now = performance.now();
            const threshold = 350;
            if (this._lastTap && (now - this._lastTap.time) <= threshold && this._lastTap.x === gridX && this._lastTap.y === gridY) {
                this._handleDoubleTap(gridX, gridY);
                this._lastTap.time = 0;
                const startX = pos.x;
                const startY = pos.y;
                const moveThreshold = 4;
                this.input.disableClass('world-edit', 'function', () => {
                    const cur = this.input.mousePos;
                    if (!cur) return false;
                    const dx = Math.abs(cur.x - startX);
                    const dy = Math.abs(cur.y - startY);
                    return (dx > moveThreshold) || (dy > moveThreshold);
                });
                return;
            } else {
                this._lastTap.time = now;
                this._lastTap.x = gridX;
                this._lastTap.y = gridY;
            }
        }, [], 1);

        this.input.addBinding('mouse', 'middle', 'held', () => {
            if (!this.factoryManager) return;
            const pos = this.input.getPos();
            const gridX = Math.floor(pos.x / window.innerHeight * 9);
            const gridY = Math.floor(pos.y / window.innerHeight * 9);
            if (gridX < 0 || gridY < 0) return;
            const grid = this.factoryManager.grid;
            if (gridX >= grid.length || gridY >= grid[0].length) return;
            const machine = grid[gridX][gridY];
            if (!machine) return;
            const type = machine.name;
            const rot = machine.data.rot;
            if (!type) return;
            for (let i = 0; i < this.slots.length; i++) {
                const slot = this.slots[i];
                const variants = JSON.parse(slot.dataset.variants ?? '[]');
                const idx = variants.indexOf(type);
                if (idx !== -1) {
                    this.setSelection(i);
                    slot.dataset.variantIndex = String(idx);
                    slot.dataset.machineType = variants[idx];
                    slot.dataset.rot = String(rot);
                    slot.dataset.animRot = String(rot);
                    const icon = slot.querySelector('canvas.machine-icon');
                    this._drawIcon(icon, variants[idx]);
                    icon.style.setProperty('--rot-anim', `${rot}deg`);
                    icon.style.setProperty('--rot', `${rot}deg`);
                    const indicator = slot.querySelector('.variant-indicator');
                    if (indicator) {
                        const dots = Array.from(indicator.children);
                        dots.forEach((d, j) => d.classList.toggle('active', j === idx));
                    }
                    this._updateSlotCountDisplay(slot);
                    if (type.split('-')[0] === 'spawner') {
                        const chosen = (machine.data && machine.data.color) || machine.color || null;
                        if (chosen !== null && chosen !== undefined) {
                            const css = intToCssHex(cssHexToInt(chosen));
                            slot.dataset.spawnerColor = css;
                            const list = slot.querySelector('.spawner-color-list');
                            const entries = Array.from(list.querySelectorAll('.spawner-color'));
                            entries.forEach(el => el.classList.toggle('selected', el.dataset.color === css));
                        }
                    }
                    return;
                }
            }
        });

        this.input.addBinding('mouse', 'right', 'held', () => {
            if (!this.slots.some(s => s.dataset.machineType === 'delete')) return;
            const pos = this.input.getPos();
            const gridX = Math.floor(pos.x / window.innerHeight * 9);
            const gridY = Math.floor(pos.y / window.innerHeight * 9);
            const removed = this.factoryManager.removeMachine(gridX, gridY);
            if (removed) {
                const size = window.innerHeight / 9;
                const cx = gridX * size + size / 2;
                const cy = gridY * size + size / 2;
                this.particleManager.spawnAt(cx, cy, { count: 10, colors: ['#FFC800', '#494949'], size: 10, speed: 300, life: 700 });
                this._refreshAllSlots();
            }
        }, ["delete", "world-edit"]);

        this.input.addBinding('wheel', 'scroll', 'press', (payload) => {
            if (performance.now() - this.lastRotate < 200) return;
            this.lastRotate = performance.now();
            const gridPos = this.input.getPos();
            const gridX = Math.floor(gridPos.x / window.innerHeight * 9);
            const gridY = Math.floor(gridPos.y / window.innerHeight * 9);
            const rotateAmount = (payload.deltaY > 0 ? 90 : -90);
            const cur = this.factoryManager.getMachineProperty(gridX, gridY, 'rot') ?? 0;
            const newRot = ((cur + rotateAmount) % 360 + 360) % 360;
            this.factoryManager.setMachineProperty(gridX, gridY, 'rot', newRot);
            this.factoryManager.getMachine(gridX, gridY)?.rotate(rotateAmount);
        }, []);

        this.input.addBinding('keyboard', 'KeyR', 'press', () => { this.factoryManager.resetFactory(); });
        this.input.addBinding('keyboard', 'Space', 'press', () => { this.factoryManager.toggle(); });
    }
}
