# Inkwell Codebase Architecture

> Read this before any task. Avoids cold-navigation greps.

---

## 1. Tech Stack

| Layer | Tech |
|---|---|
| Client bundler | Vite 6, TypeScript 5, no framework |
| Client entry | `src/main.ts` → `bootstrap()` on `DOMContentLoaded` |
| Server | Node.js 20, `ws` library, `tsx watch` for hot-reload |
| Dev ports | Client: 5173, Server/WS: 4000. Vite proxies `/ws` and `/api` to :4000 |
| Production | `npm run build` → `dist/`, served by server.ts as static files. Deployed to **Render.com** via `render.yaml` |
| CSS | Single file: `public/styles/main.css` — no framework, no Tailwind |
| Fonts | Plus Jakarta Sans (UI text), JetBrains Mono (mono/code), loaded from Google Fonts |
| Persistence | Rooms saved to `data/rooms/<id>.json` on server, debounced 1200 ms |

---

## 2. Directory Map

```
canvas/
├── index.html              ← Static DOM shell (mount points only)
├── src/
│   ├── main.ts             ← Bootstrap: wires all classes together
│   ├── types.ts            ← ALL shared types (canonical source of truth)
│   ├── engine/
│   │   ├── StateEngine.ts  ← CRDT state, mutations, undo/redo, presence
│   │   └── WebSocketClient.ts ← WS transport + latency simulation
│   ├── canvas/
│   │   └── CanvasEngine.ts ← Rendering loop, input events, tools, camera
│   └── ui/
│       ├── StudioHeader.ts     ← Top bar (brand, menu, title, undo/redo, share)
│       ├── StudioFooter.ts     ← Bottom bar (room btn, element count, zoom, minimap toggle)
│       ├── ToolRail.ts         ← Left vertical rail (tool selection, brush flyouts)
│       ├── PropertyBar.ts      ← Subbar below header (stroke, fill, opacity, erase toggle)
│       ├── LayerPanel.ts       ← Right drawer (layer CRUD, visibility, lock)
│       ├── LobbyModal.ts       ← Room create/join modal (shown on load + footer btn)
│       ├── ChaosConsole.ts     ← Right drawer admin: network sim, conflict log
│       ├── ShareModal.ts       ← Share/invite modal
│       ├── CloudStatusModal.ts ← Connection diagnostics modal
│       ├── TextEditModal.ts    ← Floating input for text/sticky_note elements
│       └── Toolbar.ts          ← Legacy/alternative toolbar (minimal use)
├── server/
│   ├── server.ts           ← HTTP + WS server, room routing, persistence
│   ├── Room.ts             ← Per-room: elements map, version clock, mutation apply
│   └── protocol.ts         ← createMessage(action, payload) / parseMessage(raw)
├── public/
│   └── styles/main.css     ← Entire CSS codebase (4400+ lines)
├── data/rooms/             ← Server-side room JSON snapshots
├── render.yaml             ← Render.com deploy config
└── vite.config.ts          ← Proxy: /ws → :4000, /api → :4000
```

---

## 3. Instantiation Order (main.ts bootstrap)

```
1. new WebSocketClient()
2. new StateEngine(wsClient)
3. new CanvasEngine(canvas, stateEngine)
4. new ChaosConsole(container, stateEngine, canvasEngine)
5. new LayerPanel(container, stateEngine, canvasEngine)
6. new StudioHeader(container, stateEngine, canvasEngine, onToggleChaos, onToggleLayers)
7. new PropertyBar(container, canvasEngine)
8. new ToolRail(container, canvasEngine)
9. new StudioFooter(container, stateEngine, canvasEngine)
10. wsClient.connect()
11. LobbyModal.show(stateEngine, canvasEngine, onEnter)  ← Shown on first load
```

---

## 4. DOM Mount Points (`index.html`)

All containers are empty shells that UI classes fill via `innerHTML`:

