import { composeMaskedFrame } from '../Helpers/imageHelpers.js';
import { stringHex, intHex, offsetIntHex } from '../Helpers/colorHelpers.js';

export default class Item {
    // color can be an int-32 hex (0xRRGGBBAA) only.
    constructor(id, x, y, color = 0x00FFFFFF, manager = null) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.color = color;
        this.vx = 0;
        this.vy = 0;
        this._sprite = null;
        this._manager = manager;
        this.age = 0;
        // lifetime in ms for static items (despawn). Default 5000ms
        this.life = 5000;
        // track last position to detect movement and reset age
        this._lastX = x;
        this._lastY = y;
        this._ensureSprite();
    }
    update(delta) {
        // simple physics (not used yet)
        const prevX = this._lastX ?? this.x;
        const prevY = this._lastY ?? this.y;
        // compute intended displacement (in tiles). clamp to avoid skipping collisions when delta or velocities are large
        const intendedDx = this.vx * (delta / 1000);
        const intendedDy = this.vy * (delta / 1000);
        const dist = Math.hypot(intendedDx, intendedDy);
        const maxTilesPerStep = 0.1; // don't allow movement >= 1 tile/frame to avoid skipping colliders
        let dx = intendedDx;
        let dy = intendedDy; 
        if (dist > 0 && dist > maxTilesPerStep) {
            const scale = maxTilesPerStep / dist;
            dx = intendedDx * scale;
            dy = intendedDy * scale;
        }
        this.x += dx;
        this.y += dy;
        this.vx *= 0;
        this.vy *= 0;
        // reset age if the item moved since last update
        const moved = (Math.abs(this.x - prevX) > 0.0001) || (Math.abs(this.y - prevY) > 0.0001);
        if (moved) {
            this.age = 0;
            this._lastX = this.x;
            this._lastY = this.y;
            return;
        }
        // age and despawn when life exceeded
        this.age += delta;
        if (this.age >= this.life) {
            const size = window.innerHeight / 9;
            const px = (this.x * size);
            const py = (this.y * size);
            const base = this.color;
            const cols = [base, offsetIntHex(base, 0.10), offsetIntHex(base, 0.18)];
            this._manager.ParticleManager.spawnAt(px, py, { count: 10, colors: cols, size: 12, speed: 300, life: 700, gravityStrength: 200 });
            this._manager.removeItem(this);
        }
    }
    draw(ctx, size = 16) {
        let px = this.x * size;
        let py = this.y * size;
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        // blink effect in last second: base blink period 250ms, and in final 250ms speed up 3x
        let visible = true;
        const timeLeft = (this.life || 0) - (this.age || 0);
        if (timeLeft <= 1000) {
            const basePeriod = 250; // ms
            const period = timeLeft > 250 ? basePeriod : (basePeriod / 3);
            // Use timeLeft to make blink ramp consistent as time decreases
            visible = (Math.floor(timeLeft / period) % 2) === 0;
        }
        if (visible) ctx.drawImage(this._sprite, px - size/2+size/4, py - size/2+size/4, size/2, size/2);
        ctx.restore();
    }

    _ensureSprite() {
        if (this._sprite) return;
        const img = this._manager.AssetManager.get('color');
        const canvas = composeMaskedFrame(img, 16, [1,0], [0,0], this.color, 0x00FF00FF);
        this._sprite = canvas;
    }
}
