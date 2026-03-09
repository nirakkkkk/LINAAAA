const { SlashCommandBuilder } = require("discord.js");
const { parseAppId } = require("../utils/validators");
const { buildInfoEmbed } = require("../utils/embedBuilder");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("info")
    .setDescription("Show game information from a Steam AppID.")
    .addIntegerOption((option) =>
      option.setName("appid").setDescription("Steam AppID").setRequired(true).setMinValue(1)
    ),
  cooldown: 3,
  async execute(interaction) {
    const appId = parseAppId(interaction.options.getInteger("appid", true));
    const snapshot = await interaction.client.container.manifestService.getAppSnapshot(appId);
    const embed = buildInfoEmbed(snapshot);
    await interaction.editReply({ embeds: [embed] });
  }
};
