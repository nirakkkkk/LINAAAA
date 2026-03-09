const config = require("../config/config");
const logger = require("../utils/logger");
const { buildErrorEmbed } = require("../utils/embedBuilder");

const cooldowns = new Map();
const userRequestWindows = new Map();

function mapErrorToMessage(error) {
  if (!error) {
    return "Unexpected error.";
  }

  if (error.code === "INVALID_APPID") {
    return "Invalid AppID. Use a positive integer (example: 730).";
  }

  if (error.code === "APP_NOT_FOUND") {
    return "Steam app not found for the supplied AppID.";
  }

  if (error.code === "DEPOT_DATA_UNAVAILABLE") {
    return "Depot or manifest data is currently unavailable for this app.";
  }

  return "Steam provider request failed. Please retry in a few seconds.";
}

function checkSpam(userId, now) {
  const existing = userRequestWindows.get(userId) || [];
  const filtered = existing.filter((timestamp) => now - timestamp <= config.spam.windowMs);

  if (filtered.length >= config.spam.maxRequests) {
    userRequestWindows.set(userId, filtered);
    return false;
  }

  filtered.push(now);
  userRequestWindows.set(userId, filtered);
  return true;
}

function clearExpiredCooldowns(now) {
  if (cooldowns.size < 2000) {
    return;
  }

  for (const [key, timestamp] of cooldowns.entries()) {
    if (timestamp <= now) {
      cooldowns.delete(key);
    }
  }
}

module.exports = {
  name: "interactionCreate",
  once: false,
  async execute(interaction) {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    const command = interaction.client.commands.get(interaction.commandName);
    if (!command) {
      return;
    }

    const userId = interaction.user.id;
    const now = Date.now();

    clearExpiredCooldowns(now);

    if (!checkSpam(userId, now)) {
      const embed = buildErrorEmbed(
        "Rate Limit",
        `Too many requests. Try again in ${Math.ceil(config.spam.windowMs / 1000)} seconds.`
      );
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    const cooldownSeconds =
      Number.isFinite(command.cooldown) && command.cooldown > 0 ? command.cooldown : config.cooldown.seconds;
    const cooldownKey = `${interaction.commandName}:${userId}`;
    const availableAt = cooldowns.get(cooldownKey) || 0;

    if (now < availableAt) {
      const remaining = ((availableAt - now) / 1000).toFixed(1);
      const embed = buildErrorEmbed("Cooldown", `Wait ${remaining}s before using this command again.`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    cooldowns.set(cooldownKey, now + cooldownSeconds * 1000);

    try {
      await interaction.deferReply();
      await command.execute(interaction);
    } catch (error) {
      logger.error(
        {
          err: error,
          command: interaction.commandName,
          userId,
          guildId: interaction.guildId || "dm"
        },
        "discord_command_failed"
      );

      const embed = buildErrorEmbed("Request Failed", mapErrorToMessage(error));
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ embeds: [embed] });
      } else {
        await interaction.reply({ embeds: [embed], ephemeral: true });
      }
    }
  }
};
