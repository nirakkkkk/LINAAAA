const config = require("../config/config");
const logger = require("../utils/logger");

class ManifestService {
  constructor({ cacheClient, steamService }) {
    this.cacheClient = cacheClient;
    this.steamService = steamService;
    this.inFlight = new Map();
  }

  toDigits(value) {
    const normalized = String(value ?? "").trim();
    return /^\d+$/.test(normalized) ? normalized : null;
  }

  parseManifestMap(manifestsData) {
    if (!manifestsData || typeof manifestsData !== "object") {
      return [];
    }

    const manifests = [];
    for (const [branch, value] of Object.entries(manifestsData)) {
      if (branch === "encryptedmanifests" && value && typeof value === "object") {
        for (const [encryptedBranch, encryptedValue] of Object.entries(value)) {
          const manifestId = this.toDigits(encryptedValue);
          if (manifestId) {
            manifests.push({ branch: encryptedBranch, manifestId, encrypted: true });
          }
        }
        continue;
      }

      const manifestId = this.toDigits(value);
      if (manifestId) {
        manifests.push({ branch, manifestId, encrypted: false });
      }
    }

    manifests.sort((a, b) => a.branch.localeCompare(b.branch));
    return manifests;
  }

  parseBuilds(branchesData) {
    if (!branchesData || typeof branchesData !== "object") {
      return [];
    }

    return Object.entries(branchesData)
      .map(([branch, details]) => {
        const buildId = this.toDigits(details?.buildid);
        const timeUpdated = Number.parseInt(details?.timeupdated ?? "0", 10) || 0;

        return {
          branch,
          buildId,
          timeUpdated,
          description: details?.description || "",
          passwordRequired: Boolean(details?.pwdrequired)
        };
      })
      .filter((build) => build.buildId)
      .sort((a, b) => b.timeUpdated - a.timeUpdated);
  }

  parseSteamCmdDepots(appData) {
    const depotsData = appData?.depots || {};
    const depots = [];

    for (const [depotKey, depotValue] of Object.entries(depotsData)) {
      if (!/^\d+$/.test(depotKey)) {
        continue;
      }

      const manifests = this.parseManifestMap(depotValue?.manifests || {});
      const publicManifest = manifests.find((manifest) => manifest.branch === "public") || manifests[0] || null;

      depots.push({
        depotId: depotKey,
        name: depotValue?.name || `Depot ${depotKey}`,
        manifests,
        publicManifestId: publicManifest?.manifestId || null,
        maxSize: Number.parseInt(depotValue?.maxsize ?? "0", 10) || 0,
        osList: depotValue?.config?.oslist || null
      });
    }

    depots.sort((a, b) => Number(a.depotId) - Number(b.depotId));
    return depots;
  }

  buildGameInfo(appId, appName, storeData, depotsCount) {
    const finalPrice = storeData?.price_overview?.final_formatted || null;
    const initialPrice = storeData?.price_overview?.initial_formatted || null;
    const discountPercent = storeData?.price_overview?.discount_percent ?? 0;
    const priceText =
      finalPrice ||
      (storeData?.is_free ? "Free" : null) ||
      (initialPrice && discountPercent > 0 ? `${initialPrice} (-${discountPercent}%)` : null);

    return {
      appId,
      name: appName,
      type: storeData?.type || "unknown",
      developers: storeData?.developers || [],
      publishers: storeData?.publishers || [],
      genres: Array.isArray(storeData?.genres) ? storeData.genres.map((genre) => genre.description).filter(Boolean) : [],
      releaseDate: storeData?.release_date?.date || null,
      comingSoon: Boolean(storeData?.release_date?.coming_soon),
      website: storeData?.website || null,
      shortDescription: storeData?.short_description || null,
      headerImage: storeData?.header_image || null,
      backgroundRaw: storeData?.background_raw || null,
      capsuleImage: storeData?.capsule_imagev5 || storeData?.capsule_image || null,
      price: priceText || "Unknown",
      drmNotice: storeData?.drm_notice || null,
      depotCount: depotsCount,
      steamStoreUrl: `https://store.steampowered.com/app/${appId}`,
      steamDbUrl: `https://steamdb.info/app/${appId}/depots/`
    };
  }

