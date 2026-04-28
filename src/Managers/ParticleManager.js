import { stringHex, intHex } from "../Helpers/colorHelpers.js";

export default class ParticleManager {
    constructor() {
        this.particles = [];
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

    update(dt) {
        if (!this.particles.length) return;
        const alive = [];
        for (const p of this.particles) {
            p.age += dt;
            if (p.age >= p.life) continue;
            // simple physics + drag
            const t = dt / 1000;
            p.vx *= Math.pow(0.95, t * 60);
            p.vy *= Math.pow(0.95, t * 60);
            const g = (typeof p._gravity === 'number') ? p._gravity : (this.gravityStrength || 300);
            const ax = (p._accel && typeof p._accel.x === 'number') ? p._accel.x : 0;
            const ay = (p._accel && typeof p._accel.y === 'number') ? p._accel.y : 0;
            p.vx += ax * t;
            p.vy += ay * t;
            p.vy += g * t; // gravity-ish
            p.x += p.vx * t;
            p.y += p.vy * t;
            alive.push(p);
        }
        this.particles = alive;
    }

    draw(ctx) {
        if (!this.particles.length) return;
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        for (const p of this.particles) {
            const a = 1 - p.age / p.life;
            ctx.fillStyle = p.color;
            ctx.globalAlpha = a;
            const s = p.size;
            // draw small filled rect for pixel-art style
            ctx.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), Math.max(1, Math.round(s)), Math.max(1, Math.round(s)));
        }
        ctx.globalAlpha = 1;
        ctx.restore();
    }
}
