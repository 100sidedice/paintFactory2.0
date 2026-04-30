import { preloadAudio, preloadFolder, preloadImage, preloadModule, preloadJSON, preloadTilemap } from "../Helpers/preloadHelpers.js";
import { pathToDot, getByPath, setByPath, removeByPath } from "../Helpers/pathHelpers.js";

/** Manages loading and storing of game assets */
export default class AssetManager {
    constructor() {
        this.assets = {};
        this.toPreload = [];
    }
    /** Add path to be preloaded */
    addPath(assetPath, name="", type='image', extra = "image") {
        this.toPreload.push({ path: assetPath, name: name, type , extra});
    }
    /** Preloads all assets */
    async preload() {
        await this.quickLoad('./Data/config.json', "config", true, 'json', null);
        await this.quickLoad(this.get('config')["assetsPath"], "AssetPath", false, 'json', null, (data) => {
            for (const [key, asset] of Object.entries(data)) {
                this.addPath(asset.path, asset.name, asset.type, asset.extra);
            }
        });
        for (const { path, name, type , extra} of this.toPreload) {
            await this.quickLoad(path, name, true, type, extra);
        }
    }
    /** Quick-load an asset */
    async quickLoad(path, assetKey="", addToAssets = false, type='image', extra = "image", lambda = null) {
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
                // Browser JS cannot list directory contents, so `extra` should
                // contain the filenames (or name hints). Load each entry similar
                // to how `module-folder` works. Try common filename variants
                // (preserve case and capitalized) and pick the first that exists.
                const folder = {};
                const tryFetch = async (p) => {
                    try {
                        const r = await fetch(p, { method: 'HEAD' });
                        return r.ok;
                    } catch (e) {
                        return false;
                    }
                };
                const capitalize = (s) => s && s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s;
                for (const [key, val] of Object.entries(extra)) {
                    const nameHint = (val && val.name) ? val.name : key;
                    const typeHint = (val && val.type) ? String(val.type).toLowerCase() : null;
                    let candidates = [];
                    // Prefer capitalized filenames to avoid lowercase probes on case-sensitive servers
                    const capName = capitalize(nameHint);
                    const capKey = capitalize(key);
                    if (typeHint === 'json') {
                        candidates = [`/${path}/${capName}.json`, `/${path}/${capKey}.json`];
                    } else if (typeHint === 'image') {
                        candidates = [`/${path}/${capName}.png`, `/${path}/${capName}.jpg`, `/${path}/${capKey}.png`, `/${path}/${capKey}.jpg`];
                    } else if (typeHint === 'module' || typeHint === 'js' || typeHint === 'script') {
                        candidates = [`/${path}/${capName}.js`, `/${path}/${capKey}.js`];
                    } else {
                        // unknown: try capitalized variants only to reduce irrelevant probes
                        candidates = [
                            `/${path}/${capName}.json`,
                            `/${path}/${capName}.png`,
                            `/${path}/${capName}.jpg`,
                            `/${path}/${capName}.js`,
                        ];
                    }
                    let picked = null;
                    for (const c of candidates) {
                        /* eslint-disable no-await-in-loop */
                        if (await tryFetch(c)) { picked = c; break; }
                    }
                    if (!picked) {
                        // Fallback: try original path join without leading slash for the most-likely extension
                        const fallback = `${path}/${nameHint}.json`;
                        if (await tryFetch(fallback)) picked = fallback;
                    }
                    if (!picked) {
                        // If still not found, skip this entry
                        continue;
                    }
                    // Determine loader by extension
                    if (picked.endsWith('.json')) folder[key] = await preloadJSON(picked);
                    else if (picked.match(/\.png$|\.jpg$|\.jpeg$/i)) folder[key] = await preloadImage(picked);
                    else if (picked.match(/\.mp3$|\.wav$/i)) folder[key] = await preloadAudio(picked);
                    else if (picked.endsWith('.js')) folder[key] = await preloadModule(picked);
                    else folder[key] = await preloadJSON(picked);
                }
                result = folder;
                break;
            case 'module':
                result = await preloadModule(path);
                break;
            case 'tilemap':
                result = await preloadTilemap(path);
                break;
            case 'module-folder':
                const moduleFolder = {};
                for (const [key, val] of Object.entries(extra)) {
                    moduleFolder[key] = await preloadModule(`/${path}/${key}.js`);
                }
                result = moduleFolder;
                break;
            default:
                throw new Error(`Unsupported asset type: ${type}`);
        }
        // Allows the user to easily use asset back in synchronous code
        if (lambda) lambda(result);
        if (addToAssets) this.set(pathToDot(assetKey), result);
        return result;
        
    }
    /** Get an asset by its path */
    get(path){
        if(!path) return null;
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
