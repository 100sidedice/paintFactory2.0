import { joinDots } from "../Helpers/pathHelpers.js";
import { stringHex, intHex } from "../Helpers/colorHelpers.js";
import { getImageId, hexToRgba, getColorizedTile } from "../../Machines/spawner.js";
export default class SidebarManager {
    constructor(assetManager, input, factoryManager, dataManager, particleManager) {
        console.log('SidebarManager constructor');
        this.assetManager = assetManager;
        this.input = input;
        this.factoryManager = factoryManager;
        this.dataManager = dataManager;
        this.particleManager = particleManager;

        this.sidebar = document.getElementById('machine_sidebar');
        this.slots = [];
        this.selectedIndex = 0;
        this.lastRotate = performance.now();
        this.lastRotateDir = 1;
        this.lastRotateTarget = null; // 'slot' | 'machine' | 'selection'
        this._lastTap = { time: 0, x: -1, y: -1 };
        this._iconAnimReq = null;
        this.spawnerColor = 0x1C1C1CFF;
        this.spawnerPanelOpen = false;
        this.spawnerPanel = null;
        this.spawnerPanelToggle = null;
        this.spawnerPanelBody = null;
    }

    _destroySpawnerPanel() {
        if (this.spawnerPanel) {
            this.spawnerPanel.remove();
            this.spawnerPanel = null;
            this.spawnerPanelBody = null;
        }
        if (this.spawnerPanelToggle) {
            this.spawnerPanelToggle.remove();
            this.spawnerPanelToggle = null;
        }
    }

    _syncSpawnerPanelVisibility() {
        if (this.spawnerPanelToggle) {
            this.spawnerPanelToggle.textContent = this.spawnerPanelOpen ? '◀' : '▶';
            this.spawnerPanelToggle.setAttribute('aria-expanded', this.spawnerPanelOpen ? 'true' : 'false');
        }
        if (this.spawnerPanel) {
            this.spawnerPanel.classList.toggle('open', this.spawnerPanelOpen);
        }
    }

    _syncSpawnerPanelPlacement() {
        const hasSpawner = !!(this.spawnerItems?.length && this.slots?.some((slot) => slot.classList.contains('spawner-slot')));
        if (!hasSpawner) {
            this.spawnerPanelOpen = false;
            if (this.spawnerPanelToggle) this.spawnerPanelToggle.style.display = 'none';
            if (this.spawnerPanel) this.spawnerPanel.style.display = 'none';
            return;
        }

        const spawnerSlot = this.slots.find((slot) => slot.classList.contains('spawner-slot'));
        if (!spawnerSlot) return;

        const slotRect = spawnerSlot.getBoundingClientRect();
        if (this.spawnerPanelToggle) {
            this.spawnerPanelToggle.style.display = 'flex';
            this.spawnerPanelToggle.style.top = `${slotRect.top}px`;
            this.spawnerPanelToggle.style.height = `${slotRect.height}px`;
        }
        if (this.spawnerPanel) {
            this.spawnerPanel.style.display = '';
            this.spawnerPanel.style.top = `${slotRect.top}px`;
        }
    }

    _ensureSpawnerPanel() {
        if (!this.spawnerItems || !this.spawnerItems.length) {
            this._destroySpawnerPanel();
            return;
        }

        if (!this.spawnerPanelToggle) {
            const toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'spawner-panel-toggle';
            toggle.addEventListener('click', (e) => {
                e.stopPropagation();
                this.spawnerPanelOpen = !this.spawnerPanelOpen;
                this._syncSpawnerPanelVisibility();
            });
            document.body.appendChild(toggle);
            this.spawnerPanelToggle = toggle;
        }

        if (!this.spawnerPanel) {
            const panel = document.createElement('aside');
            panel.className = 'spawner-panel';

            const body = document.createElement('div');
            body.className = 'spawner-panel-body';
            panel.appendChild(body);

            document.body.appendChild(panel);
            this.spawnerPanel = panel;
            this.spawnerPanelBody = body;
        }

        this._syncSpawnerPanelVisibility();
        this._syncSpawnerPanelPlacement();
        this._renderSpawnerPanel();
    }

