import MachineBase from './Machine.js';
import { intHex } from '../src/Helpers/colorHelpers.js';
import { getColorizedTile } from './components/masking.js';

const DEFAULT_CLONER_COLOR = 0x000000FF;

export default class cloner extends MachineBase {
    constructor(name, machineData, manager) {
        super(name, machineData, manager);
        this.color = DEFAULT_CLONER_COLOR;
        this.data.color = this.color;
        this._propagateAcc = 0;
        this._propagateInterval = 150;
    }

    update(delta) {
        super.update(delta);
        this._propagateAcc += delta;
        if (this._propagateAcc >= this._propagateInterval) {
            this._propagateAcc -= this._propagateInterval;
            this._propagateColorToNeighbors();
        }
    }

    receiveBeamColor(color) {
        const next = intHex(color);
        if (next === this.color) return;
        this.color = next;
        this.data.color = this.color;
        this._propagateColorToNeighbors();
    }

    _propagateColorToNeighbors() {
        if(this.color === DEFAULT_CLONER_COLOR) return; // don't propagate if we don't have a color
        const neighbors = this.manager?.getNeighborsFor?.(this);
        if (!neighbors) return;

        for (const [dir, entry] of Object.entries(neighbors)) {
            const machine = entry?.machine;
            if (!machine) continue;

            if (machine.name === 'portal' || machine.name === 'portal-in') {
                if (typeof machine._absorbPortalColor === 'function') {
                    machine._absorbPortalColor(this.color);
                } else {
                    machine.color = intHex(this.color);
                    if (machine.data) machine.data.color = machine.color;
                }
                continue;
            }

            if (machine.name === 'mixer') {
                this.fillMixerChannels(machine, dir);
                continue;
            }
            if (machine.name === 'mixer-right') {
                this.fillMixerRightChannels(machine, dir);
                continue;
            }
            if (machine.name === 'mixer-left') {
                this.fillMixerLeftChannels(machine, dir);
                continue;
            }
        }
    }

    fillMixerChannels(mixer, sourceDirFromCloner) {
        // Mixers point upward at rot=0. Rotation is clockwise.
        // Determine which side of the mixer faces the cloner, then map that
        // side to either the mixer's left or right input channel using a small
        // lookup table per rotation. Do NOT fill both channels.
        const cfg = this.manager?.DataManager?.config;
        const capacity = cfg?.defaultSaveData?.upgrades?.mixer?.capacity ?? 1;
        if (!Array.isArray(mixer.leftQueue) || !Array.isArray(mixer.rightQueue)) return;

        const facingSide = oppositeDir(sourceDirFromCloner); // side on mixer that faces the cloner
        const rot = ((((mixer.data?.rot || 0) % 360) + 360) % 360);
        let channel = null; // 'left' or 'right'

        if (rot === 0) {
            if (facingSide === 'left') channel = 'left';
            else if (facingSide === 'right') channel = 'right';
        } else if (rot === 90) {
            if (facingSide === 'top') channel = 'left';
            else if (facingSide === 'bottom') channel = 'right';
        } else if (rot === 180) {
            if (facingSide === 'right') channel = 'left';
            else if (facingSide === 'left') channel = 'right';
        } else if (rot === 270) {
            if (facingSide === 'bottom') channel = 'left';
            else if (facingSide === 'top') channel = 'right';
        }

        if (!channel) return; // touching a non-channel side; do nothing

        const c = intHex(this.color);
        if (channel === 'left') {
            if (mixer.leftQueue.length >= capacity) return;
            mixer.leftQueue.push(c);
        } else {
            if (mixer.rightQueue.length >= capacity) return;
            mixer.rightQueue.push(c);
        }

        // reset mixer idle timers so it doesn't immediately deplete
        mixer._timeSinceLastAbsorb = 0;
        mixer._depleteAcc = 0;

        // update mixer display color if it now has both channels
        if (mixer.leftQueue.length > 0 && mixer.rightQueue.length > 0 && typeof mixer._mixColors === 'function') {
            mixer.color = mixer._mixColors(mixer.leftQueue[0], mixer.rightQueue[0]);
        }
    }
    // yes, I know this is basically the same code as fillMixerChannels, but i don't feel like trying to solve the k-map for the channel selection logic to combine them, and it's only a few lines so who cares
    fillMixerLeftChannels(mixer, sourceDirFromCloner) {
        // Mixers point upward at rot=0. Rotation is clockwise.
        // Determine which side of the mixer faces the cloner, then map that
        // side to either the mixer's left or right input channel using a small
        // lookup table per rotation. Do NOT fill both channels.
        const cfg = this.manager?.DataManager?.config;
        const capacity = cfg?.defaultSaveData?.upgrades?.mixer?.capacity ?? 1;
        if (!Array.isArray(mixer.leftQueue) || !Array.isArray(mixer.rightQueue)) return;

        const facingSide = oppositeDir(sourceDirFromCloner); // side on mixer that faces the cloner
        const rot = ((((mixer.data?.rot || 0) % 360) + 360) % 360);
        let channel = null; // 'left' or 'right'

        if (rot === 0) {
            if (facingSide === 'left') channel = 'left';
            else if (facingSide === 'bottom') channel = 'right';
        } else if (rot === 90) {
            if (facingSide === 'top') channel = 'left';
            else if (facingSide === 'left') channel = 'right';
        } else if (rot === 180) {
            if (facingSide === 'right') channel = 'left';
            else if (facingSide === 'top') channel = 'right';
        } else if (rot === 270) {
            if (facingSide === 'bottom') channel = 'left';
            else if (facingSide === 'right') channel = 'right';
        }

        if (!channel) return; // touching a non-channel side; do nothing

        const c = intHex(this.color);
        if (channel === 'left') {
            if (mixer.leftQueue.length >= capacity) return;
            mixer.leftQueue.push(c);
        } else {
            if (mixer.rightQueue.length >= capacity) return;
            mixer.rightQueue.push(c);
        }

        // reset mixer idle timers so it doesn't immediately deplete
        mixer._timeSinceLastAbsorb = 0;
        mixer._depleteAcc = 0;

        // update mixer display color if it now has both channels
        if (mixer.leftQueue.length > 0 && mixer.rightQueue.length > 0 && typeof mixer._mixColors === 'function') {
            mixer.color = mixer._mixColors(mixer.leftQueue[0], mixer.rightQueue[0]);
        }
    }
    fillMixerRightChannels(mixer, sourceDirFromCloner) {
        // Mixers point upward at rot=0. Rotation is clockwise.
        // Determine which side of the mixer faces the cloner, then map that
        // side to either the mixer's left or right input channel using a small
        // lookup table per rotation. Do NOT fill both channels.
        const cfg = this.manager?.DataManager?.config;
        const capacity = cfg?.defaultSaveData?.upgrades?.mixer?.capacity ?? 1;
        if (!Array.isArray(mixer.leftQueue) || !Array.isArray(mixer.rightQueue)) return;

        const facingSide = oppositeDir(sourceDirFromCloner); // side on mixer that faces the cloner
        const rot = ((((mixer.data?.rot || 0) % 360) + 360) % 360);
        let channel = null; // 'left' or 'right'

        if (rot === 0) {
            if (facingSide === 'bottom') channel = 'left';
            else if (facingSide === 'right') channel = 'right';
        } else if (rot === 90) {
            if (facingSide === 'left') channel = 'left';
            else if (facingSide === 'bottom') channel = 'right';
        } else if (rot === 180) {
            if (facingSide === 'top') channel = 'left';
            else if (facingSide === 'left') channel = 'right';
        } else if (rot === 270) {
            if (facingSide === 'right') channel = 'left';
            else if (facingSide === 'top') channel = 'right';
        }

        if (!channel) return; // touching a non-channel side; do nothing

        const c = intHex(this.color);
        if (channel === 'left') {
            if (mixer.leftQueue.length >= capacity) return;
            mixer.leftQueue.push(c);
        } else {
            if (mixer.rightQueue.length >= capacity) return;
            mixer.rightQueue.push(c);
        }

        // reset mixer idle timers so it doesn't immediately deplete
        mixer._timeSinceLastAbsorb = 0;
        mixer._depleteAcc = 0;

        // update mixer display color if it now has both channels
        if (mixer.leftQueue.length > 0 && mixer.rightQueue.length > 0 && typeof mixer._mixColors === 'function') {
            mixer.color = mixer._mixColors(mixer.leftQueue[0], mixer.rightQueue[0]);
        }
    }

