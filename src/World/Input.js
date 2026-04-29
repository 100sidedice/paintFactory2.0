export default class Input {
    constructor() {
        this.keyMap = new Map();
        this.active = new Map(); // track pressed keys: { pressedAt, holdTimer, holdInterval, holdFired }
        this.holdThreshold = 0; // ms to consider a hold (0 = immediate held, good for instant movement)
        this.holdIntervalMs = 20; // interval to repeatedly notify held handlers after threshold
        this.blockedPriority = null; // if set, handlers with priority < blockedPriority are skipped
        this.mousePos = { x: 0, y: 0 };
        this.touches = new Map(); // id -> { id, x, y, touch }
        this.disabledClasses = new Set(); // classes currently disabled (skip their handlers)
        // map className -> { timeoutId?, intervalId? }
        this._disabledTimers = new Map();
        // composite bindings: array of { parts: [{type,button,action,key}], callback, priority, condition, classes }
        this.compositeBindings = [];
        // map of pressKey -> priority for temporary blocking until that press is released
        this._blockedUntil = new Map();
        // current trigger key while executing handlers (used by block() to auto-bind)
        this._currentTriggerKey = null;
        // manual/global block priority (when block called outside an event)
        this._manualBlockedPriority = null;
        this.attachEvents();
    }

    _isOverUI(clientX, clientY) {
        const el = document.elementFromPoint(clientX, clientY);
        if (!el) return false;
        // treat these selectors as UI - add more selectors if you have other UI containers
        if (el.closest('.ui')) return true;
        return false;
    }

    // addBinding(..., classes) - optional `classes` can be a string or array
    addBinding(type="mouse", button="left", action="press", callback = ()=>{console.log("Action triggered")}, classes = [], priority = 0,condition = ()=>true) {
        const key = `${type}:${button}:${action}`;
        if (!this.keyMap.has(key)) {
            this.keyMap.set(key, []);
        }
        const cls = Array.isArray(classes) ? classes.slice() : (classes ? [classes] : []);
        this.keyMap.get(key).push({ callback, priority, condition, classes: cls });
    }
    // addBindings: register across multiple input triples OR create a composite binding
    // If `bindings` is an array of arrays (e.g. [[type,button,action], ...]) and its first element is an array,
    // it will be treated as a single composite binding that fires only when ALL parts are satisfied together.
    // Otherwise it registers the same handler separately for each triple (legacy behavior).
    addBindings(bindings, callback = ()=>{console.log("Action triggered")}, classes = [], priority = 0, condition = ()=>true) {
        if (!Array.isArray(bindings)) return;
        // composite if first element is an array
        if (bindings.length > 0 && Array.isArray(bindings[0])) {
            // build parts
            const parts = [];
            for (const b of bindings) {
                if (!Array.isArray(b) || b.length < 3) continue;
                const [type, button, action] = b;
                parts.push({ type, button, action, key: `${type}:${button}:${action}` });
            }
            if (parts.length === 0) return;
            this.addCompositeBinding(parts, callback, classes, priority, condition);
            return;
        }
    }

    // addCompositeBinding: parts is an array of {type,button,action,key}
    addCompositeBinding(parts, callback = ()=>{console.log("Action triggered")}, classes = [], priority = 0, condition = ()=>true) {
        const cls = Array.isArray(classes) ? classes.slice() : (classes ? [classes] : []);
        this.compositeBindings.push({ parts, callback, priority, condition, classes: cls });
    }
    hasBinding(key) {
        return Array.from(this.keyMap.keys()).some(k => k === key);
    }
    hasBindingPrefix(prefix) {
        // check atomic bindings
        if (Array.from(this.keyMap.keys()).some(k => k.startsWith(prefix))) return true;
        // also check composite bindings parts
        if (this.compositeBindings && this.compositeBindings.length > 0) {
            for (const cb of this.compositeBindings) {
                for (const p of cb.parts) {
                    if (p.key && p.key.startsWith(prefix)) return true;
                }
            }
        }
        return false;
    }

    // remove all bindings that include the given class name
    removeBindings(className) {
        if (!className) return;
        for (const [key, handlers] of Array.from(this.keyMap.entries())) {
            const remaining = handlers.filter(h => !(h.classes && h.classes.includes(className)));
            if (remaining.length > 0) this.keyMap.set(key, remaining);
            else this.keyMap.delete(key);
        }
    }
    // block handlers below a priority threshold
    // If called from inside a handler (synchronously), the block will be tied
    // to the current trigger's corresponding `:press` key and automatically
    // cleared when that press is released. If called outside an event, it
    // behaves as a global persistent block (legacy behavior).
    block(priority) {
        const pr = (typeof priority === 'number') ? priority : Infinity;
        if (this._currentTriggerKey) {
            const parts = this._currentTriggerKey.split(':');
            if (parts.length >= 2) {
                const pressKey = `${parts[0]}:${parts[1]}:press`;
                this._blockedUntil.set(pressKey, pr);
                this._recalculateBlockedPriority();
                return;
            }
        }
        // legacy: global/manual block until manual unblock()
        this._manualBlockedPriority = pr;
        this._recalculateBlockedPriority();
    }
    // keep unblock for compatibility (clears global block and any temporary blocks)
    unblock() {
        this._manualBlockedPriority = null;
        this._blockedUntil.clear();
        this._recalculateBlockedPriority();
    }

    _recalculateBlockedPriority() {
        let max = this._manualBlockedPriority != null ? this._manualBlockedPriority : null;
        for (const v of this._blockedUntil.values()) {
            if (max === null || v > max) max = v;
        }
        this.blockedPriority = max;
    }

    _clearBlockedForPressKey(pressKey) {
        if (!pressKey) return;
        if (this._blockedUntil.has(pressKey)) {
            this._blockedUntil.delete(pressKey);
            this._recalculateBlockedPriority();
        }
    }
    // internal: execute handlers for a key string, passing optional arg to callbacks
    _executeHandlers(key, arg) {
        const hasKey = this.keyMap.has(key);
        if (this._isOverUI(this.mousePos.x, this.mousePos.y)) return;
        // set current trigger so handlers can call block() to auto-bind to this trigger
        this._currentTriggerKey = key;
        try {
            // Check composite bindings first so they can call block() and prevent
            // lower-priority atomic handlers from running when desired.
            this._checkCompositeBindings(key, arg);
            if (hasKey) {
                const handlers = this.keyMap.get(key).slice();
                handlers.sort((a,b)=>b.priority - a.priority);
                for (const { callback, priority, condition, classes } of handlers) {
                    if (this.blockedPriority != null && priority < this.blockedPriority) continue;
                    // skip handlers that belong to a disabled class
                    if (classes && classes.some(c => this.disabledClasses.has(c))) continue;
                    try {
                        if (condition()) callback(arg);
                    } catch (err) {
                        console.error('Input handler error', err);
                    }
                }
            }
        } finally {
            this._currentTriggerKey = null;
        }
    }

    // check composite bindings that include the triggering key
    _checkCompositeBindings(triggerKey, arg) {
        if (!this.compositeBindings || this.compositeBindings.length === 0) return;
        for (const cb of this.compositeBindings.slice()) {
            const { parts, callback, priority, condition, classes } = cb;
            // skip if blocked or disabled classes
            if (this.blockedPriority != null && priority < this.blockedPriority) continue;
            if (classes && classes.some(c => this.disabledClasses.has(c))) continue;
            // only check composites that include the triggerKey (so we fire on an actual event)
            const includesTrigger = parts.some(p => p.key === triggerKey);
            if (!includesTrigger) continue;
            // verify all parts are satisfied
            let allGood = true;
            for (const p of parts) {
                const partKey = `${p.type}:${p.button}:${p.action}`;
                // action 'held' => part must be currently pressed (active)
                if (p.action === 'held') {
                    const pressKey = `${p.type}:${p.button}:press`;
                    if (!this.active.has(pressKey)) { allGood = false; break; }
                    continue;
                }
                // action 'press'/'release'/'move' etc: must match the trigger event (we only fire on trigger)
                if (p.key !== triggerKey) { allGood = false; break; }
            }
            if (!allGood) continue;
            try {
                if (condition()) callback(arg);
            } catch (err) {
                console.error('Composite input handler error', err);
            }
        }
    }

    // disable handlers by class name (they will be skipped until enabled)
    // New signature: disableClass(className, conditionType = 'timed', conditionData = 0)
    // - if conditionType === 'timed', conditionData is timeoutMs (milliseconds). 0 means stay disabled until enabled.
    // - if conditionType === 'function', conditionData is a function (sync or async) that should return truthy when the class may be re-enabled.
    disableClass(className, conditionType = 'timed', conditionData = 0) {
        if (!className) return;
        this.disabledClasses.add(className);
        // clear any existing timers/intervals for this class
        const prev = this._disabledTimers.get(className);
        if (prev) {
            if (prev.timeoutId) clearTimeout(prev.timeoutId);
            if (prev.intervalId) clearInterval(prev.intervalId);
            this._disabledTimers.delete(className);
        }

        if (conditionType === 'timed') {
            const timeoutMs = Number(conditionData) || 0;
            if (timeoutMs <= 0) return; // stay disabled until explicitly enabled
            const id = setTimeout(() => {
                this.enableClass(className);
                if (this._disabledTimers.has(className)) this._disabledTimers.delete(className);
            }, timeoutMs);
            this._disabledTimers.set(className, { timeoutId: id });
            return;
        }

        if (conditionType === 'function') {
            const fn = conditionData;
            if (typeof fn !== 'function') return;
            // helper to start polling
            const startPolling = () => {
                const interval = setInterval(async () => {
                    try {
                        const res = await fn();
                        if (res) {
                            clearInterval(interval);
                            if (this._disabledTimers.has(className)) this._disabledTimers.delete(className);
                            this.enableClass(className);
                        }
                    } catch (e) {
                        // ignore errors from user-provided fn
                    }
                }, 100);
                this._disabledTimers.set(className, { intervalId: interval });
            };

            try {
                const res = fn();
                if (res && typeof res.then === 'function') {
                    // async result
                    res.then((val) => {
                        if (val) this.enableClass(className);
                        else startPolling();
                    }).catch(() => { startPolling(); });
                } else if (res) {
                    this.enableClass(className);
                } else {
                    startPolling();
                }
            } catch (e) {
                // if the function throws, leave disabled with no timer
            }
            return;
        }

        // unknown conditionType -> do nothing further (remain disabled)
    }

    // enable handlers by class name
    enableClass(className) {
        if (!className) return;
        // clear any pending timers/intervals
        const prev = this._disabledTimers.get(className);
        if (prev) {
            if (prev.timeoutId) clearTimeout(prev.timeoutId);
            if (prev.intervalId) clearInterval(prev.intervalId);
            this._disabledTimers.delete(className);
        }
        this.disabledClasses.delete(className);
    }

    // toggle class disabled state
    toggleClass(className) {
        if (!className) return;
        if (this.disabledClasses.has(className)) this.enableClass(className);
        else this.disableClass(className, 'timed', 0);
    }
    attachEvents() {
        // track mouse position for getPos()
        window.addEventListener('mousemove', (e) => {
            this.mousePos.x = e.clientX;
            this.mousePos.y = e.clientY;
        }, { passive: false });

        window.addEventListener('keydown', (e) => {
            const keyBase = `keyboard:${e.code}`;
            const pressKey = `${keyBase}:press`;
            // prevent browser default if we have any binding (atomic or composite) for this key
            if (this.hasBindingPrefix(`${keyBase}:`)) {
                try { e.preventDefault(); } catch (err) { /* ignore */ }
            }
            // ignore auto-repeat spam -- only handle first keydown until keyup
            if (this.active.has(pressKey)) return;
            // mark active and start hold detection
            const now = Date.now();
            const state = { pressedAt: now, holdFired: false, holdTimer: null, holdInterval: null };
            this.active.set(pressKey, state);
            // fire press handlers once
            this._executeHandlers(pressKey);
            // schedule hold threshold
            state.holdTimer = setTimeout(()=>{
                state.holdFired = true;
                const heldKey = `${keyBase}:held`;
                // initial held notify with duration
                const duration = Date.now() - state.pressedAt;
                this._executeHandlers(heldKey, duration);
                // continue notifying at intervals while held
                state.holdInterval = setInterval(()=>{
                    const d = Date.now() - state.pressedAt;
                    this._executeHandlers(heldKey, d);
                }, this.holdIntervalMs);
            }, this.holdThreshold);
        });
        window.addEventListener('keyup', (e) => {
            const keyBase = `keyboard:${e.code}`;
            const pressKey = `${keyBase}:press`;
            const releaseKey = `${keyBase}:release`;
            const heldKey = `${keyBase}:held`;
            const state = this.active.get(pressKey);
            const now = Date.now();
            let duration = 0;
            if (state) {
                duration = now - state.pressedAt;
                if (state.holdTimer) clearTimeout(state.holdTimer);
                if (state.holdInterval) clearInterval(state.holdInterval);
                this.active.delete(pressKey);
            }
            // notify release handlers
            this._executeHandlers(releaseKey);
            // clear any temporary blocks tied to this press key
            this._clearBlockedForPressKey(pressKey);
            // if there are held handlers and hold threshold wasn't fired, still pass duration on release
            if (this.keyMap.has(heldKey) && duration > 0 && (!state || !state.holdFired)) {
                this._executeHandlers(heldKey, duration);
            }
        });
        // now mouse..
        window.addEventListener('mousedown', (e) => {
            const button = e.button === 0 ? 'left' : e.button === 1 ? 'middle' : e.button === 2 ? 'right' : `button${e.button}`;
            const keyBase = `mouse:${button}`;
            const pressKey = `${keyBase}:press`;
            const heldKey = `${keyBase}:held`;
            // prevent default browser action if we have handlers for this mouse button
            if (this.hasBindingPrefix(`${keyBase}:`)) {
                try { e.preventDefault(); } catch (err) { /* ignore */ }
            }
            // prevent double mousedown handling if already active
            if (this.active.has(pressKey)) return;
            const now = Date.now();
            const state = { pressedAt: now, holdFired: false, holdTimer: null, holdInterval: null };
            this.active.set(pressKey, state);
            this._executeHandlers(pressKey);
            state.holdTimer = setTimeout(()=>{
                state.holdFired = true;
                const duration = Date.now() - state.pressedAt;
                this._executeHandlers(heldKey, duration);
                state.holdInterval = setInterval(()=>{
                    const d = Date.now() - state.pressedAt;
                    this._executeHandlers(heldKey, d);
                }, this.holdIntervalMs);
            }, this.holdThreshold);
        });
        // prevent context menu when right-click handlers exist
        window.addEventListener('contextmenu', (e) => {
            if (this.hasBindingPrefix('mouse:right:')) {
                e.preventDefault();
            }
        });
        window.addEventListener('mouseup', (e) => {
            const button = e.button === 0 ? 'left' : e.button === 1 ? 'middle' : e.button === 2 ? 'right' : `button${e.button}`;
            const keyBase = `mouse:${button}`;
            const pressKey = `${keyBase}:press`;
            const releaseKey = `${keyBase}:release`;
            const heldKey = `${keyBase}:held`;
            const state = this.active.get(pressKey);
            const now = Date.now();
            let duration = 0;
            if (state) {
                duration = now - state.pressedAt;
                if (state.holdTimer) clearTimeout(state.holdTimer);
                if (state.holdInterval) clearInterval(state.holdInterval);
                this.active.delete(pressKey);
            }
            this._executeHandlers(releaseKey);
            // clear any temporary blocks tied to this press key
            this._clearBlockedForPressKey(pressKey);
            if (this.keyMap.has(heldKey) && duration > 0 && (!state || !state.holdFired)) {
                this._executeHandlers(heldKey, duration);
            }
        });
        // wheel / scroll
        window.addEventListener('wheel', (e) => {
            const payload = { deltaX: e.deltaX, deltaY: e.deltaY, event: e };
            // prevent page scroll when wheel handlers exist
            if (this.hasBindingPrefix('wheel:')) e.preventDefault();
            // handlers follow the addBinding signature: type, button, action -> 'wheel:scroll:press'
            this._executeHandlers('wheel:scroll:press', payload);
            if (e.deltaY < 0) this._executeHandlers('wheel:up:press', payload);
            else if (e.deltaY > 0) this._executeHandlers('wheel:down:press', payload);
        }, { passive: false });

        // touch events (supports multiple touches)
        window.addEventListener('touchstart', (e) => {
            // prevent browser default (scroll/zoom) when touch bindings exist
            if (this.hasBindingPrefix('touch:')) {
                try { e.preventDefault(); } catch (err) { /* ignore */ }
            }
            for (let i = 0; i < e.changedTouches.length; i++) {
                const t = e.changedTouches[i];
                const id = t.identifier;
                // store touch position
                this.touches.set(id, { id, x: t.clientX, y: t.clientY, touch: t });
                const keyBase = `touch:${id}`;
                const pressKey = `${keyBase}:press`;
                const genericPress = `touch:press`;
                if (this.active.has(pressKey)) continue;
                const now = Date.now();
                const state = { pressedAt: now, holdFired: false, holdTimer: null, holdInterval: null };
                this.active.set(pressKey, state);
                const info = { touch: t, touches: Array.from(e.touches) };
                this._executeHandlers(pressKey, info);
                this._executeHandlers(genericPress, info);
                state.holdTimer = setTimeout(()=>{
                    state.holdFired = true;
                    const heldKey = `${keyBase}:held`;
                    const genericHeld = `touch:held`;
                    const duration = Date.now() - state.pressedAt;
                    const payload = { touch: t, touches: Array.from(e.touches), duration };
                    this._executeHandlers(heldKey, payload);
                    this._executeHandlers(genericHeld, payload);
                    state.holdInterval = setInterval(()=>{
                        const d = Date.now() - state.pressedAt;
                        const p2 = { touch: t, touches: Array.from(e.touches), duration: d };
                        this._executeHandlers(heldKey, p2);
                        this._executeHandlers(genericHeld, p2);
                    }, this.holdIntervalMs);
                }, this.holdThreshold);
            }
        }, { passive: false });

        window.addEventListener('touchmove', (e) => {
            // prevent browser default when touch bindings exist
            if (this.hasBindingPrefix('touch:')) {
                try { e.preventDefault(); } catch (err) { /* ignore */ }
            }
            for (let i = 0; i < e.changedTouches.length; i++) {
                const t = e.changedTouches[i];
                const id = t.identifier;
                // update touch position
                this.touches.set(id, { id, x: t.clientX, y: t.clientY, touch: t });
                const keyBase = `touch:${id}`;
                const moveKey = `${keyBase}:move`;
                const genericMove = `touch:move`;
                const info = { touch: t, touches: Array.from(e.touches) };
                this._executeHandlers(moveKey, info);
                this._executeHandlers(genericMove, info);
            }
        }, { passive: false });

        window.addEventListener('touchend', (e) => {
            // prevent browser default when touch bindings exist
            if (this.hasBindingPrefix('touch:')) {
                try { e.preventDefault(); } catch (err) { /* ignore */ }
            }
            for (let i = 0; i < e.changedTouches.length; i++) {
                const t = e.changedTouches[i];
                const id = t.identifier;
                // final update then remove
                this.touches.set(id, { id, x: t.clientX, y: t.clientY, touch: t });
                const keyBase = `touch:${id}`;
                const pressKey = `${keyBase}:press`;
                const releaseKey = `${keyBase}:release`;
                const heldKey = `${keyBase}:held`;
                const genericRelease = `touch:release`;
                const genericHeld = `touch:held`;
                const state = this.active.get(pressKey);
                const now = Date.now();
                let duration = 0;
                if (state) {
                    duration = now - state.pressedAt;
                    if (state.holdTimer) clearTimeout(state.holdTimer);
                    if (state.holdInterval) clearInterval(state.holdInterval);
                    this.active.delete(pressKey);
                }
                const info = { touch: t, touches: Array.from(e.touches) };
                this._executeHandlers(releaseKey, info);
                this._executeHandlers(genericRelease, info);
                // clear any temporary blocks tied to this touch press
                this._clearBlockedForPressKey(pressKey);
                if (this.keyMap.has(heldKey) && duration > 0 && (!state || !state.holdFired)) {
                    const payload = { touch: t, touches: Array.from(e.touches), duration };
                    this._executeHandlers(heldKey, payload);
                    this._executeHandlers(genericHeld, payload);
                }
                this.touches.delete(id);
            }
        }, { passive: false });

        window.addEventListener('touchcancel', (e) => {
            for (let i = 0; i < e.changedTouches.length; i++) {
                const t = e.changedTouches[i];
                const id = t.identifier;
                const pressKey = `touch:${id}:press`;
                const state = this.active.get(pressKey);
                if (state) {
                    if (state.holdTimer) clearTimeout(state.holdTimer);
                    if (state.holdInterval) clearInterval(state.holdInterval);
                    this.active.delete(pressKey);
                }
                const info = { touch: t, touches: Array.from(e.touches) };
                this._executeHandlers(`touch:${id}:release`, info);
                this._executeHandlers(`touch:release`, info);
                this._clearBlockedForPressKey(pressKey);
                this.touches.delete(id);
            }
        }, { passive: false });
    }

    // get mouse position or touch positions
    // getPos(false) -> { x, y }
    // getPos(true)  -> [ { id, x, y, touch }, ... ]
    getPos(touch = false) {
        if (!touch) return { x: this.mousePos.x, y: this.mousePos.y };
        return Array.from(this.touches.values());
    }
}