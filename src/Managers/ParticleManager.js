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
    spawnPortalParticle(portalId, x, y, color, vx, vy) {
        if (!this.portalParticles[portalId]) this.portalParticles[portalId] = {"count":0};
        const p = new PortalParticle(`${this.portalParticles[portalId].count}`, x, y, color, vx, vy, ()=>{
            delete this.portalParticles[portalId][`${p.name}`];
        });
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
    constructor(name, x,y,color, vx, vy, despawn){
        this.name = name;
        this.x = x;
        this.y = y;
        this.color = color;
        this.vx = vx;
        this.vy = vy;
        this.lastX = x;
        this.lastY = y;
        this.despawn = despawn;
    }
    draw(ctx) {
        ctx.fillStyle = `rgba(${(this.color >> 16) & 0xFF}, ${(this.color >> 8) & 0xFF}, ${this.color & 0xFF}, 1)`;
        const px = this.x;
        const py = this.y;
        ctx.fillRect(px - 2, py - 2, 4, 4);
    }
    update(delta){
        this.lastX = this.x;
        this.lastY = this.y;
        this.x += this.vx * delta;
        this.y += this.vy * delta;

        if(this.x < 0 || this.y < 0 || this.x > window.innerWidth || this.y > window.innerHeight){
            this.despawn();
        }
    }
    collide(px1,py1,px2,py2, normal){
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
}