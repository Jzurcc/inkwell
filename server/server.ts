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

// In-memory rooms
const rooms = new Map<string, Room>();

function getOrCreateRoom(roomId: string): Room {
  let room = rooms.get(roomId);
  if (!room) {
    room = new Room(roomId);
    rooms.set(roomId, room);
    console.log(`[Room] Created new room: "${roomId}"`);
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
      clientCount: r.clients.size
    }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(roomSummaries));
    return;
  }

  // Static File Serving (dist or public fallback)
  const targetDir = fs.existsSync(DIST_DIR) ? DIST_DIR : PUBLIC_DIR;
  let filePath = path.join(targetDir, url.pathname === '/' ? 'index.html' : url.pathname);

  // If path doesn't exist and doesn't have an extension, try index.html (SPA)
  if (!fs.existsSync(filePath) && !path.extname(filePath)) {
    filePath = path.join(targetDir, 'index.html');
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.ico': 'image/x-icon'
    };

    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
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
        };
        const roomId = payload.roomId || 'default-room';
        ctx.roomId = roomId;
        ctx.name = payload.clientName || ctx.name;
        ctx.color = payload.clientColor || ctx.color;

        const room = getOrCreateRoom(roomId);
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
