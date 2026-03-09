# Steam Manifest Discord Bot

High-performance Discord bot + internal API that returns Steam depot and manifest information from an AppID.

## Tech Stack

- Node.js (LTS, tested with Node 20+)
- discord.js v14
- Axios
- Redis
- Express
- dotenv
- Pino
- Bottleneck
- Node-cache (fallback if Redis is unavailable)

## Project Structure

```txt
src/
  commands/
    manifest.js
    depots.js
    download.js
    builds.js
    info.js
  events/
    ready.js
    interactionCreate.js
  services/
    steamService.js
    manifestService.js
  api/
    server.js
    routes.js
  cache/
    redisClient.js
  utils/
    logger.js
    validators.js
    embedBuilder.js
  config/
    config.js
  index.js
  registerCommands.js
```

## Features

- Slash commands:
  - `/manifest appid:<id>`
  - `/depots appid:<id>`
  - `/download appid:<id>`
  - `/builds appid:<id>`
  - `/info appid:<id>`
- Internal API:
  - `GET /manifest/:appid`
  - `GET /depots/:appid`
  - `GET /info/:appid`
- Performance:
  - Redis caching with 1-hour TTL
  - Node-cache fallback if Redis is down
  - Bottleneck request queue
  - Smart retry with exponential backoff
  - Request deduplication for concurrent same-AppID requests
- Reliability:
  - Input validation
  - Rate-limit/spam protection
  - Command cooldowns
  - Structured logging with Pino

## Data Sources

- `https://api.steamcmd.net/v1/info/:appid` (primary depot/manifest/build metadata)
- `https://store.steampowered.com/api/appdetails` (game info)
- SteamDB HTML fallback parser with Cheerio when enabled

## Installation

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env` and fill values:

```bash
copy .env.example .env
```

3. Register slash commands:

```bash
npm run register-commands
```

4. Start bot + API:

```bash
npm start
```

## Example `.env`

```env
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_application_id
DISCORD_GUILD_ID=

REDIS_URL=redis://localhost:6379
PORT=3000

CACHE_TTL_SECONDS=3600
REQUEST_TIMEOUT_MS=8000
REQUEST_MAX_RETRIES=3
REQUEST_RETRY_BASE_DELAY_MS=250

QUEUE_MAX_CONCURRENT=8
QUEUE_MIN_TIME_MS=35

COMMAND_COOLDOWN_SECONDS=3
SPAM_WINDOW_MS=15000
SPAM_MAX_REQUESTS=6

LOG_LEVEL=info
NODE_ENV=development

STEAMCMD_API_BASE_URL=https://api.steamcmd.net/v1
STEAM_STORE_API_BASE_URL=https://store.steampowered.com/api
STEAMDB_BASE_URL=https://steamdb.info
USE_STEAMDB_FALLBACK=true
```

## Example Discord Commands

- `/manifest appid:730`
- `/depots appid:730`
- `/download appid:730`
- `/builds appid:730`
- `/info appid:730`

## Example API Calls

```bash
curl http://localhost:3000/manifest/730
curl http://localhost:3000/depots/730
curl http://localhost:3000/info/730
curl http://localhost:3000/health
```

## Docker

Build and run:

```bash
docker build -t steam-manifest-bot .
docker run --env-file .env -p 3000:3000 steam-manifest-bot
```

## Deployment Guide

### Railway

1. Create new Railway project from your repo.
2. Add a Redis service/plugin.
3. Set all environment variables from `.env.example`.
4. Deploy with start command: `npm start`.
5. Run command registration once (Railway shell): `npm run register-commands`.

### Render

1. Create a new Web Service from your repo.
2. Runtime: Node.
3. Build command: `npm install`.
4. Start command: `npm start`.
5. Add Render Redis and set `REDIS_URL`.
6. Set remaining environment variables.
7. Run `npm run register-commands` at least once after first deploy.

### VPS (Ubuntu)

1. Install Node.js LTS and Redis:
   - `curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -`
   - `sudo apt-get install -y nodejs redis-server`
2. Clone project and install dependencies:
   - `npm install`
3. Configure `.env`.
4. Register commands:
   - `npm run register-commands`
5. Start with PM2:
   - `npm install -g pm2`
   - `pm2 start src/index.js --name steam-manifest-bot`
   - `pm2 save && pm2 startup`

## Notes

- Cached request path is designed for sub-second Discord response where upstream calls are avoided.
- Cold requests are limited by upstream provider latency and typically return within a few seconds.
