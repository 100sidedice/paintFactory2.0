import MachineBase from './Machine.js';
import { isItemColliding } from './components/collision.js';

export default class nothing extends MachineBase {
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
            this.manager.removeItem(item);
        }
    }
}
