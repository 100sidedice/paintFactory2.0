import { resizeCanvas } from "./Helpers/randomHelpers.js";
import AssetManager from "./Managers/AssetManager.js";
import DataManager from "./Managers/DataManager.js";
import FactoryManager from "./Managers/FactoryManager.js";
import Input from "./World/Input.js";
import LevelManager from "./Managers/LevelManager.js";
import ParticleManager from "./Managers/ParticleManager.js";
import BackgroundManager from "./Managers/BackgroundManager.js";
import { setChannel } from "./Helpers/colorHelpers.js";





class Program {
    constructor() {
        this.assetManager = new AssetManager();
        this.dataManager = null; // Will be initialized after config is loaded

        // We can put non-data dependent here still
        this.lastTime = 0;

        this.selectedRot = 0;
        this.input = new Input();
    }
    async preloadAssets() {
        await this.assetManager.preload();
        // Preload background tilemaps/images before initializing the rest
        this.BackgroundManager = new BackgroundManager(this.assetManager);
        await this.BackgroundManager.preload();
        this.dataManager = new DataManager(this.assetManager);
        this.onReady(); // After all assets are loaded, initialize the program
    }
    onReady() {
        // for data-dependent or heavier initialization, we can put it here
        // Initialize canvas resizing
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        // Get canvas and context
        this.canvas = document.getElementById('Draw');
        this.ctx = this.canvas.getContext('2d');
        this.ParticleManager = new ParticleManager(this.assetManager);
        this.FactoryManager = new FactoryManager(this.dataManager, this.assetManager, this.ParticleManager);
        // Initialize LevelManager which will wire input bindings for selection and placing/removing machines
        this.LevelManager = new LevelManager(this.assetManager, this.input, this.FactoryManager, this.dataManager, this.ParticleManager);
        this.LevelManager.init("level1");
        this.FactoryManager.addMachine('conveyor', 4,3, 0);
        // Start the main loop
        requestAnimationFrame(this.loop.bind(this));        
    }
    loop() {
        const now = performance.now();
        const deltaTime = Math.min(100, now - this.lastTime); // Cap deltaTime to avoid huge jumps
        this.lastTime = now;
        this.update(deltaTime);
        this.draw();
        // Update and render logic goes here, using deltaTime for smooth animations

        requestAnimationFrame(this.loop.bind(this));
    }
    update(deltaTime) {
        this.FactoryManager.update(deltaTime);
        if (this.ParticleManager) this.ParticleManager.update(deltaTime);
    }
    draw() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = '#222222FF';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        // Pixel art: disable smoothing on canvas context
        this.ctx.imageSmoothingEnabled = false;
        // Draw background first
        if (this.BackgroundManager) this.BackgroundManager.draw(this.ctx);
        // Draw factory and machines
        this.FactoryManager.draw(this.ctx);
        // Draw particle effects above factory
        this.ParticleManager.draw(this.ctx);

        // cursor & placement preview
        const pos = this.input.getPos();
        const gridX = Math.floor(pos.x / window.innerHeight * 9);
        const gridY = Math.floor(pos.y / window.innerHeight * 9);
        const size = window.innerHeight / 9;

        // determine selected slot/type/rotation from LevelManager
        let selectedType = null;
        let selectedRot = 0;
        let selectedSlotRemaining = 0;
        if (this.LevelManager && this.LevelManager.selectedIndex >= 0) {
            const slot = this.LevelManager.slots[this.LevelManager.selectedIndex];
            if (slot) {
                selectedType = slot.dataset.machineType;
                // fallback: if machineType missing, derive from variants/variantIndex
                if (!selectedType && slot.dataset.variants) {
                    try {
                        const variants = JSON.parse(slot.dataset.variants || '[]');
                        const vi = parseInt(slot.dataset.variantIndex || '0', 10) || 0;
                        selectedType = variants[vi] || variants[0] || null;
                    } catch (err) {
                        selectedType = null;
                    }
                }
                selectedRot = parseInt(slot.dataset.rot || '0', 10) || 0;
                // query pooled remaining for this slot (if available)
                if (this.LevelManager.getSlotRemaining) selectedSlotRemaining = this.LevelManager.getSlotRemaining(this.LevelManager.selectedIndex);
            }
        }

        const now = performance.now();
        // slow fade-blink: half speed (period doubled)
        const period = 2400; // was 1200
        const pulse = 0.5 * (1 + Math.sin((now % period) / period * Math.PI * 2)); // 0..1
        // half the alpha range: previous ~0.35..0.6 -> now ~0.175..0.325
        const alpha = 0.175 + 0.125 * pulse; // ~0.175..0.325

