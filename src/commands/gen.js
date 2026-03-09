const {
  SlashCommandBuilder,
  AttachmentBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");
const JSZip = require("jszip");
const { parseAppId } = require("../utils/validators");

function buildManifestText(snapshot) {
  const lines = [];
  lines.push(`# ${snapshot.appName}`);
  lines.push(`# AppID: ${snapshot.appId}`);
  lines.push(`# Source: ${snapshot.source}`);
  lines.push(`# Generated: ${new Date(snapshot.fetchedAt).toISOString()}`);
  lines.push("");
  lines.push("[DEPOTS]");

  for (const depot of snapshot.depots) {
    if (!depot.publicManifestId) {
      continue;
    }
    lines.push(`${depot.depotId}=${depot.publicManifestId}`);
  }

  lines.push("");
  lines.push("[DEPOTDOWNLOADER]");
  for (const depot of snapshot.depots) {
    if (!depot.publicManifestId) {
      continue;
    }
    lines.push(`DepotDownloader -app ${snapshot.appId} -depot ${depot.depotId} -manifest ${depot.publicManifestId}`);
  }

  return `${lines.join("\n")}\n`;
}

function buildGenEmbed(snapshot) {
  const info = snapshot.gameInfo;
  const manifestCount = snapshot.depots.filter((depot) => depot.publicManifestId).length;
  const latestBuild = snapshot.builds[0];
  const genres = info.genres && info.genres.length ? info.genres.slice(0, 3).join(", ") : "Unknown";
  const drmText = info.drmNotice ? "Detected" : "No DRM detected";

  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setAuthor({ name: "Manifest Generator", iconURL: "https://cdn.discordapp.com/emojis/1135909971841075280.png" })
    .setTitle(`${snapshot.appName}  |  Manifest Package`)
    .setDescription(`✅ Manifest package generated successfully.\n${info.shortDescription || "No description available."}`)
    .addFields(
      { name: "🆔 App ID", value: `\`${snapshot.appId}\``, inline: true },
      { name: "📦 Price", value: info.price || "Unknown", inline: true },
      { name: "🎮 Type", value: info.type || "Unknown", inline: true },
      { name: "🏗️ Public Manifests", value: `\`${manifestCount}\``, inline: true },
      { name: "📚 Total Depots", value: `\`${snapshot.depots.length}\``, inline: true },
      { name: "🕒 Last Build", value: latestBuild?.timeUpdated ? `<t:${latestBuild.timeUpdated}:R>` : "Unknown", inline: true },
      { name: "🧠 Developer", value: (info.developers && info.developers.join(", ")) || "Unknown", inline: true },
      { name: "🗓️ Release Date", value: info.releaseDate || "Unknown", inline: true },
      { name: "🛡️ DRM", value: drmText, inline: true },
      { name: "🏷️ Genres", value: genres, inline: false },
      {
        name: "🔗 Quick Links",
        value: `[Steam](${info.steamStoreUrl}) | [SteamDB](${info.steamDbUrl}) | [ProtonDB](https://www.protondb.com/app/${snapshot.appId})`
      }
    )
    .setFooter({ text: `Requested via /gen • Source: ${snapshot.source} • Cache: ${snapshot.cacheHit ? "hit" : "miss"}` })
    .setTimestamp(new Date(snapshot.fetchedAt));

  if (info.headerImage) {
    embed.setThumbnail(info.capsuleImage || info.headerImage).setImage(info.headerImage);
  }

  return embed;
}

function buildLinkButtons(snapshot) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel("Steam").setStyle(ButtonStyle.Link).setURL(snapshot.gameInfo.steamStoreUrl),
    new ButtonBuilder().setLabel("SteamDB").setStyle(ButtonStyle.Link).setURL(snapshot.gameInfo.steamDbUrl),
    new ButtonBuilder()
      .setLabel("ProtonDB")
      .setStyle(ButtonStyle.Link)
      .setURL(`https://www.protondb.com/app/${snapshot.appId}`)
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("gen")
    .setDescription("Generate manifest file + game info from a Steam AppID.")
    .addIntegerOption((option) =>
      option.setName("appid").setDescription("Steam AppID").setRequired(true).setMinValue(1)
    ),
  cooldown: 3,
  async execute(interaction) {
    const appId = parseAppId(interaction.options.getInteger("appid", true));
    const snapshot = await interaction.client.container.manifestService.getAppSnapshot(appId);

    const manifestText = buildManifestText(snapshot);
    const txtName = `manifest_${appId}.txt`;
    const zipName = `manifest_${appId}.zip`;

    const zip = new JSZip();
    zip.file(txtName, manifestText);
    const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    const attachment = new AttachmentBuilder(zipBuffer, { name: zipName });
    const embed = buildGenEmbed(snapshot);
    const buttons = buildLinkButtons(snapshot);

    await interaction.editReply({
      content: `✅ Here's the manifest package for **${snapshot.appName}**`,
      embeds: [embed],
      files: [attachment],
      components: [buttons]
    });
  }
};
