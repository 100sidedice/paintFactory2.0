import MachineBase from './Machine.js';
import { isItemColliding } from './components/collision.js';

export default class glass extends MachineBase {
    constructor(name, machineData, manager) {
        super(name, machineData, manager);
        this.corrupted = !!machineData?.corrupted;
        this.data.corrupted = this.corrupted;
        this.spreadTime = 0;
        this.nextSpread = 100 + Math.random() * 200;
    }
    update(delta) {
        super.update(delta);
        if (this.corrupted) {
            this.spreadTime += delta;
        }
    }
    onItemCollision(item, size) {
    }
    draw(ctx, x, y, size=16) {
        if (this.manager.paused || this.corrupted) {
            var img = this.manager?.AssetManager?.get('machines-image-grayed');
        } else {
            var img = this.manager?.AssetManager?.get('machines-image');
        }
        if (!img) return super.draw(ctx, x, y, size);

        const row = (this.data.texture.row);
        const tw = 16; const th = 16;
        let cols = Math.max(1, Math.floor(img.width / tw));
        if (this.manager.paused) cols = 1;
        const tileIndex = row * cols;
        const sx = 0;
        const sy = Math.floor(tileIndex / cols) * th;
        
        let dpr = (1/(window.devicePixelRatio))/4;
        if(!this.rotating){
            ctx.drawImage(img, sx+dpr, sy+dpr, tw-dpr*2, th-dpr*2, x*size - size/2-dpr, y*size - size/2-dpr, size+dpr*3, size+dpr*3);
        } else {
            ctx.save();
            ctx.translate(x*size, y*size);
            if(this.data.rot === 0 && this.rotating === -1) {
                ctx.rotate((this.extraRotation - this.rotating * Math.PI/2)+2*Math.PI);
            } else {
                ctx.rotate((this.extraRotation - this.rotating * Math.PI/2));
            }
            ctx.drawImage(img, sx+dpr, sy+dpr, tw-dpr*2, th-dpr*2, -size/2-dpr, -size/2-dpr, size+dpr*3, size+dpr*3);
            ctx.restore();
        }
    }
}
