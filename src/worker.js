// tmlunofficial: serves the static site from ./public and runs live chat rooms.
// Each room is one Durable Object that holds the open WebSockets and the recent history (SQLite).
import { DurableObject } from "cloudflare:workers";

const STAGES = ["mainstage", "freedom-by-budweiser", "crystal-garden-by-anker", "codex", "core", "papillon", "moose-bar"];
const ROOM_RE = /^(general|crew-[A-Z0-9]{6})$/;
const HISTORY = 60;      // messages sent to someone who joins
const KEEP = 500;        // messages kept per room
const MAX_TEXT = 500;
const MAX_NAME = 24;
const RATE = { count: 5, windowMs: 10_000 }; // per connection

const validRoom = room => ROOM_RE.test(room) || STAGES.includes(room);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/api\/rooms\/([A-Za-z0-9-]+)\/ws$/);
    if (m) {
      const room = m[1];
      if (!validRoom(room)) return new Response("Unknown room", { status: 404 });
      if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected a WebSocket", { status: 426 });
      // Only accept connections from this site (or local development).
      const origin = request.headers.get("Origin");
      if (origin) {
        const o = new URL(origin);
        if (o.host !== url.host && o.hostname !== "localhost" && o.hostname !== "127.0.0.1") return new Response("Forbidden", { status: 403 });
      }
      return env.ROOMS.get(env.ROOMS.idFromName(room)).fetch(request);
    }
    if (url.pathname.startsWith("/api/")) return new Response("Not found", { status: 404 });
    return env.ASSETS.fetch(request);
  }
};

export class ChatRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS msgs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, uid TEXT NOT NULL, name TEXT NOT NULL, text TEXT NOT NULL)`);
  }

  open() { return this.ctx.getWebSockets().filter(ws => ws.readyState === WebSocket.OPEN); }

  broadcast(obj, except) {
    const data = JSON.stringify(obj);
    for (const ws of this.open()) if (ws !== except) { try { ws.send(data); } catch {} }
  }

  async fetch() {
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ sent: [] });
    const messages = this.sql.exec(`SELECT id, ts, uid, name, text FROM msgs ORDER BY id DESC LIMIT ${HISTORY}`).toArray().reverse();
    server.send(JSON.stringify({ type: "history", messages, online: this.open().length }));
    this.broadcast({ type: "presence", online: this.open().length }, server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    let msg;
    try { msg = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw)); } catch { return; }
    if (msg?.type === "ping") return ws.send(JSON.stringify({ type: "pong" }));
    if (msg?.type !== "msg") return;

    const name = String(msg.name ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_NAME);
    const text = String(msg.text ?? "").replace(/\r/g, "").trim().slice(0, MAX_TEXT);
    const uid = String(msg.uid ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
    if (!name || !text || !uid) return;

    const att = ws.deserializeAttachment() || { sent: [] };
    const now = Date.now();
    att.sent = att.sent.filter(t => now - t < RATE.windowMs);
    if (att.sent.length >= RATE.count) {
      return ws.send(JSON.stringify({ type: "error", error: "You're sending messages too fast. Wait a few seconds." }));
    }
    att.sent.push(now);
    ws.serializeAttachment(att);

    const row = this.sql.exec("INSERT INTO msgs (ts, uid, name, text) VALUES (?, ?, ?, ?) RETURNING id", now, uid, name, text).one();
    this.sql.exec("DELETE FROM msgs WHERE id <= ?", row.id - KEEP);
    this.broadcast({ type: "msg", message: { id: row.id, ts: now, uid, name, text } });
  }

  async webSocketClose(ws, code) {
    try { ws.close(code === 1005 ? 1000 : code, "bye"); } catch {}
    this.broadcast({ type: "presence", online: this.open().filter(w => w !== ws).length });
  }

  async webSocketError(ws) { this.webSocketClose(ws, 1011); }
}
