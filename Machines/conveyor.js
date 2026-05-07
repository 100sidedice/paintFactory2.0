import MachineBase from './Machine.js';
import { isItemColliding } from './components/collision.js';
import { applyMovement } from './components/movement.js';
import { intHex } from '../src/Helpers/colorHelpers.js';
import { getColorizedTile } from './components/masking.js';

// mask colors (defaults) are stored per-instance on the conveyor
export default class conveyor extends MachineBase {
    constructor(name, machineData, manager) {
        super(name, machineData, manager);
        // mask colors (defaults): lighter yellow, darker yellow (instance properties)
        this.LIGHT_MASK = 0xFFC800FF;
        this.DARK_MASK = 0xCBA000FF;

        // conveyors can receive a propagated color (from cloners); default to light mask
        this.color = intHex(this.LIGHT_MASK);

        // corruption / flicker state (mirror portal/cloner style)
        this.corrupted = false;
        this.spreadTime = 0;
        this.nextSpread = 1;

        // color-match center trigger rotation state
        this._centerRotateActive = false;
        this._centerRotateElapsed = 0;
        this._centerRotateHoldMs = 1000;
        this._centerRotateCooldownElapsed = 0;
        this._centerRotateCooldownMs = 1000;
    }
    update(delta) {
        // handle corruption flicker timer
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

        if (this._centerRotateActive) {
            this._centerRotateElapsed += delta;

            if (this._centerRotateElapsed >= this._centerRotateHoldMs) {
                this._centerRotateActive = false;
                this._centerRotateElapsed = 0;

                // reverse the previous rotation
                const rotDir = this.corrupted ? 90 : -90;

                this.data.rot = (((this.data.rot || 0) + rotDir) % 360 + 360) % 360;

                this.manager?.generateQueue?.();

                // visual rotation matches logical rotation
                this.rotate(rotDir);

                // start post-rotation cooldown
                this._centerRotateCooldownElapsed = this._centerRotateCooldownMs;
            }
        }

        if (this._centerRotateCooldownElapsed > 0) {
            this._centerRotateCooldownElapsed = Math.max(
                0,
                this._centerRotateCooldownElapsed - delta
            );
        }
    }

    _isConveyorColorized() {
        const conveyorColor = intHex(this.color ?? this.LIGHT_MASK) >>> 0;
        return conveyorColor !== (this.LIGHT_MASK >>> 0);
    }

    _isItemSameColor(item) {
        if (!item) return false;
        const conveyorColor = intHex(this.color ?? this.LIGHT_MASK) >>> 0;
        const itemColor = intHex(item.color) >>> 0;
        return itemColor === conveyorColor;
    }

    _applyCooldownAbsorbToCenter(item) {
        if (!item) return false;
        if (this._centerRotateCooldownElapsed <= 0) return false;
        if (!this._isConveyorColorized()) return false;
        if (!this._isItemSameColor(item)) return false;

        // During cooldown, keep matching items at their current position (no teleport).
        item.vx = 0;
        item.vy = 0;
        return true;
    }

    _shouldBlockDifferentColorWhileActive(item) {
        if (!item) return false;
        if (!this._centerRotateActive) return false;
        if (!this._isConveyorColorized()) return false;
        return !this._isItemSameColor(item);
    }

    _handleItemPressColorState(item, size) {
        if (!item) return { blocked: false, absorbed: false };

        // During cooldown, absorb matching-color items to center.
        if (this._applyCooldownAbsorbToCenter(item)) {
            return { blocked: true, absorbed: true };
        }

        // While rotated from item press, block non-matching colors (color filter behavior).
        if (this._shouldBlockDifferentColorWhileActive(item)) {
            item.vx = 0;
            item.vy = 0;
            return { blocked: true, absorbed: false };
        }

        // Otherwise, allow center-press trigger check.
        this._handleCenterColorRotation(item, size);
        return { blocked: false, absorbed: false };
    }

