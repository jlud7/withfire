/**
 * With Fire — game server.
 *
 * One process serves both:
 *   - the built web client (client/dist) over HTTP, and
 *   - the realtime game protocol over WebSocket at /ws.
 *
 * Deploy anywhere that runs Node (Render, Railway, Fly, a VPS).
 * PORT is read from the environment; defaults to 3001.
 */

import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import { type ClientMsg, type ServerMsg, CODE_ALPHABET, ROOM_CODE_LENGTH } from "withfire-shared";
import { Room } from "./room.js";

const PORT = Number(process.env.PORT) || 3001;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.resolve(__dirname, "../../client/dist");

const rooms = new Map<string, Room>();

function makeCode(): string {
  let code = "";
  do {
    code = Array.from(
      { length: ROOM_CODE_LENGTH },
      () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
    ).join("");
  } while (rooms.has(code));
  return code;
}

// Reap rooms with no connected humans after 15 minutes of inactivity.
setInterval(() => {
  const cutoff = Date.now() - 15 * 60_000;
  for (const [code, room] of rooms) {
    if (room.isEmpty && room.lastActivity < cutoff) {
      room.destroy();
      rooms.delete(code);
    }
  }
}, 60_000).unref();

// ---- HTTP: static client ----------------------------------------------

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
};

const server = http.createServer(async (req, res) => {
  const url = (req.url ?? "/").split("?")[0];
  if (url === "/healthz") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }
  if (!existsSync(CLIENT_DIST)) {
    res.writeHead(503, { "content-type": "text/plain" });
    res.end("Client not built. Run: npm run build");
    return;
  }
  // Resolve within dist only; anything unknown falls back to the SPA shell.
  let filePath = path.join(CLIENT_DIST, path.normalize(url).replace(/^(\.\.[/\\])+/, ""));
  if (!filePath.startsWith(CLIENT_DIST) || url === "/" || !existsSync(filePath)) {
    filePath = path.join(CLIENT_DIST, "index.html");
  }
  try {
    const data = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "content-type": MIME[ext] ?? "application/octet-stream",
      "cache-control": ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
    });
    res.end(data);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  }
});

// ---- WebSocket: game protocol -------------------------------------------

const wss = new WebSocketServer({ server, path: "/ws" });

interface ConnState {
  room: Room | null;
  playerId: string | null;
}

wss.on("connection", (ws: WebSocket) => {
  const conn: ConnState = { room: null, playerId: null };

  const reply = (msg: ServerMsg) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  };
  const fail = (msg: string) => reply({ t: "error", msg });

  ws.on("message", (raw) => {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return fail("Bad message.");
    }

    switch (msg.t) {
      case "ping":
        return reply({ t: "pong" });

      case "create": {
        if (conn.room) return fail("Already in a room.");
        const room = new Room(makeCode());
        rooms.set(room.code, room);
        const seat = room.addHuman(msg.name, ws);
        if (typeof seat === "string") return fail(seat);
        conn.room = room;
        conn.playerId = seat.id;
        reply({ t: "joined", code: room.code, you: seat.id, token: seat.token });
        room.broadcast();
        return;
      }

      case "join": {
        if (conn.room) return fail("Already in a room.");
        const room = rooms.get(msg.code.trim().toUpperCase());
        if (!room) return fail("No room with that key. Check the code and try again.");
        const seat = room.addHuman(msg.name, ws);
        if (typeof seat === "string") return fail(seat);
        conn.room = room;
        conn.playerId = seat.id;
        reply({ t: "joined", code: room.code, you: seat.id, token: seat.token });
        room.broadcast();
        return;
      }

      case "rejoin": {
        if (conn.room) return fail("Already in a room.");
        const room = rooms.get(msg.code.trim().toUpperCase());
        if (!room) return fail("That room is gone.");
        const seat = room.rejoin(msg.token, ws);
        if (typeof seat === "string") return fail(seat);
        conn.room = room;
        conn.playerId = seat.id;
        reply({ t: "joined", code: room.code, you: seat.id, token: seat.token });
        room.broadcast();
        room.pump();
        return;
      }

      case "leave": {
        if (!conn.room || !conn.playerId) return;
        const room = conn.room;
        conn.room = null;
        conn.playerId = null;
        room.disconnect(ws);
        reply({ t: "left" });
        return;
      }

      case "addBot": {
        if (!conn.room || !conn.playerId) return fail("Not in a room.");
        const err = conn.room.addBot(conn.playerId);
        if (err) return fail(err);
        conn.room.broadcast();
        return;
      }

      case "removePlayer": {
        if (!conn.room || !conn.playerId) return fail("Not in a room.");
        const err = conn.room.removePlayer(conn.playerId, msg.id);
        if (err) return fail(err);
        conn.room.broadcast();
        return;
      }

      case "start": {
        if (!conn.room || !conn.playerId) return fail("Not in a room.");
        const err = conn.room.start(conn.playerId);
        if (err) return fail(err);
        return;
      }

      case "action": {
        if (!conn.room || !conn.playerId) return fail("Not in a room.");
        const err = conn.room.action(conn.playerId, msg.a);
        if (err) return fail(err);
        return;
      }

      case "backToLobby": {
        if (!conn.room || !conn.playerId) return fail("Not in a room.");
        const err = conn.room.backToLobby(conn.playerId);
        if (err) return fail(err);
        return;
      }
    }
  });

  ws.on("close", () => {
    conn.room?.disconnect(ws);
    conn.room = null;
    conn.playerId = null;
  });
});

// Heartbeat: drop dead sockets so seats free up for rejoin.
setInterval(() => {
  for (const ws of wss.clients) {
    const anyWs = ws as WebSocket & { _alive?: boolean };
    if (anyWs._alive === false) {
      ws.terminate();
      continue;
    }
    anyWs._alive = false;
    ws.ping();
    ws.once("pong", () => (anyWs._alive = true));
  }
}, 30_000).unref();

server.listen(PORT, () => {
  console.log(`With Fire server listening on http://localhost:${PORT}`);
});
