import ConveyorBase from './conveyor.js';
import { isItemColliding } from './components/collision.js';
import { applyMovement } from './components/movement.js';

export default class conveyor extends ConveyorBase {
    constructor(name, machineData, manager) {
        super(name, machineData, manager);
    }
    update(delta) {
        super.update(delta);
    }
    onItemCollision(item, size) {
        const colorState = this._handleItemPressColorState(item, size);
        if (colorState.blocked) return;

        const collisionA = this.data['collision-left'];
        const collisionB = this.data['collision-right'];
        const collisionC = this.data['collision-up'];
        const collidingA = isItemColliding(this.data.x, this.data.y, item, size, collisionA, this.data.rot);
        const collidingB = isItemColliding(this.data.x, this.data.y, item, size, collisionB, this.data.rot);
        const collidingC = isItemColliding(this.data.x, this.data.y, item, size, collisionC, this.data.rot);
        const speed = this.manager.DataManager.config.defaultSaveData.upgrades.conveyor.speed;
        if (collidingA) {
            applyMovement(true, item, speed, this.data.rot+90);
        }
        if (collidingB) {
            applyMovement(true, item, speed, this.data.rot-90);
        }
        if (collidingC) {
            applyMovement(true, item, speed, this.data.rot);
        }
    }
}
