# Inkwell

A tiny multiplayer canvas inspired by Figma's multiplayer architecture.

Most basic canvas tutorials just fire WebSocket events and fall apart the second two people drag the same rectangle. I wanted to see if I could implement the client-side prediction and reconciliation loop from Figma's original tech blog.

## How it works
If you wait for the server before rendering local mouse drags, the UI feels terrible. If you mutate the canvas blindly, state drifts immediately.

To handle this, the client keeps two copies of the document tree:

- Server state: The last confirmed snapshot from the backend.

- Working state: Your local modifications drawn optimistically at 60fps.

When the server sends an update from another user, the client rolls back to the last confirmed server tick, applies the incoming changes, and replays your pending local actions on top. If two people modify the same property at the same time, last-write-wins decides the winner.

---

## What it does

To test it, open the room URL in two tabs side-by-side to see both cursors and test updates with sub-30ms latency on localhost. Conflicts (like two clients deleting the same node simultaneously) are resolved deterministically using Lamport timestamps so state never snaps backward or desyncs. On the canvas side, it supports a full layer system, six brush types, shapes, text, sticky notes, an eraser, undo/redo stacks, per-element opacity and stroke styling, and a live minimap.

---

## Stack

- **TypeScript** -- everything, client and server
- **Vite** -- dev server and production bundler
- **WebSocket** (`ws`) -- raw WebSocket server, no socket.io
- **Node.js** -- server runtime
- **Canvas 2D API** -- rendering, no WebGL, no libraries
- **`tsx`** -- runs the TypeScript server directly without a compile step

Keeping everything in vanilla TypeScript and raw WebSockets made it a lot easier to trace state bugs and step through the byte payloads in the network tab without framework overhead getting in the way.

---

## Architecture

Each client runs a `StateEngine` holding two world states: an authoritative snapshot confirmed by the server, and an optimistic speculative tree for instant local drawing. When you draw, the changes render immediately in the speculative tree and queue an outgoing message. When the server acknowledges it, the commit moves into the authoritative snapshot; if rejected, the client rolls back.

Mutations carry Lamport timestamps with monotonic sequence numbers. The server arbitrates ordering, resolves concurrent edits by timestamp, and broadcasts the canonical event. Any client whose local operation lost the conflict rolls back to the new server tick and replays its remaining pending mutations on top.

```
Client                          Server (Room.ts)
  |                                    |
  |-- submitMutation(CREATE, el) -----> |
  |                                    |-- applyMutation()
  |                                    |-- broadcast to peers
  |<-- MUTATION_ACK ------------------|
  |<-- MUTATION_BROADCAST (to peers) --|
```

On reconnect, the server sends a `FULL_SYNC` snapshot. The client replays any unacknowledged pending mutations on top of it. Nothing is lost.

### Directory layout

```
canvas/
├── server/
│   ├── server.ts        # WebSocket server, HTTP fallback, room routing
│   ├── Room.ts          # Per-room state, mutation application, conflict resolution
│   └── protocol.ts      # Message type constants
├── src/
│   ├── main.ts          # App entry point, wires everything together
│   ├── types.ts         # Shared types (CanvasElement, Presence, Mutation, etc.)
│   ├── engine/
│   │   └── StateEngine.ts  # Optimistic state, WebSocket client, presence
│   ├── canvas/
│   │   └── CanvasEngine.ts # Rendering, hit testing, camera, input handling
│   └── ui/
│       ├── StudioHeader.ts  # Top bar, undo/redo, presence avatars, share
│       ├── ToolRail.ts      # Left tool rail with brush and shape flyouts
│       ├── PropertyBar.ts   # Contextual property controls (color, size, etc.)
│       ├── LayerPanel.ts    # Floating layer panel
│       ├── PresenceBar.ts   # Live collaborator display
│       └── ChaosConsole.ts  # Dev tool for simulating network conditions
├── test/
│   ├── engine.test.ts       # State engine unit tests
│   ├── integration.test.ts  # Multi-client simulation tests
│   └── layers.test.ts       # Layer ordering and visibility tests
└── public/
    └── styles/main.css
```

### Rendering

`CanvasEngine` owns the `<canvas>` element and runs a `requestAnimationFrame` loop with a dirty flag. Nothing renders unless `isDirty` is true, which keeps CPU usage near zero when the canvas is idle. The camera transform is applied once per frame before all draw calls, so zoom and pan cost nothing extra.

Pen strokes are stored as arrays of absolute world-coordinate points. Shapes store `x, y, width, height`. The hit test for pens checks point distance against each segment; shapes use bounding box intersection.

---

## Running locally

You need Node.js 20+ and npm.

```bash
git clone <repo>
cd canvas
npm install
npm run dev
```

That starts both the WebSocket server (port 4000) and the Vite dev server (port 5173) with a single command via `concurrently`. Open `http://localhost:5173?room=anything` to join a named room.

To test multiplayer, open the same URL in two tabs. You'll get different randomly generated usernames and colors. Move a cursor. You'll see the other one move.

### Individual processes

```bash
npm run dev:server   # WebSocket server only
npm run dev:client   # Vite dev server only
```

### Build

```bash
npm run build
```

Output goes to `dist/`. The server runs separately; it's not bundled into the static output.

### Tests

```bash
npm test
```

Tests run via Node's native test runner (`node:test`) through `tsx`, avoiding extra dependencies like Jest or Vitest. The integration suite spins up in-memory `Room` instances with multiple mock clients connected over mock sockets to assert deterministic conflict resolution, layer reordering, and rebase behavior under race conditions.

---

## Protocol

Every WebSocket message is a JSON object with two fields: `action` and `payload`.

| Action | Direction | Description |
|---|---|---|
| `MUTATION_SUBMIT` | client -> server | Create, update, or delete an element |
| `MUTATION_ACK` | server -> client | Confirms the mutation was applied |
| `MUTATION_BROADCAST` | server -> peers | Sends the applied mutation to everyone else |
| `FULL_SYNC` | server -> client | Full room snapshot on join or reconnect |
| `PRESENCE_UPDATE` | client -> server | Cursor position, selected elements |
| `PRESENCE_BROADCAST` | server -> peers | Another client's presence data |
| `CLIENT_JOINED` | server -> all | A new client connected |
| `CLIENT_LEFT` | server -> all | A client disconnected |
| `ROOM_CLEAR` | server -> all | All elements deleted |

---

## Network simulation

The Admin Console simulates bad network conditions without touching real infra. Toggle offline mode, dial in artificial latency up to 500ms, trigger random packet drops. Good for testing the reconnect and replay logic without needing a VPN or a bad hotel WiFi.

---

## License

MIT.
