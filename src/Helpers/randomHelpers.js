// create a function in which resizes the canvas to full screen
export function resizeCanvas(canvasID = 'Draw') {
    const canvas = document.getElementById(canvasID);
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}