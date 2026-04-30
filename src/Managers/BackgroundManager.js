import { preloadImage } from "../Helpers/preloadHelpers.js";

export default class BackgroundManager {
    constructor(assetManager, mapPath = 'Assets/tilemaps/bg/bg.tmx') {
        this.assetManager = assetManager;
        this.mapPath = mapPath;
        this.map = null; // parsed map object
        this.tilesetImage = null;
        this.layers = [];
    }

    async preload() {
        // fetch TMX (XML) and parse
        const res = await fetch(this.mapPath);
        if (!res.ok) throw new Error(`Failed to load tilemap: ${res.statusText}`);
        const text = await res.text();
        const parser = new DOMParser();
        const xml = parser.parseFromString(text, 'application/xml');
        const mapNode = xml.querySelector('map');
        if (!mapNode) throw new Error('Invalid TMX map file');

        const map = {
            width: parseInt(mapNode.getAttribute('width'), 10),
            height: parseInt(mapNode.getAttribute('height'), 10),
            tilewidth: parseInt(mapNode.getAttribute('tilewidth'), 10),
            tileheight: parseInt(mapNode.getAttribute('tileheight'), 10),
            tilesets: [],
            layers: []
        };

        // tileset - support inline tileset or external TSX reference
        const tsNode = xml.querySelector('tileset');
        if (tsNode) {
            let imageSrc = null;
            let firstgid = parseInt(tsNode.getAttribute('firstgid') || '1', 10);
            let columns = parseInt(tsNode.getAttribute('columns') || '1', 10);
            let tilecount = parseInt(tsNode.getAttribute('tilecount') || '1', 10);

            const sourceAttr = tsNode.getAttribute('source');
            if (sourceAttr) {
                // external TSX file - fetch and parse to find image source and tileset attributes
                let tsxPath;
                try {
                    tsxPath = new URL(sourceAttr, this.mapPath).toString();
                } catch (e) {
                    const base = this.mapPath.replace(/\/[^/]*$/, '/');
                    tsxPath = base + sourceAttr.replace(/^\.\//, '');
                }
                try {
                    const tsxRes = await fetch(tsxPath);
                    if (tsxRes.ok) {
                        const tsxText = await tsxRes.text();
                        const tsxXml = new DOMParser().parseFromString(tsxText, 'application/xml');
                        const tsxTileset = tsxXml.querySelector('tileset');
                        if (tsxTileset) {
                            columns = parseInt(tsxTileset.getAttribute('columns') || columns, 10);
                            tilecount = parseInt(tsxTileset.getAttribute('tilecount') || tilecount, 10);
                            const imgNode = tsxTileset.querySelector('image');
                            if (imgNode) imageSrc = imgNode.getAttribute('source');
                        }
                        // adjust image path relative to tsx
                        if (imageSrc) {
                            try {
                                imageSrc = new URL(imageSrc, tsxPath).toString();
                            } catch (e) {
                                const base2 = tsxPath.replace(/\/[^/]*$/, '/');
                                imageSrc = base2 + imageSrc.replace(/^\.\//, '');
                            }
                        }
                    }
                } catch (err) {
                    // ignore - will attempt inline fallback
                }
            } else {
                // inline tileset with image child
                const imageNode = tsNode.querySelector('image');
                if (imageNode) imageSrc = imageNode.getAttribute('source');
                columns = parseInt(tsNode.getAttribute('columns') || columns, 10);
                tilecount = parseInt(tsNode.getAttribute('tilecount') || tilecount, 10);
                if (imageSrc) {
                    try {
                        imageSrc = new URL(imageSrc, this.mapPath).toString();
                    } catch (e) {
                        const base = this.mapPath.replace(/\/[^/]*$/, '/');
                        imageSrc = base + imageSrc.replace(/^\.\//, '');
                    }
                }
            }

            map.tilesets.push({ firstgid, image: imageSrc, columns, tilecount });
        }

        // layers
        const layerNodes = xml.querySelectorAll('layer');
        layerNodes.forEach(ln => {
            const dataNode = ln.querySelector('data');
            const encoding = dataNode.getAttribute('encoding');
            let data = [];
            if (encoding === 'csv') {
                const csv = dataNode.textContent.trim();
                data = csv.split(',').map(s => parseInt(s,10));
            } else {
                // unsupported encoding, try to read raw gids
                const txt = dataNode.textContent.trim();
                data = txt.split(/[^0-9]+/).filter(Boolean).map(s=>parseInt(s,10));
            }
            map.layers.push({ name: ln.getAttribute('name'), width: parseInt(ln.getAttribute('width'),10), height: parseInt(ln.getAttribute('height'),10), data });
        });

        this.map = map;

        // preload tileset image
        if (map.tilesets.length && map.tilesets[0].image) {
            this.tilesetImage = await preloadImage(map.tilesets[0].image);
        }

        // store in asset manager for later use if desired
        try { this.assetManager.set('background.map', map); } catch(e) {}
        if (this.tilesetImage) {
            try { this.assetManager.set('background.tileset', this.tilesetImage); } catch(e) {}
        }
        window.addEventListener('resize', () => {
            // trigger redraw on resize to adjust scaling
            
        });
    }

    draw(ctx) {
        if (!this.map || !this.tilesetImage) return;
        const ts = this.map.tilesets[0];
        const tw = this.map.tilewidth;
        const th = this.map.tileheight;
        const cols = ts.columns || Math.max(1, Math.floor(this.tilesetImage.width / tw));

        // compute scale to cover the canvas while preserving aspect ratio
        const canvasW = window.innerWidth; // use window width to ensure full horizontal coverage
        const canvasH = window.innerHeight; // use window height to ensure full vertical coverage
        const mapPixelW = this.map.width * tw;
        const mapPixelH = this.map.height * th;
        const scale = Math.max(canvasH / mapPixelH, canvasH / mapPixelH);
        const destW = mapPixelW * scale;
        const destH = mapPixelH * scale;
        const offsetX = Math.round((canvasW - destW) / 2);
        const offsetY = Math.round((canvasH - destH) / 2);

        // disable smoothing for pixel-art background rendering
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        // some browsers support imageSmoothingQuality
        if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'low';

        for (const layer of this.map.layers) {
            const data = layer.data;
            for (let y = 0; y < layer.height; y++) {
                for (let x = 0; x < layer.width; x++) {
                    const idx = y * layer.width + x;
                    const gid = data[idx];
                    if (!gid || gid <= 0) continue;
                    const tileIndex = gid - ts.firstgid;
                    const sx = (tileIndex % cols) * tw;
                    const sy = Math.floor(tileIndex / cols) * th;
                    const dx = Math.round(offsetX + x * tw * scale);
                    const dy = Math.round(offsetY + y * th * scale);
                    const dWidth = Math.ceil(tw * scale);
                    const dHeight = Math.ceil(th * scale);
                    ctx.drawImage(this.tilesetImage, sx, sy, tw, th, dx, dy, dWidth, dHeight);
                }
            }
        }

        ctx.restore();
    }
}