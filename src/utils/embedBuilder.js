const { EmbedBuilder } = require("discord.js");

const COLORS = {
  PRIMARY: 0x1b2838,
  SUCCESS: 0x2ecc71,
  ERROR: 0xe74c3c
};

function joinList(items, fallback = "Unknown") {
  if (!Array.isArray(items) || !items.length) {
    return fallback;
  }
  return items.join(", ");
}

function truncate(text, maxLength) {
  if (!text) {
    return "";
  }
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 3)}...`;
}

function chunkLines(lines, maxChunkLength = 900, maxChunks = 6) {
  const chunks = [];
  let current = "";

  for (const line of lines) {
    if ((current + line + "\n").length > maxChunkLength) {
      if (current) {
        chunks.push(current.trim());
        current = "";
      }
    }
    current += `${line}\n`;
    if (chunks.length >= maxChunks) {
      break;
    }
  }

  if (current && chunks.length < maxChunks) {
    chunks.push(current.trim());
  }

  return chunks;
}

function buildErrorEmbed(title, message) {
  return new EmbedBuilder().setColor(COLORS.ERROR).setTitle(title).setDescription(message).setTimestamp();
}

function buildManifestEmbed(snapshot) {
  const lines = snapshot.depots
    .filter((depot) => depot.publicManifestId)
    .map((depot) => `${depot.depotId} -> ${depot.publicManifestId}`);

  const embed = new EmbedBuilder()
    .setColor(COLORS.PRIMARY)
    .setTitle(`${snapshot.appName} Manifest Data`)
    .setDescription(
      `AppID: \`${snapshot.appId}\`\nSource: \`${snapshot.source}\`\nCache: \`${
        snapshot.cacheHit ? "hit" : "miss"
      }\``
    )
    .setTimestamp(new Date(snapshot.fetchedAt));

  if (!lines.length) {
    embed.addFields({
      name: "Manifest Data",
      value: "No public manifest entries were found for this app."
    });
    return embed;
  }

  const chunks = chunkLines(lines, 900, 4);
  chunks.forEach((chunk, index) => {
    embed.addFields({
      name: index === 0 ? "Depot -> Manifest" : "\u200B",
      value: `\`\`\`\n${chunk}\n\`\`\``
    });
  });

  if (lines.length > chunks.join("\n").split("\n").length) {
    embed.setFooter({ text: "Output truncated to fit Discord limits." });
  } else {
    embed.setFooter({ text: `${lines.length} depots with public manifests.` });
  }

  return embed;
}

function buildDepotsEmbed(snapshot) {
  const lines = snapshot.depots.map((depot) => {
    const displayName = truncate(depot.name || `Depot ${depot.depotId}`, 36);
    return `${depot.depotId} | ${displayName} | manifests:${depot.manifests.length}`;
  });

  const embed = new EmbedBuilder()
    .setColor(COLORS.PRIMARY)
    .setTitle(`${snapshot.appName} Depots`)
    .setDescription(`AppID: \`${snapshot.appId}\`\nTotal Depots: \`${snapshot.depots.length}\``)
    .setTimestamp(new Date(snapshot.fetchedAt));

  const chunks = chunkLines(lines, 900, 5);
  chunks.forEach((chunk, index) => {
    embed.addFields({
      name: index === 0 ? "Depot List" : "\u200B",
      value: `\`\`\`\n${chunk}\n\`\`\``
    });
  });

  if (!lines.length) {
    embed.addFields({ name: "Depot List", value: "No depots found." });
  }

  return embed;
}

function buildDownloadEmbed(snapshot, commands) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.SUCCESS)
    .setTitle(`${snapshot.appName} DepotDownloader Commands`)
    .setDescription(`AppID: \`${snapshot.appId}\``)
    .setTimestamp(new Date(snapshot.fetchedAt));

  if (!commands.length) {
    embed.addFields({
      name: "Commands",
      value: "No public manifest depots available to generate commands."
    });
    return embed;
  }

  const chunks = chunkLines(commands, 850, 4);
  chunks.forEach((chunk, index) => {
    embed.addFields({
      name: index === 0 ? "Download Command" : "\u200B",
      value: `\`\`\`bash\n${chunk}\n\`\`\``
    });
  });

  if (commands.length > chunks.join("\n").split("\n").length) {
    embed.setFooter({ text: "Command list truncated to fit Discord limits." });
  }

  return embed;
}

function buildBuildsEmbed(snapshot, builds) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.PRIMARY)
    .setTitle(`${snapshot.appName} Build History`)
    .setDescription(`AppID: \`${snapshot.appId}\`\nLatest ${builds.length} build entries`)
    .setTimestamp();

  if (!builds.length) {
    embed.addFields({ name: "Build History", value: "No branch build history found." });
    return embed;
  }

  const lines = builds.map((build) => {
    const updatedText = build.timeUpdated ? `<t:${build.timeUpdated}:R>` : "unknown";
    return `${build.branch} | build:${build.buildId} | ${updatedText}`;
  });

  const chunks = chunkLines(lines, 900, 4);
  chunks.forEach((chunk, index) => {
    embed.addFields({
      name: index === 0 ? "Branch Builds" : "\u200B",
      value: `\`\`\`\n${chunk}\n\`\`\``
    });
  });

  return embed;
}

function buildInfoEmbed(snapshot) {
  const info = snapshot.gameInfo;
  const embed = new EmbedBuilder()
    .setColor(COLORS.PRIMARY)
    .setTitle(info.name)
    .setURL(info.steamStoreUrl)
    .setDescription(truncate(info.shortDescription || `Steam AppID: ${snapshot.appId}`, 350))
    .addFields(
      { name: "AppID", value: `\`${snapshot.appId}\``, inline: true },
      { name: "Type", value: info.type || "unknown", inline: true },
      { name: "Depots", value: String(snapshot.depots.length), inline: true },
      { name: "Developers", value: truncate(joinList(info.developers, "Unknown"), 1000), inline: false },
      { name: "Publishers", value: truncate(joinList(info.publishers, "Unknown"), 1000), inline: false },
      { name: "Release Date", value: info.releaseDate || "Unknown", inline: true },
      { name: "Latest Builds", value: String(snapshot.builds.length), inline: true },
      { name: "Source", value: snapshot.source, inline: true }
    )
    .setTimestamp(new Date(snapshot.fetchedAt));

  if (info.headerImage) {
    embed.setThumbnail(info.headerImage);
  }

  return embed;
}

module.exports = {
  buildErrorEmbed,
  buildManifestEmbed,
  buildDepotsEmbed,
  buildDownloadEmbed,
  buildBuildsEmbed,
  buildInfoEmbed
};
