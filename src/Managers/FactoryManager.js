import { joinDots } from "../Helpers/pathHelpers.js";
import { isItemColliding } from "../../Machines/components/collision.js";

export default class FactoryManager {
    constructor(DataManager, AssetManager, ParticleManager, input, options = {}) {
        this.DataManager = DataManager;
        this.AssetManager = AssetManager;
        this.ParticleManager = ParticleManager;
        this.input = input;
        // options: { preview: boolean }
        this.preview = !!options.preview;
        this.grid = this.generateGrid();
        this.items = {}
        this.drawQueue = [[],[],[],[]];
        this.generateQueue();

        // multiplier to speed up update deltas (1 = normal speed)
        this.speedMultiplier = 1;

        this.selectedCells = new Set(); // Store selected cells as "x,y" strings for easy add/remove/check
        this.copiedCells = new Set(); // cells that were copied (rendered green)
        // test
        this.selectMode = 'add'; // or 'remove' for toggling selection
        // if paste, we'll have some special logic
        this.pasting = false;
        this.clipboard = null; // for copy/paste functionality, can store { type, data } or similar structure
        this.paused = false;
        this.clipPos = { x: 0, y: 0 }; // for tracking mouse position clipboard origin
        this.pasteTarget = null;
    }
    generateGrid(
        x = Math.max(1, Math.ceil((window.innerWidth || 1) / ((window.innerHeight || 1) / 9))),
        y = 9
    ) {
        this.grid = [];
        for (let i = 0; i < x; i++) {
            this.grid[i] = [];
            for (let j = 0; j < y; j++) {
                this.grid[i][j] = null;
            }
        }
        return this.grid;
        // display by column, then row, so we can do grid[x][y] instead of grid[y][x] for simplicity
    }
    generateQueue() {
        const transformQueue = [[],[],[],[]]
        // Loop 1: Sort machines into transform queues based on their rotation
        const states = {  // basic matrix transforms; we're grouping machines by rotation so we can minimize transform calls
            0: [1, 1, 1],
            90: [0, 1, -1],
            180: [1, -1, -1],
            270: [0, -1, 1],
        }
        for (let i = 0; i < this.grid.length; i++) {
            for (let j = 0; j < this.grid[i].length; j++) {
                let machine = this.grid[i][j];
                if (!machine) continue;
                if (!machine.draw) continue;
                const rotIndex = (machine.data.rot) / 90;
                let x = states[machine.data.rot][0] ? i : j;
                x *= states[machine.data.rot][1];
                let y = states[machine.data.rot][0] ? j : i;
                y *= states[machine.data.rot][2];
                transformQueue[rotIndex].push({x: x, y: y, machine: machine});
            }
        }
        this.drawQueue = transformQueue;
        if(this.drawQueue.length === 0) this.drawQueue = [[],[],[],[]]; // ensure we always have 4 queues for simplicity
    }
    draw(ctx) {
        const size = window.innerHeight / 9;
        
        // Loop 2: Draw machines in each queue with appropriate per-machine transforms
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        for (let rot = 0; rot < 4; rot++) {
            ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform before each rotation
            ctx.translate(size/2, size/2); // Translate to center of canvas
            ctx.rotate(rot * Math.PI / 2);
            for (const entry of this.drawQueue[rot]) {
                entry.machine.draw(ctx, entry.x, entry.y, size);
            }
        }
        ctx.restore();
        // Draw items (entities) after machines, using world->screen mapping
        for (const id in this.items) {
            const item = this.items[id];
            // item coordinates are in grid space where (x,y) => pixel = x*size, y*size
            item.draw(ctx, size);
        }
        this.drawSelected(ctx);
        if(this.clipboard && this.pasting) {
            const target = this.pasteTarget;
            if (target && Number.isFinite(target.x) && Number.isFinite(target.y)) {
                const size = window.innerHeight / 9;
                this.pastePreview(ctx, { x: target.x * size + size / 2, y: target.y * size + size / 2 });
            } else {
                this.pastePreview(ctx, this.input.getPos());
            }
        }
    }
    drawSelected(ctx) {
        const size = window.innerHeight / 9;
        ctx.save();
        ctx.strokeStyle = 'cyan';
        ctx.lineWidth = size/32;
        for (const cell of this.selectedCells) {
            if (this.copiedCells && this.copiedCells.has(cell)) ctx.strokeStyle = 'lime';
            else ctx.strokeStyle = 'cyan';
            const [x, y] = cell.split(',').map(Number);
            ctx.strokeRect(x*size, y*size, size, size);
            ctx.strokeRect(x*size, y*size, size/4, size/4);
        }
        ctx.restore();
    }
    select(x, y, mode="add") {
        const key = `${x},${y}`;
        if (mode === "add") {
            this.selectedCells.add(key);
        } else if (mode === "remove") {
            // only act if the cell was actually selected
            if (!this.selectedCells.has(key)) return;
            // spawn corner particles when an individual cell is removed
            const size = window.innerHeight / 9;
            const [cx, cy] = key.split(',').map(Number);
            const wasCopied = (this.copiedCells && this.copiedCells.has(key));
            const color = wasCopied ? 0x00FF00FF : 0x00FFFFFF;
            this.ParticleManager.spawnAt(cx * size, cy * size, { count: 3, colors: [color], size: 20, speed: 200, life: 500 });
            this.ParticleManager.spawnAt(cx * size, cy * size + size, { count: 3, colors: [color], size: 20, speed: 200, life: 500 });
            this.ParticleManager.spawnAt(cx * size + size, cy * size + size, { count: 3, colors: [color], size: 20, speed: 200, life: 500 });
            this.ParticleManager.spawnAt(cx * size + size, cy * size, { count: 3, colors: [color], size: 20, speed: 200, life: 500 });
            this.selectedCells.delete(key);
            if (wasCopied) this.copiedCells.delete(key);
        }
    }
    clearSelection() {
        // visual feedback: spawn corner particles for each removed cell
        const size = window.innerHeight / 9;
        for (const cell of this.selectedCells) {
            const [x, y] = cell.split(',').map(Number);
            const wasCopied = (this.copiedCells && this.copiedCells.has(cell));
            const color = wasCopied ? 0x00FF00FF : 0x00FFFFFF;
            this.ParticleManager.spawnAt(x * size, y * size, { count: 3, colors: [color], size: 20, speed: 200, life: 500 });
            this.ParticleManager.spawnAt(x * size, y * size + size, { count: 3, colors: [color], size: 20, speed: 200, life: 500 });
            this.ParticleManager.spawnAt(x * size + size, y * size + size, { count: 3, colors: [color], size: 20, speed: 200, life: 500 });
            this.ParticleManager.spawnAt(x * size + size, y * size, { count: 3, colors: [color], size: 20, speed: 200, life: 500 });
        }
        this.selectedCells.clear();
        if (this.copiedCells) this.copiedCells.clear();
    }
    copySelection(screenPos) {
        if (this.selectedCells.size === 0) return;
        const selectedMachines = [];
        for (const cell of this.selectedCells) {
            const [x, y] = cell.split(',').map(Number);
            const machine = this.getMachine(x, y);
            if (machine) {
                const color = (machine.data && machine.data.color !== undefined && machine.data.color !== null) ? machine.data.color : (machine.color !== undefined ? machine.color : null);
                const acc = (machine._acc !== undefined) ? machine._acc : null;
                const cnt = (machine._count !== undefined) ? machine._count : null;
                selectedMachines.push({ x, y, type: machine.name, rot: machine.data.rot, color, _acc: acc, _count: cnt });
            }
        }
        this.clipboard = { machines: selectedMachines };
        // mark copied cells so they're rendered green (no blue particle effect here)
        this.copiedCells = new Set(this.selectedCells);
        // set clipboard origin as grid cell coordinates (floor to snap to grid)
        const size = window.innerHeight / 9;
        this.clipPos = { x: Math.floor(screenPos.x / size), y: Math.floor(screenPos.y / size) };
    }
    cutSelection(screenPos) {
        this.copySelection(screenPos);
        for (const cell of this.selectedCells) {
            const [x, y] = cell.split(',').map(Number);
            this.removeMachine(x, y);
        }
    }
    pastePreview(ctx, screenPos) {
        if (!this.clipboard) return;
        const size = window.innerHeight / 9;
        // base grid cell under cursor
        const baseGridX = Math.floor(screenPos.x / size);
        const baseGridY = Math.floor(screenPos.y / size);
        const offsetX = baseGridX * size + size/2;
        const offsetY = baseGridY * size + size/2;

        // iterate top-left -> bottom-right, left-to-right
        const machines = (this.clipboard.machines || []).slice().sort((a, b) => {
            if (a.y === b.y) return a.x - b.x;
            return a.y - b.y;
        });

        // track tentative usage so preview accounts for multiple copies in clipboard
        const usedCounts = {}; // type -> used
        const usedSpawnerCounts = {}; // colorKey -> used

        for (const m of machines) {
            const gridX = baseGridX + (m.x - this.clipPos.x);
            const gridY = baseGridY + (m.y - this.clipPos.y);
            const x = offsetX + (m.x - this.clipPos.x) * size;
            const y = offsetY + (m.y - this.clipPos.y) * size;
            // determine if this machine would be placeable and why not
            let canPlace = true;
            let reason = null;
            // bounds
            if (!this.grid || gridX < 0 || gridY < 0 || gridX >= this.grid.length || gridY >= (this.grid[0]?.length || 0)) { canPlace = false; reason = 'out-of-bounds'; }
            // occupancy
            else if (this.grid[gridX] && this.grid[gridX][gridY]) { canPlace = false; reason = 'occupied'; }
            // slot/limit checks via LevelManager -> SidebarManager
            else if (Array.isArray(this.levelManager.slots)) {
                let foundIdx = -1;
                let slotEl = null;
                for (let i = 0; i < this.levelManager.slots.length; i++) {
                    const s = this.levelManager.slots[i];
                    try {
                        const variants = JSON.parse(s.dataset.variants ?? '[]');
                        if (variants && variants.indexOf(m.type) !== -1) { foundIdx = i; slotEl = s; break; }
                    } catch (e) {
                        // ignore parse errors
                    }
                }
                if (foundIdx !== -1) {
                    const baseType = (m.type || '').split('-')[0];
                    if (baseType === 'spawner') {
                        // prefer color stored in clipboard entry, otherwise fall back to the shared sidebar color
                        const colorKey = (m.color !== undefined && m.color !== null) ? m.color : (this.levelManager?.sidebarManager?.spawnerColor ?? null);
                        const remaining = (this.levelManager.getSpawnerRemaining ? this.levelManager.getSpawnerRemaining(colorKey) : 0);
                        const used = usedSpawnerCounts[String(colorKey)] || 0;
                        if ((remaining - used) <= 0) { canPlace = false; reason = 'limit'; }
                        else usedSpawnerCounts[String(colorKey)] = used + 1;
                    } else {
                        const remaining = this.levelManager.getSlotRemaining(foundIdx);
                        const used = usedCounts[m.type] || 0;
                        if ((remaining - used) <= 0) { canPlace = false; reason = 'limit'; }
                        else usedCounts[m.type] = used + 1;
                    }
                }
            }
            // Draw a semi-transparent preview of the machine at (x,y) with rotation m.rot
            const img = this.AssetManager.get('machines-image');
            if (!img) continue;
            const data = this.DataManager.getData(joinDots('machineData', m.type)) ?? {};
            const row = (data.texture && data.texture.row) || 0;
            const fps = (data.texture && data.texture.fps) ? data.texture.fps : 8;
            const tw = 16; const th = 16;
            const cols = Math.max(1, Math.floor(img.width / tw));
            const frame = Math.floor((performance.now() * fps) / 1000) % cols;
            const sx = frame * tw;
            const sy = row * th;
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate((m.rot || 0) * Math.PI / 180);
            ctx.globalAlpha = 0.5; // semi-transparent preview
            ctx.drawImage(img, sx, sy, tw, th, -size/2, -size/2, size, size);
            ctx.restore();
            // if not placeable, tint by reason: occupied/out-of-bounds -> red, limit -> orange
            if (!canPlace) {
                ctx.save();
                const color = (reason === 'limit') ? '#FFA50044' : '#FF000044';
                ctx.fillStyle = color;
                ctx.fillRect(x - size/2, y - size/2, size, size);
                ctx.restore();
            }
        }
    }

