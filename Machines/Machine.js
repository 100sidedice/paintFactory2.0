export default class Machine {
    constructor(name, machineData, manager){
        this.name = name;
        this.manager = manager;
        this.data = machineData;
    }
    draw(ctx, x, y, size=16){
        ctx.fillStyle = 'red';
        ctx.fillRect(x*size -size/2, y*size -size/2, size, size);
        ctx.fillStyle = 'white';
        ctx.fillRect(x*size -size/8, y*size -size/2, size/4, size/4);


    }
    update(delta){


    }
    // Called when an item occupies this machine's cell. `size` is pixels per cell.
    onItemCollision(item, size) {
        // default: do nothing
    }
}