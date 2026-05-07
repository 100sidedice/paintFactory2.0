import MachineBase from './Machine.js';
import Item from '../src/World/Item.js';
import { isItemColliding } from './components/collision.js';
import { applyMovement } from './components/movement.js';
import { intHex } from '../src/Helpers/colorHelpers.js';
import { getColorizedTile } from './components/masking.js';

export default class spawner extends MachineBase {
    constructor(name, machineData, manager) {
        super(name, machineData, manager);
        this.spawnInterval = (machineData.spawnInterval || 1000);
        this._acc = 0;
        this._count = 0;
        this.color = machineData.color || 0xFFFFFFFF; // default to white with full alpha
    }
    update(delta) {
        super.update(delta);
        this._acc += delta;
        if (this._acc >= this.spawnInterval) {
            this._acc -= this.spawnInterval;
            this.spawnItem(-2,0);
            this.spawnItem(2,0);
            this.spawnItem(0,-2);
        }
    }
    spawnItem(offsetX, offsetY){
        const cfg = this.manager?.DataManager?.config || {};
        const max = parseInt(cfg.maxItems, 10) || 200;
        const current = Object.values(this.manager.items || {}).filter(Boolean).length;
        if (current >= max) return;
        
        // Rotate offset vector based on machine rotation
        const rot = (this.data.rot || 0) * Math.PI / 180; // convert degrees to radians
        const rotX = offsetX * Math.cos(rot) - offsetY * Math.sin(rot);
        const rotY = offsetX * Math.sin(rot) + offsetY * Math.cos(rot);
        
        const x = this.data.x;
        const y = this.data.y;
        const id = `item_${Math.random().toString(36).substr(2,9)}_${Date.now()}`;
        const item = new Item(id, x + 0.5 + rotX/16, y + 0.5 + rotY/16, this.color, this.manager);
        this.manager.items[id] = item;
    }
    onItemCollision(item, size) {
        const collisionA = this.data.collisionA;
        const collidingA = isItemColliding(this.data.x, this.data.y, item, size, collisionA, this.data.rot);
        if (collidingA) {
            const speed = this.manager.DataManager.config.defaultSaveData.upgrades.conveyor.speed;
            applyMovement(true, item, speed, this.data.rot-90);
        }
        const collisionB = this.data.collisionB;
        const collidingB = isItemColliding(this.data.x, this.data.y, item, size, collisionB, this.data.rot);
        if (collidingB) {
            const speed = this.manager.DataManager.config.defaultSaveData.upgrades.conveyor.speed;
            applyMovement(true, item, speed, this.data.rot+90);
        }
        const collisionC = this.data.collisionC;
        const collidingC = isItemColliding(this.data.x, this.data.y, item, size, collisionC, this.data.rot);
        if (collidingC) {
            const speed = this.manager.DataManager.config.defaultSaveData.upgrades.conveyor.speed;
            applyMovement(true, item, speed, this.data.rot);
        }
    }
    draw(ctx, x, y, size=16) {
        if (this.manager.paused) {
            var img = this.manager?.AssetManager?.get('machines-image-grayed');
        }else {
            var img = this.manager?.AssetManager?.get('machines-image');
        }
        if (!img) { super.draw(ctx, x, y, size); return; }

        const row = (this.data.texture.row);
        const tw = 16; const th = 16;
        let cols = Math.max(1, Math.floor(img.width / tw));
        if (this.manager.paused) cols = 1; // prevent animation when paused by forcing tile index to 0, since `tileIndex = row * cols` and row is always 0 or positive
        const tileIndex = row * cols; // assume one-tile-per-row layout
        const frameCount = Math.max(1, this.data.texture?.frameCount ?? cols);
        const frameLimit = this.manager.paused ? 1 : Math.min(cols, frameCount);
        const sx = Math.floor((performance.now() * this.data.texture.fps)/1000 % frameLimit) * tw;
        const sy = Math.floor(tileIndex / cols) * th;
        // colorize mask pixels (mask color 0x1C1C1CFF) with this spawner's color and cache result
        const maskColor = 0x1C1C1CFF;
        const color = this.color || 0xFFFFFFFF;
        const tileCanvas = getColorizedTile(img, sx, sy, tw, th, color, maskColor);
        // draw centered similar to base Machine
        if(!this.rotating){
            ctx.drawImage(tileCanvas, 0, 0, tw, th, x*size - size/2, y*size - size/2, size, size);
        } else {
            ctx.save();
            ctx.translate(x*size, y*size);
            // Apply an animated counter-rotation while the global canvas has already been rotated
            // by `machine.data.rot` in FactoryManager. `extraRotation` is in degrees, so convert to radians.
            if(this.data.rot === 0 && this.rotating === -1) {
                ctx.rotate((this.extraRotation - this.rotating * Math.PI/2)+2*Math.PI);
            } else {
                ctx.rotate((this.extraRotation - this.rotating * Math.PI/2));
            }
            ctx.drawImage(tileCanvas, 0, 0, tw, th, -size/2, -size/2, size, size);
            ctx.restore();
        }
    }
}

// Masking utilities (getColorizedTile) imported from ./components/masking.js
