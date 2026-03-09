const { SlashCommandBuilder } = require("discord.js");
const { parseAppId } = require("../utils/validators");
const { buildBuildsEmbed } = require("../utils/embedBuilder");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("builds")
    .setDescription("Show last 10 Steam build records for a Steam AppID.")
    .addIntegerOption((option) =>
      option.setName("appid").setDescription("Steam AppID").setRequired(true).setMinValue(1)
    ),
  cooldown: 3,
  async execute(interaction) {
    const appId = parseAppId(interaction.options.getInteger("appid", true));
    const { snapshot, builds } = await interaction.client.container.manifestService.getBuildHistory(appId, 10);
    const embed = buildBuildsEmbed(snapshot, builds);
    await interaction.editReply({ embeds: [embed] });
  }
};
