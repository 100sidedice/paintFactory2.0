import portal from './portal.js';
import { isItemColliding } from './components/collision.js';
import { applyMovement } from './components/movement.js';
import { intHex, stringHex } from '../src/Helpers/colorHelpers.js';

const INPUT_CENTER_COLOR = 0x00FFFFFF; // cyan

export default class portalIn extends portal {
    constructor(name, machineData, manager) {
        super(name, machineData, manager);
        this.spawnDelay = 0;
        this.spawnDelayMax = 10; // millis, time between individual particles in a burst
        
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
        const routeColor = this.corrupted ? sourceItemColor : this.color;
        const particleColor = this.corrupted ? this.color : sourceItemColor;
        const outputs = this._getMatchingOutputs(routeColor, this.corrupted);
        if (!outputs.length) return;

        const cfg = this.manager?.DataManager?.config || {};
        const maxItems = parseInt(cfg.maxItems, 10) || 200;
        let current = Object.values(this.manager.items || {}).filter(Boolean).length;

        for (const out of outputs) {
            if (current >= maxItems) break;
            // need to calculate speed based on angle to target portal
            const angle = Math.atan2(out.data.y - this.data.y, out.data.x - this.data.x);
            const speedX = Math.cos(angle) * 0.007;// very fast test to check that collions don't skip at speeds
            const speedY = Math.sin(angle) * 0.007;
            this.manager.ParticleManager.spawnPortalParticle(`${this.data.x},${this.data.y}`, this.data.x, this.data.y, particleColor, speedX, speedY, this.manager);
            current++;
            
        }
    }

    _getMatchingOutputs(routeColor = this.color, allowBlackMatch = false) {
        const route = intHex(routeColor) >>> 0;
        const routeRGB = (route >>> 8) & 0xFFFFFF;
        if (routeRGB === 0 && !allowBlackMatch) return [];

        const portalCache = this.manager?.getPortalMachineCache?.() ?? { outputs: [] };
        const candidates = portalCache.outputs || [];
        const outputs = [];
        for (const machine of candidates) {
            if (!machine || machine === this) continue;
            const mc = intHex(machine.color ?? machine.data?.color ?? 0x000000FF) >>> 0;
            const mcRGB = (mc >>> 8) & 0xFFFFFF;
            if (mcRGB === 0 && !allowBlackMatch) continue;
            if (mcRGB !== routeRGB) continue;
            outputs.push(machine);
        }
        return outputs;
    }

    onItemCollision(item, size) {
        if (this._handleColorInputCollisions(item, size)) return;
        const tele = this.data.collisionTeleport;
        const collidingTele = isItemColliding(this.data.x, this.data.y, item, size, tele, this.data.rot);
        if (collidingTele) {
            this.manager.removeItem(item);
            this._spawnTeleportedItems(item.color);
            return;
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
