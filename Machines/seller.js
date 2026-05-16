import MachineBase from './Machine.js';
import Item from '../src/World/Item.js';
import { isItemColliding } from './components/collision.js';
import { applyMovement } from './components/movement.js';
import { intHex, colorsClose } from '../src/Helpers/colorHelpers.js';
import { getColorizedTile } from './components/masking.js';

const SELLER_LIGHT_MASK = 0xFFC800FF;
const SELLER_DARK_MASK = 0xCBA000FF;
const SELLER_CORRUPT_LIGHT = 0x000000FF;
const SELLER_CORRUPT_DARK = 0x800080FF;

export default class seller extends MachineBase {
    constructor(name, machineData, manager) {
        super(name, machineData, manager);
        this.color = SELLER_LIGHT_MASK;
        // readable default color for external tools
        this.DEFAULT_COLOR = SELLER_LIGHT_MASK;
        this.data.color = this.color;
        this.corrupted = !!machineData?.corrupted;
        this.data.corrupted = this.corrupted;
        this.spreadTime = 0;
        this.nextSpread = 1;
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
        if (!this.corrupted && this._isColorized()) {
            const sold = this.color;
            const gm = this.manager?.levelManager?.goalManager;
            const salesPerFrame = Math.max(1, Math.floor(this.manager?.speedMultiplier ?? 1));
            for (let i = 0; i < salesPerFrame; i++) {
                if (gm && typeof gm.recordSale === 'function') gm.recordSale(sold);
                this._spawnFreeItem(sold);
            }
        }
        super.update(delta);
    }

    receiveBeamColor(color) {
        const next = intHex(color);
        const isBlackBeam = (next & 0xFFFFFF00) === 0;
        if (isBlackBeam) {
            this.corrupted = !this.corrupted;
            this.data.corrupted = this.corrupted;
            return;
        }

        this.color = next;
        this.data.color = this.color;
    }

    _isColorized() {
        return (intHex(this.color ?? SELLER_LIGHT_MASK) >>> 0) !== (SELLER_LIGHT_MASK >>> 0);
    }

    _adjustColorGoal(color, delta) {
        const gm = this.manager?.levelManager?.goalManager;
        if (!gm || !Array.isArray(gm.goals)) return false;

        const colInt = intHex(color);
        if (colInt === null || colInt === undefined) return false;

        for (const goal of gm.goals) {
            if (goal?.kind !== 'color') continue;
            if (!colorsClose(goal.colorInt, colInt)) continue;
            goal.have = (goal.have || 0) + delta;
            if (goal.haveEl) goal.haveEl.textContent = String(goal.have);
            if (typeof gm._updateGoalState === 'function') gm._updateGoalState(goal);
            if (typeof gm._markGoalRecent === 'function') gm._markGoalRecent(goal.key);
            return true;
        }

        return false;
    }

    _spawnFreeItem(color, sourceItem) {
        const cfg = this.manager?.DataManager?.config || {};
        const max = parseInt(cfg.maxItems, 10) || 200;
        const current = Object.values(this.manager.items || {}).filter(Boolean).length;
        if (current >= max) return false;

        const centerX = (this.data.x ?? 0) + 0.5;
        const centerY = (this.data.y ?? 0) + 0.5;
        const dx = (sourceItem?.x ?? centerX) - centerX;
        const dy = (sourceItem?.y ?? centerY) - centerY;

        let rot = 0;
        if (Math.abs(dx) >= Math.abs(dy)) rot = dx >= 0 ? 90 : 270;
        else rot = dy >= 0 ? 180 : 0;

        const dirX = rot === 90 ? 1 : rot === 270 ? -1 : 0;
        const dirY = rot === 180 ? 1 : rot === 0 ? -1 : 0;
        const offset = 2 / 16;
        const id = `item_${Math.random().toString(36).substr(2, 9)}_${Date.now()}`;
        const spawned = new Item(id, centerX + (dirX * offset), centerY + (dirY * offset), color, this.manager);
        this.manager.items[id] = spawned;

        const speed = this.manager?.DataManager?.config?.defaultSaveData?.upgrades?.conveyor?.speed ?? 0;
        applyMovement(true, spawned, speed, rot);
        return true;
    }

    onItemCollision(item, size) {
        const collision = this.data.collision;
        const colliding = isItemColliding(this.data.x, this.data.y, item, size, collision, this.data.rot);
        if (colliding) {
            if (this.corrupted) {
                // Corruption removes progress from the matching color goal and consumes the item.
                this._adjustColorGoal(item.color, -1);
                this.manager.removeItem(item);
                return;
            }

            if (this._isColorized()) {
                // Colorized sellers sell continuously from update(); collision only consumes the item.
                this.manager.removeItem(item);
                return;
            }

            // Default behavior: sell whatever entered.
            const gm = this.manager?.levelManager?.goalManager;
            if (gm && typeof gm.recordSale === 'function') gm.recordSale(item.color);
            this.manager.removeItem(item);
        }
    }

    draw(ctx, x, y, size = 16) {
        const flickerGrayFrame = this.corrupted && this.spreadTime >= this.nextSpread;
        const img = (this.manager.paused || flickerGrayFrame)
            ? this.manager?.AssetManager?.get('machines-image-grayed')
            : this.manager?.AssetManager?.get('machines-image');
        if (!img) { super.draw(ctx, x, y, size); return; }

        const row = this.data.texture?.row ?? 0;
        const tw = 16;
        const th = 16;
        let cols = Math.max(1, Math.floor(img.width / tw));
        if (this.manager.paused) cols = 1;
        const tileIndex = row * cols;
        const frameCount = Math.max(1, this.data.texture?.frameCount ?? cols);
        const frameLimit = this.manager.paused ? 1 : Math.min(cols, frameCount);
        const fps = this.data.texture?.fps ?? 8;
        const frame = Math.floor((performance.now() * fps) / 1000) % frameLimit;
        const sx = frame * tw;
        const sy = Math.floor(tileIndex / cols) * th;

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

        const baseColor = intHex(this.color ?? SELLER_LIGHT_MASK) >>> 0;
        const activeLight = this.corrupted
            ? SELLER_CORRUPT_LIGHT
            : baseColor;
        const activeDark = this.corrupted
            ? SELLER_CORRUPT_DARK
            : ((((Math.round(((baseColor >>> 24) & 0xFF) * 0.75) & 0xFF) << 24)
                | ((Math.round(((baseColor >>> 16) & 0xFF) * 0.75) & 0xFF) << 16)
                | ((Math.round(((baseColor >>> 8) & 0xFF) * 0.75) & 0xFF) << 8)
                | (baseColor & 0xFF)) >>> 0);

        const drawSource = getColorizedTile(
            img,
            sx,
            sy,
            tw,
            th,
            activeLight,
            SELLER_LIGHT_MASK,
            activeDark,
            SELLER_DARK_MASK
        );

        if (!this.rotating) {
            ctx.drawImage(drawSource, 0, 0, tw, th, x * size - size / 2, y * size - size / 2, size, size);
        } else {
            ctx.save();
            ctx.translate(x * size, y * size);
            if (this.data.rot === 0 && this.rotating === -1) {
                ctx.rotate((this.extraRotation - this.rotating * Math.PI / 2) + 2 * Math.PI);
            } else {
                ctx.rotate((this.extraRotation - this.rotating * Math.PI / 2));
            }
            ctx.drawImage(drawSource, 0, 0, tw, th, -size / 2, -size / 2, size, size);
            ctx.restore();
        }
    }
}
