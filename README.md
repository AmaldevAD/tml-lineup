# TML Unofficial

A mobile-first guide for Tomorrowland Thailand 2026 (11–13 Dec), with live chat.

Live at https://tmlcult.com (also https://tmlunofficial.amaldev-ad71868.workers.dev).

- Line-up as a list or a timetable, filtered by day and stage, in 12-hour time
- Headliner posters, artist photos and an inline YouTube player
- Favourites saved on your device, with a personal timeline and clash detection
- Now & next across every stage
- Accounts: browsing is open to everyone; booking sets and chatting need a free account (username + password)
- Book one set per time slot: booked sets block that time across every stage with a hatched "busy" band, with a swap option
- Crowd counts: avatar stacks and "+171"-style counts on every set, plus a who's-going list on each artist page
- Live chat: an "Everyone" room, a fan room per artist, and private crew rooms joined with a 6-character code
- Artist explorer with search and genre filters

Unofficial fan site. Not affiliated with Tomorrowland.

## How it runs

It's a single Cloudflare Worker:

- `public/index.html` is the whole site (static assets)
- `src/worker.js` is the API:
  - `Hub` Durable Object (SQLite): users (PBKDF2-hashed passwords), sessions (HttpOnly cookie), booked sets, crowd counts
  - `ChatRoom` Durable Object per room: WebSockets for signed-in users and the last 500 messages
  - Routes: `POST /api/signup`, `/api/login`, `/api/logout`, `/api/favs`; `GET /api/me`, `/api/social`, `/api/going?set=`; `/api/rooms/<room>/ws`

## Develop

```sh
npm install
npm run dev      # http://localhost:8787
```

## Deploy

Connected to Cloudflare Workers Builds: every push to `main` deploys automatically.
Manual deploy: `npx wrangler deploy`.