    _drawSpawnerPreview(canvas, color) {
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        canvas.width = 16;
        canvas.height = 16;
        canvas.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const img = this.assetManager.get('machines-image');
        if (!img || !this.dataManager) return;

        const data = this.dataManager.getData(joinDots('machineData', 'spawner')) ?? {};
        const row = (data.texture && data.texture.row) ?? 0;
        const tw = 16;
        const th = 16;
        const cols = Math.max(1, Math.floor(img.width / tw));
        const tileIndex = row * cols;
        const sx = 0;
        const sy = Math.floor(tileIndex / cols) * th;
        const tile = getColorizedTile(img, sx, sy, tw, th, color, 0x1C1C1CFF);
        ctx.drawImage(tile, 0, 0, canvas.width, canvas.height);
    }

    _renderSpawnerPanel() {
        if (!this.spawnerPanelBody) return;
        const selectedColor = this._getSelectedSpawnerColor();
        const selectedCss = selectedColor === null ? null : stringHex(selectedColor);
        this.spawnerPanelBody.innerHTML = '';

        const colors = (this.spawnerItems ?? []).filter((si) => {
            if (!si || si.color === null || si.color === undefined) return false;
            if (selectedCss === null) return true;
            return stringHex(si.color).toLowerCase() !== selectedCss.toLowerCase();
        });

        if (!colors.length) {
            return;
        }

        for (const si of colors) {
            const color = intHex(si.color);
            const entry = document.createElement('button');
            entry.type = 'button';
            entry.className = 'spawner-panel-entry';
            entry.dataset.color = stringHex(color);
            entry.title = `Select ${stringHex(color)}`;
            entry.addEventListener('click', (e) => {
                e.stopPropagation();
                this._setSpawnerColor(entry.dataset.color);
            });

            const icon = document.createElement('canvas');
            icon.className = 'spawner-panel-icon';
            this._drawSpawnerPreview(icon, color);
            entry.appendChild(icon);

            const count = document.createElement('span');
            count.className = 'spawner-panel-count';
            count.textContent = String(this._getSpawnerRemaining(color));
            entry.appendChild(count);
            this.spawnerPanelBody.appendChild(entry);
        }
    }