    // Clear the copied (green) selection, leaving normal selection intact (they'll render blue)
    clearCopiedSelection() {
        this.copiedCells = new Set();
    }

    // Remove a specific cell from the copied set (uncopy it)
    uncopyCell(x, y) {
        const key = `${x},${y}`;
        if (this.copiedCells && this.copiedCells.has(key)) this.copiedCells.delete(key);
    }

    // Attempt to paste clipboard at a grid origin (gridX, gridY).
    // Returns an object { placed: number, failed: Array<{type,x,y,reason}> }
    pasteAt(gridX, gridY) {
        if (!this.clipboard || !Array.isArray(this.clipboard.machines)) return { placed: 0, failed: [] };
        const size = window.innerHeight / 9;
        const w = this.grid.length;
        const h = this.grid[0]?.length || 0;
        // determine machines in stable order
        const machines = this.clipboard.machines.slice().sort((a, b) => {
            if (a.y === b.y) return a.x - b.x;
            return a.y - b.y;
        });
        const placed = [];
        const failed = [];
        const usedCounts = {};
        const usedSpawnerCounts = {};

        // First pass: determine which machines can be placed using same rules as preview
        const canPlaceList = [];
        for (const m of machines) {
            const tx = gridX + (m.x - this.clipPos.x);
            const ty = gridY + (m.y - this.clipPos.y);
            let canPlace = true;
            let reason = null;
            if (tx < 0 || ty < 0 || tx >= w || ty >= h) { canPlace = false; reason = 'out-of-bounds'; }
            else if (this.grid[tx] && this.grid[tx][ty]) { canPlace = false; reason = 'occupied'; }
            else if (this.levelManager && Array.isArray(this.levelManager.slots)) {
                let slotEl = null;
                let foundIdx = -1;
                for (let i = 0; i < this.levelManager.slots.length; i++) {
                    const s = this.levelManager.slots[i];
                    const variants = JSON.parse(s.dataset.variants ?? '[]');
                    if (variants && variants.indexOf(m.type) !== -1) { slotEl = s; foundIdx = i; break; }
                }
                if (foundIdx !== -1 && slotEl) {
                    const base = (m.type || '').split('-')[0];
                    if (base === 'spawner') {
                        const colorKey = (m.color !== undefined && m.color !== null) ? m.color : (this.levelManager?.sidebarManager?.spawnerColor ?? null);
                        const remaining = (this.levelManager.getSpawnerRemaining ? this.levelManager.getSpawnerRemaining(colorKey) : 0);
                        const used = usedSpawnerCounts[String(colorKey)] || 0;
                        if ((remaining - used) <= 0) { canPlace = false; reason = 'limit'; }
                        else usedSpawnerCounts[String(colorKey)] = used + 1;
                    } else {
                        const remaining = this.levelManager.getSlotRemaining(foundIdx);
                        const used = usedCounts[m.type] || 0;
                        if ((remaining - used) <= 0) { canPlace = false; reason = 'limit'; }
                        else usedCounts[m.type] = used + 1;
                    }
                }
            }
            canPlaceList.push({ m, tx, ty, canPlace, reason });
        }

        // Second pass: actually place those allowed
        for (const item of canPlaceList) {
            const { m, tx, ty, canPlace, reason } = item;
            if (!canPlace) { failed.push({ type: m.type, x: tx, y: ty, reason }); continue; }
            const placedMachine = this.addMachine(m.type, tx, ty, m.rot || 0);
            if (placedMachine) {
                // restore spawner color from clipboard if present
                if (m.color !== undefined && m.color !== null) {
                    placedMachine.data = placedMachine.data || {};
                    placedMachine.data.color = m.color;
                    placedMachine.color = m.color;
                }
                // restore internal timing state for spawners if available
                if (m._acc !== undefined && m._acc !== null) {
                    placedMachine._acc = m._acc;
                }
                if (m._count !== undefined && m._count !== null) {
                    placedMachine._count = m._count;
                }
                placed.push({ machine: placedMachine, x: tx, y: ty });
            }
            else failed.push({ type: m.type, x: tx, y: ty, reason: 'failed-to-create' });
        }

        // refresh sidebar counts if available
        this.levelManager.sidebarManager._refreshAllSlots(); 
        // auto-select placed machines
        if (placed && placed.length > 0) {
            // clear previous selection so its removal particles are shown
            if (this.selectedCells && this.selectedCells.size > 0) this.clearSelection();
            this.selectedCells = new Set(placed.map(p => `${p.x},${p.y}`));
        }

        return { placed: placed.length, failed };
    }