        // stroke width = 1/16th of a tile, inset so stroke fits exactly inside tile
        const lw = size / 16;
        const inset = lw / 2;
        // detect if there's already a machine at the hovered cell
        let hasMachine = false;
        if (gridX >= 0 && gridY >= 0 && gridX < this.FactoryManager.grid.length && gridY < (this.FactoryManager.grid[0]?.length||0)) {
            hasMachine = !!this.FactoryManager.grid[gridX][gridY];
        }

        if (!selectedType) {
            // no selection: simple white cursor (half-alpha)
            this.ctx.strokeStyle = '#FFFFFF80';
            this.ctx.lineWidth = lw;
            this.ctx.strokeRect(gridX * size + inset, gridY * size + inset, size - lw, size - lw);
        } else if (selectedType === 'delete') {
        // delete preview: red pulsing outline
        this.ctx.save();
        this.ctx.strokeStyle = setChannel('#FF0000FF', 'a', Math.min(0.95, 0.25 + 0.25 * pulse), 'string');
        this.ctx.lineWidth = lw;
        this.ctx.strokeRect(gridX * size + inset, gridY * size + inset, size - lw, size - lw);
        this.ctx.restore();
        } else {
            // If the world already has a machine at this tile, skip drawing the sprite preview
            if (hasMachine) {
                // draw only placement outline (half-alpha, pixel-perfect)
                this.ctx.save();
                this.ctx.strokeStyle = setChannel('#FFFFFFFF', 'a', 0.5, 'string');
                this.ctx.lineWidth = lw; // match pixel-perfect stroke
                this.ctx.strokeRect(gridX * size + inset, gridY * size + inset, size - lw, size - lw);
                this.ctx.restore();
            } else {
                // If the selected slot has no remaining placements, don't draw sprite preview; show orange outline
                if (selectedSlotRemaining <= 0) {
                    this.ctx.save();
                    this.ctx.strokeStyle = setChannel('#FFA500FF', 'a', 0.9, 'string');
                    this.ctx.lineWidth = lw;
                    this.ctx.strokeRect(gridX * size + inset, gridY * size + inset, size - lw, size - lw);
                    this.ctx.restore();
                } else {
                    // draw machine preview (sprite) centered in grid cell, respecting rotation and pulse alpha
                    const img = this.assetManager.get('machines-image');
                    const md = this.dataManager.getData('machineData') || {};
                    const data = md[selectedType] || {};
                    const row = (data.texture && data.texture.row) || 0;
                    const tw = 16, th = 16;
                    const cols = img ? Math.max(1, Math.floor(img.width / tw)) : 1;
                    const tileIndex = row * cols;
                    const fps = (data.texture && data.texture.fps) || 1;
                    const frame = Math.floor((now * fps) / 1000) % cols;
                    const sx = frame * tw;
                    const sy = Math.floor(tileIndex / cols) * th;

                    const cx = gridX * size + size / 2;
                    const cy = gridY * size + size / 2;
                    // golden-ratio fit ~0.618 (shrink by ~38%)
                    const scale = 0.618;
                    const dw = size * scale;
                    const dh = size * scale;

                    this.ctx.save();
                    this.ctx.translate(cx, cy);
                    this.ctx.rotate((selectedRot * Math.PI) / 180);
                    this.ctx.globalAlpha = alpha;
                    if (img) {
                        // draw sprite scaled to golden-ratio fit and centered
                        this.ctx.drawImage(img, sx, sy, tw, th, -dw / 2, -dh / 2, dw, dh);
                    } else {
                        // fallback rectangle (also shrunk)
                        this.ctx.fillStyle = setChannel('#FFFFFFFF', 'a', alpha, 'string');
                        this.ctx.fillRect(-dw / 2, -dh / 2, dw, dh);
                    }
                    this.ctx.restore();
                    // outline to make placement clear (half-alpha)
                    this.ctx.save();
                    this.ctx.strokeStyle = setChannel('#FFFFFFFF', 'a', 0.5, 'string');
                    this.ctx.lineWidth = lw; // match pixel-perfect stroke
                    this.ctx.strokeRect(gridX * size + inset, gridY * size + inset, size - lw, size - lw);
                    this.ctx.restore();
                }
            }
        }
    }
}

// Initialize program
const program = new Program();
program.preloadAssets();