import MachineBase from './Machine.js';
import Item from '../src/World/Item.js';
import { isItemColliding } from './components/collision.js';
import { applyMovement } from './components/movement.js';
import { cssHexToInt } from '../src/Helpers/colorHelpers.js';

export default class mixer extends MachineBase {
    constructor(name, machineData, manager) {
        super(name, machineData, manager);
        this._acc = 0;
        this._count = 0;
        this.leftQueue = [];
        this.rightQueue = [];
        // base interval in ms (can be overridden by machine data)
        this.baseInterval = machineData.mixInterval || 1000;
    }

    // add two int32 colors by channel with clamping to 255
    _addColors(c1, c2) {
        // c1, c2 are int32 in RRGGBBAA layout. Sum each channel and clamp to 255.
        const ch = (c, s) => Math.min(((c >> s) & 0xff) + ((c2 >> s) & 0xff), 255);
        const R = ch(c1, 24) & 0xff;
        const G = ch(c1, 16) & 0xff;
        const B = ch(c1, 8) & 0xff;
        const A = ch(c1, 0) & 0xff;
        return (((R << 24) >>> 0) | (G << 16) | (B << 8) | A) >>> 0;
    }

    update(delta) {
        super.update(delta);
        // determine effective interval based on upgrades (higher mixRate -> faster mixing)
        const cfg = this.manager && this.manager.DataManager && this.manager.DataManager.config;
        const mixRate = (cfg && cfg.defaultSaveData && cfg.defaultSaveData.upgrades && cfg.defaultSaveData.upgrades.mixer && cfg.defaultSaveData.upgrades.mixer.mixRate) || 1;
        const capacity = (cfg && cfg.defaultSaveData && cfg.defaultSaveData.upgrades && cfg.defaultSaveData.upgrades.mixer && cfg.defaultSaveData.upgrades.mixer.capacity) || 10;

        this._acc += delta;
        const effectiveInterval = Math.max(16, this.baseInterval / Math.max(1, mixRate));
        // When interval elapses: first produce mixed item if possible, then attempt to absorb nearby items
        if (this._acc >= effectiveInterval) {
            this._acc -= effectiveInterval;
            // produce mixed output if both queues have at least one item
            if (this.leftQueue.length > 0 && this.rightQueue.length > 0) {
                const c1 = this.leftQueue.shift();
                const c2 = this.rightQueue.shift();
                const mixed = this._addColors(c1, c2);
                const id = `item_${Date.now()}_${this._count++}`;
                const x = this.data.x ?? 0;
                const y = this.data.y ?? 0;
                const item = new Item(id, x + 0.5, y + 0.5, mixed, this.manager);
                // apply upward movement like a conveyor output
                try {
                    const speed = (this.manager && this.manager.DataManager && this.manager.DataManager.config && this.manager.DataManager.config.defaultSaveData && this.manager.DataManager.config.defaultSaveData.upgrades && this.manager.DataManager.config.defaultSaveData.upgrades.conveyor && this.manager.DataManager.config.defaultSaveData.upgrades.conveyor.speed) || 1;
                    applyMovement(true, item, speed, 0);
                } catch (e) {}
                this.manager.items[id] = item;
            }
            // Note: absorption is handled via `onItemCollision` only — do not scan all items here.
        }
    }

    onItemCollision(item, size) {
        // Prefer immediate absorption on collision to keep queues responsive.
        // If item sits in the up-collider, move it upward like a conveyor output.
        const capacity = (this.manager && this.manager.DataManager && this.manager.DataManager.config && this.manager.DataManager.config.defaultSaveData && this.manager.DataManager.config.defaultSaveData.upgrades && this.manager.DataManager.config.defaultSaveData.upgrades.mixer && this.manager.DataManager.config.defaultSaveData.upgrades.mixer.capacity) || 10;
        // up / output
        const colUp = this.data.collisionUp || this.data.collision || {};
        try {
            if (isItemColliding(this.data.x, this.data.y, item, size, colUp, this.data.rot)) {
                const speed = (this.manager && this.manager.DataManager && this.manager.DataManager.config && this.manager.DataManager.config.defaultSaveData && this.manager.DataManager.config.defaultSaveData.upgrades && this.manager.DataManager.config.defaultSaveData.upgrades.conveyor && this.manager.DataManager.config.defaultSaveData.upgrades.conveyor.speed) || 1;
                applyMovement(true, item, speed, 0);
                return;
            }
        } catch (e) {}

        // left
        const colLeft = this.data.collisionLeft || this.data.collision || {};
        try {
            if (this.leftQueue.length < capacity && isItemColliding(this.data.x, this.data.y, item, size, colLeft, this.data.rot)) {
                const n = (typeof item.color === 'number') ? item.color : cssHexToInt(String(item.color));
                this.leftQueue.push(n);
                this.manager.removeItem(item);
                return;
            }
        } catch (e) {}

        // right
        const colRight = this.data.collisionRight || this.data.collision || {};
        try {
            if (this.rightQueue.length < capacity && isItemColliding(this.data.x, this.data.y, item, size, colRight, this.data.rot)) {
                const n = (typeof item.color === 'number') ? item.color : cssHexToInt(String(item.color));
                this.rightQueue.push(n);
                this.manager.removeItem(item);
                return;
            }
        } catch (e) {}
    }
}