| `id` | Element | Populated By |
|---|---|---|
| `studio-header` | `<header>` | `StudioHeader` |
| `studio-subbar` | `<div>` | `PropertyBar` |
| `studio-left-rail` | `<aside>` | `ToolRail` |
| `canvas-container` | `<main>` | (static in HTML) |
| `canvas-viewport` | `<canvas>` | `CanvasEngine` |
| `minimap-canvas` | `<canvas>` | `CanvasEngine.setMinimap()` |
| `minimap-container` | `<div>` | Static HTML |
| `canvas-layers-btn` | `<button>` | Static HTML, wired in main.ts |
| `canvas-layers-count` | `<span>` | Updated in main.ts |
| `studio-layers-drawer` | `<aside>` | `LayerPanel` |
| `chaos-drawer-container` | `<aside>` | `ChaosConsole` |
| `studio-footer` | `<footer>` | `StudioFooter` |

Modals (`LobbyModal`, `ShareModal`, `CloudStatusModal`, `TextEditModal`, `StudioFooter.showShortcutsModal()`) are **appended to `document.body`** and removed on close.

---

## 5. Key Element ID Registry

### StudioHeader (`#studio-header`)
| ID | What it is |
|---|---|
| `hdr-brand-home` | Brand emblem — click opens LobbyModal |
| `btn-studio-hamburger` | Hamburger menu toggle |
| `hamburger-dropdown-menu` | The hamburger dropdown (`.open` class toggles it) |
| `studio-doc-title` | Board name text input |
| `hdr-btn-undo` / `hdr-btn-redo` | Undo / Redo buttons |
| `studio-header-right-slot` | Right section — rebuilt by `renderRightActions()` |
| `sync-status-pill` | Cloud save indicator (`.flash-saved` triggers animation) |
| `studio-cloud-status` | Connectivity icon in lucid-controls-strip |
| `btn-studio-search` | Opens command palette |
| `btn-studio-share` | Opens ShareModal |
| `sub-share-room` | "Active Room" menu item (text updated by `updateRoomDisplay()`) |
| `sub-help-shortcuts` | Opens shortcuts modal |
| `sub-help-admin` | Toggles ChaosConsole |

### StudioFooter (`#studio-footer`)
| ID | What it is |
|---|---|
| `footer-btn-room` | Room popup trigger → opens LobbyModal |
| `footer-room-label` | `<span>` showing current room name (updated after room switch) |
| `footer-element-count` | Element counter pill |
| `btn-show-shortcuts` | Keyboard shortcuts modal trigger |
| `footer-btn-minimap` | Minimap toggle (`.active` when visible) |
| `footer-zoom-out` / `footer-zoom-in` | Zoom buttons |
| `footer-zoom-slider` | Range input for zoom |
| `footer-zoom-reset` | % label, click resets zoom to 100% |

### Canvas / Layers
| ID | What it is |
|---|---|
| `canvas-layers-btn` | Floating layers button (top-right of canvas) |
| `canvas-layers-count` | Badge showing layer count |
| `btn-close-minimap` | X button inside minimap widget |

---

## 6. CSS Naming Convention (`public/styles/main.css`)

Everything is plain CSS — no scoping, no Tailwind. Namespaced by prefix:

| Prefix | Scope |
|---|---|
| `studio-*` | App-level layout and shared containers |
| `hdr-*` | Header-specific elements |
| `footer-*` | Footer-specific elements |
| `room-*` | Room selector dock (footer) |
| `lucid-*` | Hamburger menu dropdown, Lucidchart-style |
| `rail-*` | Left tool rail |
| `flyout-*` | Flyout cards on tool rail items |
| `prop-*` | PropertyBar (subbar) |
| `popover-*` | Color/stroke/opacity popovers in PropertyBar |
| `lobby-*` | LobbyModal styles |
| `modal-*` | Generic modal dialog styles |
| `canvas-*` | Canvas container, floating buttons |
| `minimap-*` | Minimap widget |
| `shortcuts-*` | Shortcuts help modal |
| `chaos-*` | ChaosConsole drawer |
| `presence-*` | Presence/collaborator avatars |

