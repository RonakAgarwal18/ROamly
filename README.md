# Captain ROamly

**ROamly — your trip. your plan.**

A self-hosted travel planner that keeps a whole trip in one place: day-wise plans on a map, bookings, budgets, packing lists and a journal — plus an AI chat that builds and edits the trip for you. Your trips live on your own server, under your own account.

**Live demo:** https://roamly.up.railway.app

![License](https://img.shields.io/badge/license-AGPL_v3-6B7280?style=flat-square)

---

## What you get

- **Day plans** — plan each day place by place, drag stops between days, reorder inside a day, undo when you change your mind
- **Maps** — every place pinned on an interactive map, with clustering, photo markers and route lines; sensible day routes worked out for you
- **AI trip chat** — paste a full itinerary as plain text and Captain ROamly builds the trip day by day; then chat to edit it ("move this to the evening", "add a day in Pelling") or ask if a plan is doable
- **Bookings & money** — keep bookings with the right day, and track trip costs and budgets as you plan
- **Lists** — packing lists and checklists per trip, so nothing gets left behind
- **Journal** — write the trip down as it happens, with the places attached
- **Collaboration** — share a trip and plan together in real time; changes sync live
- **Works as an app** — install it on your phone's home screen (PWA), no app store needed
- **Yours** — multi-user accounts with roles, your data in two folders on your disk, nothing sent anywhere you did not choose

A fresh install opens with a ready-made 8-day Sikkim trip, so you can see a full plan from the first minute.

## Quick start (Docker)

You only need Docker with Compose.

```bash
git clone https://github.com/RonakAgarwal18/ROamly.git
cd ROamly
ENCRYPTION_KEY=$(openssl rand -hex 32) docker compose up -d --build
```

Open http://localhost:3000.

On first boot an admin account is created for you. If you set `ADMIN_EMAIL` and `ADMIN_PASSWORD` before starting, those are used; otherwise the login details are printed once in the container log:

```bash
docker compose logs app
```

Your data persists in `./data` and `./uploads` next to the compose file — back those two folders up and your trips are safe.

## Updating

```bash
git pull
docker compose up -d --build
```

## Run it locally (for development)

Node.js 22 and npm:

```bash
npm install
npm run dev        # builds the shared package, then runs server + client
npm run build      # production build
npm test           # tests across all workspaces
```

The repo is an npm-workspaces monorepo: `client` (React app), `server` (API), `shared` (code both use).

## Configuration

Everything is set through environment variables in `docker-compose.yml`. The ones most people touch:

| Variable | What it does |
|---|---|
| `ENCRYPTION_KEY` | Encrypts stored secrets. Set it once and keep it — generate with `openssl rand -hex 32` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | First admin account, used only on first boot |
| `TZ` | Timezone for logs and reminders, e.g. `Asia/Kolkata` |
| `PORT` | Port the app listens on (default `3000`) |
| `ALLOWED_ORIGINS` | Extra origins allowed for CORS and email links |
| `SESSION_DURATION` | How long logins last (default 24h; `30d` with "remember me") |

Optional extras are documented inline in `docker-compose.yml`: SSO/OIDC login, HTTPS behind a proxy, an Unsplash key for place photos, and proxy settings.

The AI chat needs an AI model: after logging in as admin, add your model connection under **Settings → LLM connection** (OpenAI-compatible or Anthropic). Without one, the chat simply shows a setup prompt — everything else works.

## Tech stack

TypeScript · React 19 · Vite · Tailwind CSS · NestJS 11 · SQLite · Leaflet / MapLibre maps · WebSocket live sync · Docker

## License

AGPL-3.0 — see [LICENSE](LICENSE).

---

Built by [Ronak Agarwal](https://github.com/RonakAgarwal18)
