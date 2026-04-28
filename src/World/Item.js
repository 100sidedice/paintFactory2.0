import { composeMaskedFrame } from '../Helpers/imageHelpers.js';
import { stringHex, intHex } from '../Helpers/colorHelpers.js';

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
        this._ensureSprite();
    }
    update(delta) {
        // simple physics (not used yet)
        this.x += this.vx * (delta / 1000);
        this.y += this.vy * (delta / 1000);
        this.vx *= 0;
        this.vy *= 0;
    }
    draw(ctx, size = 16) {
        let px = this.x * size;
        let py = this.y * size;
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(this._sprite, px - size/2+size/4, py - size/2+size/4, size/2, size/2);
        ctx.restore();
    }

    _ensureSprite() {
        if (this._sprite) return;
        const img = this._manager.AssetManager.get('color');
        const canvas = composeMaskedFrame(img, 16, [1,0], [0,0], this.color, 0x00FF00FF);
        this._sprite = canvas;
    }
}
