export function isItemColliding(mx, my, item, size, margins = {}, rot = 0) {
    // Normalize margins object to [top,right,bottom,left]
    const m = {
        top: margins.top ?? margins.t ?? 0,
        right: margins.right ?? margins.r ?? 0,
        bottom: margins.bottom ?? margins.b ?? 0,
        left: margins.left ?? margins.l ?? 0,
    };
    const arr = [m.top, m.right, m.bottom, m.left];
    const steps = (((rot || 0) / 90) % 4 + 4) % 4;
    const rotated = arr.map((_, i) => arr[(i - steps + 4) % 4]);
    const rt = rotated[0], rr = rotated[1], rb = rotated[2], rl = rotated[3];

    const left =   ( (mx || 0) + rl / 16) * size;
    const top =    ( (my || 0) + rt / 16) * size;
    const right =  ( (mx || 0) - rr / 16) * size + size;  
    const bottom = ( (my || 0) - rb / 16) * size + size;

    const itemPx = item.x * size;
    const itemPy = item.y * size;
    // Use half-open intervals [left, right) and [top, bottom) so adjacent tiles
    // don't both report collision when an item sits exactly on the border.
    // Add a small epsilon to reduce flicker from floating-point imprecision.
    const EPS = 1e-6;
    return (itemPx + EPS >= left && itemPx - EPS < right && itemPy + EPS >= top && itemPy - EPS < bottom);
}

export default isItemColliding;
