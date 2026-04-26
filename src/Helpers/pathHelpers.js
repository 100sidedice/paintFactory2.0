/** Helpers for working with dot-separated object paths */
export function pathToDot(path) {
    if (typeof path !== 'string') return '';
    if (path.startsWith('./')) path = path.slice(2);
    return path.replace(/\//g, '.').replace(/\.\w+$/, '');
}

export function getByPath(obj, path) {
    if (!path) return obj;
    const parts = path.split('.');
    let cur = obj;
    for (const p of parts) {
        if (cur == null) return undefined;
        cur = cur[p];
    }
    return cur;
}

export function setByPath(obj, path, value, replace = true) {
    if (!path) return;
    const parts = path.split('.');
    let cur = obj;
    for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        if (i === parts.length - 1) {
            if (!replace && (p in cur)) return;
            cur[p] = value;
        } else {
            if (!(p in cur) || typeof cur[p] !== 'object' || cur[p] === null) {
                cur[p] = {};
            }
            cur = cur[p];
        }
    }
}

export function removeByPath(obj, path) {
    if (!path) return;
    const parts = path.split('.');
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        const p = parts[i];
        if (!(p in cur)) return;
        cur = cur[p];
        if (typeof cur !== 'object' || cur === null) return;
    }
    delete cur[parts[parts.length - 1]];
}

export function joinDots(...parts) {
    let result = '';
    for (const part of parts) {
        if (!part) continue;
        result += part
        result += "."
    }
    if (result.endsWith('.')) result = result.slice(0, -1);
    return result;
}
