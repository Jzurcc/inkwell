import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { Room } from './Room.ts';
import { createMessage, parseMessage } from './protocol.ts';
import {
  ProtocolAction,
  Mutation,
  Presence
} from '../src/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.resolve(ROOT_DIR, 'dist');
const PUBLIC_DIR = path.resolve(ROOT_DIR, 'public');

const PORT = Number(process.env.PORT) || 4000;
const DATA_DIR = path.resolve(ROOT_DIR, 'data', 'rooms');

// In-memory rooms with debounced disk persistence
const rooms = new Map<string, Room>();
const saveTimers = new Map<string, NodeJS.Timeout>();

function getSafeRoomFileName(roomId: string): string {
  return roomId.replace(/[^a-zA-Z0-9_-]/g, '_') + '.json';
}

function scheduleSaveRoom(room: Room): void {
  const existingTimer = saveTimers.get(room.id);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const timer = setTimeout(() => {
    saveTimers.delete(room.id);
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const filePath = path.join(DATA_DIR, getSafeRoomFileName(room.id));
      fs.writeFileSync(filePath, JSON.stringify(room.toSerializable(), null, 2), 'utf-8');
      console.log(`[Persistence] Saved room snapshot: "${room.id}"`);
    } catch (err) {
      console.error(`[Persistence] Error saving room "${room.id}":`, err);
    }
  }, 1200);

  saveTimers.set(room.id, timer);
}

function getOrCreateRoom(roomId: string, initialPassword?: string): Room {
  let room = rooms.get(roomId);
  if (!room) {
    room = new Room(roomId, initialPassword);

    // Attempt to restore room state from disk
    const diskFile = path.join(DATA_DIR, getSafeRoomFileName(roomId));
    if (fs.existsSync(diskFile)) {
      try {
        const raw = fs.readFileSync(diskFile, 'utf-8');
        const data = JSON.parse(raw);
        room.loadSerialized(data);
        console.log(`[Persistence] Restored room "${roomId}" from disk (${room.elements.size} elements, v${room.roomVersion})`);
      } catch (err) {
        console.error(`[Persistence] Failed to restore room "${roomId}" from disk:`, err);
      }
    }

    if (initialPassword && !room.password) {
      room.password = initialPassword;
    }

    rooms.set(roomId, room);
    console.log(`[Room] Created/Loaded room: "${roomId}" (password: ${room.password ? 'protected' : 'public'})`);
  }
  return room;
}

