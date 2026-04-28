import SidebarManager from "./SidebarManager.js";

export default class LevelManager {
    constructor(assetManager, input, factoryManager, dataManager, particleManager) {
        this.assetManager = assetManager;
        this.input = input;
        this.factoryManager = factoryManager;
        this.dataManager = dataManager;
        this.particleManager = particleManager;

        this.sidebarManager = new SidebarManager(this.assetManager, this.input, this.factoryManager, this.dataManager, this.particleManager);
    }

    async init(levelKey = null) {
        const levels = this.assetManager.get('Levels');
        const levelData = levels[levelKey];
        if (!levelData) {
            console.error(`Level data not found for key: ${levelKey}`);
            return;
        }
        if (this.factoryManager) this.factoryManager.levelManager = this;
        this.sidebarManager.setupInputBindings();
        this.sidebarManager.populateSidebar(levelData);
    }

    getSlotRemaining(index) {
        return this.sidebarManager.getSlotRemaining(index);
    }

    getSpawnerRemaining(color) {
        return this.sidebarManager.getSpawnerRemaining(color);
    }

    // compatibility accessors relied on elsewhere in the codebase
    get selectedIndex() { return this.sidebarManager?.selectedIndex ?? -1; }
    get slots() { return this.sidebarManager?.slots ?? []; }
}
