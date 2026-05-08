import { stringHex, intHex, subHex32 } from "../Helpers/colorHelpers.js";
import Item from "../World/Item.js";

export default class ParticleManager {
    constructor() {
        this.particles = [];
        this.portalParticles = {};
        this.beamParticles = [];
    }
    /**
     * Spawns a burst of particles at the given (x, y) position with various customizable options.
     * @param {number} x - The x-coordinate for the particle burst origin.
     * @param {number} y - The y-coordinate for the particle burst origin.
     * @param {object} [opts] - Optional parameters to customize the particle burst.
     * @param {number} [opts.count] - Number of particles to spawn (default: 12).
     * @param {number} [opts.speed] - Base speed of particles in pixels/second (default: 60).
     * @param {number} [opts.life] - Average lifespan of particles in milliseconds (default: 800).
     * @param {string[]} [opts.colors] - Array of color strings for particles (default: ['#FFCC00', '#FF8844', '#FF4444']).
     * @param {number} [opts.gravityStrength]-  Strength of downward acceleration in pixels/second^2 (default: 300).
     * @param {number} [opts.lifetimeNoise] - Random variation in particle lifespan as a fraction (default: 0.2).
     * @param {number} [opts.speedNoise] - Random variation in particle speed as a fraction (default: 0.3).
    * @param {number} [opts.accel] - Additional per-particle acceleration. Number -> vertical accel; object -> {x,y} (default: {x:0,y:0}).
    * @param {number} [opts.accelNoise] - Fractional noise applied to accel (default: 0).
     */
    spawnAt(x, y, opts = {}) {
        const count = opts.count || 12;
        // defaults (can be overridden via opts)
        const defaultSpeed = opts.speed ?? 60; // pixels per second
        const defaultLife = opts.life ?? 800; // ms
        const colors = opts.colors ?? [0xFFCC00FF, 0xFF8844FF, 0xFF4444FF];
        const resolvedColors = (colors || []).map(c => stringHex(intHex(c)));
        const gravityStrength = opts.gravityStrength ?? this.gravityStrength ?? 300;
        const lifetimeNoise = opts.lifetimeNoise ?? this.lifetimeNoise ?? 0.2;
        const speedNoise = opts.speedNoise ?? this.speedNoise ?? 0.3;
        const accelOpt = opts.accel ?? this.accel ?? { x: 0, y: 0 };
        const accelNoise = opts.accelNoise ?? this.accelNoise ?? 0;
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            // compute speed as base speed plus additive noise: speed + (±noiseAmount);
            const sp = defaultSpeed + (Math.random() - 0.5) * 2 * speedNoise;
            const vx = Math.cos(angle) * sp;
            const vy = Math.sin(angle) * sp;
            const life = Math.max(50, Math.round(defaultLife * (1 + (Math.random() * 2 - 1) * lifetimeNoise)));
            // resolve accel base: number -> vertical accel, object -> {x,y}
            let baseAx = 0; let baseAy = 0;
            baseAy = accelOpt;
            // apply additive accel noise: accel + (±noiseAmount)
            const ax = baseAx + (Math.random() -0.5) * 2 * accelNoise;
            const ay = baseAy + (Math.random() -0.5) * 2 * accelNoise;

                const p = {
                x: x,
                y: y,
                vx: vx,
                vy: vy,
                life: life,
                age: 0,
                size: (opts.size || 6) * (0.6 + Math.random() * 0.8),
                color: resolvedColors[Math.floor(Math.random() * resolvedColors.length)],
                _gravity: gravityStrength,
                _accel: { x: ax, y: ay }
            };
            this.particles.push(p);
        }
    }
    spawnPortalParticle(portalId, x, y, color, vx, vy, manager) {
        if (!this.portalParticles[portalId]) this.portalParticles[portalId] = {"count":0};
        const beam = this.spawnBeamParticle(color, null); // spawn a beam without a target to create the initial flash of the portal particle
        const p = new PortalParticle(`${this.portalParticles[portalId].count}`, x, y, color, vx, vy, ()=>{
            beam.targetParticle = null; // stop the beam from tracking once the portal particle is despawned
            delete this.portalParticles[portalId][`${p.name}`];
        }, manager, portalId);
        beam.targetParticle = p; // link the beam to the portal particle so it can track it
        p.beam = beam;
        this.portalParticles[portalId][`${this.portalParticles[portalId].count}`] = p;
        this.portalParticles[portalId].count++;
    }
    spawnBeamParticle(color, targetParticle) {
        const p = new BeamParticle(color, targetParticle, ()=>{
            const index = this.beamParticles.indexOf(p);
            if (index !== -1) {
                this.beamParticles.splice(index, 1);
            }
        });
        this.beamParticles.push(p);
        return p;
    }
    

    update(dt) {
        this.updateMainParticles(dt);
        this.updatePortalParticles(dt);
        this.updateBeamParticles(dt);
    }
    
    draw(ctx) {
        ctx.save();
        this.drawMainParticles(ctx);
        this.drawPortalParticles(ctx);
        this.drawBeamParticles(ctx);
        ctx.restore();
    }
    updateMainParticles(dt) {
        if (!this.particles.length) return; // noop to keep subsequent logic consistent
        const alive = [];
        for (const p of this.particles) {
            p.age += dt;
            if (p.age >= p.life) continue;
            const t = dt / 1000;
            p.vx *= Math.pow(0.95, t * 60);
            p.vy *= Math.pow(0.95, t * 60);
            const g = (typeof p._gravity === 'number') ? p._gravity : (this.gravityStrength || 300);
            const ax = (p._accel && typeof p._accel.x === 'number') ? p._accel.x : 0;
            const ay = (p._accel && typeof p._accel.y === 'number') ? p._accel.y : 0;
            p.vx += ax * t;
            p.vy += ay * t;
            p.vy += g * t;
            p.x += p.vx * t;
            p.y += p.vy * t;
            alive.push(p);
        }
        this.particles = alive;
    }
    drawMainParticles(ctx) {
        if (!this.particles.length) return;
        
        ctx.imageSmoothingEnabled = false;
        // draw global particles
        for (const p of this.particles) {
            const a = 1 - p.age / p.life;
            ctx.fillStyle = p.color;
            ctx.globalAlpha = a;
            const s = p.size;
            ctx.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), Math.max(1, Math.round(s)), Math.max(1, Math.round(s)));
        }
        ctx.globalAlpha = 1;
    }
    updatePortalParticles(dt) {
        for (const portalId in this.portalParticles) {
            const portal = this.portalParticles[portalId];
            for (const key in portal) {
                if (key === "count") continue;
                const p = portal[key];
                p.update(dt);
            }
        }
    }
    drawPortalParticles(ctx) {
        for (const portalId in this.portalParticles) {
            const portal = this.portalParticles[portalId];
            for (const key in portal) {
                if (key === "count") continue;
                const p = portal[key];
                p.draw(ctx);
            }
        }
    }
    updateBeamParticles(dt) {
        for (const p of this.beamParticles) {
            p.update(dt);
        }
    }
    drawBeamParticles(ctx) {
        for (const p of this.beamParticles) {
            p.draw(ctx);
        }
    }
}


