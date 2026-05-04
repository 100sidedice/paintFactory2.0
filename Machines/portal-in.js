import portal from './portal.js';
import Item from '../src/World/Item.js';
import { isItemColliding } from './components/collision.js';
import { applyMovement } from './components/movement.js';
import { intHex, stringHex } from '../src/Helpers/colorHelpers.js';

const INPUT_CENTER_COLOR = 0x00FFFFFF; // cyan

export default class portalIn extends portal {
    constructor(name, machineData, manager) {
        super(name, machineData, manager);
        this.spawnDelay = 0;
        this.spawnDelayMax = 10; // millis, time between individual particles in a burst
        this._count = 0; // for unique item IDs
    }
    rotate(offsetX, offsetY) {
        const rot = (this.data.rot || 0) * Math.PI / 180; // convert degrees to radians
        const rotX = offsetX * Math.cos(rot) - offsetY * Math.sin(rot);
        const rotY = offsetX * Math.sin(rot) + offsetY * Math.cos(rot);
        return { x: rotX, y: rotY };
    }


    _handleConveyorCollision(item, size) {
        const collision = this.data.collisionConveyor;
        if (!collision) return false;
        const colliding = isItemColliding(this.data.x, this.data.y, item, size, collision, this.data.rot);
        if (!colliding) return false;
        const speed = this.manager.DataManager.config.defaultSaveData.upgrades.conveyor.speed;
        applyMovement(true, item, speed, this.data.rot);
        return true;
    }

    _getFrameIndex(frameLimit, fps) {
        return Math.floor((performance.now() * fps) / 1000) % frameLimit;
    }

    _getCenterMaskBaseColor() {
        return INPUT_CENTER_COLOR;
    }

    _spawnTeleportedItems(sourceItemColor) {
        const outputs = this._getMatchingOutputs();
        if (!outputs.length) return;

        const cfg = this.manager?.DataManager?.config || {};
        const maxItems = parseInt(cfg.maxItems, 10) || 200;
        let current = Object.values(this.manager.items || {}).filter(Boolean).length;

        for (const out of outputs) {
            if (current >= maxItems) break;
            const id = `item_${Date.now()}_${this._count++}`;
            const x = (out.data?.x ?? 0) + 0.5;
            const y = (out.data?.y ?? 0) + 0.5;
            const clone = new Item(id, x, y, sourceItemColor, this.manager);
            this.manager.items[id] = clone;
            current++;
            
        }
    }

    _getMatchingOutputs() {
        if (this._isUncoloredPortal()) return [];
        const own = intHex(this.color) >>> 0;
        const ownRGB = (own >>> 8) & 0xFFFFFF;

        const portalCache = this.manager?.getPortalMachineCache?.() ?? { outputs: [] };
        const candidates = portalCache.outputs || [];
        const outputs = [];
        for (const machine of candidates) {
            if (!machine || machine === this) continue;
            const mc = intHex(machine.color ?? machine.data?.color ?? 0x000000FF) >>> 0;
            const mcRGB = (mc >>> 8) & 0xFFFFFF;
            if (mcRGB === 0) continue;
            if (mcRGB !== ownRGB) continue;
            outputs.push(machine);
        }
        return outputs;
    }

    onItemCollision(item, size) {
        if (this._handleColorInputCollisions(item, size)) return;

        const tele = this.data.collisionTeleport;
        if (tele) {
            const collidingTele = isItemColliding(this.data.x, this.data.y, item, size, tele, this.data.rot);
            if (collidingTele) {
                const sizeTile = window.innerHeight/9;
                this.manager.ParticleManager.spawnPortalParticle(`${this.data.x},${this.data.y}`, this.data.x*sizeTile+sizeTile/2, this.data.y*sizeTile+sizeTile/2, item.color, 0.1, 0.1);
                this.manager.removeItem(item);
                if (!this._isUncoloredPortal()) {
                    this._spawnTeleportedItems(item.color);
                }
                return;
            }
        }

        this._handleConveyorCollision(item, size);
    }

    draw(ctx, x, y, size = 16) {
        super.draw(ctx, x, y, size);
    }
    update(delta) {
        super.update(delta);
    }
}
