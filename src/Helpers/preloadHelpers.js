/** Preloads a single image */
export async function preloadImage(path) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = path;
    });
}
/** Preloads a single JSON file */
export async function preloadJSON(path) {
    return fetch(path).then(response => {
        if (!response.ok) {
            throw new Error(`Failed to load JSON: ${response.statusText}`);
        }
        return response.json();
    });
}
/** Preloads a single audio file */
export async function preloadAudio(path) {
    return new Promise((resolve, reject) => {
        const audio = new Audio();
        audio.oncanplaythrough = () => resolve(audio);
        audio.onerror = reject;
        audio.src = path;
    });
}
/** Preloads all assets of a specific type from a folder */
export async function preloadFolder(path, type='image') {
    const response = await fetch(path);
    if (!response.ok) {
        throw new Error(`Failed to load folder: ${response.statusText}`);
    }
    const files = await response.json();
    const assets = {};
    for (const file of files) {
        const assetPath = `${path}/${file}`;
        switch (type) {
            case 'image':
                assets[file] = await preloadImage(assetPath);
                break;
            case 'json':
                assets[file] = await preloadJSON(assetPath);
                break;
            case 'audio':
                assets[file] = await preloadAudio(assetPath);
                break;
            case 'module':
                assets[file] = await preloadModule(assetPath);
                break;
            default:
                throw new Error(`Unsupported asset type: ${type}`);
        }
    }
    return assets;
}
/** Preloads a JavaScript module */
export async function preloadModule(path) {
    return import(path);
}
/** Preloads a Tiled tilemap (JSON/tmx-lite). Loads referenced tileset images. */
export async function preloadTilemap(path) {
    const map = await preloadJSON(path);
    if (!map) return map;
    if (Array.isArray(map.tilesets)) {
        for (const ts of map.tilesets) {
            if (ts.image) {
                // Resolve image path relative to the map file
                let imgPath;
                try {
                    imgPath = new URL(ts.image, path).toString();
                } catch (e) {
                    // Fallback: join manually
                    const base = path.replace(/\/[^/]*$/, '/');
                    imgPath = base + ts.image.replace(/^\.\//, '');
                }
                ts._image = await preloadImage(imgPath);
                ts._imagePath = imgPath;
            }
        }
    }
    return map;
}