    populateSidebar(levelData) {
        this._stopIconAnimationLoop();
        this._destroySpawnerPanel();
        this.sidebar.innerHTML = '';
        this.slots = [];
        const machines = levelData.Machines ?? [];
        this.spawnerItems = levelData['spawner-items'] ?? [];

        this.initialSpawnerCountsInt = {};
        for (const si of this.spawnerItems) {
            si.color = intHex(si.color);
            this.initialSpawnerCountsInt[si.color] = si.count ?? 0;
        }
        if (this.spawnerItems.length > 0) {
            const firstColor = this.spawnerItems[0]?.color;
            if (firstColor !== undefined && firstColor !== null) {
                this.spawnerColor = intHex(firstColor);
            }
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

        this._ensureSpawnerPanel();
        this._startIconAnimationLoop();
        this._refreshAllSlots();
        requestAnimationFrame(() => this._syncSpawnerPanelPlacement());
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

        if (variants.indexOf('spawner') !== -1) {
            slot.classList.add('spawner-slot');
        }

        icon.addEventListener('wheel', (e) => {
            if (performance.now() - this.lastRotate < 150) return;
            e.preventDefault();
            const deltaY = e.deltaY;
            const delta = deltaY > 0 ? 90 : -90;
            this.lastRotate = performance.now();
            this.lastRotateDir = (delta > 0) ? 1 : -1;
            this.lastRotateTarget = 'slot';
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
        console.log(`hello`);
        const ctx = icon.getContext('2d');
        ctx.clearRect(0, 0, icon.width, icon.height);
        if (type === 'delete') {
            const deleteImg = this.assetManager.get('delete');
            if (deleteImg) ctx.drawImage(deleteImg, 0, 0, icon.width, icon.height);
            return;
        }
        const img = this.assetManager.get('machines-image');
        if (!img) return;
        if (!img || !this.dataManager) return;
        const data = this.dataManager.getData(joinDots('machineData', type)) ?? {};
        const row = (data.texture && data.texture.row) ?? 0;
        const tw = 16; const th = 16;
        const cols = Math.max(1, Math.floor(img.width / tw));
        const tileIndex = row * cols;
        const sx = 0;
        const sy = Math.floor(tileIndex / cols) * th;
        console.log('drawing spawner icon with color');
        if(type === 'spawner'){
            const maskColor = 0x1C1C1CFF;
            const color = this.spawnerColor;
            const tile = getColorizedTile(img, sx, sy, tw, th, color, maskColor);
            console.log('drawing spawner icon with color', stringHex(color));
            ctx.drawImage(tile, 0, 0, icon.width, icon.height);
            return;
        }
        ctx.drawImage(img, sx, sy, tw, th, 0, 0, icon.width, icon.height);
    }

    _drawIconFrame(icon, type, nowMs) {
        console.log(`_drawIconFrame: type=${type}, nowMs=${nowMs}`);
        const ctx = icon.getContext('2d');
        ctx.clearRect(0, 0, icon.width, icon.height);
        if (type === 'delete') {
            const deleteImg = this.assetManager.get('delete');
            if (deleteImg) ctx.drawImage(deleteImg, 0, 0, icon.width, icon.height);
            return;
        }
        const img = this.assetManager.get('machines-image');
        
        const data = this.dataManager.getData(joinDots('machineData', type)) ?? {};
        const row = data.texture.row;
        const tw = 16; 
        const th = 16;
        const cols = Math.max(1, Math.floor(img.width / tw));
        const tileIndex = row * cols;
        let fps = data.texture.fps;
        const remaining = this._getRemainingCount(type);
        if (remaining <= 0) fps = fps * 0.7;
        const frame = Math.floor((nowMs * fps) / 1000) % cols;
        const sx = frame * tw;
        const sy = Math.floor(tileIndex / cols) * th;
        if(type === 'spawner'){
            const maskColor = 0x1C1C1CFF;
            const color = this.spawnerColor;
            const tile = getColorizedTile(img, sx, sy, tw, th, color, maskColor);
            ctx.drawImage(tile, 0, 0, icon.width, icon.height);
            return;
        }
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
        return (allowed - placed);
    }

    _getSpawnerRemaining(color) {
        if (color === null || color === undefined) return 0;
        const targetInt = intHex(color);
        const allowed = this.initialSpawnerCountsInt?.[targetInt] ?? 0;
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
                let mcInt = intHex(mc);
                if (mcInt === null || mcInt === undefined) continue;
                if (mcInt === targetInt) placedSpawners++;
            }
        }
        return (allowed - placedSpawners);
    }

    _getSelectedSpawnerColor() {
        if (this.spawnerColor !== null && this.spawnerColor !== undefined) {
            return this.spawnerColor;
        }
        return this.spawnerItems?.[0]?.color ?? null;
    }

    _setSpawnerColor(color) {
        if (color === null || color === undefined) return;
        this.spawnerColor = intHex(color);
        this._refreshSpawnerColorLists();
        this._renderSpawnerPanel();
        this._refreshAllSlots();
    }

    _updateSpawnerColorList(list) {
        if (!list) return;
        const selectedColor = this._getSelectedSpawnerColor();
        const selectedCss = selectedColor === null ? null : stringHex(selectedColor);
        const entries = Array.from(list.querySelectorAll('.spawner-color'));
        for (const colorEl of entries) {
            const color = colorEl.dataset.color;
            if (!color) continue;
            const rem = this._getSpawnerRemaining(color);
            colorEl.textContent = String(rem);
            const isSel = selectedCss && color.toLowerCase() === selectedCss.toLowerCase();
            colorEl.classList.toggle('selected', !!isSel);
            if (isSel) {
                const glowColor = (() => {
                    try {
                        const v = intHex(color) >>> 0;
                        const r = (v >>> 24) & 0xFF;
                        const g = (v >>> 16) & 0xFF;
                        const b = (v >>> 8) & 0xFF;
                        return (r + g + b <= 256) ? '#FFFFFFFF' : color;
                    } catch (e) { return color; }
                })();
                colorEl.style.textShadow = `0 0 6px ${glowColor}`;
                colorEl.style.filter = `drop-shadow(0 0 6px ${glowColor})`;
            } else {
                colorEl.style.textShadow = '';
                colorEl.style.filter = '';
            }
        }
    }

    _refreshSpawnerColorLists() {
        this._renderSpawnerPanel();
        if (!this.slots || !this.slots.length) return;
        for (const slot of this.slots) {
            const spList = slot.querySelector('.spawner-color-list');
            if (spList) this._updateSpawnerColorList(spList);
        }
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
        const isSpawnerSlot = slot.classList.contains('spawner-slot');
        if (countEl) {
            if (isSpawnerSlot) {
                countEl.textContent = '';
                countEl.style.display = 'none';
            } else if (slot.dataset.machineType !== 'delete') {
                countEl.textContent = String(count);
                countEl.style.display = '';
            } else {
                countEl.textContent = '(:';
                countEl.style.display = '';
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
        this._renderSpawnerPanel();
        for (let i = 0; i < this.slots.length; i++) {
            const s = this.slots[i];
            this._updateSlotCountDisplay(s);
            const spList = s.querySelector('.spawner-color-list');
            if (spList) this._updateSpawnerColorList(spList);
        }
        this._syncSpawnerPanelPlacement();
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
                                dot.style.background = '#FF4444FF';
                            } else {
                                dot.style.background = '#8B0000FF';
                            }
                            dot.style.boxShadow = 'inset 0 0 0 1px #000000A0';
                        } else {
                            dot.style.background = (vi === parseInt(slot.dataset.variantIndex ?? '0', 10)) ? '#00FFFFFF' : '#666666FF';
                            dot.style.boxShadow = '';
                        }
                    }
                }
                const spList = slot.querySelector('.spawner-color-list');
                if (spList) this._updateSpawnerColorList(spList);
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
                const rot = parseInt((machine.data && machine.data.rot) ?? 0, 10) || 0;
                this.factoryManager.removeMachine(gridX, gridY);
                this.factoryManager.addMachine(newType, gridX, gridY, rot);
                this._updateSlotCountDisplay(slot);
                for (let s = 0; s < this.slots.length; s++) this._updateSlotCountDisplay(this.slots[s]);
                if (this.particleManager) {
                    const size = window.innerHeight / 9;
                    const cx = gridX * size + size / 2;
                    const cy = gridY * size + size / 2;
                    this.particleManager.spawnAt(cx, cy, { count: 8, colors: [0x00FFFFFF, 0xFFA500FF], size: 4, speed: 300, life: 500 });
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

        // Shift+left = select
        this.input.addBindings([
            ["keyboard", "ShiftLeft", "held"],
            ["mouse", "left", "held"]
        ], () => {
            if (!this.factoryManager) return;
            const pos = this.input.getPos();
            const gridX = Math.floor(pos.x / window.innerHeight * 9);
            const gridY = Math.floor(pos.y / window.innerHeight * 9);
            if (gridX < 0 || gridY < 0) return;
            this.factoryManager.select(gridX, gridY);
            this.input.block(3)
        }, ["select"], 3);

        // Shift+right = remove select
        // require keyboard held + mouse press so action fires immediately while Shift is down
        this.input.addBindings([
            ["keyboard", "ShiftLeft", "held"],
            ["mouse", "right", "held"]
        ], () => {
            if (!this.factoryManager) return;
            const pos = this.input.getPos();
            const gridX = Math.floor(pos.x / window.innerHeight * 9);
            const gridY = Math.floor(pos.y / window.innerHeight * 9);
            if (gridX < 0 || gridY < 0) return;
            this.factoryManager.select(gridX, gridY, "remove");
            this.input.block(3)
        }, ["select"], 3);

        // c = copy selection 
        this.input.addBinding('keyboard', 'KeyC', 'press', () => {
            this.factoryManager.copySelection(this.input.getPos());
        }, ["select"], 1);

        this.input.addBinding('keyboard', 'KeyX', 'press', () => {
            this.factoryManager.cutSelection(this.input.getPos());
            this.factoryManager.clearSelection();
        }, ["select"], 1);

        // v = paste selection
        this.input.addBinding('keyboard', 'KeyV', 'press', () => {
            this.factoryManager.pasting = true;
        }, ["select"], 1);

        // While pasting: left = confirm, right = cancel. High priority to avoid other handlers.
        this.input.addBinding('mouse', 'left', 'press', () => {
            if (!this.factoryManager) return;
            if (!this.factoryManager.pasting) return;
            const pos = this.input.getPos();
            const gridX = Math.floor(pos.x / window.innerHeight * 9);
            const gridY = Math.floor(pos.y / window.innerHeight * 9);
            // attempt paste
            const res = this.factoryManager.pasteAt(gridX, gridY);
            this.factoryManager.pasting = false;
            // block until mouse release to prevent other place handlers
            this.input.block(3);
        }, ["paste"], 10, ()=>{
            return this.factoryManager.pasting;
        });

        this.input.addBinding('mouse', 'right', 'press', () => {
            if (!this.factoryManager) return;
            if (!this.factoryManager.pasting) return;
            this.factoryManager.pasting = false;
            this.input.block(3);
        }, ["paste"], 10);

        this.input.addBinding('mouse', 'left', 'held', () => {
            if (!this.factoryManager) return;
            // when shift select is active, do not place while holding left
            if (this.input.active.has('keyboard:ShiftLeft:press') || this.input.active.has('keyboard:ShiftRight:press')) return;
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
                    this.particleManager.spawnAt(cx, cy, { count: 10, colors: [0xFFC800FF, 0x494949FF], size: 10, speed: 300, life: 700 });
                    this._refreshAllSlots();
                }
                return;
            }
            if (this._getRemainingCount(type) <= 0) return;
            if (type.split('-')[0] === 'spawner') {
                if (this._getSpawnerRemaining(this._getSelectedSpawnerColor()) <= 0) return;
            }
            const placed = this.factoryManager.addMachine(type, gridX, gridY, parseInt(slot.dataset.rot ?? '0', 10) || 0);
            if (type.split('-')[0] === 'spawner') {
                placed.data = placed.data || {};
                const n = intHex(this._getSelectedSpawnerColor());
                placed.data.color = n;
                placed.color = n;
                this._refreshAllSlots();
            }
            if (this._getRemainingCount(type) === 0) {
                const size = window.innerHeight / 9;
                const cx = (gridX + 1/2) * size;
                const cy = (gridY + 1/2) * size;
                this.particleManager.spawnAt(cx, cy, { count: 20, colors: [0xFBFF00FF, 0xFF5144FF, 0xFFA600FF], size: 5, speed: 500, life: 900 });
            }
        }, ["world-edit"], 1);

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
                            this._setSpawnerColor(chosen);
                        }
                    }
                    return;
                }
            }
        });
        this.input.addBinding('keyboard', 'ControlLeft', 'held', () => {
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
                            this._setSpawnerColor(chosen);
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
                this.particleManager.spawnAt(cx, cy, { count: 10, colors: [0xFFC800FF, 0x494949FF], size: 10, speed: 300, life: 700 });
                this._refreshAllSlots();
            }
            this.factoryManager.clearSelection();
        }, ["delete", "world-edit"], 1);

        // Shift+wheel -> always rotate the selected slot (even when hovering a tile)
        this.input.addBindings([
            ["keyboard", "ShiftLeft", "held"],
            ["wheel", "scroll", "press"]
        ], (payload) => {
            if (performance.now() - this.lastRotate < 200) return;
            const rotateAmount = (payload.deltaY > 0 ? 90 : -90);
            this.lastRotate = performance.now();
            this.lastRotateDir = (rotateAmount > 0) ? 1 : -1;
            this.lastRotateTarget = 'slot';
            const sel = this.slots[this.selectedIndex];
            if (!sel) return;
            let anim = parseInt(sel.dataset.animRot ?? '0', 10) || 0;
            anim = anim + rotateAmount;
            sel.dataset.animRot = String(anim);
            const icon = sel.querySelector('canvas.machine-icon');
            if (icon) icon.style.setProperty('--rot-anim', `${anim}deg`);
            const cur = parseInt(sel.dataset.rot ?? '0', 10) || 0;
            const next = (cur + rotateAmount + 360) % 360;
            sel.dataset.rot = String(next);
            this.input.block(3);
            setTimeout(() => {this.input.unblock();}, 120);
        }, ["select"], 2);

        this.input.addBindings([
            ["keyboard", "ShiftRight", "held"],
            ["wheel", "scroll", "press"]
        ], (payload) => {
            if (performance.now() - this.lastRotate < 200) return;
            const rotateAmount = (payload.deltaY > 0 ? 90 : -90);
            this.lastRotate = performance.now();
            this.lastRotateDir = (rotateAmount > 0) ? 1 : -1;
            this.lastRotateTarget = 'slot';
            const sel = this.slots[this.selectedIndex];
            if (!sel) return;
            let anim = parseInt(sel.dataset.animRot ?? '0', 10) || 0;
            anim = anim + rotateAmount;
            sel.dataset.animRot = String(anim);
            const icon = sel.querySelector('canvas.machine-icon');
            if (icon) icon.style.setProperty('--rot-anim', `${anim}deg`);
            const cur = parseInt(sel.dataset.rot ?? '0', 10) || 0;
            const next = (cur + rotateAmount + 360) % 360;
            sel.dataset.rot = String(next);
            this.input.block(3);
            setTimeout(() => {this.input.unblock();}, 120);
        }, ["select"], 2);

        this.input.addBinding('wheel', 'scroll', 'press', (payload) => {
            if (performance.now() - this.lastRotate < 200) return;
            const rotateAmount = (payload.deltaY > 0 ? 90 : -90);
            this.lastRotate = performance.now();
            this.lastRotateDir = (rotateAmount > 0) ? 1 : -1;
            this.lastRotateTarget = 'machine';
            const gridPos = this.input.getPos();
            const gridX = Math.floor(gridPos.x / window.innerHeight * 9);
            const gridY = Math.floor(gridPos.y / window.innerHeight * 9);
            // if hovering a machine, rotate that machine
            const grid = this.factoryManager && this.factoryManager.grid;
            let hoveredMachine = null;
            if (grid && gridX >= 0 && gridY >= 0 && gridX < grid.length && gridY < (grid[0]?.length || 0)) hoveredMachine = grid[gridX][gridY];
            if (hoveredMachine) {
                const cur = parseInt(this.factoryManager.getMachineProperty(gridX, gridY, 'rot') ?? 0, 10) || 0;
                const newRot = ((cur + rotateAmount) % 360 + 360) % 360;
                this.factoryManager.setMachineProperty(gridX, gridY, 'rot', newRot);
                if (typeof hoveredMachine.rotate === 'function') hoveredMachine.rotate(rotateAmount);
                return;
            }
            // otherwise, rotate the currently selected slot (like wheel on slot icon)
            const sel = this.slots[this.selectedIndex];
            if (!sel) return;
            // animate rotate
            let anim = parseInt(sel.dataset.animRot ?? '0', 10) || 0;
            anim = anim + rotateAmount;
            sel.dataset.animRot = String(anim);
            const icon = sel.querySelector('canvas.machine-icon');
            if (icon) icon.style.setProperty('--rot-anim', `${anim}deg`);
            const cur = parseInt(sel.dataset.rot ?? '0', 10) || 0;
            const next = (cur + rotateAmount + 360) % 360;
            sel.dataset.rot = String(next);
        }, [], 0);

        // rotate selection when there is an active selection (higher priority)
        this.input.addBinding('wheel', 'scroll', 'press', (payload) => {
            if (performance.now() - this.lastRotate < 200) return;
            const rotateAmount = (payload.deltaY > 0 ? 90 : -90);
            this.lastRotate = performance.now();
            this.lastRotateDir = (rotateAmount > 0) ? 1 : -1;
            if (this.factoryManager) {
                this.factoryManager.rotateSelection(rotateAmount);
                // block lower-priority handlers while rotate completes
                this.input.block(3);
                // wheel has no matching 'release' event to clear temporary block,
                // so clear it shortly after to avoid permanently blocking input.
                setTimeout(() => {this.input.unblock();}, 120);
            }
        }, [], 1, () => {
            return !!(this.factoryManager && this.factoryManager.selectedCells && this.factoryManager.selectedCells.size > 0);
        });

        // KeyR: rotate clipboard when pasting, otherwise reset factory
        this.input.addBinding('keyboard', 'KeyR', 'press', () => {
            if (this.factoryManager && this.factoryManager.pasting) {
                this.factoryManager.rotateClipboard(true);
            } else if (this.factoryManager) {
                this.factoryManager.resetFactory();
            }
        }, [], 1);
        this.input.addBinding('keyboard', 'Space', 'press', () => { this.factoryManager.toggle(); });
    }
}