  async fetchAndCompose(appId) {
    const [steamCmdResult, storeResult] = await Promise.allSettled([
      this.steamService.fetchAppInfoFromSteamCmd(appId),
      this.steamService.fetchAppInfoFromStore(appId)
    ]);

    let source = "steamcmd";
    let depots = [];
    let builds = [];
    let appName = null;

    if (steamCmdResult.status === "fulfilled") {
      depots = this.parseSteamCmdDepots(steamCmdResult.value);
      builds = this.parseBuilds(steamCmdResult.value?.depots?.branches || {});
      appName = steamCmdResult.value?.common?.name || null;
    } else {
      logger.warn({ appId, err: steamCmdResult.reason }, "steamcmd_provider_failed");
    }

    if (!depots.length) {
      const steamDbDepots = await this.steamService.fetchDepotsFromSteamDb(appId);
      if (steamDbDepots.length) {
        source = "steamdb";
        depots = steamDbDepots;
      }
    }

    if (!depots.length) {
      const error = new Error("Depot data not available for this AppID.");
      error.code =
        steamCmdResult.status === "rejected" && steamCmdResult.reason?.code === "APP_NOT_FOUND"
          ? "APP_NOT_FOUND"
          : "DEPOT_DATA_UNAVAILABLE";
      throw error;
    }

    const storeData = storeResult.status === "fulfilled" ? storeResult.value : null;
    appName = storeData?.name || appName || `App ${appId}`;

    const snapshot = {
      appId,
      appName,
      source,
      depots,
      builds,
      gameInfo: this.buildGameInfo(appId, appName, storeData, depots.length),
      fetchedAt: new Date().toISOString()
    };

    return snapshot;
  }

  async getAppSnapshot(appId, options = {}) {
    const forceRefresh = options.forceRefresh === true;
    const cacheKey = `steam:snapshot:${appId}`;

    if (!forceRefresh) {
      const cached = await this.cacheClient.get(cacheKey);
      if (cached) {
        logger.info({ appId }, "snapshot_cache_hit");
        return { ...cached, cacheHit: true };
      }
    }

    if (this.inFlight.has(cacheKey)) {
      logger.debug({ appId }, "request_deduplicated_inflight");
      return this.inFlight.get(cacheKey);
    }

    const promise = (async () => {
      const snapshot = await this.fetchAndCompose(appId);
      await this.cacheClient.set(cacheKey, snapshot, config.cache.ttlSeconds);
      logger.info({ appId }, "snapshot_cache_miss_refreshed");
      return { ...snapshot, cacheHit: false };
    })().finally(() => {
      this.inFlight.delete(cacheKey);
    });

    this.inFlight.set(cacheKey, promise);
    return promise;
  }

  async getManifestPairs(appId) {
    const snapshot = await this.getAppSnapshot(appId);
    const manifests = snapshot.depots
      .filter((depot) => depot.publicManifestId)
      .map((depot) => ({
        depotId: depot.depotId,
        manifestId: depot.publicManifestId
      }));

    return { snapshot, manifests };
  }

  async getDownloadCommands(appId) {
    const { snapshot, manifests } = await this.getManifestPairs(appId);
    const commands = manifests.map(
      (item) => `DepotDownloader -app ${snapshot.appId} -depot ${item.depotId} -manifest ${item.manifestId}`
    );

    return { snapshot, commands };
  }

  async getBuildHistory(appId, limit = 10) {
    const snapshot = await this.getAppSnapshot(appId);
    const builds = snapshot.builds.slice(0, limit);
    return { snapshot, builds };
  }
}

module.exports = ManifestService;
