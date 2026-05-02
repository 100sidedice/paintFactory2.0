# SidebarManager Input Map

Complete reference of all input event bindings, priorities, and conditions.

## Numeric Slot Selection
| Input | Event | Priority | Conditions | Function |
|-------|-------|----------|-----------|----------|
| `1-7` | press | default | `idx < slots.length` | Select sidebar slot by number |

## Selection & Picking
| Input | Event | Priority | Conditions | Function |
|-------|-------|----------|-----------|----------|
| `Shift + Left Mouse` | held | 3 | `gridX >= 0, gridY >= 0` | Select machine at grid position |
| `Shift + Right Mouse` | held | 3 | `gridX >= 0, gridY >= 0` | Deselect machine at grid position |
| `Middle Mouse` | held | default | none | Pick machine type at cursor (eyedropper) |
| `Ctrl + Left Mouse` | held | default | none | Pick machine type at cursor (eyedropper) |

## Copy/Paste/Cut
| Input | Event | Priority | Conditions | Class | Function |
|-------|-------|----------|-----------|-------|----------|
| `C` | press | 1 | Selection exists | `select` | Copy selected machines |
| `X` | press | 1 | Selection exists | `select` | Cut selected machines |
| `V` | press | 1 | Machines copied | `select` | Enter paste mode |
| `Left Mouse` | press | 10 | Pasting enabled | `paste` | Confirm paste location (requires 2 clicks) |
| `Right Mouse` | press | 10 | Pasting enabled | `paste` | Cancel paste mode |

## Placement & Deletion
| Input | Event | Priority | Conditions | Function |
|-------|-------|----------|-----------|----------|
| `Left Mouse` | held | 1 | Slot selected, not rotating/selecting | Continuous placement of selected machine |
| `Right Mouse` | held | 1 | Delete slot available | Remove machine at cursor |
| `Left Mouse (held)` | held | 1 | Delete selected, slot selected | Delete machines from selection while holding |

## Rotation
| Input | Event | Priority | Conditions | Class | Function |
|-------|-------|----------|-----------|-------|----------|
| `Shift + Wheel` | press | 2 | Slot selected | `select` | Rotate selected slot icon |
| `Shift+Right + Wheel` | press | 2 | Slot selected | `select` | Rotate selected slot icon |
| `Wheel` | press | default | none | `world-edit` | Rotate hovered machine or selected slot |

## Rotate & Select Actions
| Input | Event | Priority | Class | Conditions | Function |
|-------|-------|----------|-------|-----------|----------|
| `Left Mouse` | press | 3 | `rotate-select-action` | Rotate slot selected | Rotate all selected cells or hovered machine |
| `Left Mouse` | press | 3 | `rotate-select-action` | Select slot selected | Start drag selection |
| `Left Mouse` | held | 3 | `rotate-select-action` | Drag active | Select/deselect tiles as cursor moves |
| `Left Mouse` | release | 3 | `rotate-select-action` | Drag active | Finalize drag selection |

## Double-Tap Action
| Input | Event | Priority | Class | Conditions | Function |
|-------|-------|----------|-------|-----------|----------|
| `Left Mouse` | press | 1 | none | Same tile within 200ms, rotate/select not active | Swap machine type on double-tap |

## Priority Levels (High to Low)
- **10**: Paste confirmation (overrides all other actions)
- **3**: Selection, rotation, drag operations (higher priority world edits)
- **2**: Wheel rotation with modifiers (select mode)
- **1**: Basic placement, deletion, slot swap (normal world editing)
- **default**: Eyedropper tools, basic wheel scroll (lowest priority)

## Class Grouping
- `select`: Selection and copy/paste operations
- `rotate-select-action`: Rotation and tile selection dragging
- `world-edit`: Machine placement and deletion
- `paste`: Paste mode confirmation/cancellation

## Notable Input Conditions
- **Pasting Mode Guard**: Left/Right mouse press check `factoryManager.pasting` before executing
- **Slot Range Guards**: All slot-dependent actions verify `selectedIndex >= 0 && selectedIndex < slots.length`
- **Grid Bounds Guards**: Grid operations verify `gridX >= 0 && gridY >= 0`
- **Rotate/Select Exclusivity**: Left held placement skips if rotate or select slot is active
- **Shift Key Blocking**: Left held placement skips if Shift is held (prevents placement during selection)
- **Delete Slot Check**: Right held deletion requires delete slot to exist in sidebar
- **Machine Existence**: Drag select only operates on cells with machines (`getMachine(gridX, gridY)` truthy)

## Input Throttling
- **Rotation Release Throttle**: 150ms minimum between rotate events
- **Double-Tap Threshold**: 200ms window for registering second tap
- **Input Blocking**: 3ms blocks applied to prevent input stacking

## State Tracking Variables
- `_selectDragStart`: Tracks drag selection state (startX, startY, isStartSelected, processedCells)
- `_lastTap`: Tracks last tap position and time for double-tap detection
- `lastRotate`: Timestamp of last rotation to enforce throttling
- `selectedIndex`: Currently selected sidebar slot

