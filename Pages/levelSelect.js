import { resizeCanvas } from "../src/Helpers/randomHelpers.js";
import ParticleManager from "../src/Managers/ParticleManager.js";

resizeCanvas('Draw');
window.addEventListener('resize', () => resizeCanvas('Draw'));

const canvas = document.getElementById('Draw');
const ctx = canvas.getContext('2d');

const particleManager = new ParticleManager();

let lastTime = performance.now();
let spawnTimer = 0;
const spawnInterval = 350; // ms between spawns

function update(delta) {
	particleManager.update(delta);
	spawnTimer -= delta;
	if (spawnTimer <= 0) {
		// spawn a small burst from above at random x
		particleManager.spawnAt(canvas.width * Math.random(), -80 - Math.random() * 160, { count: 4, speed: 200, life: 9000 + Math.random()*3000, colors: [0xFF8844FF,0x55FF55FF,0x8888FFFF], gravityStrength: 300, size: 6 });
		spawnTimer = spawnInterval + Math.random() * 200;
	}
}

function draw() {
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	particleManager.draw(ctx);
}

function loop() {
	const now = performance.now();
	const delta = Math.min(100, now - lastTime);
	lastTime = now;
	update(delta);
	draw();
	requestAnimationFrame(loop);
}

loop();

// Toggle grabbing cursor when pressing level buttons (delegated)
(function(){
	const onDown = (e) => {
		const btn = e.target && e.target.closest ? e.target.closest('#levels button') : null;
		if (btn) {
			document.body.classList.add('is-grabbing');
			btn.classList.add('grabbing');
		}
	};
	const onUp = (e) => {
		document.body.classList.remove('is-grabbing');
		document.querySelectorAll('#levels button.grabbing').forEach(b => b.classList.remove('grabbing'));
	};
	document.addEventListener('pointerdown', onDown);
	window.addEventListener('pointerup', onUp);
	window.addEventListener('pointercancel', onUp);
	window.addEventListener('blur', onUp);
})();