class PortalParticle {
    constructor(name, x,y,color, vx, vy, despawn, manager, portalId){
        this.name = name;
        this.x = x;
        this.y = y;
        this.color = color;
        this.vx = vx;
        this.vy = vy;
        this.lastX = x;
        this.lastY = y;
        this.despawn = despawn;
        this.manager = manager;
        this.portalId = portalId;
        this.inGlass = false;
        this.glassAxis = null; // 'x' or 'y'
        this.beam = null;
        this.portalcolor = this.manager.getMachine(`${Math.floor(x)},${Math.floor(y)}`).color; 
    }
    draw(ctx) {
        ctx.fillStyle = stringHex(this.color);
        const px = this.x;
        const py = this.y;
        this.winSize = window.innerHeight/9;
        if(!this.lastX || !this.lastY){return;} // can't really draw a line with only 1 point.
        // line from prev pos to current pos. 
        ctx.lineWidth = this.winSize/16;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(this.lastX * this.winSize + this.winSize/2, this.lastY * this.winSize + this.winSize/2);
        ctx.lineTo(px * this.winSize + this.winSize/2, py * this.winSize + this.winSize/2);
        ctx.strokeStyle = ctx.fillStyle;
        ctx.stroke();
    }
    update(delta){
        this.lastX = this.x;
        this.lastY = this.y;
        this.x += this.vx * delta;
        this.y += this.vy * delta;

        // check for collisions against machines
        const fm = this.manager;
        const collisions = this.getcollidedCells();
        const winSize = window.innerHeight/9; 
        for(const col of collisions){
            if(col.cell === this.portalId) continue;
            // use axis annotated by getcollidedCells ("x", "y", "center", or "corner")
            const axis = col.axis || 'center';
            if (col.entering === 'true' && col.type === 'portal-in'){
                const [cellX, cellY] = col.cell.split(',').map(v => parseInt(v, 10));
                // portal vortex: corrupted portals halve beam alpha; otherwise they subtract their color from the beam
                const machine = this.manager.getMachine(cellX, cellY);
                const portalColor = intHex(machine.color);
                const beamColor = intHex(this.color);
                const isBlackBeam = (beamColor & 0xFFFFFF00) === 0;
                const isBlackPortal = (portalColor & 0xFFFFFF00) === 0;
                if (isBlackBeam && isBlackPortal) {
                    if(machine.corrupted){
                        machine.corrupted = false; // repair
                    } else {
                        machine.corrupted = true; // corrupt
                    }
                    this.despawn();
                    return;
                    // corruption handling will grow from here.
                } else {
                    const newColor = machine.corrupted
                        ? ((beamColor & 0xFFFFFF00) | Math.max(0, Math.round((beamColor & 0xFF) * 0.5)))
                        : subHex32(beamColor, portalColor);
                    this.beam.color = stringHex(newColor);
                    this.color = newColor; 
                }
            }
            if (col.entering === 'center' && col.type === 'portal') {
                const [cellX, cellY] = col.cell.split(',').map(v => parseInt(v, 10));
                if (Number.isFinite(cellX) && Number.isFinite(cellY)) {
                    if (this._spawnItemAtCell(cellX, cellY)) {
                        this.despawn();
                        return;
                    }
                }
            }
            if (col.entering === 'center' && col.type === 'portal-in') {
                const [cellX, cellY] = col.cell.split(',').map(v => parseInt(v, 10));
                if (Number.isFinite(cellX) && Number.isFinite(cellY)) {
                    if(this.manager.getMachine(cellX, cellY).color === this.portalcolor) continue; // only allow entry if portal colors don't match, otherwise we can get stuck in an infinite loop of portal particles bouncing back and forth between 2 same-color portals.
                    if (this._spawnItemAtCell(cellX, cellY)) {
                        this.despawn();
                        return;
                    }
                }
            }

            if ((col.entering === 'true' || col.entering === 'center') && col.type === 'cloner') {
                const [cellX, cellY] = col.cell.split(',').map(v => parseInt(v, 10));
                if (Number.isFinite(cellX) && Number.isFinite(cellY)) {
                    const machine = this.manager.getMachine(cellX, cellY);
                    if (machine && typeof machine.receiveBeamColor === 'function') {
                        machine.receiveBeamColor(this.color);
                        this.despawn();
                    }
                }
            }
            
            // Glass handling: when entering a glass cell, remember that we're inside and the axis we used to enter.
            // When exiting, if exiting on the same axis, allow exit; otherwise bounce off (reflect the velocity component perpendicular to the wall).
            if (col.type === 'glass'){
                if (col.entering === 'true'){
                    this.inGlass = true;
                    if (axis === 'x' || axis === 'y') this.glassAxis = axis;
                } else if (col.entering === 'false'){
                    if (this.inGlass) {
                        // exit along same axis: leave glass normally
                        if (axis === this.glassAxis) {
                            this.inGlass = false;
                            this.glassAxis = null;
                        } else if (axis === 'x' || axis === 'y') {
                            // bounce: reflect the velocity component corresponding to the axis we are crossing
                            if (axis === 'x') this.vx = -this.vx;
                            if (axis === 'y') this.vy = -this.vy;
                            // revert to previous position to avoid passing through the wall this frame
                            this.x = this.lastX;
                            this.y = this.lastY;
                            break; // stop processing further collisions this tick after bounce
                        }
                    }
                }
            }
            // now, if we would enter a nothing machine, destroy the particle & spawn particle burst at that location.
            if (col.entering === 'true' && col.type === 'nothing'){
                this.manager.ParticleManager.spawnAt(col.px * winSize, col.py * winSize, {colors: [0xFF0000FF], speed: 80, life: 300, count: 6});
                this.despawn();
                break;
            }
            if (col.entering === 'true' && col.type === 'seller'){
                this.manager.ParticleManager.spawnAt(col.px * winSize, col.py * winSize, {colors: [0xFFFF00FF], speed: 80, life: 300, count: 6});
                const color = this.color;
                const gm = this.manager?.levelManager?.goalManager;
                if (gm && typeof gm.recordSale === 'function') gm.recordSale(color);
                this.despawn();
                break;
            }
        }
        // if particle left the grid bounds, despawn (portal particles use cell-center coords)
        const worldX = this.x + 0.5;
        const worldY = this.y + 0.5;
        if (worldX < 0 || worldY < 0 || worldX >= fm.grid.length || worldY >= (fm.grid[0]?.length || 0)) {
            this.despawn();
        }
    }
    getcollidedCells(){
        // goal: map:"cellx,celly"{px, py, type, entering:'true'/'false'/'center'}
        // px & py = exact collision points
        // cellx & celly = cell we are colliding with
        // type = machine type we are colliding with (or "nothing" if no machine)
        // entering = whether we are entering the cell (vs leaving it)
        const cells = new Map();
        const centers = new Map(); // we'll merge later.
        const fm = this.manager;
        // portal particle positions are stored at cell centers (integer), convert to world coords (+0.5)
        const startX = this.lastX + 0.5;
        const startY = this.lastY + 0.5;
        const endX = this.x + 0.5;
        const endY = this.y + 0.5;
        // Tiny epsilon avoids floating-point comparison issues, not for excluding valid boundaries
        const eps = 1e-9;
        // 1. bounding box - check ALL cells the particle path crosses
        // Do NOT apply epsilon to the min/max calculation - that prevents valid collisions from being checked
        const minX = Math.ceil(Math.min(startX, endX));
        const maxX = Math.floor(Math.max(startX, endX));
        const minY = Math.ceil(Math.min(startY, endY)); // we don't want floor for the edge collision, but still want the center - hence the -0.5 shift
        const maxY = Math.floor(Math.max(startY, endY));

        // 2a. center collisions (cell centers are at x.5, y.5 in world coords)
        const dx = endX - startX;
        const dy = endY - startY;
        const delta = 1/8; // center = pixel in center of cell
        if (Math.abs(dy) < eps) {
            const fracY = ((startY % 1) + 1) % 1;
            if (Math.abs(fracY - 0.5) < delta) {
                const xMin = Math.min(startX, endX);
                const xMax = Math.max(startX, endX);
                const x2Start = Math.ceil(xMin * 2 - eps);
                const x2End = Math.floor(xMax * 2 + eps);
                for (let x2 = x2Start; x2 <= x2End; x2++) {
                    if ((x2 & 1) === 0) continue;
                    const x = x2 / 2;
                    if (Math.abs(x - startX) < eps) continue;
                    const cordX = Math.floor(x);
                    const cordY = Math.floor(startY);
                    const machine = fm.getMachine(cordX, cordY);
                    if (machine) centers.set(`${cordX},${cordY}`, {px:x, py:startY, type:machine.name, entering:'center', axis: 'center'})
                }
            }
        } else if (Math.abs(dx) < eps) {
            const fracX = ((startX % 1) + 1) % 1;
            if (Math.abs(fracX - 0.5) < delta) {
                const yMin = Math.min(startY, endY);
                const yMax = Math.max(startY, endY);
                const y2Start = Math.ceil(yMin * 2 - eps);
                const y2End = Math.floor(yMax * 2 + eps);
                for (let y2 = y2Start; y2 <= y2End; y2++) {
                    if ((y2 & 1) === 0) continue;
                    const y = y2 / 2;
                    if (Math.abs(y - startY) < eps) continue;
                    const cordX = Math.floor(startX);
                    const cordY = Math.floor(y);
                    const machine = fm.getMachine(cordX, cordY);
                    if (machine) centers.set(`${cordX},${cordY}`, {px:startX, py:y, type:machine.name, entering:'center', axis: 'center'})
                }
            }
        } else {
            const yMin = Math.min(startY, endY);
            const yMax = Math.max(startY, endY);
            const y2Start = Math.ceil(yMin * 2 - eps);
            const y2End = Math.floor(yMax * 2 + eps);
            const slope = dy / dx;
            for (let y2 = y2Start; y2 <= y2End; y2++) {
                if ((y2 & 1) === 0) continue;
                const y = y2 / 2;
                if (Math.abs(y - startY) < eps) continue;
                const x = (y - startY) / slope + startX;
                const fracX = ((x % 1) + 1) % 1;
                if (Math.abs(fracX - 0.5) < delta) {
                    const cordX = Math.floor(x);
                    const cordY = Math.floor(y);
                    const machine = fm.getMachine(cordX, cordY);
                    if (machine) centers.set(`${cordX},${cordY}`, {px:x, py:y, type:machine.name, entering:'center', axis: 'center'})
                }
            }
        }

        // 2b. y-axis collisions
        // formulas: 1. point slope (y-y1) = m(x-x1)  2. slope: m = (y2-y1)/(x2-x1)
        // first we substute m
        // y-y1 = ((y2-y1)/(x2-x1)) * (x-x1)
        // divide both sides by ((y2-y1)/(x2-x1))
        // (y-y1) / ((y2-y1)/(x2-x1)) = x-x1
        // then we add x1 to both sides
        // x = (y-y1) / ((y2-y1)/(x2-x1)) + x1 
        for(let y = minY; y <= maxY; y+=1){
            const x = (y-startY) / ((endY-startY)/(endX-startX)) + startX;
            const cordY = Math.floor(y); // given
            // more complex here - there are 3 cases. 1. moving downward, so 2 cells, top>bottom. 2. moving upward, so 2 cells, bottom>top. 3. collide with cell corner (hits 4 cells - priority is corner > right > down (or rotations of such)).
            // case 1. corner.
            if (x % 1 === 0){// y is an int here (.5 cases delt with earlier), so this is always a corner.
                const cordX = Math.floor(x);
                const dirY = Math.sign(endY - startY); // moving up or down?
                const dirX = Math.sign(endX - startX); // moving left or right?
                if (dirX === 0 || dirY === 0) continue; // axis-aligned edge cases handled elsewhere

                // cells around the corner
                const fromX = dirX > 0 ? cordX - 1 : cordX;
                const fromY = dirY > 0 ? cordY - 1 : cordY;
                const toX = dirX > 0 ? cordX : cordX - 1;
                const toY = dirY > 0 ? cordY : cordY - 1;

                // diagonal cell (crossing both boundaries)
                const diagMachine = fm.getMachine(toX, toY);
                if (diagMachine) cells.set(`${toX},${toY}`, {px:x, py:y, type:diagMachine.name, entering:'true', axis: 'corner'})

                // side cells (crossing each boundary individually)
                const sideMachineX = fm.getMachine(toX, fromY);
                if (sideMachineX) cells.set(`${toX},${fromY}`, {px:x, py:y, type:sideMachineX.name, entering:'true', axis: 'x'})

                const sideMachineY = fm.getMachine(fromX, toY);
                if (sideMachineY) cells.set(`${fromX},${toY}`, {px:x, py:y, type:sideMachineY.name, entering:'true', axis: 'y'})

                // we also have the from corner cell, which we are exiting.
                const fromMachine = fm.getMachine(fromX, fromY);
                if (fromMachine) cells.set(`${fromX},${fromY}`, {px:startX, py:startY, type:fromMachine.name, entering:'false', axis: 'corner'})
            }
            // case 2. not a corner, moving down.
            else if (endY > startY){
                const cordX = Math.floor(x);
                const enterY = cordY;
                const exitY = cordY - 1;
                const fromMachine = fm.getMachine(cordX, exitY);
                if (fromMachine) cells.set(`${cordX},${exitY}`, {px:startX, py:startY, type:fromMachine.name, entering:'false', axis: 'y'})
                const machine = fm.getMachine(cordX, enterY);
                if (machine) cells.set(`${cordX},${enterY}`, {px:x, py:y, type:machine.name, entering:'true', axis: 'y'})
            }
            // case 3. not a corner, moving up.
            else {
                const cordX = Math.floor(x);
                const enterY = cordY - 1;
                const exitY = cordY;
                const fromMachine = fm.getMachine(cordX, exitY);
                if (fromMachine) cells.set(`${cordX},${exitY}`, {px:startX, py:startY, type:fromMachine.name, entering:'false', axis: 'y'})
                const machine = fm.getMachine(cordX, enterY);
                if (machine) cells.set(`${cordX},${enterY}`, {px:x, py:y, type:machine.name, entering:'true', axis: 'y'})
            }
        }
        // Now, x axis collisions. Simpler, no center or corner cases here. We don't want duplicates, so we early return on corners.
        for(let x = minX; x <= maxX; x++){
            const y = (x-startX) * ((endY-startY)/(endX-startX)) + startY;
            if (y % 1 === 0) continue; // we already dealt with this in the y axis loop as a corner collision.
            const cordX = Math.floor(x);
            const cordY = Math.floor(y);
            // again, 2 cases, moving right or left.
            if (endX > startX){
                const enterX = cordX;
                const exitX = cordX - 1;
                const fromMachine = fm.getMachine(exitX, cordY);
                if (fromMachine) cells.set(`${exitX},${cordY}`, {px:startX, py:startY, type:fromMachine.name, entering:'false', axis: 'x'})
                const machine = fm.getMachine(enterX, cordY);
                if (machine) cells.set(`${enterX},${cordY}`, {px:x, py:y, type:machine.name, entering:'true', axis: 'x'})
            }
            else {
                const enterX = cordX - 1;
                const exitX = cordX;
                const fromMachine = fm.getMachine(exitX, cordY);
                if (fromMachine) cells.set(`${exitX},${cordY}`, {px:startX, py:startY, type:fromMachine.name, entering:'false', axis: 'x'})
                const machine = fm.getMachine(enterX, cordY);
                if (machine) cells.set(`${enterX},${cordY}`, {px:x, py:y, type:machine.name, entering:'true', axis: 'x'})
            }
        }
        // yay all collisions done. But we're not done yet, we need to weave X & Y, then merge in center.
        // append the centers before sorting.
        for(const [key, value] of centers.entries()){
            cells.set(key, value);
        }
        // we want the collision order. Prefer exits over entries for context,
        // but otherwise order by distance from the start position.
        const sortedCells = Array.from(cells.entries()).sort((a, b) => {
            const aVal = a[1];
            const bVal = b[1];
            // if one is an exit and the other is an entry, prefer the exit
            if (aVal.entering !== bVal.entering) {
                if (aVal.entering === 'false') return -1;
                if (bVal.entering === 'false') return 1;
            }
            const aDist = Math.hypot(aVal.px - startX, aVal.py - startY);
            const bDist = Math.hypot(bVal.px - startX, bVal.py - startY);
            return aDist - bDist;
        });
        const finalCells = sortedCells.map(([key, value])=>({
            cell: key,
            px: value.px,
            py: value.py,
            type: value.type,
            entering: value.entering,
            axis: value.axis || 'center'
        }));
        return finalCells;   
    }

