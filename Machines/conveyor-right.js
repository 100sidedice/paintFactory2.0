import MachineBase from './Machine.js';
import { isItemColliding } from './components/collision.js';
import { applyMovement } from './components/movement.js';

export default class conveyor extends MachineBase {
    constructor(name, machineData, manager) {
        super(name, machineData, manager);
    }
    update(delta) {

    }
    onItemCollision(item, size) {
        const collisionA = this.data['collision-up'];
        const collisionB = this.data['collision-right'];
        const collidingA = isItemColliding(this.data.x, this.data.y, item, size, collisionA, this.data.rot);
        const collidingB = isItemColliding(this.data.x, this.data.y, item, size, collisionB, this.data.rot);
        const speed = this.manager.DataManager.config.defaultSaveData.upgrades.conveyor.speed;
        if (collidingA) {
            applyMovement(true, item, speed, this.data.rot);
        }
        if (collidingB) {
            applyMovement(true, item, speed, this.data.rot+90);
        }
    }
    draw(ctx, x, y, size=16) {
        const img = this.manager?.AssetManager?.get('machines-image');
        if (!img) super.draw(ctx, x, y, size);

        const row = (this.data.texture.row);
        const tw = 16; const th = 16;
        const cols = Math.max(1, Math.floor(img.width / tw));
        const tileIndex = row * cols; // assume one-tile-per-row layout
        const sx = Math.floor((performance.now() * this.data.texture.fps)/1000 % cols) * tw;
        const sy = Math.floor(tileIndex / cols) * th;
        // draw centered similar to base Machine
        ctx.drawImage(img, sx, sy, tw, th, x*size - size/2, y*size - size/2, size, size);
    }
}
