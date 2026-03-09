const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

function asInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function asBool(value, fallback) {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value).toLowerCase().trim();
  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }
  return fallback;
}

const config = {
  nodeEnv: process.env.NODE_ENV || "development",
  logLevel: process.env.LOG_LEVEL || "info",
  discord: {
    token: process.env.DISCORD_TOKEN || "",
    clientId: process.env.DISCORD_CLIENT_ID || "",
    guildId: process.env.DISCORD_GUILD_ID || ""
  },
  redis: {
    url: process.env.REDIS_URL || ""
  },
  api: {
    port: asInt(process.env.PORT, 3000)
  },
  cache: {
    ttlSeconds: asInt(process.env.CACHE_TTL_SECONDS, 3600)
  },
  request: {
    timeoutMs: asInt(process.env.REQUEST_TIMEOUT_MS, 8000),
    maxRetries: asInt(process.env.REQUEST_MAX_RETRIES, 3),
    retryBaseDelayMs: asInt(process.env.REQUEST_RETRY_BASE_DELAY_MS, 250)
  },
  queue: {
    maxConcurrent: asInt(process.env.QUEUE_MAX_CONCURRENT, 8),
    minTimeMs: asInt(process.env.QUEUE_MIN_TIME_MS, 35)
  },
  cooldown: {
    seconds: asInt(process.env.COMMAND_COOLDOWN_SECONDS, 3)
  },
  spam: {
    windowMs: asInt(process.env.SPAM_WINDOW_MS, 15000),
    maxRequests: asInt(process.env.SPAM_MAX_REQUESTS, 6)
  },
  steam: {
    steamCmdBaseUrl: process.env.STEAMCMD_API_BASE_URL || "https://api.steamcmd.net/v1",
    storeBaseUrl: process.env.STEAM_STORE_API_BASE_URL || "https://store.steampowered.com/api",
    steamDbBaseUrl: process.env.STEAMDB_BASE_URL || "https://steamdb.info",
    useSteamDbFallback: asBool(process.env.USE_STEAMDB_FALLBACK, true)
  }
};

module.exports = Object.freeze(config);
