const fs = require("fs");
const path = require("path");
const { Client, Collection, GatewayIntentBits } = require("discord.js");
const config = require("./config/config");
const logger = require("./utils/logger");
const cacheClient = require("./cache/redisClient");
const steamService = require("./services/steamService");
const ManifestService = require("./services/manifestService");
const createApiServer = require("./api/server");

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});
client.commands = new Collection();

function loadCommands() {
  const commandsPath = path.join(__dirname, "commands");
  const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith(".js"));

  for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));
    if (!command?.data?.name || typeof command.execute !== "function") {
      logger.warn({ file }, "invalid_command_module_skipped");
      continue;
    }
    client.commands.set(command.data.name, command);
  }

  logger.info({ commandCount: client.commands.size }, "discord_commands_loaded");
}

function loadEvents() {
  const eventsPath = path.join(__dirname, "events");
  const eventFiles = fs.readdirSync(eventsPath).filter((file) => file.endsWith(".js"));

  for (const file of eventFiles) {
    const event = require(path.join(eventsPath, file));
    if (!event?.name || typeof event.execute !== "function") {
      logger.warn({ file }, "invalid_event_module_skipped");
      continue;
    }

    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args));
    } else {
      client.on(event.name, (...args) => event.execute(...args));
    }
  }

  logger.info({ eventCount: eventFiles.length }, "discord_events_loaded");
}

async function bootstrap() {
  if (!config.discord.token) {
    throw new Error("DISCORD_TOKEN is not configured.");
  }

  await cacheClient.init();

  const manifestService = new ManifestService({
    cacheClient,
    steamService
  });

  client.container = {
    manifestService,
    cacheClient,
    steamService
  };

  loadCommands();
  loadEvents();

  const apiServer = createApiServer({
    manifestService,
    cacheClient
  });

  await apiServer.start();
  await client.login(config.discord.token);

  const shutdown = async (signal) => {
    logger.info({ signal }, "shutdown_started");

    try {
      await apiServer.stop();
    } catch (error) {
      logger.warn({ err: error }, "api_shutdown_failed");
    }

    try {
      await cacheClient.close();
    } catch (error) {
      logger.warn({ err: error }, "cache_shutdown_failed");
    }

    try {
      client.destroy();
    } catch (error) {
      logger.warn({ err: error }, "discord_shutdown_failed");
    }

    process.exit(0);
  };

  process.on("SIGINT", () => {
    shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    shutdown("SIGTERM");
  });
}

bootstrap().catch((error) => {
  logger.error({ err: error }, "bootstrap_failed");
  process.exit(1);
});
