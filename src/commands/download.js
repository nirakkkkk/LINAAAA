const { SlashCommandBuilder } = require("discord.js");
const { parseAppId } = require("../utils/validators");
const { buildDownloadEmbed } = require("../utils/embedBuilder");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("download")
    .setDescription("Generate DepotDownloader commands from a Steam AppID.")
    .addIntegerOption((option) =>
      option.setName("appid").setDescription("Steam AppID").setRequired(true).setMinValue(1)
    ),
  cooldown: 3,
  async execute(interaction) {
    const appId = parseAppId(interaction.options.getInteger("appid", true));
    const { snapshot, commands } = await interaction.client.container.manifestService.getDownloadCommands(appId);
    const embed = buildDownloadEmbed(snapshot, commands);
    await interaction.editReply({ embeds: [embed] });
  }
};
