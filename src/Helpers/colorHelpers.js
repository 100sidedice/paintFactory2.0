

// Add multiple 32-bit hex RGBA colors (RRGGBBAA format). Channels are clamped to 0..255.
export function addHex32(...colors) {
    if (!colors || colors.length === 0) return 0 >>> 0;
    let r = 0, g = 0, b = 0, a = 0;
    for (const c of colors) {
        const v = intHex(c) >>> 0;
        r += (v >>> 24) & 0xFF;
        g += (v >>> 16) & 0xFF;
        b += (v >>> 8) & 0xFF;
        a += v & 0xFF;
    }
    r = Math.min(255, r);
    g = Math.min(255, g);
    b = Math.min(255, b);
    a = Math.min(255, a);
    return (((r & 0xFF) << 24) | ((g & 0xFF) << 16) | ((b & 0xFF) << 8) | (a & 0xFF)) >>> 0;
}

// Subtract colorB from colorA per-channel (RRGGBBAA format). Channels are clamped to 0..255.
// Set subtractAlpha to 1 to include alpha subtraction; default keeps alpha from colorA.
export function subHex32(colorA, colorB, subtractAlpha = 0) {
    const a = intHex(colorA) >>> 0;
    const b = intHex(colorB) >>> 0;
    const r = Math.max(0, ((a >>> 24) & 0xFF) - ((b >>> 24) & 0xFF));
    const g = Math.max(0, ((a >>> 16) & 0xFF) - ((b >>> 16) & 0xFF));
    const bb = Math.max(0, ((a >>> 8) & 0xFF) - ((b >>> 8) & 0xFF));
    const aa = subtractAlpha ? Math.max(0, (a & 0xFF) - (b & 0xFF)) : (a & 0xFF);
    return (((r & 0xFF) << 24) | ((g & 0xFF) << 16) | ((bb & 0xFF) << 8) | (aa & 0xFF)) >>> 0;
}

// Convert a 32-bit integer (RRGGBBAA) to a CSS hex string '#RRGGBBAA'.
export function stringHex(hex32) {
    const v = intHex(hex32) >>> 0;
    const hex = ('00000000' + v.toString(16)).slice(-8).toUpperCase();
    return '#' + hex;
}

// Parse a CSS hex string (expects RRGGBBAA style, with or without leading '#') to a 32-bit integer.
export function intHex(str) {
    // If a number is provided, treat it as an already-correct 32-bit value
    if (typeof str === 'number') {
        return (Number(str) >>> 0);
    }
    if (typeof str !== 'string') return 0 >>> 0;
    let s = str.trim();
    if (s[0] === '#') s = s.slice(1);
    const v = parseInt(s, 16);
    return (isNaN(v) ? 0 : (v >>> 0));
}

// Set a single channel (r/g/b/a or 0..3) on a 32-bit RRGGBBAA color.
// `color` may be a string like '#RRGGBBAA' or a Number. `value` is 0..1.
// `type` controls return: 'string' => '#RRGGBBAA', '32' => 32-bit integer.
export function setChannel(color, channel, value, type = 'string') {
    const idx = (ch => {
        if (typeof ch === 'number') return ch;
        const c = String(ch).toLowerCase();
        if (c === 'r') return 0;
        if (c === 'g') return 1;
        if (c === 'b') return 2;
        if (c === 'a') return 3;
        // fallback: parse numeric string
        const n = parseInt(c, 10);
        return isNaN(n) ? 0 : n;
    })(channel);

    const v = intHex(color) >>> 0;
    const clamped = Math.max(0, Math.min(1, Number(value) || 0));
    const byte = Math.round(clamped * 255) & 0xFF;
    // channel index: 0 -> R (highest), 1 -> G, 2 -> B, 3 -> A (lowest)
    const shift = (3 - (idx % 4)) * 8;
    const mask = (~(0xFF << shift)) >>> 0;
    const result = ((v & mask) | ((byte & 0xFF) << shift)) >>> 0;
    return type === '32' ? result : stringHex(result);
}

// Return a new 32-bit color integer by offsetting RGB channels randomly by up to
// `pct` fraction of 255. `pct` may be 0..1 (e.g. 0.15 = ±15% of 255). Alpha is preserved.
export function offsetIntHex(color, pct = 0.12) {
    const v = intHex(color) >>> 0;
    const r = (v >>> 24) & 0xFF;
    const g = (v >>> 16) & 0xFF;
    const b = (v >>> 8) & 0xFF;
    const a = v & 0xFF;
    const amp = Math.round(Math.max(0, Math.min(1, Number(pct) || 0)) * 255);
    function rndChannel(base) {
        const delta = Math.floor((Math.random() * 2 - 1) * amp);
        return Math.max(0, Math.min(255, base + delta));
    }
    const nr = rndChannel(r);
    const ng = rndChannel(g);
    const nb = rndChannel(b);
    return (((nr & 0xFF) << 24) | ((ng & 0xFF) << 16) | ((nb & 0xFF) << 8) | (a & 0xFF)) >>> 0;
}

// Return true if two 32-bit colors (RRGGBBAA) are_close per-channel within
// a tolerance. Default tolerance is 1/16th of max channel (≈16).
export function colorsClose(cA, cB, tolerance = Math.ceil(255 / 16)) {
    const a = intHex(cA) >>> 0;
    const b = intHex(cB) >>> 0;
    const ra = (a >>> 24) & 0xFF;
    const ga = (a >>> 16) & 0xFF;
    const ba = (a >>> 8) & 0xFF;
    const aa = a & 0xFF;
    const rb = (b >>> 24) & 0xFF;
    const gb = (b >>> 16) & 0xFF;
    const bb = (b >>> 8) & 0xFF;
    const ab = b & 0xFF;
    const tol = Math.max(0, Number(tolerance) || 0);
    if (Math.abs(ra - rb) > tol) return false;
    if (Math.abs(ga - gb) > tol) return false;
    if (Math.abs(ba - bb) > tol) return false;
    if (Math.abs(aa - ab) > tol) return false;
    return true;
}