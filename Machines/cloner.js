import MachineBase from './Machine.js';
import { intHex, addHex32 } from '../src/Helpers/colorHelpers.js';
import { getColorizedTile } from './components/masking.js';
import { isItemColliding } from './components/collision.js';
import { applyMovement } from './components/movement.js';

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

    onItemCollision(item, size) {
        // Act as a multi-way conveyor: apply movement in the direction the item is traveling
        const collision = this.data.collision;
        const colliding = isItemColliding(this.data.x ?? 0, this.data.y ?? 0, item, size, collision, this.data.rot);
        if (colliding) {
            const speed = this.manager.DataManager.config.defaultSaveData.upgrades.conveyor.speed;
            // Try to detect direction of travel and apply movement in that direction
            // For multi-way support, apply movement in 4 directions: up, right, down, left (0, 90, 180, 270)
            applyMovement(true, item, speed, 0);   // up
            applyMovement(true, item, speed, 90);  // right
            applyMovement(true, item, speed, 180); // down
            applyMovement(true, item, speed, 270); // left
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
                    machine.color = addHex32(machine.color, this.color);
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
                // Additively mix cloner color into conveyor color (matches mixer behavior)
                machine.color = addHex32(machine.color, this.color);
                machine.lastColorChange = performance.now();
                if (this.corrupted) {
                    machine.corrupted = true;
                    machine.spreadTime = 0;
                    machine.nextSpread = 100 + Math.random() * 200;
                }
                continue;
            }
            if (machine.name.split('-')[0] === 'seller') {
                // Additively mix cloner color into seller color (matches mixer behavior)
                machine.color = addHex32(machine.color, this.color);
                machine.lastColorChange = performance.now();
                if (this.corrupted) {
                    machine.corrupted = true;
                    machine.spreadTime = 0;
                    machine.nextSpread = 100 + Math.random() * 200;
                }
                continue;
            }
            if (machine.name.split('-')[0] === 'spawner') {
                // Mix color into spawner and update its variant if editable
                machine.color = addHex32(machine.color, this.color);
                if (machine.data) machine.data.color = machine.color;
                this._updateSpawnerVariant(machine);
                if (this.corrupted) {
                    machine.corrupted = true;
                    machine.spreadTime = 0;
                    machine.nextSpread = 100 + Math.random() * 200;
                }
                continue;
            }
            if (machine.name === 'glass') {
                if (this.corrupted) {
                    machine.corrupted = true;
                    machine.spreadTime = 0;
                    machine.nextSpread = 100 + Math.random() * 200;
                    machine.data.corrupted = true;
                }
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

    _updateSpawnerVariant(spawner) {
        // Check if base spawner is editable (has delete slot and base spawner type in slots)
        const isEditable = this.manager?.hasActionSlot?.('delete') && 
                          this.manager?.hasMachineInSlot?.('spawner');
        
        if (!isEditable) return; // Don't swap if spawner isn't editable
        
        // Get all neighboring cloners and mix their colors
        const neighbors = this.manager?.getNeighborsFor?.(spawner);
        if (!neighbors) return;

        const cloners = [];
        const colors = [];
        
        for (const [dir, entry] of Object.entries(neighbors)) {
            const machine = entry?.machine;
            if (machine && machine.name === 'cloner') {
                // Skip unpowered (default color) cloners
                if (machine.color === DEFAULT_CLONER_COLOR) continue;
                cloners.push(machine);
                colors.push(intHex(machine.color));
            }
        }

        if (cloners.length === 0) return; // no cloners nearby

        // Mix all cloner colors together
        const mixedColor = this._mixColors(...colors);
        spawner.color = mixedColor;
        if (spawner.data) {
            spawner.data.color = mixedColor;
            spawner.data.editable = true; // Mark as editable so variant can be rotated/deleted
        }

        // Determine spawner variant based on number of cloners
        const currentName = spawner.name;
        let newVariantType = 'spawner'; // 1 cloner = basic spawner
        
        if (cloners.length === 2) {
            newVariantType = 'spawner-twoway';
        } else if (cloners.length === 3) {
            newVariantType = 'spawner-threeway';
        } else if (cloners.length >= 4) {
            newVariantType = 'spawner-fourway';
        }

        // If variant changed, replace the machine but keep it as a "spawner" for slot checking
        if (currentName !== newVariantType) {
            const x = spawner.data.x;
            const y = spawner.data.y;
            const rot = spawner.data.rot || 0;
            const color = spawner.color;
            
            // Remove and re-add with new variant type, preserving editable flag
            const wasEditable = spawner.data?.editable === true;
            this.manager.removeMachine(x, y);
            const newSpawner = this.manager.addMachine(newVariantType, x, y, rot);
            if (newSpawner) {
                newSpawner.color = color;
                if (newSpawner.data) {
                    newSpawner.data.color = color;
                    newSpawner.data.editable = wasEditable || true; // Keep or set editable flag
                }
            }
        }
    }

    _mixColors(...colors) {
        // Use additive mixing (clamp per-channel) to match mixer behavior.
        if (!colors || colors.length === 0) return 0xFFFFFFFF;
        if (colors.length === 1) return colors[0] >>> 0;
        return addHex32(...colors) >>> 0;
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
