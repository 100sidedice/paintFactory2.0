import { resizeCanvas } from "../src/Helpers/randomHelpers.js";
import ParticleManager from "../src/Managers/ParticleManager.js";

resizeCanvas('Draw');
window.addEventListener('resize', () => resizeCanvas('Draw'));

const canvas = document.getElementById('Draw');
const ctx = canvas.getContext('2d');
const particleManager = new ParticleManager();

let lastTime = performance.now();
let spawnTimer = 0;
const spawnInterval = 180; // more frequent bursts

function loop() {
    const now = performance.now();
    const delta = Math.min(100, now - lastTime);
    lastTime = now;
    update(delta);
    draw();
    requestAnimationFrame(loop);
}

function update(delta) {
    particleManager.update(delta);
    spawnTimer -= delta;
    if (spawnTimer <= 0) {
        // spawn vibrant confetti from the top half of the screen
        const w = canvas.width;
        const burstX = Math.random() * w;
        // vibrant palette (more saturated / bright)
        const vibrant = [0xFF1A1AFF, 0xFFB400FF, 0xFFD700FF, 0x00FF8CFF, 0x00E5FFFF, 0xFF6A00FF, 0xFF66EEFF];
        particleManager.spawnAt(burstX, -10, { count: 18, speed: 420, life: 2200, colors: vibrant, gravityStrength: 900, size: 12, lifetimeNoise: 0.35, speedNoise: 0.4 });
        spawnTimer = spawnInterval + Math.random() * 220;
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particleManager.draw(ctx);
}

// Start a few initial bursts so the screen looks celebratory immediately
for (let i = 0; i < 4; i++) {
    const x = Math.random() * (canvas.width || window.innerWidth);
    const vibrant = [0xFF1A1AFF, 0xFFB400FF, 0xFFD700FF, 0x00FF8CFF, 0x00E5FFFF, 0xFF6A00FF, 0xFF66EEFF];
    particleManager.spawnAt(x, -20 - Math.random() * 60, { count: 26, speed: 480, life: 2400, colors: vibrant, gravityStrength: 1000, size: 14 });
}

loop();
