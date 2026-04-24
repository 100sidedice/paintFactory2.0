export default class Machine {
    constructor(name, machineData, manager){
        this.name = name;
        this.manager = manager;
        this.data = machineData;
    }
    draw(ctx){
        ctx.fillStyle = 'red';
        ctx.fillRect(this.data.x * 16, this.data.y * 16, 16, 16);
    }
    update(delta){

    }
}