**Theme switching**: `document.documentElement.setAttribute('data-theme', 'dark'|'light')` — all dark overrides use `[data-theme="dark"] .class { ... }`.

**CSS variables** (defined in `:root`): `--color-brand`, `--text-primary`, `--text-muted`, `--text-secondary`, `--border-outer`, `--border-inner`, `--bg-surface`, `--bg-elevated`, `--radius-sm`, `--radius-md`, `--font-mono`, `--font-sans`.

---

## 7. StateEngine Public API

**Key state properties** (all public, read directly by UI):
```ts
clientId, clientName, clientColor, roomId
authoritativeElements: Map<string, CanvasElement>  // server-confirmed state
speculativeElements: Map<string, CanvasElement>     // optimistic local state (use this for rendering)
pendingMutations: Mutation[]
undoStack, redoStack: HistoryEntry[]
presences: Map<string, Presence>
layers: Map<string, Layer>
activeLayerId: string
ws: WebSocketClient
```

**Key methods**:
```ts
setRoom(roomId, password?)       // clears local state + sends JOIN_ROOM
joinCurrentRoom()                // re-sends JOIN_ROOM (called on reconnect)
submitMutation(type, elementId?, data, isUndoRedo?) → Mutation
                                 // Optimistic: applies locally + sends over WS
undo() / redo()                  // reverses last mutation via inverse submitMutation
canUndo() / canRedo() → boolean
updateLocalPresence(update)      // throttled presence broadcast
getSortedLayers() → Layer[]      // sorted by .order
createLayer(name?) / deleteLayer(id) / toggleLayerVisibility(id)
toggleLayerLock(id) / setLayerOpacity(id, n) / renameLayer(id, name)
moveLayerUp(id) / moveLayerDown(id) / setActiveLayer(id)
clearRoom()                      // DELETE all elements
```

**Event subscriptions** (all return unsubscribe function):
```ts
onStateChange(cb: () => void)         // elements changed
onPresenceChange(cb: () => void)      // peer cursor/tool changed
onLayersChange(cb: () => void)        // layer structure changed
onConflict(cb: (evt: ConflictEvent) => void)
onAuthError(cb: (evt: AuthErrorEvent) => void)
```

---

## 8. CanvasEngine Public API

**Key state properties**:
```ts
activeTool: CanvasTool        // 'select' | 'pen' | 'rectangle' | 'circle' | ... | 'eraser' | etc.
isEraserMode: boolean         // overlay flag — brush still active, but erasing
strokeColor: string
strokeWidth: number
fillColor: string
elementOpacity: number
activeBrushType: BrushType    // 'pen' | 'marker' | 'calligraphy' | 'neon' | 'spray' | 'eraser'
activeDashStyle: DashStyle    // 'solid' | 'dashed' | 'dotted'
camera: Camera                // { x, y, zoom }
selectedElementIds: Set<string>
theme: 'light' | 'dark'
engine: StateEngine           // reference to state
```

**Key methods**:
```ts
setTool(tool: CanvasTool)
toggleEraserMode() / setEraserMode(enabled)
cycleBrushType() / cycleSelectionTool() / cycleFillTool() / cycleShapeTool()
setStrokeColor(c) / setFillColor(c) / setStrokeWidth(n)
setBrushType(b) / setDashStyle(d) / setElementOpacity(n)
zoomIn(factor?) / zoomOut(factor?) / zoomAt(sx, sy, factor) / resetView()
screenToWorld(sx, sy) → Point / worldToScreen(wx, wy) → Point
deleteSelected() / duplicateSelected()
setTheme('light'|'dark') / toggleTheme()
setMinimap(canvas)
requestRender()               // sets isDirty=true; render fires next RAF
```

**Event subscriptions**:
```ts
onToolChange(cb: (tool) => void)
onStyleChange(cb: () => void)     // fired when stroke/fill/brush/dash/opacity changes
onSelectionChange(cb: () => void)
onEraserModeChange(cb: (enabled) => void)
```

---

## 9. Rendering Pipeline

