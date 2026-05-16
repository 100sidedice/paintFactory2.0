import MachineBase from './Machine.js';
import { isItemColliding } from './components/collision.js';
import { applyMovement } from './components/movement.js';
import { intHex, addHex32 } from '../src/Helpers/colorHelpers.js';
import { createCanvas, getImageId, getCanvasId, hexToRgba, getMaskedLayer } from './components/masking.js';

const PORTAL_MASK = 0x000000FF;
const DEFAULT_PORTAL_COLOR = 0x000000FF;
const OUTPUT_CENTER_COLOR = 0xFF00FFFF; // magenta
const COLOR_HOLD_MS = 1100;

export default class portal extends MachineBase {
    constructor(name, machineData, manager) {
        super(name, machineData, manager);
        this._count = 0;
        this._colorContributions = [];
        this.color = intHex(machineData?.color ?? DEFAULT_PORTAL_COLOR);
        // expose default portal color for external clearing
        this.DEFAULT_COLOR = intHex(DEFAULT_PORTAL_COLOR) >>> 0;
        this.corrupted = false; // whether this portal is currently corrupted (black) or not, used for visual effects and to determine if it should teleport or not
        this.spreadTime = 0; // last time we had a corruption flicker
        this.nextSpread = 1; // when the next corruption flicker should happen
    }

    update(delta) {
        if(this.corrupted){
            if(this.spreadTime >= this.nextSpread*1.2){
                this.spreadTime = 0;
                this.nextSpread = 100 + Math.random() * 200; // randomize next flicker time a bit
            }
            this.spreadTime += delta; // we do this after so that draw can flicker - if it was before it would never get a chance to draw the flicker before resetting the timer
        }else{
            this.spreadTime = 0;
            this.nextSpread = 1; // must be above at first 
        }
        super.update(delta);
        this._tickPortalColor(delta);
    }

    _tickPortalColor(delta) {
        if (!this._colorContributions.length) {
            this.color = DEFAULT_PORTAL_COLOR;
            this.data.color = this.color;
            return;
        }

        for (let i = this._colorContributions.length - 1; i >= 0; i--) {
            this._colorContributions[i].timeLeft -= delta;
            if (this._colorContributions[i].timeLeft <= 0) this._colorContributions.splice(i, 1);
        }

        if (!this._colorContributions.length) {
            this.color = DEFAULT_PORTAL_COLOR;
            this.data.color = this.color;
            return;
        }

        const mixed = addHex32(...this._colorContributions.map((entry) => entry.color));
        this.color = intHex(mixed);
        this.data.color = this.color;
    }

    _absorbPortalColor(itemColor) {
        this._colorContributions.push({ color: intHex(itemColor), timeLeft: COLOR_HOLD_MS });
        const mixed = addHex32(...this._colorContributions.map((entry) => entry.color));
        this.color = intHex(mixed);
        this.data.color = this.color;
    }

    _isUncoloredPortal() {
        const c = intHex(this.color) >>> 0;
        const r = (c >>> 24) & 0xFF;
        const g = (c >>> 16) & 0xFF;
        const b = (c >>> 8) & 0xFF;
        return (r === 0 && g === 0 && b === 0);
    }

    _handleColorInputCollisions(item, size) {
        const collisions = [this.data.collisionInA, this.data.collisionInB, this.data.collisionInC];
        for (const collision of collisions) {
            if (!collision) continue;
            const colliding = isItemColliding(this.data.x, this.data.y, item, size, collision, this.data.rot);
            if (!colliding) continue;
            this._absorbPortalColor(item.color);
            this.manager.removeItem(item);
            return true;
        }
        return false;
    }

    _handleConveyorCollision(item, size) {
        const collision = this.data.collisionConveyor;
        if (!collision) return false;
        const colliding = isItemColliding(this.data.x, this.data.y, item, size, collision, this.data.rot);
        if (!colliding) return false;
        const speed = this.manager.DataManager.config.defaultSaveData.upgrades.conveyor.speed;
        const flippedRot = ((this.data.rot || 0) + 180) % 360;
        applyMovement(true, item, speed, flippedRot);
        return true;
    }

    onItemCollision(item, size) {
        if (this._handleColorInputCollisions(item, size)) return;
        this._handleConveyorCollision(item, size);
    }

    _getFrameIndex(frameLimit, fps) {
        const frame = Math.floor((performance.now() * fps) / 1000) % frameLimit;
        return frame;
    }

