const express = require("express");
const { parseAppId } = require("../utils/validators");

function mapError(error) {
  if (!error) {
    return { status: 500, code: "INTERNAL_ERROR", message: "Unexpected error." };
  }
  if (error.code === "INVALID_APPID") {
    return { status: 400, code: error.code, message: "Invalid AppID. Use a positive integer." };
  }
  if (error.code === "APP_NOT_FOUND") {
    return { status: 404, code: error.code, message: "Steam app not found." };
  }
  if (error.code === "DEPOT_DATA_UNAVAILABLE") {
    return { status: 404, code: error.code, message: "Depot data unavailable for this app." };
  }
  return { status: 502, code: "UPSTREAM_FAILURE", message: "Steam data provider failed." };
}

module.exports = function createRoutes({ manifestService, cacheClient }) {
  const router = express.Router();

  router.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      cache: {
        redisConnected: cacheClient.redisReady
      },
      timestamp: new Date().toISOString()
    });
  });

  router.get("/manifest/:appid", async (req, res) => {
    try {
      const appId = parseAppId(req.params.appid);
      const { snapshot, manifests } = await manifestService.getManifestPairs(appId);

      res.json({
        appId: snapshot.appId,
        appName: snapshot.appName,
        source: snapshot.source,
        cacheHit: snapshot.cacheHit,
        manifests
      });
    } catch (error) {
      const mapped = mapError(error);
      res.status(mapped.status).json({ error: mapped.message, code: mapped.code });
    }
  });

  router.get("/depots/:appid", async (req, res) => {
    try {
      const appId = parseAppId(req.params.appid);
      const snapshot = await manifestService.getAppSnapshot(appId);

      res.json({
        appId: snapshot.appId,
        appName: snapshot.appName,
        source: snapshot.source,
        cacheHit: snapshot.cacheHit,
        depots: snapshot.depots
      });
    } catch (error) {
      const mapped = mapError(error);
      res.status(mapped.status).json({ error: mapped.message, code: mapped.code });
    }
  });

  router.get("/info/:appid", async (req, res) => {
    try {
      const appId = parseAppId(req.params.appid);
      const snapshot = await manifestService.getAppSnapshot(appId);

      res.json({
        appId: snapshot.appId,
        appName: snapshot.appName,
        source: snapshot.source,
        cacheHit: snapshot.cacheHit,
        info: snapshot.gameInfo,
        buildHistory: snapshot.builds.slice(0, 10)
      });
    } catch (error) {
      const mapped = mapError(error);
      res.status(mapped.status).json({ error: mapped.message, code: mapped.code });
    }
  });

  return router;
};