```
StateEngine.speculativeElements
        ↓
CanvasEngine (RAF loop — only runs when isDirty=true)
  1. clear ctx
  2. draw background / grid
  3. for each layer (sorted by .order, only visible layers):
       a. draw elements on layerCanvas (offscreen)
       b. composite layerCanvas → elementCanvas
            → eraser strokes use destination-out on elementCanvas
  4. draw elementCanvas → main ctx
  5. draw selection handles, area-select overlays
  6. draw remote cursors (lerped positions)
  7. draw local brush cursor circle (when isEraserMode or pen tools)
  8. update minimap
```

**Eraser compositing pattern** (critical gotcha):
- `activeBrushType = 'eraser'` when eraser mode on
- Eraser strokes are drawn to `elementCanvas` with `globalCompositeOperation = 'destination-out'`
- This means they carve through the drawing without touching the background/grid
- Eraser `CanvasElement`s have `brushType: 'eraser'` — **skip them in `hitTest()` and `applyAreaSelection()`** (they're never selectable)

---

## 10. WebSocket Protocol

All messages are `{ action: ProtocolActionType, payload: T, timestamp: number }`.

| Action | Direction | Payload |
|---|---|---|
| `JOIN_ROOM` | C→S | `{ roomId, clientName, clientColor, password? }` |
| `SYNC_STATE` | S→C | Full room snapshot on join |
| `MUTATION_SUBMIT` | C→S | `Mutation` |
| `MUTATION_ACK` | S→C | `{ mutationId, elementId, serverVersion, success, resolvedElement? }` |
| `MUTATION_BROADCAST` | S→C | Broadcast to peers (not sender) |
| `PRESENCE_UPDATE` | C→S | Partial `Presence` |
| `PRESENCE_BROADCAST` | S→C | Peer presence update |
| `CLIENT_JOINED` | S→C | New peer joined |
| `CLIENT_LEFT` | S→C | `{ clientId }` |
| `ROOM_CLEAR` | S→C | Room cleared event |
| `ROOM_AUTH_ERROR` | S→C | `{ roomId, requiresPassword, error, message }` |
| `HEARTBEAT_PING/PONG` | both | Latency measurement |

**WS URL resolution** (in `WebSocketClient`): dev port 5173 → connects to `:4000/ws`. Production → same host/port as HTTP.

---

## 11. LobbyModal Patterns

- **Static factory**: `LobbyModal.show(engine, canvasEngine?, onEnter?)` — kills any existing instance, creates new one
- **Singleton**: `LobbyModal.instance` — only one lobby open at a time
- Opens automatically on app start (`main.ts` line 131)
- Also opens from: footer `#footer-btn-room` click, header brand click, hamburger "Active Room" menu item
- Room name generator: `ROOM_PREFIXES` (40) + `ROOM_SUFFIXES` (40) + 2-digit number → e.g. `neon-cove-42`
- Avatar palette: 18 colors from `PALETTE` static array (2 rows of 9)

---

## 12. UI Component Patterns

All UI classes follow the same lifecycle:

```ts
constructor(container, ...engines) {
  this.render();      // sets container.innerHTML
  this.subscribe();   // listens to engine events → re-render / partial update
}

private subscribe() {
  engine.onStateChange(() => this.updateCounters());    // partial update
  canvasEngine.onStyleChange(() => this.render());      // full re-render
}

public render() {
  this.container.innerHTML = `...template...`;
  this.attachEvents();   // ← MUST be called at end of render() since innerHTML wipes listeners
}

private attachEvents() {
  this.container.querySelector('#some-id')?.addEventListener(...);
}
```

> **Critical**: Since `innerHTML` wipes all DOM children and their event listeners, `attachEvents()` must always be called at the end of every `render()`. Never cache element references across renders.

**Modals** (`LobbyModal`, `ShareModal`, `CloudStatusModal`, `TextEditModal`):
- Created via static `.show()` method
- Append to `document.body`
- Remove themselves on close (backdrop click, Escape, or close button)
- Use `.modal-backdrop.visible` → CSS transition for enter/exit animation

---

## 13. Layer System

- 3 default layers: `layer-1` (Base), `layer-2` (Artwork, default active), `layer-3` (Overlays)
- Layer order controlled by `Layer.order` integer — `getSortedLayers()` sorts ascending
- Each `CanvasElement` has `layerId?: string` — defaults to active layer on creation
- Locked layers: elements not editable, but still visible
- Hidden layers: not rendered, not hitable
- Layer CRUD goes through `StateEngine` methods; mutations submitted for element reassignment on delete

---

## 14. Types Cheat Sheet (`src/types.ts`)

```ts
ElementType = 'rectangle'|'circle'|'pen'|'arrow'|'sticky_note'|'text'|'triangle'|'star'|'diamond'|'line'|'lasso_brush'
CanvasTool  = ElementType | 'select'|'eraser'|'delete'|'marquee'|'circle_select'|'lasso_select'|'eyedropper'|'paint_bucket'|'hand'|'zoom'|'crop'
BrushType   = 'pen'|'marker'|'calligraphy'|'neon'|'spray'|'eraser'
DashStyle   = 'solid'|'dashed'|'dotted'

CanvasElement.points?: Point[]      // freehand pen strokes
CanvasElement.brushType?: BrushType // for pen-type elements
CanvasElement.layerId?: string
CanvasElement.version: number       // monotonic per-element
CanvasElement.lamportClock: number  // distributed ordering
```

---

## 15. Server Architecture

- `server.ts`: HTTP server serves `dist/` (prod) or `public/` (dev assets). WS server handles all protocol messages.
- `Room.ts`: Holds `elements: Map<string, CanvasElement>`, `roomVersion`, `lamportClock`, `clients: Set<WebSocket>`. Applies mutations, resolves conflicts by version.
- Rooms persisted to `data/rooms/<safe-name>.json` with 1200 ms debounce.
- **No DB** — pure in-memory with flat-file snapshots.
- Password protection per room; stored on `Room.password`.

---

## 16. Common Gotchas

1. **Re-render wipes events**: Always call `attachEvents()` at end of `render()`. Never cache `querySelector` results beyond a single method call.

2. **Eraser is a BrushType, not a CanvasTool**: `activeTool` stays as `'pen'` (or whatever brush), `isEraserMode = true` overlays eraser behavior. Eraser elements have `brushType: 'eraser'` and must be excluded from `hitTest` and `applyAreaSelection`.

3. **Offscreen canvas sizes must match main canvas**: `elementCanvas` and `layerCanvas` are resized in `setupResizeHandler()` to match `canvas.width/height` (DPR-scaled). If you add a new offscreen buffer, sync it there.

4. **Use `speculativeElements` for rendering**: `authoritativeElements` is the server-confirmed snapshot. `speculativeElements` is what the user sees (optimistic). Always read from `speculativeElements`.

5. **`requestRender()` just sets a dirty flag**: It doesn't render immediately. The RAF loop checks `isDirty` each frame. Don't call it in a tight loop unnecessarily.

6. **Presence is throttled**: `updateLocalPresence()` throttles sends to avoid flooding. Don't call `ws.send(PRESENCE_UPDATE, ...)` directly.

7. **Room button is in the footer, NOT the header**: The header room pill (`#hdr-btn-room`) was removed. The footer button (`#footer-btn-room`) now opens LobbyModal. The header brand (`#hdr-brand-home`) still opens LobbyModal on click.

8. **Footer re-renders on `canvasEngine.onStyleChange`**: `StudioFooter.render()` is subscribed to `canvasEngine.onStyleChange`. This means the zoom slider and room label rebuild on any style change. The room label reads `this.engine.roomId` fresh from state each time.

9. **Theme**: Stored in `localStorage('inkwell_theme')`. Set via `canvasEngine.setTheme()` which sets `data-theme` on `<html>` and fires `styleChangeListeners`.

10. **WS dev proxy**: Vite proxies `/ws` → `:4000`. In production, server.ts serves static files and handles WS on the same port (4000 / `process.env.PORT`).
