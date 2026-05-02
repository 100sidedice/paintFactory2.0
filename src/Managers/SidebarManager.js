import { joinDots } from "../Helpers/pathHelpers.js";
import { stringHex, intHex } from "../Helpers/colorHelpers.js";
import { getImageId, hexToRgba, getColorizedTile } from "../../Machines/spawner.js";

// Constants to replace magic numbers and repeated strings
const ROTATION_STEP = 90; // Degrees to rotate machines (90° increments)
const ROTATION_CYCLE = 360; // Full rotation in degrees
const TILE_SIZE = 16; // Size of each tile sprite in pixels
const GRID_SIZE = 9; // fixed vertical grid size (rows)
const DOUBLE_TAP_THRESHOLD = 350; // Milliseconds to detect double-tap
const HOLD_SHAKE_DELAY = 500; // Milliseconds to hold before triggering paste mode
const ROTATE_THROTTLE = 150; // Milliseconds between rotation inputs on icon wheel
const ROTATE_RELEASE_THROTTLE = 200; // Milliseconds between rotation inputs on mouse wheel
const DEFAULT_SPAWNER_COLOR = 0x1C1C1CFF; // Default dark gray color for spawner
const SPAWNER_BASE = 'spawner'; // Machine type for spawners
const DELETE_BASE = 'delete'; // Machine type for delete tool
const DELETE_ROTATE = 'delete-rotate'; // Machine type for rotate-selected action
const DELETE_SELECT = 'delete-select'; // Machine type for select/drag action

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
        this._lastTap = { time: 0, x: -1, y: -1 };
        this._iconAnimReq = null;
        this._pasteModeSlot = null;
        this._selectDragStart = null;
        this.spawnerColor = DEFAULT_SPAWNER_COLOR;
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
            this.spawnerPanelToggle.setAttribute('aria-expanded', String(this.spawnerPanelOpen));
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

    _setPasteMode(slot, enabled) {
        if (!slot) return;
        const label = slot.querySelector('.paste-status');
        const icon = slot.querySelector('canvas.machine-icon');
        if (enabled) {
            if (this._pasteModeSlot && this._pasteModeSlot !== slot) {
                const oldLabel = this._pasteModeSlot.querySelector('.paste-status');
                const oldIcon = this._pasteModeSlot.querySelector('canvas.machine-icon');
                this._pasteModeSlot.classList.remove('paste-mode');
                if (oldLabel) oldLabel.classList.remove('visible');
                this._pasteModeSlot.dataset.pasteArmed = '0';
                if (oldIcon) this._drawIcon(oldIcon, 'delete-select');
            }
            this._pasteModeSlot = slot;
            slot.classList.add('paste-mode');
            slot.dataset.pasteArmed = '1';
            if (label) label.classList.add('visible');
            if (icon) this._drawIcon(icon, 'delete-rotate');
        } else {
            slot.classList.remove('paste-mode');
            slot.dataset.pasteArmed = '0';
            if (label) label.classList.remove('visible');
            if (icon) this._drawIcon(icon, 'delete-select');
            if (this._pasteModeSlot === slot) this._pasteModeSlot = null;
        }
    }

    _clearPasteMode() {
        if (this._pasteModeSlot) {
            this._setPasteMode(this._pasteModeSlot, false);
        }
        this.factoryManager.pasting = false;
        this.factoryManager.pasteTarget = null;
    }

    _ensureSpawnerPanel() {
        if (!this.spawnerItems || !this.spawnerItems.length) {
            this._destroySpawnerPanel();
            return;
        }

        if (!this.spawnerPanelToggle) {
            const toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'spawner-panel-toggle ui';
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
            panel.className = 'spawner-panel ui';

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
        
        canvas.width = TILE_SIZE;
        canvas.height = TILE_SIZE;
        canvas.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const img = this.assetManager.get('machines-image');
        if (!img?.width) return;

        const data = this.dataManager.getData(joinDots('machineData', SPAWNER_BASE)) ?? {};
        const row = data.texture?.row ?? 0;
        const cols = Math.max(1, Math.floor(img.width / TILE_SIZE));
        const tileIndex = row * cols;
        const sy = Math.floor(tileIndex / cols) * TILE_SIZE;
        const tile = getColorizedTile(img, 0, sy, TILE_SIZE, TILE_SIZE, color, DEFAULT_SPAWNER_COLOR);
        ctx.drawImage(tile, 0, 0, TILE_SIZE, TILE_SIZE);
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
            const remaining = this._getSpawnerRemaining(color);
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
            icon.style.filter = (remaining <= 0) ? 'grayscale(100%)' : '';
            entry.appendChild(icon);

            const count = document.createElement('span');
            count.className = 'spawner-panel-count';
            count.textContent = String(remaining);
            count.style.color = (remaining <= 0) ? 'red' : 'white';
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
            // If this is delete, add rotate and select as special action variants
            if (base === DELETE_BASE) {
                variants.push('delete-rotate', 'delete-select');
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

        const pasteLabel = document.createElement('p');
        pasteLabel.className = 'paste-status';
        pasteLabel.textContent = 'Pasting';
        slot.appendChild(pasteLabel);

        let holdShakeTimer = null;
        let holdActivated = false;
        const stopHoldShake = () => {
            if (holdShakeTimer !== null) {
                clearTimeout(holdShakeTimer);
                holdShakeTimer = null;
            }
            slot.classList.remove('hold-shake');
            if (!holdActivated) pasteLabel.classList.remove('visible');
        };

        slot.addEventListener('pointerdown', (e) => {
            if (slot.dataset.machineType !== DELETE_SELECT) return;
            if (e.button !== undefined && e.button !== 0) return;
            holdActivated = false;
            stopHoldShake();
            holdShakeTimer = window.setTimeout(() => {
                if (slot.dataset.machineType !== DELETE_SELECT) return;
                if (!this.factoryManager?.clipboard?.machines?.length) return;
                holdActivated = true;
                slot.classList.add('hold-shake');
                holdShakeTimer = null;
                slot.classList.remove('hold-shake');
                this._setPasteMode(slot, true);
                this.factoryManager.pasting = true;
                this.factoryManager.pasteTarget = null;
                const rect = slot.getBoundingClientRect();
                const cx = rect.left + rect.width / 2;
                const cy = rect.top + rect.height / 2;
                this.particleManager.spawnAt(cx, cy, { count: 16, colors: [0xFFFFFFFF, 0x00FFFFFF, 0xA0A0FFFF], size: 4, speed: 220, life: 500 });
            }, HOLD_SHAKE_DELAY);
            window.addEventListener('pointerup', stopHoldShake, { once: true });
            window.addEventListener('pointercancel', stopHoldShake, { once: true });
            window.addEventListener('pointerleave', stopHoldShake, { once: true });
        });

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

        if (variants.indexOf(SPAWNER_BASE) !== -1) {
            slot.classList.add('spawner-slot');
        }

        const countEl = document.createElement('p');
        countEl.className = 'machine-count';
        slot.appendChild(countEl);

        if (slot.classList.contains('spawner-slot')) {
            const selectedCountEl = document.createElement('p');
            selectedCountEl.className = 'spawner-selected-count';
            slot.appendChild(selectedCountEl);
        }

        this._updateSlotCountDisplay(slot);

        icon.addEventListener('wheel', (e) => {
            if (performance.now() - this.lastRotate < ROTATE_THROTTLE) return;
            e.preventDefault();
            const deltaY = e.deltaY;
            const delta = deltaY > 0 ? ROTATION_STEP : -ROTATION_STEP;
            this.lastRotate = performance.now();
            this.lastRotateDir = (delta > 0) ? 1 : -1;
            let anim = parseInt(slot.dataset.animRot ?? '0', 10) || 0;
            anim = anim + delta;
            slot.dataset.animRot = String(anim);
            icon.style.setProperty('--rot-anim', `${anim}deg`);
            const cur = parseInt(slot.dataset.rot ?? '0', 10) || 0;
            const next = (cur + delta + ROTATION_CYCLE) % ROTATION_CYCLE;
            slot.dataset.rot = String(next);
        }, { passive: false });

        icon.addEventListener('transitionend', (ev) => {
            if (ev.propertyName !== 'transform') return;
            const logical = parseInt(slot.dataset.rot ?? '0', 10) || 0;
            let anim = parseInt(slot.dataset.animRot ?? '0', 10) || 0;
            if (((anim % ROTATION_CYCLE) + ROTATION_CYCLE) % ROTATION_CYCLE !== logical) return;
            slot.dataset.animRot = String(logical);
            icon.style.transition = 'none';
            icon.style.setProperty('--rot-anim', `${logical}deg`);
            void icon.offsetWidth;
            icon.style.transition = 'transform 0.1s ease';
        });

        slot.appendChild(icon);

        const index = this.slots.length;
        slot.addEventListener('click', () => {
            if (slot.dataset.pasteArmed === '1') {
                if (this.factoryManager.pasting) this.factoryManager.rotateClipboard(true);
                return;
            }
            // Special handling for rotate: if rotate is selected and we click on another slot, rotate it
            if (this.selectedIndex >= 0 && this.selectedIndex < this.slots.length) {
                const currentSlot = this.slots[this.selectedIndex];
                const currentType = currentSlot.dataset.machineType;
                if (currentType === DELETE_ROTATE) {
                    // Rotate the clicked slot (same effect as scrolling on it) - rotate by 90 degrees
                    const clickedSlot = this.slots[index];
                    if (clickedSlot && index !== this.selectedIndex) {
                        // Rotate clockwise by ROTATION_STEP degrees
                        const delta = ROTATION_STEP;
                        let anim = parseInt(clickedSlot.dataset.animRot ?? '0', 10) || 0;
                        anim = anim + delta;
                        clickedSlot.dataset.animRot = String(anim);
                        const slotIcon = clickedSlot.querySelector('canvas.machine-icon');
                        if (slotIcon) {
                            slotIcon.style.setProperty('--rot-anim', `${anim}deg`);
                        }
                        const cur = parseInt(clickedSlot.dataset.rot ?? '0', 10) || 0;
                        const next = (cur + delta + ROTATION_CYCLE) % ROTATION_CYCLE;
                        clickedSlot.dataset.rot = String(next);
                        return;
                    } else if (index === this.selectedIndex) {
                        // Clicking on delete slot itself should cycle its variants
                        this._cycleSlotVariant(index);
                        return;
                    }
                }
            }
            
            // Normal slot interaction
            if (this.selectedIndex === index) {
                this._cycleSlotVariant(index);
            } else {
                this.setSelection(index);
            }
        });

        this.sidebar.appendChild(slot);
        this.slots.push(slot);
    }

    _isSpawnerType(type) {
        return type?.split('-')[0] === SPAWNER_BASE;
    }

    _drawIcon(icon, type, nowMs = null) {
        if (!icon) return;
        const ctx = icon.getContext('2d');
        ctx.clearRect(0, 0, icon.width, icon.height);

        // Handle special delete action variants
        const specialAssets = { [DELETE_ROTATE]: 'rotate', [DELETE_SELECT]: 'select', delete: 'delete' };
        if (type in specialAssets) {
            const img = this.assetManager.get(specialAssets[type]);
            if (img) ctx.drawImage(img, 0, 0, icon.width, icon.height);
            return;
        }

        const img = this.assetManager.get('machines-image');
        if (!img?.width) return;

        const data = this.dataManager.getData(joinDots('machineData', type)) ?? {};
        const row = data.texture?.row ?? 0;
        const cols = Math.max(1, Math.floor(img.width / TILE_SIZE));
        const tileIndex = row * cols;
        const sy = Math.floor(tileIndex / cols) * TILE_SIZE;
        let sx = 0;

        // Calculate animation frame if timestamp provided
        if (nowMs !== null) {
            const fps = data.texture?.fps ?? 1;
            const remaining = this._getRemainingCount(type);
            const adjustedFps = remaining <= 0 ? fps * 0.7 : fps;
            sx = Math.floor((nowMs * adjustedFps) / 1000) % cols * TILE_SIZE;
        }

        if (this._isSpawnerType(type)) {
            const tile = getColorizedTile(img, sx, sy, TILE_SIZE, TILE_SIZE, this.spawnerColor, DEFAULT_SPAWNER_COLOR);
            ctx.drawImage(tile, 0, 0, icon.width, icon.height);
        } else {
            ctx.drawImage(img, sx, sy, TILE_SIZE, TILE_SIZE, 0, 0, icon.width, icon.height);
        }
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
        // Special delete variants (rotate, select) don't have limits
        if (type === DELETE_ROTATE || type === DELETE_SELECT) return 1;
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
                const name = m.name ?? m.data?.type ?? null;
                if (!name) continue;
                if (name !== 'spawner') continue;
                let mc = m.data?.color ?? m.color ?? null;
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
                const name = m.name ?? m.data?.type ?? null;
                if (!name) continue;
                if (name === type) cnt++;
            }
        }
        return cnt;
    }

    _updateSlotCountDisplay(slot) {
        if (!slot) return;
        const countEl = slot.querySelector('.machine-count');
        const selectedCountEl = slot.querySelector('.spawner-selected-count');
        const icon = slot.querySelector('canvas.machine-icon');
        const count = this._getSlotRemaining(slot);
        const selectedColorCount = selectedCountEl
            ? this._getSpawnerRemaining(this._getSelectedSpawnerColor())
            : null;
        if (countEl) {
            const type = slot.dataset.machineType;
            if (type === 'delete') {
                countEl.textContent = '(:';
                countEl.style.display = '';
                countEl.style.color = (count <= 0) ? 'red' : 'white';
            } else if (type === DELETE_ROTATE) {
                countEl.textContent = 'O:';
                countEl.style.display = '';
                countEl.style.color = 'white';
            } else if (type === DELETE_SELECT) {
                countEl.textContent = '/:';
                countEl.style.display = '';
                countEl.style.color = 'white';
            } else {
                countEl.textContent = String(count);
                countEl.style.display = '';
                countEl.style.color = (count <= 0) ? 'red' : 'white';
            }
        }
        if (selectedCountEl) {
            selectedCountEl.textContent = String(selectedColorCount);
            selectedCountEl.style.color = (selectedColorCount <= 0) ? 'red' : 'white';
        }
        const type = slot.dataset.machineType;
        const isSpecialAction = (type === DELETE_ROTATE || type === DELETE_SELECT);
        if (icon) {
            if (!isSpecialAction && (count <= 0 || (selectedColorCount !== null && selectedColorCount <= 0))) {
                icon.style.filter = 'grayscale(100%)';
            } else {
                icon.style.filter = '';
            }
        }
        if (!isSpecialAction && count <= 0) slot.classList.add('depleted');
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
                const drawType = (type === DELETE_SELECT && slot.dataset.pasteArmed === '1') ? DELETE_ROTATE : type;
                this._drawIcon(icon, drawType, ts);
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
        const machine = this.factoryManager.getMachine(gridX, gridY);
        if (!machine) return;
        const type = machine.name ?? machine.data?.type ?? null;
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
                const rot = parseInt(machine.data?.rot ?? 0, 10) || 0;
                this.factoryManager.removeMachine(gridX, gridY);
                this.factoryManager.addMachine(newType, gridX, gridY, rot);
                this._updateSlotCountDisplay(slot);
                for (let s = 0; s < this.slots.length; s++) this._updateSlotCountDisplay(this.slots[s]);
                const size = window.innerHeight / 9;
                const cx = gridX * size + size / 2;
                const cy = gridY * size + size / 2;
                this.particleManager.spawnAt(cx, cy, { count: 8, colors: [0x00FFFFFF, 0xFFA500FF], size: 4, speed: 300, life: 500 });
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

    _getGridCoordinates(screenPos) {
        const size = this._getGridCellSize();
        const gridX = Math.floor(screenPos.x / size);
        const gridY = Math.floor(screenPos.y / size);
        return { gridX, gridY };
    }

    _getGridCellSize() {
        return window.innerHeight / GRID_SIZE;
    }

    _getGridCellCenter(gridX, gridY) {
        const size = this._getGridCellSize();
        return { x: (gridX + 0.5) * size, y: (gridY + 0.5) * size };
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

    _pickMachineAtGridPosition(gridX, gridY) {
        const grid = this.factoryManager.grid;
        if (gridX < 0 || gridY < 0 || gridX >= grid.length || gridY >= grid[0].length) return false;
        
        const machine = grid[gridX][gridY];
        if (!machine) return false;
        
        const type = machine.name;
        const rot = machine.data?.rot ?? 0;
        if (!type) return false;

        for (let i = 0; i < this.slots.length; i++) {
            const slot = this.slots[i];
            const variants = JSON.parse(slot.dataset.variants ?? '[]');
            const idx = variants.indexOf(type);
            if (idx === -1) continue;

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
            
            if (this._isSpawnerType(type)) {
                const chosen = machine.data?.color ?? machine.color;
                if (chosen !== null && chosen !== undefined) {
                    this._setSpawnerColor(chosen);
                }
            }
            return true;
        }
        return false;
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
            const pos = this.input.getPos();
            const { gridX, gridY } = this._getGridCoordinates(pos);
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
            const pos = this.input.getPos();
            const { gridX, gridY } = this._getGridCoordinates(pos);
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
            this.factoryManager.pasteTarget = null;
        }, ["select"], 1);

        // While pasting: left = confirm, right = cancel. High priority to avoid other handlers.
        this.input.addBinding('mouse', 'left', 'press', () => {
            if (!this.factoryManager.pasting) return;
            const pos = this.input.getPos();
            const { gridX, gridY } = this._getGridCoordinates(pos);
            const pending = this.factoryManager.pasteTarget;
            if (!pending || pending.x !== gridX || pending.y !== gridY) {
                this.factoryManager.pasteTarget = { x: gridX, y: gridY };
                this.input.block(3);
                return;
            }
            // attempt paste on the second click to confirm the locked cell
            const res = this.factoryManager.pasteAt(gridX, gridY);
            this._clearPasteMode();
            const selectSlot = this.slots.find((slot) => slot.dataset.machineType === DELETE_SELECT);
            if (selectSlot) this._setPasteMode(selectSlot, false);
            // block until mouse release to prevent other place handlers
            this.input.block(3);
        }, ["paste"], 10, ()=>{
            return this.factoryManager.pasting;
        });

        this.input.addBinding('mouse', 'right', 'press', () => {
            if (!this.factoryManager.pasting) return;
            this._clearPasteMode();
            const selectSlot = this.slots.find((slot) => slot.dataset.machineType === DELETE_SELECT);
            if (selectSlot) this._setPasteMode(selectSlot, false);
            this.input.block(3);
        }, ["paste"], 10);

        // Initialize drag tracking - moved to constructor
        // Press handler for single-tap rotate and select drag start (higher priority)
        this.input.addBinding('mouse', 'left', 'press', () => {
            if (this.selectedIndex < 0 || this.selectedIndex >= this.slots.length) return;
            const slot = this.slots[this.selectedIndex];
            const type = slot.dataset.machineType;
            const pos = this.input.getPos();
            const { gridX, gridY } = this._getGridCoordinates(pos);
            if (!type) return;

            // Handle rotate
            if (type === DELETE_ROTATE) {
                // Check if there are selected cells - rotate all selected cells
                if (this.factoryManager.selectedCells && this.factoryManager.selectedCells.size > 0) {
                    console.log('Rotating', this.factoryManager.selectedCells.size, 'selected cells');
                    for (const cellKey of this.factoryManager.selectedCells) {
                        const [x, y] = cellKey.split(',').map(Number);
                        const machine = this.factoryManager.getMachine(x, y);
                        if (machine) {
                            const currentRot = machine.data?.rot || 0;
                            const newRot = (currentRot + ROTATION_STEP) % ROTATION_CYCLE;
                            this.factoryManager.setMachineProperty(x, y, 'rot', newRot);
                            if (typeof machine.rotate === 'function') {
                                try { machine.rotate(ROTATION_STEP); } catch (e) { }
                            }
                        }
                    }
                } else if (gridX >= 0 && gridY >= 0) {
                    // Rotate single cell at cursor
                    const machine = this.factoryManager.getMachine(gridX, gridY);
                    if (machine) {
                        const currentRot = machine.data?.rot || 0;
                        const newRot = (currentRot + ROTATION_STEP) % ROTATION_CYCLE;
                        this.factoryManager.setMachineProperty(gridX, gridY, 'rot', newRot);
                        if (typeof machine.rotate === 'function') {
                            try { machine.rotate(ROTATION_STEP); } catch (e) { }
                        }
                    }
                }
                this.input.block(3);
                return;
            }

            // Handle select drag start
            if (type === DELETE_SELECT) {
                if (gridX < 0 || gridY < 0) return;
                const cellKey = `${gridX},${gridY}`;
                const isStartSelected = this.factoryManager.selectedCells && this.factoryManager.selectedCells.has(cellKey);
                console.log('Select drag starting at', gridX, gridY, 'isStartSelected:', isStartSelected);
                this._selectDragStart = {
                    startX: gridX,
                    startY: gridY,
                    isStartSelected: isStartSelected,
                    startTime: performance.now(),
                    lastMinX: gridX,
                    lastMaxX: gridX,
                    lastMinY: gridY,
                    lastMaxY: gridY
                };
                this.input.block(3);
                return;
            }
        }, ["rotate-select-action"], 3);

        // Held binding for placement and delete (but not for rotate or select variants)
        this.input.addBinding('mouse', 'left', 'held', () => {
            // when shift select is active, do not place while holding left
            if (this.input.active.has('keyboard:ShiftLeft:press') || this.input.active.has('keyboard:ShiftRight:press')) return;
            if (this.selectedIndex < 0 || this.selectedIndex >= this.slots.length) return;
            const slot = this.slots[this.selectedIndex];
            const type = slot.dataset.machineType;
            const pos = this.input.getPos();
            const { gridX, gridY } = this._getGridCoordinates(pos);
            if (!type) return;
            
            // Skip rotate and select variants (they use different bindings)
            if (type === DELETE_ROTATE || type === DELETE_SELECT) return;
            
            if (type === 'delete') {
                const cellKey = `${gridX},${gridY}`;
                if (this.factoryManager.selectedCells?.has(cellKey)) {
                    this.factoryManager.cutSelection(this.input.getPos());
                    this.factoryManager.clearSelection();
                    this._refreshAllSlots();
                    return;
                }
                if (this.factoryManager.removeMachine(gridX, gridY)) {
                    const { x: cx, y: cy } = this._getGridCellCenter(gridX, gridY);
                    this.particleManager.spawnAt(cx, cy, { count: 10, colors: [0xFFC800FF, 0x494949FF], size: 10, speed: 300, life: 700 });
                    this._refreshAllSlots();
                }
                return;
            }
            if (this._getRemainingCount(type) <= 0) return;
            if (this._isSpawnerType(type)) {
                if (this._getSpawnerRemaining(this._getSelectedSpawnerColor()) <= 0) return;
            }
            const placed = this.factoryManager.addMachine(type, gridX, gridY, parseInt(slot.dataset.rot ?? '0', 10) || 0);
            if (this._isSpawnerType(type)) {
                placed.data = placed.data || {};
                const n = intHex(this._getSelectedSpawnerColor());
                placed.data.color = n;
                placed.color = n;
                this._refreshAllSlots();
            }
            if (this._getRemainingCount(type) === 0) {
                const { x: cx, y: cy } = this._getGridCellCenter(gridX, gridY);
                this.particleManager.spawnAt(cx, cy, { count: 20, colors: [0xFBFF00FF, 0xFF5144FF, 0xFFA600FF], size: 5, speed: 500, life: 900 });
            }
        }, ["world-edit"], 1);

        // Double-tap handler (lower priority than rotate/select)
        this.input.addBinding('mouse', 'left', 'press', () => {
            // Skip if rotate or select is active
            if (this.selectedIndex >= 0 && this.selectedIndex < this.slots.length) {
                const slot = this.slots[this.selectedIndex];
                const type = slot.dataset.machineType;
                if (type === DELETE_ROTATE || type === DELETE_SELECT) return;
            }
            const pos = this.input.getPos();
            const { gridX, gridY } = this._getGridCoordinates(pos);
            if (gridX < 0 || gridY < 0) return;
            const now = performance.now();
            if (this._lastTap && (now - this._lastTap.time) <= DOUBLE_TAP_THRESHOLD && this._lastTap.x === gridX && this._lastTap.y === gridY) {
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

        // Drag handler for select variant: select/deselect individual tiles as you drag
        this.input.addBinding('mouse', 'left', 'held', () => {
            if (!this._selectDragStart) return;
            if (this.selectedIndex < 0 || this.selectedIndex >= this.slots.length) return;
            const slot = this.slots[this.selectedIndex];
            const type = slot.dataset.machineType;
            if (type !== DELETE_SELECT) return;
            
            const pos = this.input.getPos();
            const { gridX, gridY } = this._getGridCoordinates(pos);
            
            // Get or create the cell key
            const cellKey = `${gridX},${gridY}`;
            
            // Skip if this is a cell we've already processed in this drag
            if (this._selectDragStart.processedCells && this._selectDragStart.processedCells.has(cellKey)) {
                return;
            }
            
            // Ensure tracked cells set exists
            if (!this._selectDragStart.processedCells) {
                this._selectDragStart.processedCells = new Set();
            }
            this._selectDragStart.processedCells.add(cellKey);
            
            // Initialize selected cells if needed
            if (!this.factoryManager.selectedCells) {
                this.factoryManager.selectedCells = new Set();
            }
            
            // Only operate on cells that have machines
            if (!this.factoryManager.getMachine(gridX, gridY)) {
                return;
            }
            
            // Based on initial state, select or deselect this tile
            if (this._selectDragStart.isStartSelected) {
                // Started on selected, so deselect
                this.factoryManager.selectedCells.delete(cellKey);
            } else {
                // Started on unselected, so select
                this.factoryManager.selectedCells.add(cellKey);
            }
            console.log('Selected cells now:', Array.from(this.factoryManager.selectedCells || []));
        }, ["rotate-select-action"], 3);

        // Release handler for select variant: finalize drag
        this.input.addBinding('mouse', 'left', 'release', () => {
            if (this._selectDragStart) {
                this._selectDragStart = null;
                this.input.unblock();
            }
        }, ["rotate-select-action"], 3);

        this.input.addBinding('mouse', 'middle', 'held', () => {
            const pos = this.input.getPos();
            const { gridX, gridY } = this._getGridCoordinates(pos);
            this._pickMachineAtGridPosition(gridX, gridY);
        });
        this.input.addBinding('keyboard', 'ControlLeft', 'held', () => {
            const pos = this.input.getPos();
            const { gridX, gridY } = this._getGridCoordinates(pos);
            this._pickMachineAtGridPosition(gridX, gridY);
        });

        this.input.addBinding('mouse', 'right', 'held', () => {
            if (!this.slots.some(s => s.dataset.machineType === 'delete')) return;
            const pos = this.input.getPos();
            const { gridX, gridY } = this._getGridCoordinates(pos);
            const removed = this.factoryManager.removeMachine(gridX, gridY);
            if (removed) {
                const { x: cx, y: cy } = this._getGridCellCenter(gridX, gridY);
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
            if (performance.now() - this.lastRotate < ROTATE_RELEASE_THROTTLE) return;
            const rotateAmount = (payload.deltaY > 0 ? ROTATION_STEP : -ROTATION_STEP);
            this.lastRotate = performance.now();
            this.lastRotateDir = (rotateAmount > 0) ? 1 : -1;
            const sel = this.slots[this.selectedIndex];
            if (!sel) return;
            let anim = parseInt(sel.dataset.animRot ?? '0', 10) || 0;
            anim = anim + rotateAmount;
            sel.dataset.animRot = String(anim);
            const icon = sel.querySelector('canvas.machine-icon');
            if (icon) icon.style.setProperty('--rot-anim', `${anim}deg`);
            const cur = parseInt(sel.dataset.rot ?? '0', 10) || 0;
            const next = (cur + rotateAmount + ROTATION_CYCLE) % ROTATION_CYCLE;
            sel.dataset.rot = String(next);
            this.input.block(3);
            setTimeout(() => {this.input.unblock();}, 120);
        }, ["select"], 2);

        this.input.addBindings([
            ["keyboard", "ShiftRight", "held"],
            ["wheel", "scroll", "press"]
        ], (payload) => {
            if (performance.now() - this.lastRotate < ROTATE_RELEASE_THROTTLE) return;
            const rotateAmount = (payload.deltaY > 0 ? ROTATION_STEP : -ROTATION_STEP);
            this.lastRotate = performance.now();
            this.lastRotateDir = (rotateAmount > 0) ? 1 : -1;
            const sel = this.slots[this.selectedIndex];
            if (!sel) return;
            let anim = parseInt(sel.dataset.animRot ?? '0', 10) || 0;
            anim = anim + rotateAmount;
            sel.dataset.animRot = String(anim);
            const icon = sel.querySelector('canvas.machine-icon');
            if (icon) icon.style.setProperty('--rot-anim', `${anim}deg`);
            const cur = parseInt(sel.dataset.rot ?? '0', 10) || 0;
            const next = (cur + rotateAmount + ROTATION_CYCLE) % ROTATION_CYCLE;
            sel.dataset.rot = String(next);
            this.input.block(3);
            setTimeout(() => {this.input.unblock();}, 120);
        }, ["select"], 2);

        this.input.addBinding('wheel', 'scroll', 'press', (payload) => {
            if (performance.now() - this.lastRotate < ROTATE_RELEASE_THROTTLE) return;
            const rotateAmount = (payload.deltaY > 0 ? ROTATION_STEP : -ROTATION_STEP);
            this.lastRotate = performance.now();
            this.lastRotateDir = (rotateAmount > 0) ? 1 : -1;
            const gridPos = this.input.getPos();
            const { gridX, gridY } = this._getGridCoordinates(gridPos);
            // if hovering a machine, rotate that machine
            const grid = this.factoryManager?.grid;
            let hoveredMachine = null;
            if (grid && gridX >= 0 && gridY >= 0 && gridX < grid.length && gridY < (grid[0]?.length || 0)) hoveredMachine = grid[gridX][gridY];
            if (hoveredMachine) {
                const cur = parseInt(this.factoryManager.getMachineProperty(gridX, gridY, 'rot') ?? 0, 10) || 0;
                const newRot = ((cur + rotateAmount) % ROTATION_CYCLE + ROTATION_CYCLE) % ROTATION_CYCLE;
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
            const next = (cur + rotateAmount + ROTATION_CYCLE) % ROTATION_CYCLE;
            sel.dataset.rot = String(next);
        }, [], 0);

        // rotate selection when there is an active selection (higher priority)
        this.input.addBinding('wheel', 'scroll', 'press', (payload) => {
            if (performance.now() - this.lastRotate < ROTATE_RELEASE_THROTTLE) return;
            const rotateAmount = (payload.deltaY > 0 ? ROTATION_STEP : -ROTATION_STEP);
            this.lastRotate = performance.now();
            this.lastRotateDir = (rotateAmount > 0) ? 1 : -1;
            this.factoryManager.rotateSelection(rotateAmount);
            // block lower-priority handlers while rotate completes
            this.input.block(3);
            // wheel has no matching 'release' event to clear temporary block,
            // so clear it shortly after to avoid permanently blocking input.
            setTimeout(() => {this.input.unblock();}, 120);
        }, [], 1, () => {
            return !!(this.factoryManager?.selectedCells?.size > 0);
        });

        // KeyR: rotate clipboard when pasting, otherwise reset factory
        this.input.addBinding('keyboard', 'KeyR', 'press', () => {
            if (this.factoryManager.pasting) this.factoryManager.rotateClipboard(true);
            else this.factoryManager.resetFactory();
        }, [], 1);
        this.input.addBinding('keyboard', 'Space', 'press', () => { this.factoryManager.toggle(); });
    }
}