    // Rotate clipboard selection 90deg clockwise around this.clipPos
    rotateClipboard(clockwise = true) {
        if (!this.clipboard || !Array.isArray(this.clipboard.machines)) return;
        const dir = clockwise ? 1 : -1; // 1 => +90deg
        for (const m of this.clipboard.machines) {
            const relX = m.x - this.clipPos.x;
            const relY = m.y - this.clipPos.y;
            // rotate 90deg clockwise: (x,y) -> (-y, x)
            let nx, ny;
            if (dir === 1) { nx = -relY; ny = relX; }
            else { nx = relY; ny = -relX; }
            m.x = this.clipPos.x + nx;
            m.y = this.clipPos.y + ny;
            m.rot = (((m.rot || 0) + (dir * 90)) % 360 + 360) % 360;
        }
    }
    pause() {
        this.paused = true;
        this.ParticleManager.spawnAt(window.innerWidth/2, window.innerHeight/2, { count: 200, colors: [0x333333FF, 0x222222FF], size: 50, speed: 3750, life: 2000, gravityStrength: 0, speedNoise: 1000 , accel: 0.999, accelNoise:0});
    }
    unpause() {
        this.paused = false;
        this.ParticleManager.spawnAt(window.innerWidth/2, window.innerHeight/2, { count: 200, colors: [0x77000066, 0x77770066, 0x00770066, 0x00777766, 0x00007766], size: 50, speed: 3750, life: 2000, gravityStrength: 0, speedNoise: 1000 , accel: 0.999, accelNoise:0});
    }
    toggle() {
        if(this.paused) this.unpause();
        else this.pause();
    }
    update(delta){
        // apply speed multiplier to delta when not paused
        const mult = (this.speedMultiplier && !this.paused) ? this.speedMultiplier : 1;
        const effDelta = (delta || 0) * mult;

        for (let i = 0; i < this.grid.length; i++) {
            for (let j = 0; j < this.grid[i].length; j++) {
                const machine = this.grid[i][j];
                if (!machine) continue;
                if (!machine.update) continue;
                if (this.paused) {
                    machine.updateRotation(delta);
                } else {
                    machine.update(effDelta);
                }
            }
        }

        // Update items
        if (this.paused) return; // skip item updates when paused
        const size = window.innerHeight / 9;
        for (const itemId in this.items) {
            const it = this.items[itemId];
            if (!it) continue;
            if (it.update) it.update(effDelta);

            // Collision check
            const cellX = Math.floor(it.x);
            const cellY = Math.floor(it.y);
            // remove items that go out of bounds and skip further processing for them
            if (cellX < 0 || cellY < 0 || cellX >= this.grid.length || cellY >= (this.grid[0]?.length || 0)) { this.items[itemId] = null; continue; }
            const machine = this.grid[cellX][cellY];
            if (!machine) continue;
            // detect collision for goal tracking (machines may also handle collision internally)
            const collision = (machine.data && machine.data.collision) ? machine.data.collision : { top:0, right:0, bottom:0, left:0 };
            const colliding = isItemColliding(machine.data.x ?? 0, machine.data.y ?? 0, it, size, collision, machine.data.rot);
            if (colliding) {
                if (machine.onItemCollision) machine.onItemCollision(it, size);
                const gm = this.levelManager?.goalManager;
                if (gm && typeof gm.recordMachineCollision === 'function') {
                    gm.recordMachineCollision(machine.name || (machine.data && machine.data.type) || '', machine.data.x, machine.data.y, it.id);
                }
            } else {
                // still call machine handler if present (some machines expect to be notified even when not colliding)
                if (machine.onItemCollision) machine.onItemCollision(it, size);
            }
        }
    }
    addMachine(type, x, y, rot=0){
        let machineClass = this.AssetManager.get(joinDots('Machines', type));
        if (!machineClass) {console.log(`Machine type ${type} not found`); return;}
        machineClass = machineClass.default;
        let machineData = this.DataManager.getData(joinDots('machineData', type));
        if (!machineData) {console.log(`Machine data for type ${type} not found`); return;}
        // Deep-clone machineData so instances don't share the same object
        const machine = new machineClass(type, structuredClone(machineData), this);
        // Normalize rotation to a number (0,90,180,270)
        const normalizedRot = (((parseInt(rot, 10) || 0) % 360) + 360) % 360;
        machine.data.rot = normalizedRot;
        machine.data.x = x;
        machine.data.y = y;
        this.grid[x][y] = machine;
        this.generateQueue()
        return machine;
    }

