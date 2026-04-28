import { joinDots } from "../Helpers/pathHelpers.js";

export default class FactoryManager {
    constructor(DataManager, AssetManager, ParticleManager, input) {
        this.DataManager = DataManager;
        this.AssetManager = AssetManager;
        this.ParticleManager = ParticleManager;
        this.input = input;
        this.grid = this.generateGrid();
        this.items = {}
        this.drawQueue = this.generateQueue();

        this.selectedCells = new Set(); // Store selected cells as "x,y" strings for easy add/remove/check
        // test
        this.selectedCells.add("2,3");
        this.selectMode = 'add'; // or 'remove' for toggling selection
        // if paste, we'll have some special logic
        this.pasting = false;
        this.clipboard = null; // for copy/paste functionality, can store { type, data } or similar structure
        this.paused = false;
        this.clipPos = { x: 0, y: 0 }; // for tracking mouse position clipboard origin
    }
    generateGrid(x=16, y=16) {
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
            this.pastePreview(ctx, this.input.getPos());
        }
    }
    drawSelected(ctx) {
        const size = window.innerHeight / 9;
        ctx.save();
        ctx.strokeStyle = 'cyan';
        ctx.lineWidth = size/32;
        for (const cell of this.selectedCells) {
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
            this.selectedCells.delete(key);
        }
    }
    clearSelection() {
        this.selectedCells.clear();
    }
    copySelection(screenPos) {
        if (this.selectedCells.size === 0) return;
        const selectedMachines = [];
        for (const cell of this.selectedCells) {
            const [x, y] = cell.split(',').map(Number);
            const machine = this.getMachine(x, y);
            if (machine) {
                selectedMachines.push({ x, y, type: machine.name, rot: machine.data.rot });
            }
        }
        this.clipboard = { machines: selectedMachines };
        // visual feedback
        this.ParticleManager.spawnAt(screenPos.x, screenPos.y, { count: 50, colors: [0x00FFFFFF], size: 20, speed: 200, life: 500 });
        // set clipboard origin (the grid cell mouse was over)
        this.clipPos = { x: screenPos.x/ window.innerHeight * 9, y: screenPos.y / window.innerHeight * 9 };
    }
    pastePreview(ctx, screenPos) {
        if (!this.clipboard) return;
        const size = window.innerHeight / 9;
        const offsetX = screenPos.x - size/2;
        const offsetY = screenPos.y - size/2;
        for (const m of this.clipboard.machines) {
            const x = offsetX + (m.x - this.clipPos.x) * size;
            const y = offsetY + (m.y - this.clipPos.y) * size;
            // Draw a semi-transparent preview of the machine at (x,y) with rotation m.rot
            const img = this.AssetManager.get('machines-image');
            if (!img) continue;
            const row = (this.DataManager.getData(joinDots('machineData', m.type))?.texture.row) || 0;
            const tw = 16; const th = 16;
            let cols = Math.max(1, Math.floor(img.width / tw));
            const sx = 0; // for preview, we can just use the first frame of animation
            const sy = row * th;
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate((m.rot || 0) * Math.PI / 180);
            ctx.globalAlpha = 0.5; // semi-transparent preview
            ctx.drawImage(img, sx, sy, tw, th, -size/2, -size/2, size, size);
            ctx.restore();
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
        for (let i = 0; i < this.grid.length; i++) {
            for (let j = 0; j < this.grid[i].length; j++) {
                const machine = this.grid[i][j];
                if (!machine) continue;
                if (!machine.update) continue;
                if (this.paused) {
                    machine.updateRotation(delta);
                }else{
                    machine.update(delta);
                }
            }
        }
        // Update items
        const size = window.innerHeight / 9;
        for (const itemId in this.items) {
            const it = this.items[itemId];
            if (!it) continue;
            if (it.update) it.update(delta);

            // Collision check
            const cellX = Math.floor(it.x);
            const cellY = Math.floor(it.y);
            if (cellX < 0 || cellY < 0 || cellX >= this.grid.length || cellY >= this.grid[0].length) this.items[itemId] = null; // remove items that go out of bounds
            const machine = this.grid[cellX][cellY];
            if (!machine) continue;
            if (machine.onItemCollision) machine.onItemCollision(it, size);
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
    getMachineProperty(x,y,prop) {
        const machine = this.grid[x][y];
        if (!machine) return null;
        return machine.data[prop];
    }
    removeMachine(x,y) {
        const removed = this.grid[x] && this.grid[x][y];
        if (!removed) return null;
        this.grid[x][y] = null;
        this.generateQueue();
        const type = removed.name || (removed.data && removed.data.type) || null;
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