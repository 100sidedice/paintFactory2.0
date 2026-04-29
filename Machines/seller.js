import MachineBase from './Machine.js';
import { isItemColliding } from './components/collision.js';
import { applyMovement } from './components/movement.js';

export default class seller extends MachineBase {
    constructor(name, machineData, manager) {
        super(name, machineData, manager);
    }
    update(delta) {
        super.update(delta);
    }
    onItemCollision(item, size) {
        const collision = this.data.collision;
        const colliding = isItemColliding(this.data.x, this.data.y, item, size, collision, this.data.rot);
        if (colliding) {
            // remove the item from the factory and inform level goal manager (if present)
            try {
                const color = (item && (item.color !== undefined && item.color !== null)) ? item.color : null;
                if (this.manager && this.manager.levelManager && this.manager.levelManager.goalManager) {
                    this.manager.levelManager.goalManager.recordSale(color);
                }
            } catch (e) { /* ignore */ }
            this.manager.removeItem(item);
        }
    }
}
