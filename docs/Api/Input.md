# Input API

Overview
- The `Input` class provides a unified way to bind to keyboard, mouse, wheel and touch events and supports: `press`, `release`, `held`, `move` (touch/mouse), wheel directions, priorities, conditional handlers and blocking.
- Handlers can receive a payload depending on the event type (see examples below).

addBinding(type, button, action, callback, priority = 0, condition = () => true)
- `type` — `keyboard`, `mouse`, `wheel`, `touch` (for touch you usually use generic keys like `touch:press` or per-id `touch:<id>:press`).
- `button` — for keyboard this is the `e.code` (e.g. `ArrowLeft`, `KeyA`, `ShiftLeft`), for mouse use `left|middle|right` or `buttonN`.
- `action` — common values: `press`, `release`, `held`, `move` (touch move), for wheel see `wheel:scroll`, `wheel:up`, `wheel:down`.
- `callback` — function called when binding triggers. `held` callbacks receive a `duration` number (ms) or a payload object for touch/wheel. Other callbacks may receive a payload depending on event type.
- `priority` — numeric priority; higher values run first.
- `condition` — function returning boolean; handler runs only when `condition()` is true.

Key/action naming summary
- Keyboard: `keyboard:<e.code>:press|release|held` (example: `keyboard:ArrowLeft:press`). Use `e.code` so layout changes don't break bindings.
- Mouse: `mouse:left:press|release|held`, `mouse:right:press` etc.
 - Wheel: `wheel:scroll:press` (payload {deltaX, deltaY, event}), and convenience `wheel:up:press` / `wheel:down:press` for vertical scroll direction.
- Touch:
  - Per-touch id keys: `touch:<id>:press|move|held|release`
  - Generic touch keys: `touch:press|move|held|release` (called for every touch)

Examples

- Simple keyboard movement (press/held/release). `held` receives a duration (ms) and with `holdThreshold = 0` fires immediately and repeats at `holdIntervalMs`:

```js
// move left while ArrowLeft is held
input.addBinding('keyboard','ArrowLeft','press',  () => moveLeftStart(), 0);
input.addBinding('keyboard','ArrowLeft','held',   (duration) => moveLeft(duration), 0);
input.addBinding('keyboard','ArrowLeft','release',() => moveLeftStop(), 0);

// move right
input.addBinding('keyboard','ArrowRight','press',  () => moveRightStart(), 0);
input.addBinding('keyboard','ArrowRight','held',   (duration) => moveRight(duration), 0);
input.addBinding('keyboard','ArrowRight','release',() => moveRightStop(), 0);
```

- Priority example: a UI overlay intercepts `KeyE` if open; otherwise lower-priority binding runs.

```js
// high priority runs first and can short-circuit functionality via condition
input.addBinding('keyboard','KeyE','press', () => openMenu(), 20, () => uiOpen);

// lower priority game action
input.addBinding('keyboard','KeyE','press', () => useItem(), 0, () => !uiOpen);
```

- Blocking: temporarily block lower-priority handlers.

```js
// block anything below priority 5
input.block(5);

// later
input.unblock();
```

- Modifier keys (Shift/Ctrl/Alt)
- Approach A — track modifier key state and use `condition`:

```js
let shiftDown = false;
input.addBinding('keyboard','ShiftLeft','press',  () => shiftDown = true);
input.addBinding('keyboard','ShiftLeft','release',() => shiftDown = false);

// use condition to only run when shift is held
input.addBinding('keyboard','KeyA','press', () => dashLeft(), 5, () => shiftDown);
```

- Approach B — bind the modifier combination explicitly by checking a shared flag in your callback.

Notes about modifiers: the Input API uses the raw `e.code` for key names; it does not automatically rename keys when shift/alt/ctrl is pressed. The recommended pattern is to either bind to the modifier key to set state (Approach A) or use conditions that consult global state.

- Touch examples

```js
// generic touch press (any finger)
input.addBinding('touch','press','press', (info) => {
  // info.touch is the changed touch; info.touches is full active touches array
  startTouchInteraction(info.touch);
});

// per-touch id binding (rarely needed directly since id changes each touch)
// The library emits per-touch keys: touch:<id>:press|move|held|release
// Generic held receives payload { touch, touches, duration }
input.addBinding('touch','held','held', (payload) => {
  // payload.duration = ms held
});
```

- Wheel example

```js
input.addBinding('wheel','scroll','press', (p) => { console.log(p.deltaY); });
input.addBinding('wheel','up','press', (p) => zoomIn(p));
input.addBinding('wheel','down','press', (p) => zoomOut(p));
```

Payloads and return values
- `held` callbacks receive either a number (`duration` in ms) or an object for touch/wheel containing `{ touch, touches, duration }` or `{ deltaX, deltaY, event }` respectively.
- Other callbacks may receive an event-specific payload as documented above.

Input helper: `getPos(touch = false)`
- `getPos()` returns `{ x, y }` — the current mouse position.
- `getPos(true)` returns an array of active touches: `[ { id, x, y, touch }, ... ]`.

Conditions and interactions
- `condition` functions are evaluated just before running a handler. They should be quick and side-effect free. Use them to gate input (for example: `() => !isTyping && !uiOpen`).
- Multiple handlers for the same key/action are sorted by `priority` (descending). Use `block()` to skip handlers below a priority threshold when you want a global interrupt.

Tips
- For instant character movement bind `held` and set `holdThreshold = 0` (already defaulted in this project) so held callbacks fire immediately and then repeat at `holdIntervalMs`.
- If you need the original DOM event inside callbacks, wrap the callback in a closure that captures global state updated from modifier bindings, or modify the `Input` class to pass the raw event (current API passes payloads described above).
