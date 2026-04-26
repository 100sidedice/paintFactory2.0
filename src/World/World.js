export default class World {
    constructor(FactoryManager, BackgroundManager){
        this.FactoryManager = FactoryManager;
        this.BackgroundManager = BackgroundManager;
    }
    draw(ctx){
        this.BackgroundManager.draw(ctx);
        this.FactoryManager.draw(ctx);
    }
    update(delta){
        this.FactoryManager.update(delta);
    }
}