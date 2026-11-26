// tmlunofficial: serves the static site from ./public plus a small API.
//  - Hub (one Durable Object, SQLite): accounts, sessions, saved sets, crowd counts.
//  - ChatRoom (one Durable Object per room): live WebSocket chat with recent history.
// Browsing the line-up needs no account; saving sets and chatting do.
import { DurableObject } from "cloudflare:workers";

const COOKIE = "tml_session";
const STATE_COOKIE = "tml_oauth";   // CSRF state for the Google round trip
const PENDING_COOKIE = "tml_new";   // Google account that still has to pick a username
const SESSION_DAYS = 60;
const ROOM_RE = /^(general|artist-[a-z0-9-]{1,60}|crew-[A-Z0-9]{6})$/;
const SET_KEY_RE = /^2026-12-1[123]\/[a-z0-9+-]{1,120}$/;
const COLORS = ["#F5A524", "#FF6370", "#4CC9DE", "#9D83FF", "#5BC26E", "#FF5F9E", "#C49A86", "#3B82F6", "#14B8A6", "#EAB308"];

const json = (data, init = {}) => new Response(JSON.stringify(data), { ...init, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...(init.headers || {}) } });
const err = (status, error) => json({ error }, { status });

function getCookie(req, name) {
  const m = (req.headers.get("cookie") || "").match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[1]) : null;
}
function sessionCookie(token, url, maxAge) {
  const secure = url.protocol === "https:" ? "; Secure" : "";
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}
function tempCookie(name, value, url, maxAge) {
  const secure = url.protocol === "https:" ? "; Secure" : "";
  return `${name}=${value}; Path=/api/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}
const redirect = (to, cookies = []) => {
  const h = new Headers({ location: to, "cache-control": "no-store" });
  for (const c of cookies) h.append("set-cookie", c);
  return new Response(null, { status: 302, headers: h });
};
const googleReady = env => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
function b64urlJson(part) {
  const b = atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "="));
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(b, c => c.charCodeAt(0))));
}
function sameOrigin(req, url) {
  const origin = req.headers.get("Origin");
  if (!origin) return true;
  try { const o = new URL(origin); return o.host === url.host || o.hostname === "localhost" || o.hostname === "127.0.0.1"; } catch { return false; }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const p = url.pathname;
    if (!p.startsWith("/api/")) return env.ASSETS.fetch(req);
    if (!sameOrigin(req, url)) return err(403, "Forbidden");

    const hub = env.HUB.get(env.HUB.idFromName("hub"));
    const token = getCookie(req, COOKIE);
    const body = async () => { try { return await req.json(); } catch { return {}; } };
    const cb = url.origin + "/api/auth/google/callback";

    try {
      // ----- Sign in with Google -----
      if (p === "/api/auth/google/start" && req.method === "GET") {
        if (!googleReady(env)) return redirect("/#signin-error");
        const state = randHex(16);
        const q = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: cb, response_type: "code", scope: "openid profile", state, prompt: "select_account" });
        return redirect("https://accounts.google.com/o/oauth2/v2/auth?" + q, [tempCookie(STATE_COOKIE, state, url, 600)]);
      }
      if (p === "/api/auth/google/callback" && req.method === "GET") {
        const clear = tempCookie(STATE_COOKIE, "", url, 0);
        const state = getCookie(req, STATE_COOKIE), code = url.searchParams.get("code");
        if (!googleReady(env) || !code || !state || !safeEqual(state, url.searchParams.get("state") || "")) return redirect("/#signin-error", [clear]);
        const tr = await fetch(env.GOOGLE_TOKEN_URL_DEV || "https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: cb, grant_type: "authorization_code" }) });
        const tok = await tr.json().catch(() => ({}));
        if (!tr.ok || !tok.id_token) { console.error("google token", tr.status, tok.error); return redirect("/#signin-error", [clear]); }
        // The ID token came straight from Google's token endpoint over TLS, so its claims can be read without re-checking the signature.
        const c = b64urlJson(tok.id_token.split(".")[1]);
        if (c.aud !== env.GOOGLE_CLIENT_ID || !["accounts.google.com", "https://accounts.google.com"].includes(c.iss) || !c.sub || c.exp * 1000 < Date.now()) return redirect("/#signin-error", [clear]);
        const r = await hub.googleSignin(String(c.sub), String(c.name || c.given_name || ""));
        if (r.token) return redirect("/#welcome", [clear, sessionCookie(r.token, url, SESSION_DAYS * 86400)]);
        return redirect("/#pick-username", [clear, tempCookie(PENDING_COOKIE, r.pending, url, 1800)]);
      }
      if (p === "/api/auth/google/finish" && req.method === "POST") {
        const b = await body();
        const r = await hub.googleFinish(getCookie(req, PENDING_COOKIE) || "", String(b.username || ""), String(b.display || ""));
        if (r.error) return err(400, r.error);
        const h = new Headers({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
        h.append("set-cookie", sessionCookie(r.token, url, SESSION_DAYS * 86400)); h.append("set-cookie", tempCookie(PENDING_COOKIE, "", url, 0));
        return new Response(JSON.stringify({ user: r.user, favs: r.favs }), { headers: h });
      }
      if (p === "/api/signup" && req.method === "POST") {
        const b = await body();
        const r = await hub.signup(String(b.username || ""), String(b.password || ""), String(b.display || ""), Array.isArray(b.favs) ? b.favs : []);
        if (r.error) return err(400, r.error);
        return json({ user: r.user, favs: r.favs }, { headers: { "set-cookie": sessionCookie(r.token, url, SESSION_DAYS * 86400) } });
      }
      if (p === "/api/login" && req.method === "POST") {
        const b = await body();
        const r = await hub.login(String(b.username || ""), String(b.password || ""), Array.isArray(b.favs) ? b.favs : []);
        if (r.error) return err(401, r.error);
        return json({ user: r.user, favs: r.favs }, { headers: { "set-cookie": sessionCookie(r.token, url, SESSION_DAYS * 86400) } });
      }
      if (p === "/api/logout" && req.method === "POST") {
        if (token) await hub.logout(token);
        return json({ ok: true }, { headers: { "set-cookie": sessionCookie("", url, 0) } });
      }
      if (p === "/api/me" && req.method === "GET") {
        const r = token ? await hub.me(token) : null;
        const pending = r ? null : await hub.pendingFor(getCookie(req, PENDING_COOKIE) || "");
        return json({ ...(r || { user: null, favs: [] }), google: googleReady(env), pending });
      }
      if (p === "/api/favs" && req.method === "POST") {
        const b = await body();
        const r = token ? await hub.setFavs(token, b.add || [], b.remove || []) : null;
        if (!r) return err(401, "Sign in to save sets");
        if (r.error) return err(400, r.error);
        return json(r);
      }
      if (p === "/api/social" && req.method === "GET") {
        return json(await hub.social(), { headers: { "cache-control": "public, max-age=10" } });
      }
      if (p === "/api/going" && req.method === "GET") {
        const key = url.searchParams.get("set") || "";
        if (!SET_KEY_RE.test(key)) return err(400, "Unknown set");
        return json(await hub.going(key));
      }
      const m = p.match(/^\/api\/rooms\/([A-Za-z0-9-]+)\/ws$/);
      if (m) {
        if (!ROOM_RE.test(m[1])) return err(404, "Unknown room");
        if (req.headers.get("Upgrade") !== "websocket") return err(426, "Expected a WebSocket");
        const me = token ? await hub.me(token) : null;
        if (!me?.user) return err(401, "Sign in to chat");
        const fwd = new Request(req, { headers: new Headers(req.headers) });
        fwd.headers.set("x-tml-user", JSON.stringify({ id: me.user.id, name: me.user.display, color: me.user.color }));
        return env.ROOMS.get(env.ROOMS.idFromName(m[1])).fetch(fwd);
      }
      return err(404, "Not found");
    } catch (e) {
      console.error(e);
      return err(500, "Something went wrong. Try again.");
    }
  }
};

// ---------- Accounts, saved sets and crowd counts ----------
const enc = new TextEncoder();
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
const randHex = n => hex(crypto.getRandomValues(new Uint8Array(n)));
async function hashPassword(password, saltHex) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const salt = new Uint8Array(saltHex.match(/../g).map(h => parseInt(h, 16)));
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 100000 }, key, 256));
}
const sha256 = async s => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
function safeEqual(a, b) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }

export class Hub extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, display TEXT NOT NULL, color TEXT NOT NULL, pass TEXT NOT NULL, salt TEXT NOT NULL, created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS favs (user_id INTEGER NOT NULL, set_key TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY (user_id, set_key));
      CREATE INDEX IF NOT EXISTS favs_by_set ON favs (set_key, created);
      CREATE TABLE IF NOT EXISTS fails (username TEXT NOT NULL, ts INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS pending (token TEXT PRIMARY KEY, sub TEXT NOT NULL, name TEXT NOT NULL, expires INTEGER NOT NULL);
    `);
    if (!this.sql.exec("PRAGMA table_info(users)").toArray().some(c => c.name === "google_sub")) this.sql.exec("ALTER TABLE users ADD COLUMN google_sub TEXT");
    this.sql.exec("CREATE UNIQUE INDEX IF NOT EXISTS users_by_google ON users (google_sub) WHERE google_sub IS NOT NULL");
    this.socialCache = null;
  }

  publicUser(u) { return { id: u.id, username: u.username, display: u.display, color: u.color }; }
  favsOf(id) { return this.sql.exec("SELECT set_key FROM favs WHERE user_id = ?", id).toArray().map(r => r.set_key); }
  addFavs(id, keys) {
    const now = Date.now();
    for (const k of keys.slice(0, 200)) if (SET_KEY_RE.test(k)) this.sql.exec("INSERT OR IGNORE INTO favs (user_id, set_key, created) VALUES (?, ?, ?)", id, k, now);
    this.socialCache = null;
  }
  async newSession(id) {
    const token = randHex(32);
    this.sql.exec("INSERT INTO sessions (token, user_id, expires) VALUES (?, ?, ?)", await sha256(token), id, Date.now() + SESSION_DAYS * 86400e3);
    return token;
  }

  checkUsername(username) {
    if (!/^[a-z0-9_.]{3,20}$/.test(username)) return "Usernames are 3–20 letters, numbers, dots or underscores.";
    if (this.sql.exec("SELECT 1 FROM users WHERE username = ?", username).toArray().length) return "That username is taken. Try another.";
    return null;
  }

  // Google: existing account -> session; new account -> a short-lived "pick a username" ticket.
  async googleSignin(sub, name) {
    const u = this.sql.exec("SELECT * FROM users WHERE google_sub = ?", sub).toArray()[0];
    if (u) return { token: await this.newSession(u.id) };
    const now = Date.now();
    this.sql.exec("DELETE FROM pending WHERE expires < ?", now);
    const t = randHex(32);
    this.sql.exec("INSERT INTO pending (token, sub, name, expires) VALUES (?, ?, ?, ?)", await sha256(t), sub, name.slice(0, 60), now + 30 * 60e3);
    return { pending: t };
  }
  async pendingFor(t) {
    if (!t || t.length > 100) return null;
    const row = this.sql.exec("SELECT name FROM pending WHERE token = ? AND expires > ?", await sha256(t), Date.now()).toArray()[0];
    if (!row) return null;
    const first = row.name.split(" ")[0] || "";
    let base = first.toLowerCase().normalize("NFKD").replace(/[^a-z0-9_.]/g, "").slice(0, 14);
    if (base.length < 3) base = "raver";
    let suggest = base;
    for (let i = 0; i < 20 && this.checkUsername(suggest); i++) suggest = base + Math.floor(10 + Math.random() * 990);
    return { name: row.name.slice(0, 24), suggest };
  }
  async googleFinish(t, username, display) {
    if (!t || t.length > 100) return { error: "Your Google sign-in expired. Try again." };
    const h = await sha256(t);
    const row = this.sql.exec("SELECT * FROM pending WHERE token = ? AND expires > ?", h, Date.now()).toArray()[0];
    if (!row) return { error: "Your Google sign-in expired. Try again." };
    username = username.trim().toLowerCase();
    display = display.replace(/\s+/g, " ").trim().slice(0, 24) || row.name.slice(0, 24) || username;
    const bad = this.checkUsername(username); if (bad) return { error: bad };
    let u = this.sql.exec("SELECT * FROM users WHERE google_sub = ?", row.sub).toArray()[0];
    if (!u) {
      const color = COLORS[Math.floor(Math.random() * COLORS.length)];
      // No password: pass/salt stay empty so password login can never match this account.
      u = this.sql.exec("INSERT INTO users (username, display, color, pass, salt, created, google_sub) VALUES (?, ?, ?, '', '', ?, ?) RETURNING *", username, display, color, Date.now(), row.sub).one();
    }
    this.sql.exec("DELETE FROM pending WHERE token = ?", h);
    return { user: this.publicUser(u), favs: this.favsOf(u.id), token: await this.newSession(u.id) };
  }

  async signup(username, password, display, favs) {
    username = username.trim().toLowerCase();
    display = display.replace(/\s+/g, " ").trim().slice(0, 24) || username;
    const bad = this.checkUsername(username); if (bad) return { error: bad };
    if (password.length < 8 || password.length > 200) return { error: "Use a password of at least 8 characters." };
    const salt = randHex(16);
    const pass = await hashPassword(password, salt);
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const u = this.sql.exec("INSERT INTO users (username, display, color, pass, salt, created) VALUES (?, ?, ?, ?, ?, ?) RETURNING *", username, display, color, pass, salt, Date.now()).one();
    this.addFavs(u.id, favs);
    return { user: this.publicUser(u), favs: this.favsOf(u.id), token: await this.newSession(u.id) };
  }

  async login(username, password, favs) {
    username = username.trim().toLowerCase();
    const now = Date.now();
    this.sql.exec("DELETE FROM fails WHERE ts < ?", now - 15 * 60e3);
    const fails = this.sql.exec("SELECT COUNT(*) AS n FROM fails WHERE username = ?", username).one().n;
    if (fails >= 10) return { error: "Too many attempts. Wait 15 minutes and try again." };
    const u = this.sql.exec("SELECT * FROM users WHERE username = ?", username).toArray()[0];
    const ok = u && u.salt && safeEqual(await hashPassword(password, u.salt), u.pass);
    if (!ok) { this.sql.exec("INSERT INTO fails (username, ts) VALUES (?, ?)", username, now); return { error: "Wrong username or password." }; }
    this.addFavs(u.id, favs);
    return { user: this.publicUser(u), favs: this.favsOf(u.id), token: await this.newSession(u.id) };
  }

  async logout(token) { this.sql.exec("DELETE FROM sessions WHERE token = ?", await sha256(token)); }

  async userFor(token) {
    if (!token || token.length > 100) return null;
    const row = this.sql.exec("SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires > ?", await sha256(token), Date.now()).toArray()[0];
    return row || null;
  }

  async me(token) {
    const u = await this.userFor(token);
    return u ? { user: this.publicUser(u), favs: this.favsOf(u.id) } : null;
  }

  async setFavs(token, add, remove) {
    const u = await this.userFor(token);
    if (!u) return null;
    for (const k of [].concat(remove).slice(0, 200)) this.sql.exec("DELETE FROM favs WHERE user_id = ? AND set_key = ?", u.id, String(k));
    this.addFavs(u.id, [].concat(add).map(String));
    this.socialCache = null;
    return { favs: this.favsOf(u.id) };
  }

  // Count per set + the first few people (for the avatar stack).
  social() {
    if (this.socialCache && Date.now() - this.socialCache.at < 5000) return this.socialCache.data;
    const sets = {};
    for (const r of this.sql.exec("SELECT set_key, COUNT(*) AS n FROM favs GROUP BY set_key").toArray()) sets[r.set_key] = { n: r.n, top: [] };
    for (const r of this.sql.exec(`SELECT set_key, display, color FROM (
        SELECT f.set_key, u.display, u.color, ROW_NUMBER() OVER (PARTITION BY f.set_key ORDER BY f.created) AS rn
        FROM favs f JOIN users u ON u.id = f.user_id) WHERE rn <= 4`).toArray()) {
      if (sets[r.set_key] && sets[r.set_key].top.length < 4) sets[r.set_key].top.push({ name: r.display, color: r.color });
    }
    const data = { sets, users: this.sql.exec("SELECT COUNT(*) AS n FROM users").one().n };
    this.socialCache = { at: Date.now(), data };
    return data;
  }

  going(key) {
    const people = this.sql.exec("SELECT u.display AS name, u.color FROM favs f JOIN users u ON u.id = f.user_id WHERE f.set_key = ? ORDER BY f.created LIMIT 200", key).toArray();
    const n = this.sql.exec("SELECT COUNT(*) AS n FROM favs WHERE set_key = ?", key).one().n;
    return { n, people };
  }
}

