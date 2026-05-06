import MachineBase from './Machine.js';
import Item from '../src/World/Item.js';
import { isItemColliding } from './components/collision.js';
import { applyMovement } from './components/movement.js';
import { stringHex, intHex, addHex32 } from '../src/Helpers/colorHelpers.js';

export default class mixer extends MachineBase {
    constructor(name, machineData, manager) {
        super(name, machineData, manager);
        this._acc = 0;
        this._count = 0;
        this.leftQueue = [];
        this.rightQueue = [];
        // base interval in ms (can be overridden by machine data)
        this.baseInterval = 1000;
        this.color = 0x1C1C1CFF;
        // time since last absorbed item (ms). when >3000, start depleting queues.
        this._timeSinceLastAbsorb = 0;
        // accumulator for per-second depletion ticks when idle
        this._depleteAcc = 0;

        this.splitting = false;
        this.splitTime = 0;
        this.splitTimeMax = 1000; // ms until return to normal logic
        this._splitColors = null; // { r: int32, g: int32, b: int32 } while splitting
    }
    _mixColors(color1, color2) {
        // Special case: black + anything = half the color
        const isBlack = (c) => (intHex(c) & 0xFFFFFF00) === 0x00000000; // RGB channels are zero
        
        if (isBlack(color1)) {
            return this._halveColor(color2);
        }
        if (isBlack(color2)) {
            return this._halveColor(color1);
        }
        // Normal mixing: additive color
        return addHex32(color1, color2);
    }

    _halveColor(color) {
        const v = intHex(color) >>> 0;
        const r = ((v >>> 24) & 0xFF) >> 1;
        const g = ((v >>> 16) & 0xFF) >> 1;
        const b = ((v >>> 8) & 0xFF) >> 1;
        const a = v & 0xFF;
        return (((r & 0xFF) << 24) | ((g & 0xFF) << 16) | ((b & 0xFF) << 8) | (a & 0xFF)) >>> 0;
    }

    spawnItem(offsetX, offsetY, color=0xFFFFFFFF){
        const cfg = this.manager?.DataManager?.config || {};
        const max = parseInt(cfg.maxItems, 10) || 200;
        const current = Object.values(this.manager.items || {}).filter(Boolean).length;
        if (current >= max) return;
        
        // Rotate offset vector based on machine rotation
        const rot = (this.data.rot || 0) * Math.PI / 180; // convert degrees to radians
        const rotX = offsetX * Math.cos(rot) - offsetY * Math.sin(rot);
        const rotY = offsetX * Math.sin(rot) + offsetY * Math.cos(rot);
        
        const x = this.data.x;
        const y = this.data.y;
        const id = `item_${Math.random().toString(36).substr(2,9)}_${Date.now()}`;
        const item = new Item(id, x + 0.5 + rotX/16, y + 0.5 + rotY/16, color, this.manager);
        this.manager.items[id] = item;
    }

    update(delta) {
        super.update(delta);
        if(this.splitting){
            this.splitTime -= delta;
            if(this.splitTime <= 0){
                this.splitting = false;
                this.splitTime = 0;
                this._splitColors = null;
            }
            return; // while splitting, skip normal mixing and absorption logic
        }
        // track idle time since last absorb (only resets when new items are absorbed)
        this._timeSinceLastAbsorb += delta;
        if (this._timeSinceLastAbsorb > 3000) {
            this._depleteAcc += delta;
            if (this._depleteAcc >= 1000) {
                this._depleteAcc -= 1000;
                if (this.leftQueue.length > 0) this.leftQueue.shift();
                if (this.rightQueue.length > 0) this.rightQueue.shift();
            }
        } else {
            this._depleteAcc = 0;
        }
        // determine effective interval based on upgrades (higher mixRate -> faster mixing)
        const cfg = this.manager.DataManager.config;
        const mixRate = cfg.defaultSaveData.upgrades.mixer.mixRate;

        this._acc += delta;
        const effectiveInterval = Math.max(16, this.baseInterval / Math.max(1, mixRate));
        // When interval elapses: first produce mixed item if possible, then attempt to absorb nearby items
        if (this.leftQueue.length > 0 && this.rightQueue.length > 0) {
            this.color = this._mixColors(this.leftQueue[0], this.rightQueue[0]);
        }
        if (this._acc >= effectiveInterval) {
            this._acc -= effectiveInterval;
            // produce mixed output if both queues have at least one item
            if (this.leftQueue.length > 0 && this.rightQueue.length > 0) {
                const c1 = this.leftQueue.shift();
                const c2 = this.rightQueue.shift();
                const mixed = this._mixColors(c1, c2);
                this.spawnItem(0, -0.2, mixed);
            }
            // Note: absorption is handled via `onItemCollision` only — do not scan all items here.
        }

        // if both queues are empty, reset display color to default
        if (this.leftQueue.length === 0 && this.rightQueue.length === 0) {
            this.color = 0x353535FF;
        }
    }
    

