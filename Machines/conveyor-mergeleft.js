import Machine from './Machine.js';
import { isItemColliding } from './components/collision.js';
import { applyMovement } from './components/movement.js';

export default class conveyor extends Machine {
    constructor(name, machineData, manager) {
        super(name, machineData, manager);
    }
    update(delta) {
        super.update(delta);
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
}
