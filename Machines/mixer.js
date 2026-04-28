import MachineBase from './Machine.js';
import Item from '../src/World/Item.js';
import { isItemColliding } from './components/collision.js';
import { applyMovement } from './components/movement.js';
import { stringHex, intHex, addHex32 } from '../src/Helpers/colorHelpers.js';

export default class mixer extends MachineBase {
    constructor(name, machineData, manager) {
        super(name, machineData, manager);
        this._acc = 0;
        this._count = 0;
        this.leftQueue = [];
        this.rightQueue = [];
        // base interval in ms (can be overridden by machine data)
        this.baseInterval = 1000;
    }

    update(delta) {
        super.update(delta);
        // determine effective interval based on upgrades (higher mixRate -> faster mixing)
        const cfg = this.manager.DataManager.config;
        const mixRate = cfg.defaultSaveData.upgrades.mixer.mixRate;

        this._acc += delta;
        const effectiveInterval = Math.max(16, this.baseInterval / Math.max(1, mixRate));
        // When interval elapses: first produce mixed item if possible, then attempt to absorb nearby items
        if (this._acc >= effectiveInterval) {
            this._acc -= effectiveInterval;
            // produce mixed output if both queues have at least one item
            if (this.leftQueue.length > 0 && this.rightQueue.length > 0) {
                const c1 = this.leftQueue.shift();
                const c2 = this.rightQueue.shift();
                const mixed = addHex32(c1, c2);
                const id = `item_${Date.now()}_${this._count++}`;
                const x = this.data.x;
                const y = this.data.y;
                const item = new Item(id, x + 0.5, y + 0.5, mixed, this.manager);
                // apply upward movement like a conveyor output
                const speed = this.manager.DataManager.config.defaultSaveData.upgrades.conveyor.speed;
                applyMovement(true, item, speed, 0);
                this.manager.items[id] = item;
            }
            // Note: absorption is handled via `onItemCollision` only — do not scan all items here.
        }
    }

    onItemCollision(item, size) {
        // Prefer immediate absorption on collision to keep queues responsive.
        // If item sits in the up-collider, move it upward like a conveyor output.
        const capacity = this.manager.DataManager.config.defaultSaveData.upgrades.mixer.capacity;
        // up / output
        const colUp = this.data.collisionUp || this.data.collision || {};
        if (isItemColliding(this.data.x, this.data.y, item, size, colUp, this.data.rot)) {
            const speed = this.manager.DataManager.config.defaultSaveData.upgrades.conveyor.speed;
            applyMovement(true, item, speed, 0);
            return;
        }

        // left
        const colLeft = this.data.collisionLeft || this.data.collision || {};
        if (this.leftQueue.length < capacity && isItemColliding(this.data.x, this.data.y, item, size, colLeft, this.data.rot)) {
            const n = item.color;
            this.leftQueue.push(n);
            this.manager.removeItem(item);
            return;
        }

        // right
        const colRight = this.data.collisionRight || this.data.collision || {};
        if (this.rightQueue.length < capacity && isItemColliding(this.data.x, this.data.y, item, size, colRight, this.data.rot)) {
            const n = item.color;
            this.rightQueue.push(n);
            this.manager.removeItem(item);
            return;
        }
    }
}