    _spawnItemAtCell(cellX, cellY) {
        const cfg = this.manager?.DataManager?.config || {};
        const maxItems = parseInt(cfg.maxItems, 10) || 200;
        const current = Object.values(this.manager.items || {}).filter(Boolean).length;
        if (current >= maxItems) return false;
        const id = `item_${Date.now()}_${PortalParticle._itemCount++}`;
        const item = new Item(id, cellX + 0.5, cellY + 0.5, this.color, this.manager);
        this.manager.items[id] = item;
        return true;
    }
}
class BeamParticle {
    constructor(color, targetParticle, despawn){
        this.color = color;
        this.targetParticle = targetParticle;
        this.recordedPositions = [];
        this.despawn = despawn;
        this.lastRecordedX = null;
        this.lastRecordedY = null;
        this.elapsedTime = 0; // accumulated time for tracking history window
    }
    update(delta){
        this.elapsedTime += delta;
        if (!this.targetParticle) {
            const cutoff = this.elapsedTime - 100;
            while (this.recordedPositions.length && this.recordedPositions[0].time < cutoff) {
                this.recordedPositions.shift();
            }
            if (!this.recordedPositions.length) {
                this.despawn();
            }
            return;
        }

        // Track elapsed time instead of relying on performance.now() which breaks during debug stepping
        
        // For large deltas (like 10 frames at once), interpolate intermediate positions
        // to maintain a smooth beam even during rapid stepping
        const sampleInterval = 5; // ms between samples for smooth trails
        const numSamples = Math.max(1, Math.ceil(delta / sampleInterval));
        
        if (this.lastRecordedX === null) {
            // First update; just record current position
            this.lastRecordedX = this.targetParticle.x;
            this.lastRecordedY = this.targetParticle.y;
            this.recordedPositions.push({
                x: this.targetParticle.x,
                y: this.targetParticle.y,
                time: this.elapsedTime
            });
        } else if (numSamples > 1) {
            // Large delta: interpolate intermediate positions
            const dx = this.targetParticle.x - this.lastRecordedX;
            const dy = this.targetParticle.y - this.lastRecordedY;
            for (let i = 1; i <= numSamples; i++) {
                const t = i / numSamples;
                this.recordedPositions.push({
                    x: this.lastRecordedX + dx * t,
                    y: this.lastRecordedY + dy * t,
                    time: this.elapsedTime - delta + (delta * t)
                });
            }
            this.lastRecordedX = this.targetParticle.x;
            this.lastRecordedY = this.targetParticle.y;
        } else {
            // Small delta: record normally
            this.recordedPositions.push({
                x: this.targetParticle.x,
                y: this.targetParticle.y,
                time: this.elapsedTime
            });
            this.lastRecordedX = this.targetParticle.x;
            this.lastRecordedY = this.targetParticle.y;
        }
        
        // Remove old positions outside the 100ms window
        const cutoff = this.elapsedTime - 100;
        while(this.recordedPositions.length && this.recordedPositions[0].time < cutoff){
            this.recordedPositions.shift();
        }
    }
    draw(ctx){
        if (!this.recordedPositions.length && !this.targetParticle) return; // no history left, so nothing to draw.
        ctx.strokeStyle = stringHex(this.color);
        const size = window.innerHeight/9;
        // draw a line between recorded positions. If no recorded positions, draw a dot at the target particle.
        if (this.recordedPositions.length > 1) {
            ctx.beginPath();
            ctx.moveTo(this.recordedPositions[0].x*size+size/2, this.recordedPositions[0].y*size+size/2);
            for (let i = 1; i < this.recordedPositions.length; i++) {
                ctx.lineTo(this.recordedPositions[i].x*size+size/2, this.recordedPositions[i].y*size+size/2);
            }
            ctx.stroke();
        } else if (this.targetParticle) {
            ctx.fillRect(this.targetParticle.x*size+size/2 - 2, this.targetParticle.y*size+size/2 - 2, 4, 4);
        } else if (this.recordedPositions.length) {
            const last = this.recordedPositions[this.recordedPositions.length - 1];
            ctx.fillRect(last.x*size+size/2 - 2, last.y*size+size/2 - 2, 4, 4);
        }
    }
}
PortalParticle._itemCount = 0;