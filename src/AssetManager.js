import { preloadAudio, preloadFolder, preloadImage, preloadModule, preloadJSON, preloadTilemap } from "./helpers/preload.js";
import { pathToDot, getByPath, setByPath, removeByPath } from "./helpers/pathHelpers.js";

/** Manages loading and storing of game assets */
export default class AssetManager {
    constructor() {
        this.assets = {};
        this.toPreload = [];
    }
    /** Add path to be preloaded */
    addPath(assetPath, type='image', extra = "image") {
        this.toPreload.push({ path: assetPath, type , extra});
    }
    /** Preloads all assets */
    async preload() {
        await this.quickLoad('./Data/config.json', true, 'json', null);
        await this.quickLoad(this.get('Data.config')["assetsPath"], true, 'json', null, (data) => {
            for (const [key, asset] of Object.entries(data)) {
                this.addPath(asset.path, asset.type, asset.extra);
            }
        });
        for (const { path, type , extra} of this.toPreload) {
            await this.quickLoad(path, true, type, extra);
            document.getElementById('debug').textContent += `Hola`;
        }
    }
    /** Quick-load an asset */
    async quickLoad(path, addToAssets = false, type='image', extra = "image", lambda = null) {
        let result;
        switch (type) {
            case 'image':
                result = await preloadImage(path);
                break;
            case 'json':
                result = await preloadJSON(path);
                break;
            case 'audio':
                result = await preloadAudio(path);
                break;
            case 'folder':
                result = await preloadFolder(path, extra);
                break;
            case 'module':
                result = await preloadModule(path);
                break;
            case 'tilemap':
                result = await preloadTilemap(path);
                break;
            default:
                throw new Error(`Unsupported asset type: ${type}`);
        }
        // Allows the user to easily use asset back in synchronous code
        if (lambda) lambda(result);
        if (addToAssets) this.set(pathToDot(path), result);
        return result;
        
    }
    /** Get an asset by its path */
    get(path){
        if (!path) return this.assets;
        return getByPath(this.assets, path);
    }
    /** Set an asset by its path */
    set(path, asset, replace = true){
        setByPath(this.assets, path, asset, replace);
    }
    remove (path){
        removeByPath(this.assets, path);
    }
}
