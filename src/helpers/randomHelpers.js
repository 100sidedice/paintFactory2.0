// create a function in which resizes the canvas to full screen
export function resizeCanvas() {
    const canvas = document.getElementById('Draw');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}