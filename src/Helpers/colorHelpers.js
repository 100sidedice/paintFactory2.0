/**
 * Color helpers operating on 32-bit integers (0xRRGGBB or 0xRRGGBBAA).
 */
export function hexToRgba(hex) {
    if (hex === undefined || hex === null) return [0,0,0,255];
    const h = Number(hex) >>> 0;
    if (h <= 0xFFFFFF) {
        const r = (h >> 16) & 0xFF;
        const g = (h >> 8) & 0xFF;
        const b = h & 0xFF;
        return [r, g, b, 255];
    }
    // interpret as RRGGBBAA
    const r = (h >> 24) & 0xFF;
    const g = (h >> 16) & 0xFF;
    const b = (h >> 8) & 0xFF;
    const a = h & 0xFF;
    return [r, g, b, a];
}

export function rgbaToHexInt([r=0,g=0,b=0,a=255]){
    r = r & 0xFF; g = g & 0xFF; b = b & 0xFF; a = a & 0xFF;
    if (a === 255) return ((r<<16) | (g<<8) | b) >>> 0;
    return (((r&0xFF)<<24) | ((g&0xFF)<<16) | ((b&0xFF)<<8) | (a&0xFF)) >>> 0;
}

export function mixHexInt(aHex, bHex, t=0.5) {
    const a = hexToRgba(aHex);
    const b = hexToRgba(bHex);
    const r = Math.round(a[0] + (b[0]-a[0])*t);
    const g = Math.round(a[1] + (b[1]-a[1])*t);
    const bb = Math.round(a[2] + (b[2]-a[2])*t);
    const aa = Math.round(a[3] + (b[3]-a[3])*t);
    return rgbaToHexInt([r,g,bb,aa]);
}

export default { hexToRgba, rgbaToHexInt, mixHexInt };
