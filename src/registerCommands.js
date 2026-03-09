const fs = require("fs");
const path = require("path");
const { REST, Routes } = require("discord.js");
const config = require("./config/config");
const logger = require("./utils/logger");

async function registerCommands() {
  if (!config.discord.token) {
    throw new Error("DISCORD_TOKEN is required.");
  }
  if (!config.discord.clientId) {
    throw new Error("DISCORD_CLIENT_ID is required.");
  }

  const commandsPath = path.join(__dirname, "commands");
  const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith(".js"));
  const payload = commandFiles.map((file) => {
    const command = require(path.join(commandsPath, file));
    return command.data.toJSON();
  });

  const rest = new REST({ version: "10" }).setToken(config.discord.token);

  const route = config.discord.guildId
    ? Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId)
    : Routes.applicationCommands(config.discord.clientId);

  logger.info(
    {
      commandCount: payload.length,
      scope: config.discord.guildId ? `guild:${config.discord.guildId}` : "global"
    },
    "discord_command_registration_started"
  );

  await rest.put(route, { body: payload });
  logger.info("discord_command_registration_completed");
}

registerCommands().catch((error) => {
  logger.error({ err: error }, "discord_command_registration_failed");
  process.exit(1);
});
