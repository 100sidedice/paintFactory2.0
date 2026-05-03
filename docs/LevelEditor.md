# Level Editor / Dev Mode

This project includes a lightweight level-editing workflow built into the game UI.

## Toggle Dev Mode

Press `F4` to toggle developer mode.

When dev mode is on:
- The level header turns orange to show edit mode is active.
- Time goals are held in place while editing.
- Clickable level fields become editable.

## Edit Level Text

In dev mode, click any of these to edit them with a prompt:
- Level header
- Level description
- Funny text

## Edit Goals

In dev mode, click a goal entry to edit it.

Supported prompt inputs:
- `dye, #RRGGBBAA, 100`
- `machine, conveyor, 10`
- `time, 100`
- A single integer like `3` to move the goal to that position in the list without changing it
- `del`, `delete`, `remove`, or `rm` to remove the selected goal

### Time Goals

Time goals are normalized to a single canonical key, so editing a time goal will not duplicate it.

## Add Goals

Press `F3` in dev mode to add a new goal.

Examples:
- `dye, #000000FF, 100`
- `machine, conveyor, 10`
- `time, 100`

## Edit Sidebar Slots

In dev mode, middle-click a sidebar slot to edit its machine list.

You can enter:
- a single integer to move the slot to a new position
- `remove`, `del`, or `rm` to remove the slot
- `base,amount, [[variant,amounts]]`
- shorthand variants like `left` / `right` will expand to `base-left` / `base-right`
- For spawners: `spawner, amount, [[color,amount]], [[variant,amount]]`
- If a variant amount is omitted, it inherits the base amount

Press `F5` in dev mode to add a new slot.

## Notes

- Dev mode is intended for quick in-editor level authoring and testing.
- Time goals only count down when dev mode is off.
- The level export shortcut `F8` still copies the current level JSON to the clipboard.
