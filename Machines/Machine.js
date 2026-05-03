export default class Machine {
    constructor(name, machineData, manager){
        this.name = name;
        this.manager = manager;
        this.data = machineData;
        this.rotating = 0;
        this.startRotate = 0;
        this.rotateDuration = 200; // ms for a 90 degree rotation
        this.extraRotation = 0;
    }
    rotate(degrees) {
        this.startRotate = performance.now();
        // Determine rotation direction from the sign of `degrees` (positive -> clockwise, negative -> counter-clockwise)
        this.extraRotation = 0;
        if (degrees < 0) { this.rotating = -1; }
        else if (degrees > 0) { this.rotating = 1; }
    }
    draw(ctx, x, y, size=16) {
        if (this.manager.paused) {
            var img = this.manager?.AssetManager?.get('machines-image-grayed');
        }else {
            var img = this.manager?.AssetManager?.get('machines-image');
        }
        if (!img) super.draw(ctx, x, y, size);

        const row = (this.data.texture.row);
        const tw = 16; const th = 16;
        let cols = Math.max(1, Math.floor(img.width / tw));
        if (this.manager.paused) cols = 1; // prevent animation when paused by forcing tile index to 0, since `tileIndex = row * cols` and row is always 0 or positive
        const tileIndex = row * cols; // assume one-tile-per-row layout
        const frameCount = Math.max(1, this.data.texture?.frameCount ?? cols);
        const frameLimit = this.manager.paused ? 1 : Math.min(cols, frameCount);
        const sx = Math.floor((performance.now() * this.data.texture.fps)/1000 % frameLimit) * tw;
        const sy = Math.floor(tileIndex / cols) * th;
        // draw centered similar to base Machine
        let dpr = (1/(window.devicePixelRatio))/4; // we scale a tiny bit to prevent anti-aliasing gaps
        if(!this.rotating){
            ctx.drawImage(img, sx+dpr, sy+dpr, tw-dpr*2, th-dpr*2, x*size - size/2-dpr, y*size - size/2-dpr, size+dpr*3, size+dpr*3);
        } else {
            ctx.save();
            ctx.translate(x*size, y*size);
            // Apply an animated counter-rotation while the global canvas has already been rotated
            // by `machine.data.rot` in FactoryManager. `extraRotation` is in degrees, so convert to radians.
            if(this.data.rot === 0 && this.rotating === -1) {
                ctx.rotate((this.extraRotation - this.rotating * Math.PI/2)+2*Math.PI);
            } else {
                ctx.rotate((this.extraRotation - this.rotating * Math.PI/2));
            }
            ctx.drawImage(img, sx+dpr, sy+dpr, tw-dpr*2, th-dpr*2, -size/2-dpr, -size/2-dpr, size+dpr*3, size+dpr*3);
            ctx.restore();
        }
    }
    updateRotation(delta) {
        if (this.rotating) {
            const elapsed = performance.now() - this.startRotate;
            this.extraRotation = (elapsed / this.rotateDuration) * Math.PI/2 * this.rotating;
            if (elapsed >= this.rotateDuration) {
                this.rotating = 0;
                this.extraRotation = 0;
                this.manager.generateQueue(); // regenerate draw queue to update machine order based on new rotation
            }
        }
    }
    update(delta){
        this.updateRotation(delta);
    }
    // Called when an item occupies this machine's cell. `size` is pixels per cell.
    onItemCollision(item, size) {
        // default: do nothing
    }
}