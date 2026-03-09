const { createClient } = require("redis");
const NodeCache = require("node-cache");
const config = require("../config/config");
const logger = require("../utils/logger");

class CacheClient {
  constructor() {
    this.redisDisabled = false;
    this.redisErrorLogged = false;

    this.memory = new NodeCache({
      stdTTL: config.cache.ttlSeconds,
      checkperiod: Math.max(Math.floor(config.cache.ttlSeconds / 6), 60),
      useClones: false
    });

    this.redis = config.redis.url
      ? createClient({
          url: config.redis.url,
          socket: {
            reconnectStrategy: () => false
          }
        })
      : null;
    this.redisReady = false;

    if (this.redis) {
      this.redis.on("error", (error) => {
        this.redisReady = false;
        if (!this.redisErrorLogged) {
          logger.warn({ err: error }, "redis_error_falling_back_to_memory_cache");
          this.redisErrorLogged = true;
        }
      });
      this.redis.on("ready", () => {
        this.redisReady = true;
        this.redisDisabled = false;
        this.redisErrorLogged = false;
        logger.info("redis_ready");
      });
      this.redis.on("end", () => {
        this.redisReady = false;
        logger.warn("redis_connection_ended");
      });
    }
  }

  async init() {
    if (!this.redis || this.redisDisabled) {
      logger.warn("redis_url_missing_using_memory_cache_only");
      return;
    }

    try {
      await this.redis.connect();
      this.redisReady = true;
      logger.info("redis_connected");
    } catch (error) {
      this.redisReady = false;
      this.redisDisabled = true;
      logger.warn({ err: error }, "redis_connect_failed_using_memory_cache_only");
    }
  }

  async get(key) {
    if (this.redisReady && this.redis) {
      try {
        const raw = await this.redis.get(key);
        if (raw !== null) {
          const parsed = JSON.parse(raw);
          this.memory.set(key, parsed, config.cache.ttlSeconds);
          logger.debug({ key }, "cache_hit_redis");
          return parsed;
        }
      } catch (error) {
        logger.warn({ err: error, key }, "redis_get_failed_falling_back_to_memory");
      }
    }

    const value = this.memory.get(key);
    if (value !== undefined) {
      logger.debug({ key }, "cache_hit_memory");
      return value;
    }

    logger.debug({ key }, "cache_miss");
    return null;
  }

  async set(key, value, ttlSeconds = config.cache.ttlSeconds) {
    this.memory.set(key, value, ttlSeconds);

    if (this.redisReady && this.redis) {
      try {
        await this.redis.set(key, JSON.stringify(value), { EX: ttlSeconds });
      } catch (error) {
        logger.warn({ err: error, key }, "redis_set_failed");
      }
    }
  }

  async del(key) {
    this.memory.del(key);
    if (this.redisReady && this.redis) {
      try {
        await this.redis.del(key);
      } catch (error) {
        logger.warn({ err: error, key }, "redis_del_failed");
      }
    }
  }

  async close() {
    if (this.redis && this.redisReady) {
      try {
        await this.redis.quit();
      } catch (error) {
        logger.warn({ err: error }, "redis_quit_failed");
      }
    }
  }
}

module.exports = new CacheClient();
