
import { intHex } from './colorHelpers.js';
/**
 * Draws a square region (tile) from a tilesheet onto a canvas.
 * @param {CanvasRenderingContext2D} ctx - Canvas rendering context to draw into.
 * @param {CanvasImageSource} image - Source image or canvas containing the tilesheet.
 * @param {number} slicePx - Size in pixels of one tile (assumes square tiles).
 * @param {number} tileX - Tile X index (0-based) within the sheet.
 * @param {number} tileY - Tile Y index (0-based) within the sheet.
 * @param {number} [destX=0] - Destination top-left X on the canvas.
 * @param {number} [destY=0] - Destination top-left Y on the canvas.
 * @param {number} [rotation=0] - Rotation in radians applied around tile center.
 * @param {number} [scale=1] - Scale factor for destination size.
 * @returns {void}
 * @example drawTile(ctx, tilesheetImg, 32, 1, 2, 100, 50, Math.PI/2, 1);
 */

export function drawTile(ctx, image, slicePx, tileX, tileY, destX = 0, destY = 0, rotation = 0, scale = 1) {
    const sx = tileX * slicePx;
    const sy = tileY * slicePx;
    const sw = slicePx;
    const sh = slicePx;
    const dw = Math.round(slicePx * scale);
    const dh = Math.round(slicePx * scale);

    ctx.save();
    // Translate to the center of destination to rotate around center
    ctx.translate(destX + dw / 2, destY + dh / 2);
    if (rotation) ctx.rotate(rotation);
    // drawImage with destination centered at origin
    ctx.drawImage(image, sx, sy, sw, sh, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
}

/**
 * Recolor a mask tile (replace pixels matching `maskColor` with `newColor`),
 * then overlay a base tile on top and return the resulting canvas.
 * All colors are int-32 hex (0xRRGGBBAA ONLY).
 * @param {CanvasImageSource} image - Source tilesheet image
 * @param {number} sliceSize - Tile size in pixels (assumes square tiles)
 * @param {[number,number]} baseImg - [tileX, tileY] of the base image frame
 * @param {[number,number]} maskImg - [tileX, tileY] of the mask frame
 * @param {number} newColor - New color for mask (int hex)
 * @param {number} maskColor - Color in mask to replace (int hex)
 * @returns {HTMLCanvasElement} canvas containing the composed result
 */
export function composeMaskedFrame(image, sliceSize, baseImg, maskImg, newColor, maskColor) {
    const s = sliceSize || 16;
    const canvas = document.createElement('canvas');
    canvas.width = s; canvas.height = s;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    const newC = hexToRgba(newColor);
    const maskC = hexToRgba(maskColor);

    // draw mask frame first
    // Convert a 32-bit hex (or CSS hex string) to an [r,g,b,a] byte array (0-255)
    function hexToRgba(hex32) {
        const v = intHex(hex32) >>> 0;
        const r = (v >>> 24) & 0xFF;
        const g = (v >>> 16) & 0xFF;
        const b = (v >>> 8) & 0xFF;
        const a = v & 0xFF;
        return [r, g, b, a];
    }
    const mx = (maskImg && maskImg[0])|0;
    const my = (maskImg && maskImg[1])|0;
    ctx.clearRect(0,0,s,s);
    ctx.drawImage(image, mx*s, my*s, s, s, 0, 0, s, s);

    // replace maskColor -> newColor in image data
    const id = ctx.getImageData(0,0,s,s);
    const data = id.data;
    for (let i=0;i<data.length;i+=4) {
        if (data[i] === maskC[0] && data[i+1] === maskC[1] && data[i+2] === maskC[2] && data[i+3] === maskC[3]) {
            data[i] = newC[0]; data[i+1] = newC[1]; data[i+2] = newC[2]; data[i+3] = newC[3];
        }
    }
    ctx.putImageData(id,0,0);

    // draw base frame on top
    const bx = (baseImg && baseImg[0])|0;
    const by = (baseImg && baseImg[1])|0;
    ctx.drawImage(image, bx*s, by*s, s, s, 0, 0, s, s);

    return canvas;
}


// alias for clarity
export const drawSlice = drawTile;

/**
 * Draw a simple Tiled-style tilemap.
 * Groups drawing by tileset image so all tiles using the same tileset
 * are drawn together per layer.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} map - Tiled JSON map object (tilewidth/tileheight, layers[], tilesets[]).
 * @param {number} [destX=0] - X offset to draw the map.
 * @param {number} [destY=0] - Y offset to draw the map.
 * @param {number} [scale=1] - Global scale for drawing tiles.
 * @returns {void}
 */
export function drawTilemap(ctx, map, destX = 0, destY = 0, scale = 1) {
    if (!map || !Array.isArray(map.layers)) return;
    const tileW = map.tilewidth || map.tileWidth || 0;
    const tileH = map.tileheight || map.tileHeight || tileW;

    // Precompute tileset ranges and helper info
    const tilesets = (map.tilesets || []).map(ts => {
        const firstgid = ts.firstgid || 1;
        const img = ts._image || ts.image;
        const imgPath = ts._imagePath || ts.image;
        const columns = ts.columns || (ts.imagewidth ? Math.floor(ts.imagewidth / ts.tilewidth) : 0);
        return { ts, firstgid, img, imgPath, columns, tilewidth: ts.tilewidth || tileW, tileheight: ts.tileheight || tileH };
    });

    for (const layer of map.layers) {
        if (!layer || layer.type !== 'tilelayer' || !(layer.data)) continue;
        const width = layer.width || map.width;
        const height = layer.height || map.height;

        // For each tileset, draw all tiles that come from it for this layer
        for (const tinfo of tilesets) {
            const img = tinfo.img;
            if (!img) continue;
            const cols = tinfo.columns || Math.max(1, Math.floor(img.width / tinfo.tilewidth));

            for (let idx = 0; idx < layer.data.length; idx++) {
                const gid = layer.data[idx];
                if (!gid) continue; // empty tile
                // check if gid belongs to this tileset
                const localId = gid - tinfo.firstgid;
                if (localId < 0) continue;
                // ensure gid doesn't belong to a later tileset
                const nextTs = tilesets.find(ts2 => ts2.firstgid > tinfo.firstgid);
                if (nextTs && gid >= nextTs.firstgid) continue;

                const x = idx % width;
                const y = Math.floor(idx / width);
                const sx = (localId % cols) * tinfo.tilewidth;
                const sy = Math.floor(localId / cols) * tinfo.tilewidth;
                const dx = destX + x * tileW * scale;
                const dy = destY + y * tileH * scale;
                // draw directly using drawImage for performance
                const dw = Math.round(tinfo.tilewidth * scale);
                const dh = Math.round(tinfo.tileheight * scale);
                ctx.drawImage(img, sx, sy, tinfo.tilewidth, tinfo.tileheight, dx, dy, dw, dh);
            }
        }
    }
}


