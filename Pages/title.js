import { resizeCanvas } from "../src/Helpers/randomHelpers.js";
import ParticleManager from "../src/Managers/ParticleManager.js";
import AssetManager from "../src/Managers/AssetManager.js";
import DataManager from "../src/Managers/DataManager.js";
import FactoryManager from "../src/Managers/FactoryManager.js";
import { intHex } from "../src/Helpers/colorHelpers.js";

resizeCanvas('Draw');
window.addEventListener('resize', () => resizeCanvas('Draw'));

const canvas = document.getElementById('Draw');
const ctx = canvas.getContext('2d');
const particleManager = new ParticleManager();

let lastTime = performance.now();
let spawnTimer = 0;
const spawnInterval = 300;
const offset = { x: 5, y: 0 };
// Minimal input stub used by FactoryManager (only getPos used occasionally)
const inputStub = {
    getPos: () => ({ x: 0, y: 0 })
};

let factory = null;

// Title layout: two supported formats for convenience
// 1) Absolute mapping like level files: "Placed": { "4,5": { type:"conveyor", rot:0, color:0x... }, ... }
// 2) Relative array for easy copy/paste: "placedRelative": [ { x: -3, y: 0, type: 'spawner', rot:0 }, ... ]
// Edit this object to change the title screen factory. `placedRelative` is centered on the grid.
const titleLayout = {
    Placed: {
        "5.5": {
            "type": "spawner #FFFFFFFF",
            "rot": 90
        },
        "2.4": "seller",
        "3.4": {
            "type": "conveyor",
            "rot": 270
        },
        "4.1": "seller",
        "4.2": "conveyor",
        "4.3": "conveyor",
        "4.4": {
            "type": "mixer",
            "rot": 270
        },
        "4.5": {
            "type": "conveyor",
            "rot": 180
        },
        "4.6": {
            "type": "conveyor",
            "rot": 180
        },
        "4.7": "seller",
        "5.3": {
            "type": "spawner #FFFFFFFF",
            "rot": 90
        },
        "5.4": {
            "type": "spawner #FFFFFFFF",
            "rot": 270
        },
        
        "6.1": "conveyor-right",
        "6.2": "conveyor",
        "6.3": {
            "type": "mixer",
            "rot": 90
        },
        "6.4": {
            "type": "mixer",
            "rot": 90
        },
        "6.5": {
            "type": "mixer",
            "rot": 90
        },
        "6.6": {
            "type": "conveyor",
            "rot": 180
        },
        "6.7": {
            "type": "conveyor-left",
            "rot": 180
        },
        "7.1": {
            "type": "conveyor-right",
            "rot": 90
        },
        "7.2": {
            "type": "mixer",
            "rot": 90
        },
        "7.3": {
            "type": "conveyor-left",
            "rot": 90
        },
        "7.4": {
            "type": "conveyor",
            "rot": 90
        },
        "7.5": {
            "type": "conveyor-right",
            "rot": 90
        },
        "7.6": {
            "type": "mixer",
            "rot": 90
        },
        "7.7": {
            "type": "conveyor-left",
            "rot": 90
        },
        "8.2": {
            "type": "conveyor",
            "rot": 90
        },
        "8.4": {
            "type": "conveyor",
            "rot": 90
        },
        "8.6": {
            "type": "conveyor",
            "rot": 90
        },
        "9.1": "conveyor-right",
        "9.2": {
            "type": "conveyor-left",
            "rot": 90
        },
        "9.4": {
            "type": "conveyor",
            "rot": 90
        },
        "9.6": {
            "type": "conveyor",
            "rot": 90
        },
        "10.1": "seller",
        "10.2": "spawner #FFFFFFFF",
        "10.4": {
            "type": "conveyor",
            "rot": 90
        },
        "10.6": {
            "type": "conveyor-right",
            "rot": 90
        },
        "10.7": "seller",
        "11.4": {
            "type": "conveyor",
            "rot": 90
        },
        "12.4": "seller"
    }
};

async function initTitleBoard() {
    // We simplify asset loading as we want the title screen to load as fast as possible, so we just load whats needed.
    const assetManager = new AssetManager();
    await assetManager.quickLoad('./Data/config.json', 'config', true, 'json');
    const titleAssets = await assetManager.quickLoad('./Data/title-assets.json', 'TitleAssets', true, 'json');
    await assetManager.quickLoad('./Data/machines.json', 'machineData', true, 'json');
    for (const [key, asset] of Object.entries(titleAssets || {})) {
        await assetManager.quickLoad(asset.path, asset.name || key, true, asset.type, asset.extra);
    }
    const dataManager = new DataManager(assetManager);

    factory = new FactoryManager(dataManager, assetManager, particleManager, inputStub, { preview: true });

    const w = factory.grid.length;
    const h = factory.grid[0]?.length || 0;

    for (const [key, value] of Object.entries(titleLayout.Placed)) {
        const parts = key.split('.')
        const gx = Number(parts[0])+offset.x;
        const gy = Number(parts[1])+offset.y;
        // Normalize placement entry to object { type, rot, color, ... }
        let m = {};
        if (typeof value === 'string') {
            const partsStr = value.split(' ');
            m.type = partsStr[0];
            if (partsStr.length > 1) m.color = intHex(partsStr[1]);
        } else if (typeof value === 'object') {
            // If object.type contains an inline color (e.g. "spawner #FFFFFFFF"), split it out
            if (typeof value.type === 'string' && value.type.indexOf(' ') !== -1) {
                const tparts = value.type.split(' ');
                m.type = tparts[0];
                if(tparts.length > 1) m.color = intHex(tparts[1]);
            }
            m = Object.assign({}, value, m);
        }
        const resolvedType = (m.type || '').toString().trim();
        const inst = factory.addMachine(resolvedType, gx, gy, m.rot || 0);
        if (inst && m.color !== undefined && m.color !== null) { inst.data = inst.data || {}; inst.data.color = m.color; inst.color = m.color; }
        if (inst && m._acc !== undefined) inst._acc = m._acc;
        if (inst && m._count !== undefined) inst._count = m._count;
    }
}

initTitleBoard().catch(e => console.warn('Title init failed', e));

function loop() {
    const now = performance.now();
    const delta = Math.min(100, now - lastTime);
    lastTime = now;
    update(delta);
    draw();
    requestAnimationFrame(loop);
}

function update(delta){
    if (factory) factory.update(delta);
    particleManager.update(delta);
    spawnTimer -= delta;
    if(spawnTimer < 0){
        particleManager.spawnAt(canvas.width * Math.random(), -200, { count: 3, speed: 500, life: 20000, colors: [0x332222FF,0x223322FF, 0x222233FF, 0x332222FF], gravityStrength: 200, size: 10 });
        spawnTimer = spawnInterval;
    }
}

function draw(){
    ctx.fillStyle = '#00000000';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // draw factory (if ready) before particles so items appear above machines
    if (factory) factory.draw(ctx);
    particleManager.draw(ctx);
}

loop();