    onItemCollision(item, size) {
        // Prefer immediate absorption on collision to keep queues responsive.
        // If item sits in the up-collider, move it upward like a conveyor output.
        const capacity = this.manager.DataManager.config.defaultSaveData.upgrades.mixer.capacity;
        // up / output
        const colUp = this.data.collisionUp;
        const colDown = this.data.collisionDown;
        if (isItemColliding(this.data.x, this.data.y, item, size, colUp, this.data.rot)) {
            const speed = this.manager.DataManager.config.defaultSaveData.upgrades.conveyor.speed;
            applyMovement(true, item, speed, this.data.rot);
            return;
        }
        if (isItemColliding(this.data.x, this.data.y, item, size, colDown, this.data.rot)) {
            this.splitTime = this.splitTimeMax;
            this.splitting = true;
            const splitColor = item.color;

            // remove the original input item
            this.manager.removeItem(item);

            // extract R/G/B channels from the 32-bit color (RRGGBBAA)
            const v = intHex(splitColor) >>> 0;
            const r = (v >>> 24) & 0xFF;
            const g = (v >>> 16) & 0xFF;
            const b = (v >>> 8) & 0xFF;
            const a = v & 0xFF;

            // build three colors: black + specific channel (preserve alpha)
            const rCol = (((r & 0xFF) << 24) | (0 << 16) | (0 << 8) | (a & 0xFF)) >>> 0;
            const gCol = (((0) << 24) | ((g & 0xFF) << 16) | (0 << 8) | (a & 0xFF)) >>> 0;
            const bCol = (((0) << 24) | (0 << 16) | ((b & 0xFF) << 8) | (a & 0xFF)) >>> 0;

            // remember split mask colors while splitting so draw() can use them
            this._splitColors = { r: rCol, g: gCol, b: bCol };
            // also set primary display color to green channel while splitting
            this.color = gCol;

            const x = this.data.x;
            const y = this.data.y;
            // spawn items only for non-zero channels (avoid spawning 'black' dyes)
            // compute rotated offsets so spawn positions respect machine rotation
            const cx = x + 0.5;
            const cy = y + 0.5;
            
            // offsets in tile units: left (-0.2,0), up (0,-0.2), right (0.2,0)
            
            if (r > 0) {
                this.spawnItem(-2, 0, rCol);
            }
            if (g > 0) {
                this.spawnItem(0, -2, gCol);
            }
            if (b > 0) {
                this.spawnItem(2, 0, bCol);
            }

            return;
        }
        if(this.splitting) {
            // While splitting, left & right colliders act like conveyors facing away from the machine
            const speed = this.manager.DataManager.config.defaultSaveData.upgrades.conveyor.speed;
            const colLeft = this.data.collisionLeft;
            const colRight = this.data.collisionRight;
            // left -> face machine rotation minus 90 degrees
            if (isItemColliding(this.data.x, this.data.y, item, size, colLeft, this.data.rot)) {
                const leftRot = ((this.data.rot || 0) - 90 + 360) % 360;
                applyMovement(true, item, speed, leftRot);
                return;
            }
            // right -> face machine rotation plus 90 degrees
            if (isItemColliding(this.data.x, this.data.y, item, size, colRight, this.data.rot)) {
                const rightRot = ((this.data.rot || 0) + 90 + 360) % 360;
                applyMovement(true, item, speed, rightRot);
                return;
            }
            return;
        } // stop absorbing new items while splitting (splitting overrides mixing)

        // left
        const colLeft = this.data.collisionLeft;
        if (this.leftQueue.length < capacity && isItemColliding(this.data.x, this.data.y, item, size, colLeft, this.data.rot)) {
            const n = item.color;
            this.leftQueue.push(n);
            // reset idle timer when a new item is absorbed
            this._timeSinceLastAbsorb = 0;
            this._depleteAcc = 0;
            this.manager.removeItem(item);
            return;
        }

        // right
        const colRight = this.data.collisionRight;
        if (this.rightQueue.length < capacity && isItemColliding(this.data.x, this.data.y, item, size, colRight, this.data.rot)) {
            const n = item.color;
            this.rightQueue.push(n);
            // reset idle timer when a new item is absorbed
            this._timeSinceLastAbsorb = 0;
            this._depleteAcc = 0;
            this.manager.removeItem(item);
            return;
        }
    }
    draw(ctx, x, y, size=16) {
        if (this.manager.paused) {
            var img = this.manager?.AssetManager?.get('machines-image-grayed');
        }else {
            var img = this.manager?.AssetManager?.get('machines-image');
        }
        if (!img) { super.draw(ctx, x, y, size); return; }

        const row = (this.data.texture.row);
        const tw = 16; const th = 16;
        let cols = Math.max(1, Math.floor(img.width / tw));
        if (this.manager.paused) cols = 1; // prevent animation when paused by forcing tile index to 0, since `tileIndex = row * cols` and row is always 0 or positive
        const tileIndex = row * cols; // assume one-tile-per-row layout
        // compute animated frame index; reverse order while splitting
        const fps = (this.data.texture && this.data.texture.fps) ? this.data.texture.fps : 8;
        const frameCount = Math.max(1, this.data.texture?.frameCount ?? cols);
        const frameLimit = this.manager.paused ? 1 : Math.min(cols, frameCount);
        let frameIndex = 0;
        if (frameLimit > 0) {
            frameIndex = Math.floor((performance.now() * fps) / 1000) % frameLimit;
            if (this.splitting) frameIndex = (frameLimit - 1) - frameIndex;
        }
        const sx = frameIndex * tw;
        const sy = Math.floor(tileIndex / cols) * th;
        // colorize mask pixels: main mask (0x1C1C1CFF) -> `this.color`,
        // left mask (0xFFFFFFFF) -> left input color, right mask (0x000000FF) -> right input color
        const mainMask = 0x1C1C1CFF;
        const leftMask = 0xFFFFFFFF;
        const rightMask = 0x000000FF;
        // while splitting, override the three mask colors with split channels
        let mainColor = this.color || 0xFFFFFFFF;
        let leftColor = (this.leftQueue && this.leftQueue.length > 0) ? this.leftQueue[0] : 0xFFFFFFFF;
        let rightColor = (this.rightQueue && this.rightQueue.length > 0) ? this.rightQueue[0] : 0x000000FF;
        if (this.splitting && this._splitColors) {
            mainColor = this._splitColors.g;
            leftColor = this._splitColors.r;
            rightColor = this._splitColors.b;
        }
        const tileCanvas = getColorizedTile(img, sx, sy, tw, th, mainColor, mainMask, leftColor, leftMask, rightColor, rightMask);
        // draw centered similar to base Machine
        if(!this.rotating){
            ctx.drawImage(tileCanvas, 0, 0, tw, th, x*size - size/2, y*size - size/2, size, size);
        } else {
            ctx.save();
            ctx.translate(x*size, y*size);
            // Apply an animated counter-rotation while the global canvas has already been rotated
            // by `machine.data.rot` in FactoryManager. `extraRotation` is in degrees, so convert to radians.
            if(this.data.rot === 0 && this.rotating === -1) {
                ctx.rotate((this.extraRotation - this.rotating * Math.PI/2)+2*Math.PI);
            } else {
                ctx.rotate((this.extraRotation - this.rotating * Math.PI/2));
            }
            ctx.drawImage(tileCanvas, 0, 0, tw, th, -size/2, -size/2, size, size);
            ctx.restore();
        }
    }
}

