import MachineBase from './Machine.js';
import { intHex } from '../src/Helpers/colorHelpers.js';
import { getColorizedTile } from './components/masking.js';

const DEFAULT_CLONER_COLOR = 0x000000FF;

export default class cloner extends MachineBase {
    constructor(name, machineData, manager) {
        super(name, machineData, manager);
        // mask colors (defaults): lighter yellow, darker yellow
        this.LIGHT_MASK = 0xFFC800FF;
        this.DARK_MASK = 0xCBA000FF;

        this.color = DEFAULT_CLONER_COLOR;
        this.data.color = this.color;
        this._propagateAcc = 0;
        this._propagateInterval = 150;

        // corruption flicker state (mirrors portal timing style)
        this.corrupted = false;
        this.spreadTime = 0;
        this.nextSpread = 1;
        this.lastcolor = this.color;
    }

    update(delta) {
        if (this.corrupted) {
            if (this.spreadTime >= this.nextSpread * 1.2) {
                this.spreadTime = 0;
                this.nextSpread = 100 + Math.random() * 200;
            }
            this.spreadTime += delta;
        } else {
            this.spreadTime = 0;
            this.nextSpread = 1;
        }

        super.update(delta);
        this._propagateAcc += delta;
        if (this._propagateAcc >= this._propagateInterval) {
            this._propagateAcc -= this._propagateInterval;
            this._propagateColorToNeighbors();
        }
    }

    _invertColor(color) {
        const v = intHex(color) >>> 0;
        const r = (v >>> 24) & 0xFF;
        const g = (v >>> 16) & 0xFF;
        const b = (v >>> 8) & 0xFF;
        const a = v & 0xFF;
        const ir = (255 - r) & 0xFF;
        const ig = (255 - g) & 0xFF;
        const ib = (255 - b) & 0xFF;
        return (((ir & 0xFF) << 24) | ((ig & 0xFF) << 16) | ((ib & 0xFF) << 8) | (a & 0xFF)) >>> 0;
    }

    receiveBeamColor(color) {
        const next = intHex(color);

        // Black beam toggles corruption and inverts the cloner's current RGB channels.
        const isBlackBeam = (next & 0xFFFFFF00) === 0;
        if (isBlackBeam) {
            this.corrupted = true;
            if(this._invertColor(this.color) !== this.lastcolor){
                this.lastcolor = this.color;
                this.color = this._invertColor(this.color);
                this.data.color = this.color;
            }
            this._propagateColorToNeighbors();
            return;
        }

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
                // If cloner is corrupted, immediately mark touching portals as corrupted
                if (this.corrupted) {
                    machine.corrupted = true;
                    machine.spreadTime = 0;
                    machine.nextSpread = 100 + Math.random() * 200;
                }
                if (typeof machine._absorbPortalColor === 'function') {
                    machine._absorbPortalColor(this.color);
                } else {
                    machine.color = intHex(this.color);
                    if (machine.data) machine.data.color = machine.color;
                }
                continue;
            }

