import { resizeCanvas } from "./helpers/randomHelpers.js";
import AssetManager from "./AssetManager.js";
import DataManager from "./DataManager.js";
import FactoryManager from "./FactoryManager.js";

// Surface runtime errors and unhandled promise rejections into the debug div
window.addEventListener('error', (ev) => {
    const dbg = document.getElementById('debug');
    if (!dbg) return;
    const msg = ev.message || (ev.error && ev.error.message) || 'Unknown error';
    const file = ev.filename || (ev.error && ev.error.fileName) || '';
    const stack = ev.error && ev.error.stack ? `\n${ev.error.stack}` : '';
    dbg.textContent += `Error: ${msg} at ${file}${stack}\n`;
});
window.addEventListener('unhandledrejection', (ev) => {
    const dbg = document.getElementById('debug');
    if (!dbg) return;
    const r = ev.reason;
    if (r instanceof Event) {
        const src = r.target && (r.target.currentSrc || r.target.src) ? (r.target.currentSrc || r.target.src) : '';
        dbg.textContent += `UnhandledRejection Event: type=${r.type} src=${src}\n`;
    } else if (r instanceof Error) {
        dbg.textContent += `UnhandledRejection Error: ${r.message}\n${r.stack || ''}\n`;
    } else {
        try {
            dbg.textContent += `UnhandledRejection: ${JSON.stringify(r)}\n`;
        } catch (e) {
            dbg.textContent += `UnhandledRejection: ${String(r)}\n`;
        }
    }
});

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

        this.FactoryManager = new FactoryManager(this.dataManager, this.assetManager);
        this.FactoryManager.addMachine('Machine', 5,5);
        // Start the main loop
        requestAnimationFrame(this.loop.bind(this));
    }
    loop() {
        const now = performance.now();
        const deltaTime = now - this.lastTime;
        this.lastTime = now;
        this.update(deltaTime);
        this.draw();
        // Update and render logic goes here, using deltaTime for smooth animations

        requestAnimationFrame(this.loop.bind(this));
    }
    update(deltaTime) {
        this.FactoryManager.update(deltaTime);
    }
    draw() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = '#222222';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        // Draw factory and machines
        this.FactoryManager.draw(this.ctx);
    }
}

// Initialize program
const program = new Program();
program.preloadAssets();