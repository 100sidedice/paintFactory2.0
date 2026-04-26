export function applyMovement(isColliding, item, speed = 0, rot = 0) {
    if (!isColliding || !item) return false;
    const r = (rot || 0) * Math.PI / 180;
    const dirX = Math.sin(r);
    const dirY = -Math.cos(r);
    item.vx = dirX * speed;
    item.vy = dirY * speed;
    return true;
}

export default applyMovement;