    getMachine(x,y) {
        if (!this.grid || !this.grid[x] || !this.grid[x][y]) return null;
        return this.grid[x][y];
    }

    // Return neighbors for a grid cell. Result keys: top,right,bottom,left.
    // Each value is either null or { type, rot, machine }.
    getNeighbors(x, y) {
        const res = { top: null, right: null, bottom: null, left: null };
        if (!this.grid) return res;
        const w = this.grid.length;
        const h = this.grid[0]?.length || 0;
        const dirs = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] };
        for (const [key, [dx, dy]] of Object.entries(dirs)) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) { res[key] = null; continue; }
            const m = this.grid[nx][ny];
            if (!m) { res[key] = null; }
            else { res[key] = { type: m.name, rot: (m.data?.rot || 0), machine: m }; }
        }
        return res;
    }

    // Convenience: get neighbors for a machine instance
    getNeighborsFor(machine) {
        if (!machine || !machine.data) return { top:null, right:null, bottom:null, left:null };
        return this.getNeighbors(machine.data.x, machine.data.y);
    }

    setMachineProperty(x,y,prop,value) {
        const machine = this.grid[x][y];
        if (!machine) return;
        // Ensure rotation property is always stored as a normalized number
        if (prop === 'rot') {
            const normalized = (((parseInt(value, 10) || 0) % 360) + 360) % 360;
            machine.data[prop] = normalized;
        } else {
            machine.data[prop] = value;
        }
        this.generateQueue(); // Regenerate draw queue if properties affect drawing (like rotation)
    }

    // Rotate all machines in the current selection by `rotateAmount` degrees (typically ±90).
    rotateSelection(rotateAmount) {
        if (!this.selectedCells || this.selectedCells.size === 0) return;
        for (const cell of Array.from(this.selectedCells)) {
            const [x, y] = cell.split(',').map(Number);
            if (Number.isNaN(x) || Number.isNaN(y)) continue;
            const machine = this.getMachine(x, y);
            if (!machine) continue;
            const cur = parseInt(machine.data?.rot ?? 0, 10) || 0;
            const newRot = ((cur + rotateAmount) % 360 + 360) % 360;
            this.setMachineProperty(x, y, 'rot', newRot);
            if (typeof machine.rotate === 'function') {
                try { machine.rotate(rotateAmount); } catch (e) { }
            }
        }
        // regenerate draw queue to ensure drawing order respects new rotations
        this.generateQueue();
    }
    getMachineProperty(x,y,prop) {
        const machine = this.grid[x][y];
        if (!machine) return null;
        return machine.data[prop];
    }
    removeMachine(x,y) {
        const removed = this.grid[x] && this.grid[x][y];
        if (!removed) return null;
        const type = removed.name || (removed.data && removed.data.type) || null;
        // If a SidebarManager is present, only allow deletion of this machine
        // type when that type exists in the sidebar slots. This prevents
        // players from deleting machine types that aren't available in the
        // current level's sidebar (so placed machines can be protected).
        try {
            const sidebar = this.levelManager?.sidebarManager;
            if (sidebar && Array.isArray(sidebar.slots)) {
                let found = false;
                for (const s of sidebar.slots) {
                    try {
                        const variants = JSON.parse(s.dataset.variants ?? '[]');
                        if (Array.isArray(variants) && variants.indexOf(type) !== -1) { found = true; break; }
                    } catch (e) { /* ignore parse errors per-slot */ }
                }
                if (!found) return null;
            }
        } catch (e) {
            // If anything goes wrong inspecting the sidebar, fall back to
            // allowing removal so we don't lock out normal editor behaviour.
        }

        this.grid[x][y] = null;
        this.generateQueue();
        const rot = (removed.data && removed.data.rot) || 0;
        return { type, rot };
    }
    resetFactory(type="items"){
        switch(type) {
            case "items":
                this.items = {};
                break;
            case "machines":
                this.generateGrid();
                this.generateQueue();
                break;
            case "all":
                this.items = {};
                this.generateGrid();
                this.generateQueue();
                break;
            default:
                console.log(`Unknown reset type: ${type}`);
        }   
    }
    removeItem(item) {
        if (!item || !item.id) { console.log(`Invalid item to remove: ${item}`); return; }
        delete this.items[item.id];
    }


}