    draw(ctx, x, y, size = 16) {
        const img = (this.manager.paused || this.spreadTime >= this.nextSpread)
            ? this.manager?.AssetManager?.get('machines-image-grayed')
            : this.manager?.AssetManager?.get('machines-image');
        if (!img) {
            super.draw(ctx, x, y, size);
            return;
        }

        const row = this.data.texture?.row ?? 0;
        const tw = 16;
        const th = 16;
        let cols = Math.max(1, Math.floor(img.width / tw));
        if (this.manager.paused || this.spreadTime >= this.nextSpread) cols = 1;
        const tileIndex = row * cols;
        const frameCount = Math.max(1, this.data.texture?.frameCount ?? cols);
        const frameLimit = this.manager.paused ? 1 : Math.min(cols, frameCount);
        const fps = this.data.texture?.fps ?? 8;
        const frame = this._getFrameIndex(frameLimit, fps);
        const sx = frame * tw;
        const sy = Math.floor(tileIndex / cols) * th;

        const portalColor = intHex(this.color ?? DEFAULT_PORTAL_COLOR);
        const tileCanvas = getPortalTile(img, sx, sy, tw, th, portalColor, PORTAL_MASK);

        if (!this.rotating) {
            ctx.drawImage(tileCanvas, 0, 0, tw, th, x * size - size / 2, y * size - size / 2, size, size);
        } else {
            ctx.save();
            ctx.translate(x * size, y * size);
            if (this.data.rot === 0 && this.rotating === -1) {
                ctx.rotate((this.extraRotation - this.rotating * Math.PI / 2) + 2 * Math.PI);
            } else {
                ctx.rotate((this.extraRotation - this.rotating * Math.PI / 2));
            }
            ctx.drawImage(tileCanvas, 0, 0, tw, th, -size / 2, -size / 2, size, size);
            ctx.restore();
        }
    }
}

const _portalTileCache = new Map();
const _portalFrameCache = new Map();
const _portalGradientFillCache = new Map();
// createCanvas, getImageId, getCanvasId, hexToRgba and getMaskedLayer
// are provided by Machines/components/masking.js

function clampByte(n) {
    return Math.max(0, Math.min(255, Math.round(n || 0)));
}

function rgbaCss(r, g, b, aByte) {
    const a = Math.max(0, Math.min(1, (aByte ?? 255) / 255));
    return `rgba(${clampByte(r)}, ${clampByte(g)}, ${clampByte(b)}, ${a})`;
}



function getPortalFrameData(img, sx, sy, tw, th, portalMaskColor = PORTAL_MASK) {
    const frameKey = `${getImageId(img)}|${sx},${sy},${tw},${th}|pm:${intHex(portalMaskColor)}`;
    if (_portalFrameCache.has(frameKey)) return _portalFrameCache.get(frameKey);

    const { canvas: frameCanvas, ctx: frameCtx } = createCanvas(tw, th);
    frameCtx.clearRect(0, 0, tw, th);
    frameCtx.drawImage(img, sx, sy, tw, th, 0, 0, tw, th);

    const { canvas: portalMaskCanvas, ctx: portalMaskCtx } = createCanvas(tw, th);

    const maskPortal = hexToRgba(portalMaskColor);

    try {
        const idata = frameCtx.getImageData(0, 0, tw, th);
        const src = idata.data;

        const portalMaskData = portalMaskCtx.createImageData(tw, th);

        const p = portalMaskData.data;

        for (let i = 0; i < src.length; i += 4) {
            const isPortal = (
                src[i] === maskPortal[0] &&
                src[i + 1] === maskPortal[1] &&
                src[i + 2] === maskPortal[2] &&
                src[i + 3] === maskPortal[3]
            );

            if (isPortal) {
                p[i] = 255;
                p[i + 1] = 255;
                p[i + 2] = 255;
                p[i + 3] = 255;
            }
        }

        portalMaskCtx.putImageData(portalMaskData, 0, 0);
    } catch (e) {
        // ignore tainted canvas and keep empty mask
    }

    const out = { frameCanvas, portalMaskCanvas };
    _portalFrameCache.set(frameKey, out);
    return out;
}

function getSteppedGradientFillCanvas(tw, th, portalColor) {
    const colorKey = intHex(portalColor) >>> 0;
    const key = `${tw}x${th}|${colorKey}`;
    if (_portalGradientFillCache.has(key)) return _portalGradientFillCache.get(key);

    const [r, g, b, a] = hexToRgba(colorKey);
    const { canvas, ctx } = createCanvas(tw, th);

    const cx = (tw - 1) / 2;
    const cy = (th - 1) / 2;
    const radius = Math.max(1, Math.hypot(cx, cy));
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);

    for (let i = 0; i <= 20; i++) {
        const t = i / 20; // 5% steps
        const intensity = 0.15 + (0.85 * t);
        grad.addColorStop(t, rgbaCss(r * intensity, g * intensity, b * intensity, a));
    }

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, tw, th);

    _portalGradientFillCache.set(key, canvas);
    return canvas;
}



// getMaskedLayer comes from masking component

function getPortalTile(img, sx, sy, tw, th, portalColor, portalMaskColor = PORTAL_MASK) {
    const id = `${getImageId(img)}|${sx},${sy},${tw},${th}|p:${(intHex(portalColor) >>> 0).toString(16)}`;
    if (_portalTileCache.has(id)) return _portalTileCache.get(id);

    const { frameCanvas, portalMaskCanvas } = getPortalFrameData(img, sx, sy, tw, th, portalMaskColor);
    const portalFill = getSteppedGradientFillCanvas(tw, th, portalColor);
    const portalLayer = getMaskedLayer(portalFill, portalMaskCanvas);

    const { canvas, ctx } = createCanvas(tw, th);
    ctx.clearRect(0, 0, tw, th);
    ctx.drawImage(frameCanvas, 0, 0);
    ctx.drawImage(portalLayer, 0, 0);

    _portalTileCache.set(id, canvas);
    return canvas;
}
