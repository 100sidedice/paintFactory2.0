import MachineBase from './Machine.js';
import { isItemColliding } from './components/collision.js';

export default class glass extends MachineBase {
    constructor(name, machineData, manager) {
        super(name, machineData, manager);
    }
    update(delta) {
        super.update(delta);
    }
    onItemCollision(item, size) {
    }
}
