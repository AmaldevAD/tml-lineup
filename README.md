# TML Unofficial

A mobile-first guide for Tomorrowland Thailand 2026 (11–13 Dec), with live chat.

- Line-up as a list or a timetable, filtered by day and stage, in 12-hour time
- Headliner posters, artist photos and an inline YouTube player
- Favourites saved on your device, with a personal timeline and clash detection
- Now & next across every stage
- Live chat: one room per stage, an "Everyone" room, and private crew rooms joined with a 6-character code
- Artist explorer with search and genre filters

Artist photos and videos are loaded live from [tomorrowland.aiko.dev](https://tomorrowland.aiko.dev/).
Unofficial fan site. Not affiliated with Tomorrowland.

## How it runs

It's a single Cloudflare Worker:

- `public/index.html` is the whole site (static assets)
- `src/worker.js` handles `/api/rooms/<room>/ws` and sends each room to a Durable Object (`ChatRoom`) that keeps the open WebSockets and the last 500 messages in SQLite

## Develop

```sh
npm install
npm run dev      # http://localhost:8787
```

## Deploy

Connected to Cloudflare Workers Builds: every push to `main` deploys automatically.
Manual deploy: `npx wrangler deploy`.
