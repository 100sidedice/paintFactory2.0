import MachineBase from './Machine.js';
import { isItemColliding } from './components/collision.js';
import { applyMovement } from './components/movement.js';

export default class conveyor extends MachineBase {
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
            const speed = this.manager.DataManager.config.defaultSaveData.upgrades.conveyor.speed;
            applyMovement(true, item, speed, this.data.rot);
        }
    }
}
