import MachineBase from './Machine.js';
import Item from '../src/World/Item.js';
import { isItemColliding } from './components/collision.js';
import { applyMovement } from './components/movement.js';

export default class spawner extends MachineBase {
    constructor(name, machineData, manager) {
        super(name, machineData, manager);
        this.spawnInterval = (machineData.spawnInterval || 1000);
        this._acc = 0;
        this._count = 0;
        this.color = machineData.color || 0xFFFFFF; // default to white if no color provided
    }
    update(delta) {
        this._acc += delta;
        if (this._acc >= this.spawnInterval) {
            this._acc -= this.spawnInterval;
            // spawn item at machine location
            const x = this.data.x ?? 0;
            const y = this.data.y ?? 0;
            const id = `item_${Date.now()}_${this._count++}`;
            const item = new Item(id, x + 0.5, y + 0.5, this.color, this.manager);
            this.manager.items[id] = item;
        }
    }
    onItemCollision(item, size) {
        const collision = this.data.collision || { top:0,right:0,bottom:0,left:0 };
        const colliding = isItemColliding(this.data.x ?? 0, this.data.y ?? 0, item, size, collision, this.data.rot);
        if (colliding) {
            const speed = this.manager.DataManager.config.defaultSaveData.upgrades.conveyor.speed;
            applyMovement(true, item, speed, this.data.rot);
        }
    }
    draw(ctx, x, y, size=16) {
        const img = this.manager?.AssetManager?.get('machines-image');
        if (!img) super.draw(ctx, x, y, size);

        const row = (this.data.texture?.row ?? 0);
        const tw = 16; const th = 16;
        const cols = Math.max(1, Math.floor(img.width / tw));
        const tileIndex = row * cols; // assume one-tile-per-row layout
        const sx = 1 * tw;
        const sy = Math.floor(tileIndex / cols) * th;
        // draw centered similar to base Machine
        ctx.drawImage(img, sx, sy, tw, th, x*size - size/2, y*size - size/2, size, size);
    }
}
