import { resizeCanvas } from "./helpers/randomHelpers.js";
import AssetManager from "./AssetManager.js";
import DataManager from "./DataManager.js";

class Program {
    constructor() {
        this.assetManager = new AssetManager();
        this.dataManager = null; // Will be initialized after config is loaded

        // We can put non-data dependent here still
        this.lastTime = 0;
    }
    async preloadAssets() {
        await this.assetManager.preload();
        this.dataManager = new DataManager(this.assetManager.get('Data.config'));
        this.onReady(); // After all assets are loaded, initialize the program
    }
    async onReady() {
        // for data-dependent or heavier initialization, we can put it here
        // Initialize canvas resizing
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        // Get canvas and context
        this.canvas = document.getElementById('Draw');
        this.ctx = this.canvas.getContext('2d');
    }
    loop() {
        const now = performance.now();
        const deltaTime = now - this.lastTime;
        this.lastTime = now;

        // Update and render logic goes here, using deltaTime for smooth animations

        requestAnimationFrame(this.loop.bind(this));
    }
}

// Initialize program
const program = new Program();
program.preloadAssets();