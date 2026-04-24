import { joinDots } from "./helpers/pathHelpers.js";

export default class FactoryManager {
    constructor(DataManager, AssetManager) {
        this.DataManager = DataManager;
        this.AssetManager = AssetManager;
        this.grid = this.generateGrid();
        this.items = {}
        this.machines = {};
    }
    generateGrid(x=16, y=16) {
        this.grid = [];
        for (let i = 0; i < x; i++) {
            this.grid[i] = [];
            for (let j = 0; j < y; j++) {
                this.grid[i][j] = null;
            }
        }
        return this.grid;
        // display by column, then row, so we can do grid[x][y] instead of grid[y][x] for simplicity
    }
    draw(ctx) {
        for (const machine in this.machines) {
            if (!this.machines[machine]?.draw) continue;
            this.machines[machine].draw(ctx);
        }
        for (const item in this.items) {
            if (!this.items[item]?.draw) continue;
            this.items[item].draw(ctx);
        }
    }
    update(delta){
        for (const machine in this.machines) {
            if (!this.machines[machine]?.update) continue;
            this.machines[machine].update(delta);
        }
        for (const item in this.items) {
            if (!this.items[item]?.update) continue;
            this.items[item].update(delta);
        }
    }
    addMachine(type, x, y){
        const machineClass = this.AssetManager.get(joinDots('Machines', type));
        if (!machineClass) {console.log(`Machine type ${type} not found`); return;}
        const machineData = this.DataManager.getData(joinDots('Machines', type));
        if (!machineData) {console.log(`Machine data for type ${type} not found`); return;}
        const machine = new machineClass(type, machineData, this);
        if (!this.machines[x]) this.machines[x] = [];
        this.machines[x][y] = machine;
    }
}