// Cache for colorized tiles: key -> HTMLCanvasElement
const _colorizedTileCache = new Map();

function getImageId(img) {
    if (!img) return 'img:null';
    if (img.src) return img.src;
    // fallback for canvases or other sources
    return `canvas:${img.width}x${img.height}`;
}

function hexToRgba(hex32) {
    const v = intHex(hex32) >>> 0;
    const r = (v >>> 24) & 0xFF;
    const g = (v >>> 16) & 0xFF;
    const b = (v >>> 8) & 0xFF;
    const a = v & 0xFF;
    return [r, g, b, a];
}

function getColorizedTile(img, sx, sy, tw, th, mainNewColor, mainMaskColor=0x353535FF, leftNewColor=0xFFFFFFFF, leftMaskColor=0xFFFFFFFF, rightNewColor=0x000000FF, rightMaskColor=0x000000FF) {
    const id = `${getImageId(img)}|${sx},${sy},${tw},${th}|m:${(intHex(mainNewColor)>>>0).toString(16)}|l:${(intHex(leftNewColor)>>>0).toString(16)}|r:${(intHex(rightNewColor)>>>0).toString(16)}`;
    if (_colorizedTileCache.has(id)) return _colorizedTileCache.get(id);

    const canvas = document.createElement('canvas');
    canvas.width = tw; canvas.height = th;
    const cctx = canvas.getContext('2d');
    cctx.imageSmoothingEnabled = false;
    // draw tile region onto temp canvas
    cctx.clearRect(0,0,tw,th);
    cctx.drawImage(img, sx, sy, tw, th, 0, 0, tw, th);

    const maskMain = hexToRgba(mainMaskColor);
    const newMain = hexToRgba(mainNewColor);
    const maskLeft = hexToRgba(leftMaskColor);
    const newLeft = hexToRgba(leftNewColor);
    const maskRight = hexToRgba(rightMaskColor);
    const newRight = hexToRgba(rightNewColor);
    try {
        const idata = cctx.getImageData(0,0,tw,th);
        const data = idata.data;
        for (let i=0;i<data.length;i+=4) {
            if (data[i] === maskMain[0] && data[i+1] === maskMain[1] && data[i+2] === maskMain[2] && data[i+3] === maskMain[3]) {
                data[i] = newMain[0]; data[i+1] = newMain[1]; data[i+2] = newMain[2]; data[i+3] = newMain[3];
            } else if (data[i] === maskLeft[0] && data[i+1] === maskLeft[1] && data[i+2] === maskLeft[2] && data[i+3] === maskLeft[3]) {
                data[i] = newLeft[0]; data[i+1] = newLeft[1]; data[i+2] = newLeft[2]; data[i+3] = newLeft[3];
            } else if (data[i] === maskRight[0] && data[i+1] === maskRight[1] && data[i+2] === maskRight[2] && data[i+3] === maskRight[3]) {
                data[i] = newRight[0]; data[i+1] = newRight[1]; data[i+2] = newRight[2]; data[i+3] = newRight[3];
            }
        }
        cctx.putImageData(idata,0,0);
    } catch (e) {
        // SecurityError if image is tainted; fail gracefully and just return original region drawn to canvas
    }

    _colorizedTileCache.set(id, canvas);
    return canvas;
}
/**
 * Rotate a point (dx,dy) by `rot` degrees clockwise, returning the rotated offsets.
 */
function rotOffset(dx, dy, rot=0) {
    const ang = rot * Math.PI / 180;
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    // standard rotation (counter-clockwise) applied to (dx,dy)
    const rx = dx * cos - dy * sin;
    const ry = dx * sin + dy * cos;
    return [rx, ry];
}