    onItemCollision(item, size) {
    }

    draw(ctx, x, y, size = 16) {
        if (this.manager.paused) {
            var img = this.manager?.AssetManager?.get('machines-image-grayed');
        } else {
            var img = this.manager?.AssetManager?.get('machines-image');
        }
        if (!img) {
            super.draw(ctx, x, y, size);
            return;
        }

        const row = this.data.texture?.row ?? 0;
        const tw = 16;
        const th = 16;
        let cols = Math.max(1, Math.floor(img.width / tw));
        if (this.manager.paused) cols = 1;
        const tileIndex = row * cols;
        const frameCount = Math.max(1, this.data.texture?.frameCount ?? cols);
        const frameLimit = this.manager.paused ? 1 : Math.min(cols, frameCount);
        const sx = Math.floor((performance.now() * (this.data.texture?.fps ?? 8)) / 1000 % frameLimit) * tw;
        const sy = Math.floor(tileIndex / cols) * th;

        const tileCanvas = getColorizedTile(img, sx, sy, tw, th, this.color, DEFAULT_CLONER_COLOR);
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

// Masking utilities imported from ./components/masking.js

function oppositeDir(dir) {
    switch (dir) {
        case 'top': return 'bottom';
        case 'right': return 'left';
        case 'bottom': return 'top';
        case 'left': return 'right';
        default: return null;
    }
}

function toLocalSide(worldSide, rot = 0) {
    const v = sideToVec(worldSide);
    if (!v) return null;
    // Convert world direction -> local direction by rotating CCW by `rot`.
    const localVec = rotateVecCCW(v[0], v[1], rot);
    return vecToSide(localVec[0], localVec[1]);
}

function sideToVec(side) {
    switch (side) {
        case 'top': return [0, -1];
        case 'right': return [1, 0];
        case 'bottom': return [0, 1];
        case 'left': return [-1, 0];
        default: return null;
    }
}

function vecToSide(dx, dy) {
    if (dx === 0 && dy === -1) return 'top';
    if (dx === 1 && dy === 0) return 'right';
    if (dx === 0 && dy === 1) return 'bottom';
    if (dx === -1 && dy === 0) return 'left';
    return null;
}

function rotateVecCCW(dx, dy, degrees) {
    const rot = ((((degrees || 0) % 360) + 360) % 360);
    if (rot === 0) return [dx, dy];
    if (rot === 90) return [-dy, dx];
    if (rot === 180) return [-dx, -dy];
    if (rot === 270) return [dy, -dx];
    return [dx, dy];
}
