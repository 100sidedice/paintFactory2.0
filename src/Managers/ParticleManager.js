export default class ParticleManager {
    constructor() {
        this.particles = [];
    }

    spawnAt(x, y, opts = {}) {
        const count = opts.count || 12;
        const speed = opts.speed || 60; // pixels per second
        const life = opts.life || 800; // ms
        const colors = opts.colors || ['#FFCC00', '#FF8844', '#FF4444'];
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const sp = speed * (0.5 + Math.random() * 0.8);
            const vx = Math.cos(angle) * sp;
            const vy = Math.sin(angle) * sp;
            const p = {
                x: x,
                y: y,
                vx: vx,
                vy: vy,
                life: life,
                age: 0,
                size: (opts.size || 6) * (0.6 + Math.random() * 0.8),
                color: colors[Math.floor(Math.random() * colors.length)]
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
            p.vy += 300 * t; // gravity-ish
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