// ---------- Live chat rooms ----------
const HISTORY = 60, KEEP = 500, MAX_TEXT = 500, RATE = { count: 5, windowMs: 10_000 };

export class ChatRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS msgs (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, uid TEXT NOT NULL, name TEXT NOT NULL, color TEXT NOT NULL DEFAULT '', text TEXT NOT NULL)`);
    // Rooms created by the first version have no color column yet.
    if (!this.sql.exec("PRAGMA table_info(msgs)").toArray().some(c => c.name === "color")) this.sql.exec("ALTER TABLE msgs ADD COLUMN color TEXT NOT NULL DEFAULT ''");
  }
  open() { return this.ctx.getWebSockets().filter(ws => ws.readyState === WebSocket.OPEN); }
  broadcast(obj, except) { const d = JSON.stringify(obj); for (const ws of this.open()) if (ws !== except) { try { ws.send(d); } catch {} } }

  async fetch(req) {
    let user; try { user = JSON.parse(req.headers.get("x-tml-user")); } catch {}
    if (!user?.id) return new Response("Sign in to chat", { status: 401 });
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ user, sent: [] });
    const messages = this.sql.exec(`SELECT id, ts, uid, name, color, text FROM msgs ORDER BY id DESC LIMIT ${HISTORY}`).toArray().reverse();
    server.send(JSON.stringify({ type: "history", messages, online: this.open().length }));
    this.broadcast({ type: "presence", online: this.open().length }, server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    let msg; try { msg = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw)); } catch { return; }
    if (msg?.type === "ping") return ws.send('{"type":"pong"}');
    if (msg?.type !== "msg") return;
    const att = ws.deserializeAttachment();
    if (!att?.user) return;
    const text = String(msg.text ?? "").replace(/\r/g, "").trim().slice(0, MAX_TEXT);
    if (!text) return;
    const now = Date.now();
    att.sent = att.sent.filter(t => now - t < RATE.windowMs);
    if (att.sent.length >= RATE.count) return ws.send(JSON.stringify({ type: "error", error: "You're sending messages too fast. Wait a few seconds." }));
    att.sent.push(now); ws.serializeAttachment(att);
    const { user } = att;
    const row = this.sql.exec("INSERT INTO msgs (ts, uid, name, color, text) VALUES (?, ?, ?, ?, ?) RETURNING id", now, String(user.id), user.name, user.color || "", text).one();
    this.sql.exec("DELETE FROM msgs WHERE id <= ?", row.id - KEEP);
    this.broadcast({ type: "msg", message: { id: row.id, ts: now, uid: String(user.id), name: user.name, color: user.color, text } });
  }

  async webSocketClose(ws, code) {
    try { ws.close(code === 1005 ? 1000 : code, "bye"); } catch {}
    this.broadcast({ type: "presence", online: this.open().filter(w => w !== ws).length });
  }
  async webSocketError(ws) { this.webSocketClose(ws, 1011); }
}