            if (machine.name === 'mixer') {
                // if cloner is corrupted, mark mixer corrupted so it subtracts and flickers
                if (this.corrupted) {
                    machine.corrupted = true;
                    machine.spreadTime = 0;
                    machine.nextSpread = 100 + Math.random() * 200;
                }
                this.fillMixerChannels(machine, dir);
                continue;
            }
            if (machine.name === 'mixer-right') {
                if (this.corrupted) {
                    machine.corrupted = true;
                    machine.spreadTime = 0;
                    machine.nextSpread = 100 + Math.random() * 200;
                }
                this.fillMixerRightChannels(machine, dir);
                continue;
            }
            if (machine.name === 'mixer-left') {
                if (this.corrupted) {
                    machine.corrupted = true;
                    machine.spreadTime = 0;
                    machine.nextSpread = 100 + Math.random() * 200;
                }
                this.fillMixerLeftChannels(machine, dir);
                continue;
            }
            if (machine.name.split('-')[0] === 'conveyor') {
                machine.color = this.color;
                machine.lastColorChange = performance.now();
                if (this.corrupted) {
                    machine.corrupted = true;
                    machine.spreadTime = 0;
                    machine.nextSpread = 100 + Math.random() * 200;
                }
            }
            if (machine.name.split('-')[0] === 'seller') {
                machine.color = this.color;
                machine.lastColorChange = performance.now();
                if (this.corrupted) {
                    machine.corrupted = true;
                    machine.spreadTime = 0;
                    machine.nextSpread = 100 + Math.random() * 200;
                }
            }
            if (machine.name.split('-')[0] === 'spawner') {
                machine.color = this.color;
                machine.lastColorChange = performance.now();
                if (this.corrupted) {
                    machine.corrupted = true;
                    machine.spreadTime = 0;
                    machine.nextSpread = 100 + Math.random() * 200;
                }
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
        const flickerGrayFrame = this.spreadTime >= this.nextSpread;
        if (this.manager.paused || flickerGrayFrame) {
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
        const isDefaultColor = (intHex(this.color ?? DEFAULT_CLONER_COLOR) >>> 0) === (DEFAULT_CLONER_COLOR >>> 0);
        if (this.manager.paused || this.spreadTime >= this.nextSpread || isDefaultColor) cols = 1;
        const tileIndex = row * cols;
        const frameCount = Math.max(1, this.data.texture?.frameCount ?? cols);
        const frameLimit = this.manager.paused ? 1 : Math.min(cols, frameCount);
        const sx = isDefaultColor ? 1 * tw : Math.floor((performance.now() * (this.data.texture?.fps ?? 8)) / 1000 % frameLimit) * tw;
        const sy = Math.floor(tileIndex / cols) * th;

        // Cancel masking on grayscale corruption flicker frames.
        let drawSource = img;
        if (!flickerGrayFrame) {
            const cval = (intHex(this.color ?? DEFAULT_CLONER_COLOR) >>> 0);
            // If cloner has the default color, draw the original sprite (no masking)
            if (cval !== (DEFAULT_CLONER_COLOR >>> 0)) {
                const r = (cval >>> 24) & 0xFF;
                const g = (cval >>> 16) & 0xFF;
                const b = (cval >>> 8) & 0xFF;
                const a = cval & 0xFF;

                const lightMul = 1.0;
                const darkMul = 0.75;

                const light = ((((Math.round(r * lightMul) & 0xFF) << 24) | ((Math.round(g * lightMul) & 0xFF) << 16) | ((Math.round(b * lightMul) & 0xFF) << 8) | (a & 0xFF)) >>> 0);
                const dark = ((((Math.round(r * darkMul) & 0xFF) << 24) | ((Math.round(g * darkMul) & 0xFF) << 16) | ((Math.round(b * darkMul) & 0xFF) << 8) | (a & 0xFF)) >>> 0);

                drawSource = getColorizedTile(img, sx, sy, tw, th, light, this.LIGHT_MASK, dark, this.DARK_MASK);
            }
        }

        if (!this.rotating) {
            if (flickerGrayFrame || drawSource === img) {
                ctx.drawImage(drawSource, sx, sy, tw, th, x * size - size / 2, y * size - size / 2, size, size);
            } else {
                ctx.drawImage(drawSource, 0, 0, tw, th, x * size - size / 2, y * size - size / 2, size, size);
            }
        } else {
            ctx.save();
            ctx.translate(x * size, y * size);
            if (this.data.rot === 0 && this.rotating === -1) {
                ctx.rotate((this.extraRotation - this.rotating * Math.PI / 2) + 2 * Math.PI);
            } else {
                ctx.rotate((this.extraRotation - this.rotating * Math.PI / 2));
            }
            if (flickerGrayFrame || drawSource === img) {
                ctx.drawImage(drawSource, sx, sy, tw, th, -size / 2, -size / 2, size, size);
            } else {
                ctx.drawImage(drawSource, 0, 0, tw, th, -size / 2, -size / 2, size, size);
            }
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
