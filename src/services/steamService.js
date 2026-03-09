const axios = require("axios");
const Bottleneck = require("bottleneck");
const cheerio = require("cheerio");
const config = require("../config/config");
const logger = require("../utils/logger");

const RETRIABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class SteamService {
  constructor() {
    this.http = axios.create({
      timeout: config.request.timeoutMs,
      headers: {
        "User-Agent": "SteamManifestBot/1.0 (+Discord)",
        Accept: "application/json, text/html"
      }
    });

    this.queue = new Bottleneck({
      maxConcurrent: config.queue.maxConcurrent,
      minTime: config.queue.minTimeMs
    });
  }

  isRetriableError(error) {
    const status = error.response?.status;
    return !status || RETRIABLE_STATUSES.has(status);
  }

  async queuedRequest(requestConfig, attempt = 0) {
    try {
      return await this.queue.schedule(() => this.http.request(requestConfig));
    } catch (error) {
      if (!this.isRetriableError(error) || attempt >= config.request.maxRetries) {
        throw error;
      }

      const backoffMs =
        config.request.retryBaseDelayMs * Math.pow(2, attempt) + Math.floor(Math.random() * 120);

      logger.warn(
        {
          url: requestConfig.url,
          attempt: attempt + 1,
          maxRetries: config.request.maxRetries,
          backoffMs
        },
        "upstream_request_retry"
      );

      await sleep(backoffMs);
      return this.queuedRequest(requestConfig, attempt + 1);
    }
  }

  extractAppData(payload, appId) {
    const id = String(appId);
    if (!payload) {
      return null;
    }
    if (payload.data?.[id]) {
      return payload.data[id];
    }
    if (payload[id]) {
      return payload[id];
    }
    if (payload.apps?.[id]) {
      return payload.apps[id];
    }
    if (payload.response?.apps?.[id]) {
      return payload.response.apps[id];
    }
    return null;
  }

  async fetchAppInfoFromSteamCmd(appId) {
    try {
      const response = await this.queuedRequest({
        method: "GET",
        url: `${config.steam.steamCmdBaseUrl}/info/${appId}`
      });

      const appData = this.extractAppData(response.data, appId);
      if (!appData) {
        const error = new Error("App data missing in SteamCMD response.");
        error.code = "APP_NOT_FOUND";
        throw error;
      }

      return appData;
    } catch (error) {
      const mappedError = new Error("Failed to fetch app data from SteamCMD API.");
      mappedError.cause = error;
      mappedError.code = error.response?.status === 404 ? "APP_NOT_FOUND" : "STEAMCMD_FAILED";
      throw mappedError;
    }
  }

  async fetchAppInfoFromStore(appId) {
    try {
      const response = await this.queuedRequest({
        method: "GET",
        url: `${config.steam.storeBaseUrl}/appdetails`,
        params: {
          appids: appId,
          l: "en",
          cc: "US"
        }
      });

      const key = String(appId);
      if (!response.data || !response.data[key] || !response.data[key].success) {
        return null;
      }

      return response.data[key].data || null;
    } catch (error) {
      logger.warn({ appId, err: error }, "steam_store_info_failed");
      return null;
    }
  }

  parseSteamDbDepots(html) {
    const $ = cheerio.load(html);
    const depots = [];
    const seen = new Set();

    $("table tbody tr").each((_, row) => {
      const cells = $(row).find("td");
      if (!cells.length) {
        return;
      }

      const depotMatch = $(cells[0]).text().match(/\b\d{3,}\b/);
      if (!depotMatch) {
        return;
      }

      const depotId = depotMatch[0];
      if (seen.has(depotId)) {
        return;
      }

      const manifestMatch = $(row).text().match(/\b\d{15,22}\b/);
      const name = $(cells[1]).text().replace(/\s+/g, " ").trim() || `Depot ${depotId}`;

      depots.push({
        depotId,
        name,
        manifests: manifestMatch ? [{ branch: "public", manifestId: manifestMatch[0] }] : [],
        publicManifestId: manifestMatch ? manifestMatch[0] : null,
        maxSize: 0,
        osList: null
      });
      seen.add(depotId);
    });

    return depots.sort((a, b) => Number(a.depotId) - Number(b.depotId));
  }

  async fetchDepotsFromSteamDb(appId) {
    if (!config.steam.useSteamDbFallback) {
      return [];
    }

    try {
      const response = await this.queuedRequest({
        method: "GET",
        url: `${config.steam.steamDbBaseUrl}/app/${appId}/depots/`,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; SteamManifestBot/1.0)"
        }
      });

      if (typeof response.data !== "string") {
        return [];
      }

      return this.parseSteamDbDepots(response.data);
    } catch (error) {
      logger.warn({ appId, err: error }, "steamdb_fallback_failed");
      return [];
    }
  }
}

module.exports = new SteamService();