    _handleCenterColorRotation(item, size) {
        if (!item) return;
        if (this._centerRotateActive || this.rotating) return;
        if (this._centerRotateCooldownElapsed > 0) return;

        // only react when conveyor is actually colorized (not default color)
        const conveyorColor = intHex(this.color ?? this.LIGHT_MASK) >>> 0;
        if (conveyorColor === (this.LIGHT_MASK >>> 0)) return;

        const itemColor = intHex(item.color) >>> 0;
        if (itemColor !== conveyorColor) return;

        const centerCollision = this.data['collision-center'] || this.data.collisionCenter;
        if (!centerCollision) return;

        const touchingCenter = isItemColliding(
            this.data.x,
            this.data.y,
            item,
            size,
            centerCollision,
            this.data.rot
        );

        if (!touchingCenter) return;

        // corruption reverses actual rotation direction
        const rotDir = this.corrupted ? -90 : 90;

        // trigger turn and lock for 1 second before returning
        this._centerRotateActive = true;
        this._centerRotateElapsed = 0;

        this.data.rot = (((this.data.rot || 0) + rotDir) % 360 + 360) % 360;

        this.manager?.generateQueue?.();

        // visual rotation matches logical rotation
        this.rotate(rotDir);
    }
    onItemCollision(item, size) {
        const colorState = this._handleItemPressColorState(item, size);
        if (colorState.blocked) return;

        const collision = this.data.collision;
        const colliding = isItemColliding(this.data.x, this.data.y, item, size, collision, this.data.rot);
        if (colliding) {
            const speed = this.manager.DataManager.config.defaultSaveData.upgrades.conveyor.speed;
            applyMovement(true, item, speed, this.data.rot);
        }
    }

    draw(ctx, x, y, size = 16) {
        const flickerGrayFrame = this.corrupted && this.spreadTime >= this.nextSpread;
        const img = (this.manager.paused || flickerGrayFrame)
            ? this.manager?.AssetManager?.get('machines-image-grayed')
            : this.manager?.AssetManager?.get('machines-image');
        if (!img) { super.draw(ctx, x, y, size); return; }

        const row = this.data.texture?.row ?? 0;
        const tw = 16; const th = 16;
        let cols = Math.max(1, Math.floor(img.width / tw));
        if (this.manager.paused) cols = 1;
        const tileIndex = row * cols;
        const frameCount = Math.max(1, this.data.texture?.frameCount ?? cols);
        const frameLimit = this.manager.paused ? 1 : Math.min(cols, frameCount);
        const fps = this.data.texture?.fps ?? 8;
        const frame = Math.floor((performance.now() * fps) / 1000) % frameLimit;
        const sx = frame * tw;
        const sy = Math.floor(tileIndex / cols) * th;

        // replacement colors: use conveyor color for the lighter mask and a darker variant for the darker mask
        const baseColor = intHex(this.color ?? this.LIGHT_MASK) >>> 0;

        // If the conveyor has the default light mask color, draw the original sprite (no masking)
        if (baseColor === (this.LIGHT_MASK >>> 0)) {
            if (!this.rotating) {
                ctx.drawImage(img, sx, sy, tw, th, x * size - size / 2, y * size - size / 2, size, size);
            } else {
                ctx.save();
                ctx.translate(x * size, y * size);
                if (this.data.rot === 0 && this.rotating === -1) {
                    ctx.rotate((this.extraRotation - this.rotating * Math.PI / 2) + 2 * Math.PI);
                } else {
                    ctx.rotate((this.extraRotation - this.rotating * Math.PI / 2));
                }
                ctx.drawImage(img, sx, sy, tw, th, -size / 2, -size / 2, size, size);
                ctx.restore();
            }
            return;
        }

        // cooldown visual: darken mask colors while in cooldown
        const cooldownActive = this._centerRotateCooldownElapsed > 0;
        const r = (baseColor >>> 24) & 0xFF;
        const g = (baseColor >>> 16) & 0xFF;
        const b = (baseColor >>> 8) & 0xFF;
        const a = baseColor & 0xFF;

        const lightMul = cooldownActive ? 0.72 : 1;
        const darkMul = cooldownActive ? 0.54 : 0.75;

        const light = ((((Math.round(r * lightMul) & 0xFF) << 24) | ((Math.round(g * lightMul) & 0xFF) << 16) | ((Math.round(b * lightMul) & 0xFF) << 8) | (a & 0xFF)) >>> 0);
        const dark = ((((Math.round(r * darkMul) & 0xFF) << 24) | ((Math.round(g * darkMul) & 0xFF) << 16) | ((Math.round(b * darkMul) & 0xFF) << 8) | (a & 0xFF)) >>> 0);

        // If we're in a corruption flicker frame, cancel masking and draw the grayscale source frame
        if (flickerGrayFrame) {
            if (!this.rotating) {
                ctx.drawImage(img, sx, sy, tw, th, x * size - size / 2, y * size - size / 2, size, size);
            } else {
                ctx.save();
                ctx.translate(x * size, y * size);
                if (this.data.rot === 0 && this.rotating === -1) {
                    ctx.rotate((this.extraRotation - this.rotating * Math.PI / 2) + 2 * Math.PI);
                } else {
                    ctx.rotate((this.extraRotation - this.rotating * Math.PI / 2));
                }
                ctx.drawImage(img, sx, sy, tw, th, -size / 2, -size / 2, size, size);
                ctx.restore();
            }
            return;
        }

        const tileCanvas = getColorizedTile(img, sx, sy, tw, th, light, this.LIGHT_MASK, dark, this.DARK_MASK);

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