// HTTP Server
const server = http.createServer((req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://${req.headers.host}`);

  // API Endpoints
  if (url.pathname === '/api/health') {
    let totalClients = 0;
    for (const r of rooms.values()) {
      totalClients += r.clients.size;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'healthy',
        uptimeSeconds: Math.floor(process.uptime()),
        roomsCount: rooms.size,
        totalConnections: totalClients,
        timestamp: Date.now()
      })
    );
    return;
  }

  if (url.pathname === '/api/rooms') {
    const roomSummaries = Array.from(rooms.values()).map((r) => ({
      id: r.id,
      version: r.roomVersion,
      elementCount: r.elements.size,
      clientCount: r.clients.size,
      hasPassword: Boolean(r.password)
    }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(roomSummaries));
    return;
  }

  // Static File Serving (dist or public fallback) with Path Traversal Protection
  const targetDir = fs.existsSync(DIST_DIR) ? DIST_DIR : PUBLIC_DIR;
  const rawPath = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
  let filePath = path.resolve(targetDir, rawPath);

  // Path Traversal Security Hardening
  if (!filePath.startsWith(targetDir)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  // SPA fallback for non-extension client routes
  if (!fs.existsSync(filePath) && !path.extname(filePath)) {
    filePath = path.resolve(targetDir, 'index.html');
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.mjs': 'text/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
      '.ico': 'image/x-icon',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.ttf': 'font/ttf',
      '.map': 'application/json'
    };

    const isHashedAsset = rawPath.startsWith('assets/');
    res.writeHead(200, {
      'Content-Type': mimeTypes[ext] || 'application/octet-stream',
      'Cache-Control': isHashedAsset
        ? 'public, max-age=31536000, immutable'
        : 'no-cache, must-revalidate'
    });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

// WebSocket Server
const wss = new WebSocketServer({ server, path: '/ws' });

interface ClientContext {
  id: string;
  roomId?: string;
  name: string;
  color: string;
}

const socketContexts = new WeakMap<WebSocket, ClientContext>();

wss.on('connection', (ws: WebSocket) => {
  const clientId = `client_${Math.random().toString(36).substring(2, 9)}`;
  socketContexts.set(ws, {
    id: clientId,
    name: 'Collaborator',
    color: '#38BDF8'
  });

  console.log(`[WS] Client connected: ${clientId}`);

  ws.on('message', (rawData) => {
    const msg = parseMessage(rawData.toString());
    if (!msg) return;

    const ctx = socketContexts.get(ws);
    if (!ctx) return;

    switch (msg.action) {
      case ProtocolAction.JOIN_ROOM: {
        const payload = msg.payload as {
          roomId: string;
          clientName?: string;
          clientColor?: string;
          password?: string;
        };
        const roomId = payload.roomId || 'default-room';
        const candidatePassword = payload.password?.trim() || undefined;

        // Fetch or restore room from disk
        const room = getOrCreateRoom(roomId, candidatePassword);

        // If the room has a password set, verify credentials
        if (room.password) {
          if (!candidatePassword || candidatePassword !== room.password) {
            console.log(`[Auth] Rejected client ${ctx.id} for protected room "${roomId}" (invalid password)`);
            ws.send(
              createMessage(ProtocolAction.ROOM_AUTH_ERROR, {
                roomId,
                requiresPassword: true,
                error: 'invalid_password',
                message: candidatePassword ? 'Incorrect room password.' : 'This room is password protected.'
              })
            );
            return;
          }
        } else if (candidatePassword && !room.password) {
          // If host is the first one setting a password
          room.password = candidatePassword;
          scheduleSaveRoom(room);
        }

        ctx.roomId = roomId;
        ctx.name = payload.clientName || ctx.name;
        ctx.color = payload.clientColor || ctx.color;

        room.addClient(ctx.id, ws, ctx.name, ctx.color);

        // Send full state snapshot to the newly joined client
        const snapshot = room.getSnapshot(ctx.id);
        ws.send(createMessage(ProtocolAction.SYNC_STATE, snapshot));
        break;
      }

      case ProtocolAction.MUTATION_SUBMIT: {
        if (!ctx.roomId) return;
        const room = rooms.get(ctx.roomId);
        if (!room) return;

        const mutation = msg.payload as Mutation;
        mutation.authorId = ctx.id; // Force author identity

        const result = room.applyMutation(mutation);

        // Schedule debounced disk snapshot
        scheduleSaveRoom(room);

        // Send ACK back to the author
        ws.send(createMessage(ProtocolAction.MUTATION_ACK, result.ack));

        // If mutation succeeded, broadcast to all peers in the room
        if (result.broadcast) {
          room.broadcast(
            createMessage(ProtocolAction.MUTATION_BROADCAST, result.broadcast),
            ctx.id // Exclude author because author applied optimistically!
          );
        }
        break;
      }

      case ProtocolAction.PRESENCE_UPDATE: {
        if (!ctx.roomId) return;
        const room = rooms.get(ctx.roomId);
        if (!room) return;

        const update = msg.payload as Partial<Presence>;
        const updated = room.updatePresence(ctx.id, update);

        if (updated) {
          // Broadcast to all other peers in the room
          room.broadcast(
            createMessage(ProtocolAction.PRESENCE_BROADCAST, updated),
            ctx.id
          );
        }
        break;
      }

      case ProtocolAction.HEARTBEAT_PING: {
        const payload = msg.payload as { pingId: string; clientTimestamp: number };
        ws.send(
          createMessage(ProtocolAction.HEARTBEAT_PONG, {
            pingId: payload.pingId,
            clientTimestamp: payload.clientTimestamp,
            serverTimestamp: Date.now()
          })
        );
        break;
      }

      case ProtocolAction.ROOM_CLEAR: {
        if (!ctx.roomId) return;
        const room = rooms.get(ctx.roomId);
        if (room) {
          room.clear(ctx.id);
          scheduleSaveRoom(room);
        }
        break;
      }

      case ProtocolAction.SIMULATE_RACE: {
        // Special endpoint to deliberately trigger a race condition on an element
        if (!ctx.roomId) return;
        const room = rooms.get(ctx.roomId);
        if (!room) return;

        const payload = msg.payload as { elementId: string };
        const el = room.elements.get(payload.elementId);
        if (!el) return;

        // Simulate a phantom peer modifying the element concurrently
        const phantomAuthorId = `peer_chaos_${Math.random().toString(36).substring(2, 6)}`;
        const phantomMutation: Mutation = {
          mutationId: `chaos_${Date.now()}`,
          elementId: el.id,
          type: 'UPDATE',
          baseVersion: el.version, // Same base version as client!
          data: {
            x: el.x + (Math.random() > 0.5 ? 40 : -40),
            y: el.y + (Math.random() > 0.5 ? 40 : -40),
            fill: '#EF4444' // Conflict red indicator
          },
          authorId: phantomAuthorId,
          clientTimestamp: Date.now(),
          lamportClock: el.lamportClock + 1
        };

        const result = room.applyMutation(phantomMutation);
        if (result.broadcast) {
          // Broadcast to everyone including this client
          room.broadcast(createMessage(ProtocolAction.MUTATION_BROADCAST, result.broadcast));
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    const ctx = socketContexts.get(ws);
    if (ctx && ctx.roomId) {
      const room = rooms.get(ctx.roomId);
      if (room) {
        room.removeClient(ctx.id);
        console.log(`[WS] Client ${ctx.id} left room ${ctx.roomId}`);
        if (room.clients.size === 0) {
          // Clean up empty room after 10 minutes or keep in memory
          console.log(`[Room] Room ${ctx.roomId} is now empty.`);
        }
      }
    }
    console.log(`[WS] Client disconnected: ${ctx?.id}`);
  });

  ws.on('error', (err) => {
    console.error(`[WS] Error on client socket:`, err);
  });
});

server.listen(PORT, () => {
  console.log(`========================================================`);
  console.log(`🚀 Collaborative Canvas WebSocket Server Running!`);
  console.log(`📡 HTTP & WebSocket: http://localhost:${PORT}`);
  console.log(`📡 WS Endpoint:      ws://localhost:${PORT}/ws`);
  console.log(`========================================================`);
});
