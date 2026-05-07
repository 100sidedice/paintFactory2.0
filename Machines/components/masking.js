import { intHex } from '../../src/Helpers/colorHelpers.js';

const _colorizedTileCache = new Map();
const _canvasIdMap = new WeakMap();
let _canvasIdCounter = 1;

export function getImageId(img) {
    if (!img) return 'img:null';
    if (img.src) return img.src;
    return `canvas:${img.width}x${img.height}`;
}

export function getCanvasId(canvas) {
    if (!canvas) return 'canvas:null';
    if (!_canvasIdMap.has(canvas)) {
        _canvasIdMap.set(canvas, `c${_canvasIdCounter++}`);
    }
    return _canvasIdMap.get(canvas);
}

export function createCanvas(w, h) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    return { canvas, ctx };
}

export function hexToRgba(hex32) {
    const v = intHex(hex32) >>> 0;
    const r = (v >>> 24) & 0xFF;
    const g = (v >>> 16) & 0xFF;
    const b = (v >>> 8) & 0xFF;
    const a = v & 0xFF;
    return [r, g, b, a];
}

export function getMaskedLayer(fillCanvas, maskCanvas) {
    const key = `${getCanvasId(fillCanvas)}|${getCanvasId(maskCanvas)}`;
    if (_colorizedTileCache.has(key)) return _colorizedTileCache.get(key);

    const { canvas, ctx } = createCanvas(fillCanvas.width, fillCanvas.height);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(fillCanvas, 0, 0);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(maskCanvas, 0, 0);
    ctx.globalCompositeOperation = 'source-over';

    _colorizedTileCache.set(key, canvas);
    return canvas;
}

// Generic colorization function that supports either a single mask or up to
// three mask/newColor pairs (used by mixers). It preserves a cache per
// resulting image key.
export function getColorizedTile(img, sx, sy, tw, th, ...args) {
    // Accept an arbitrary number of (newColor, maskColor) pairs.
    // Example calls:
    //   getColorizedTile(img, sx, sy, tw, th, newColor, maskColor)
    //   getColorizedTile(img, sx, sy, tw, th, n1, m1, n2, m2, n3, m3, ...)
    const pairs = [];
    for (let i = 0; i + 1 < args.length; i += 2) {
        pairs.push({ newC32: args[i], maskC32: args[i + 1] });
    }

    // Build cache key including all new/mask values so different combos cache separately
    const keyParts = [`${getImageId(img)}|${sx},${sy},${tw},${th}`];
    for (let i = 0; i < pairs.length; i++) {
        const n = (intHex(pairs[i].newC32) >>> 0).toString(16);
        const m = (intHex(pairs[i].maskC32) >>> 0).toString(16);
        keyParts.push(`n${i}:${n}`);
        keyParts.push(`m${i}:${m}`);
    }
    const id = keyParts.join('|');

    if (_colorizedTileCache.has(id)) return _colorizedTileCache.get(id);

    const canvas = document.createElement('canvas');
    canvas.width = tw; canvas.height = th;
    const cctx = canvas.getContext('2d');
    cctx.imageSmoothingEnabled = false;
    cctx.clearRect(0,0,tw,th);
    cctx.drawImage(img, sx, sy, tw, th, 0, 0, tw, th);

    if (pairs.length === 0) {
        _colorizedTileCache.set(id, canvas);
        return canvas;
    }

    // Precompute rgba arrays for masks and replacements
    const masks = pairs.map(p => hexToRgba(p.maskC32));
    const news = pairs.map(p => hexToRgba(p.newC32));

    try {
        const idata = cctx.getImageData(0,0,tw,th);
        const data = idata.data;
        for (let i = 0; i < data.length; i += 4) {
            for (let pi = 0; pi < masks.length; pi++) {
                const m = masks[pi];
                if (data[i] === m[0] && data[i+1] === m[1] && data[i+2] === m[2] && data[i+3] === m[3]) {
                    const r = news[pi];
                    data[i] = r[0]; data[i+1] = r[1]; data[i+2] = r[2]; data[i+3] = r[3];
                    break; // matched this pixel, move to next pixel
                }
            }
        }
        cctx.putImageData(idata,0,0);
    } catch (e) {
        // ignore tainted canvas
    }

    _colorizedTileCache.set(id, canvas);
    return canvas;
}
