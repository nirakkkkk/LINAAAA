const logger = require("../utils/logger");

module.exports = {
  name: "ready",
  once: true,
  execute(client) {
    logger.info({ bot: client.user.tag, commands: client.commands.size }, "discord_bot_ready");
  }
};
