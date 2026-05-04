import { stringHex, intHex } from "../Helpers/colorHelpers.js";

export default class ParticleManager {
    constructor() {
        this.particles = [];
        this.portalParticles = {};
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
        const p = new PortalParticle(`${this.portalParticles[portalId].count}`, x, y, color, vx, vy, ()=>{
            delete this.portalParticles[portalId][`${p.name}`];
        }, manager);
        this.portalParticles[portalId][`${this.portalParticles[portalId].count}`] = p;
        this.portalParticles[portalId].count++;
    }

    update(dt) {
        this.updateMainParticles(dt);
        this.updatePortalParticles(dt);
    }
    
    draw(ctx) {
        ctx.save();
        this.drawMainParticles(ctx);
        this.drawPortalParticles(ctx);
        
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
}


class PortalParticle {
    constructor(name, x,y,color, vx, vy, despawn, manager){
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
    }
    draw(ctx) {
        ctx.fillStyle = `rgba(${(this.color >> 16) & 0xFF}, ${(this.color >> 8) & 0xFF}, ${this.color & 0xFF}, 1)`;
        const px = this.x;
        const py = this.y;
        this.winSize = window.innerHeight/9;
        ctx.fillRect(px * this.winSize-this.winSize/8+this.winSize/2, py * this.winSize-this.winSize/8+this.winSize/2, this.winSize/4, this.winSize/4);
    }
    update(delta){
        this.lastX = this.x;
        this.lastY = this.y;
        this.x += this.vx * delta;
        this.y += this.vy * delta;

        // check for collisions against machines
        const fm = this.manager;
        const cells = this.getcollidedCells();
        for (const c of cells) {
            const gx = c.x; const gy = c.y;
            if (gx < 0 || gy < 0) continue;
            if (gx >= fm.grid.length) continue;
            if (gy >= (fm.grid[0]?.length || 0)) continue;
            const machine = fm.grid[gx][gy];
            if (machine && (machine.name === 'nothing')) {
                // get collided edge
                const collision = this.getcollidedEdge(gx, gy);
                if (!collision) continue;
                const size = window.innerHeight / 9;
                const px = collision.cx * size + size / 2;
                const py = collision.cy * size + size / 2;
                // prefer factory's particle manager if available
                const pm = fm.ParticleManager;
                fm.ParticleManager.spawnAt(px, py, { count: 14, colors: [0xFF0000FF], size: 10, speed: 220, life: 700 });
                this.despawn();
                return;
            }
        }
        // if particle left the grid bounds, despawn
        if (this.x < 0 || this.y < 0 || this.x >= fm.grid.length || this.y >= (fm.grid[0]?.length || 0)) {
            this.despawn();
        }
        return;
    }
    getcollidedCells(){
        // Return an array of grid cells (tile coordinates) crossed by the particle
        // movement between `lastX,lastY` -> `x,y`. Uses a grid-traversal (Amanatides)
        // approach to enumerate cells in the order they are entered. Each entry
        // is { x, y, t, px, py } where `t` is the normalized param along the
        // segment [0..1] at the entry point and `px,py` is the intersection point.
        const out = [];
        const x0 = this.lastX;
        const y0 = this.lastY;
        const x1 = this.x;
        const y1 = this.y;
        if (!isFinite(x0) || !isFinite(y0) || !isFinite(x1) || !isFinite(y1)) return out;

        let cx = Math.floor(x0);
        let cy = Math.floor(y0);
        const endX = Math.floor(x1);
        const endY = Math.floor(y1);

        // push starting cell (t = 0)
        out.push({ x: cx, y: cy, t: 0, px: x0, py: y0 });
        if (cx === endX && cy === endY) return out;

        const dx = x1 - x0;
        const dy = y1 - y0;
        const stepX = dx > 0 ? 1 : (dx < 0 ? -1 : 0);
        const stepY = dy > 0 ? 1 : (dy < 0 ? -1 : 0);

        const tDeltaX = stepX !== 0 ? Math.abs(1 / dx) : Infinity;
        const tDeltaY = stepY !== 0 ? Math.abs(1 / dy) : Infinity;

        let tMaxX;
        if (stepX > 0) {
            tMaxX = ((Math.floor(x0) + 1) - x0) / dx;
        } else if (stepX < 0) {
            tMaxX = (x0 - Math.floor(x0)) / -dx;
        } else {
            tMaxX = Infinity;
        }

        let tMaxY;
        if (stepY > 0) {
            tMaxY = ((Math.floor(y0) + 1) - y0) / dy;
        } else if (stepY < 0) {
            tMaxY = (y0 - Math.floor(y0)) / -dy;
        } else {
            tMaxY = Infinity;
        }

        // traverse until we reach the end cell or exceed the segment
        let t = 0;
        const maxIter = 512;
        for (let i = 0; i < maxIter; i++) {
            if (tMaxX <= tMaxY) {
                cx += stepX;
                t = tMaxX;
                tMaxX += tDeltaX;
            } else {
                cy += stepY;
                t = tMaxY;
                tMaxY += tDeltaY;
            }

            if (t > 1) break;
            const px = x0 + dx * t;
            const py = y0 + dy * t;
            out.push({ x: cx, y: cy, t: Math.max(0, Math.min(1, t)), px, py });

            if (cx === endX && cy === endY) break;
        }

        // ensure final cell is present
        const last = out[out.length - 1];
        if (!last || last.x !== endX || last.y !== endY) {
            out.push({ x: endX, y: endY, t: 1, px: x1, py: y1 });
        }
        return out;
    }
    collideEdge(px1,py1,px2,py2, normal){
        // robust segment-segment intersection between movement (last -> current)
        // and edge (px1,py1 -> px2,py2). Returns collision point, normal angle
        // (uses provided `normal` angle if given) and `entering` boolean.
        const relVX = this.x - this.lastX;
        const relVY = this.y - this.lastY;
        const edgeX = px2 - px1;
        const edgeY = py2 - py1;

        const denom = relVX * edgeY - relVY * edgeX;
        if (denom === 0) return null; // parallel or no relative motion

        const dx = px1 - this.lastX;
        const dy = py1 - this.lastY;

        const s = (dx * edgeY - dy * edgeX) / denom; // along movement [0..1]
        const t = (dx * relVY - dy * relVX) / denom; // along edge [0..1]

        if (s < 0 || s > 1 || t < 0 || t > 1) return null; // no intersection within segments

        const cx = this.lastX + relVX * s;
        const cy = this.lastY + relVY * s;

        const angle = (typeof normal === 'number')
            ? normal
            : Math.atan2(edgeY, edgeX) + Math.PI / 2;

        const nX = Math.cos(angle);
        const nY = Math.sin(angle);

        // movement dot normal: >0 means moving into the normal direction (into shape)
        const dot = relVX * nX + relVY * nY;
        const entering = dot > 0;

        return { cx, cy, angle, entering };
    }
    getcollidedEdge(cellx, celly){
        // check the 4 edges of the cell using collideEdge and return the earliest collision (if any)
        const x = cellx; const y = celly;
        const edges = [
            { px1: x-0.5, py1: y-0.5, px2: x + 0.5, py2: y-0.5, normal: 3 * Math.PI / 2 }, // top
            { px1: x + 0.5, py1: y-0.5, px2: x + 0.5, py2: y + 0.5, normal: 0 }, // right
            { px1: x-0.5, py1: y + 0.5, px2: x + 0.5, py2: y + 0.5, normal: Math.PI / 2 }, // bottom
            { px1: x-0.5, py1: y-0.5, px2: x-0.5, py2: y + 0.5, normal: Math.PI } // left
        ];
        let earliest = null;
        for (const edge of edges) {
            const collision = this.collideEdge(edge.px1, edge.py1, edge.px2, edge.py2, edge.normal);
            if (collision && (!earliest || collision.t < earliest.t)) {
                earliest = collision;
            }
        }
        return earliest;
    }
}