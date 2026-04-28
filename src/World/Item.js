import { composeMaskedFrame } from '../Helpers/imageHelpers.js';

export default class Item {
    // color can be an int-32 hex (0xRRGGBB or 0xRRGGBBAA) or CSS string
    constructor(id, x, y, color = 0x00FFFF, manager = null) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.color = color;
        this.vx = 0;
        this.vy = 0;
        this._sprite = null;
        this._manager = manager;
        this._ensureSprite();
    }
    update(delta) {
        // simple physics (not used yet)
        this.x += this.vx * (delta / 1000);
        this.y += this.vy * (delta / 1000);
        this.vx *= 0;
        this.vy *= 0;
    }
    draw(ctx, size = 16, screenX = null, screenY = null) {
        let px, py;
        if (typeof screenX === 'number' && typeof screenY === 'number') {
            px = screenX;
            py = screenY;
        } else {
            px = this.x * size;
            py = this.y * size;
        }
        ctx.save();
        // Ensure nearest-neighbor (pixel-art) rendering when drawing the composed sprite
        ctx.imageSmoothingEnabled = false;
        if (this._sprite) {
            ctx.drawImage(this._sprite, px - size/2+size/4, py - size/2+size/4, size/2, size/2);
        } else {
            ctx.fillStyle = (typeof this.color === 'number') ? '#00FFFF' : this.color;
            ctx.beginPath();
            ctx.arc(px, py, Math.max(2, size * 0.35), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    _ensureSprite() {
        if (this._sprite) return;
        const img = this._manager.AssetManager.get('color');
        if (!img) return;
        // pixels: mask at [0,0], base at [1,0], slice size 16
        const canvas = composeMaskedFrame(img, 16, [1,0], [0,0], this.color, 0x00FF00);
        this._sprite = canvas;
    }
}
