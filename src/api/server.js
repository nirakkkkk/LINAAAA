const express = require("express");
const config = require("../config/config");
const logger = require("../utils/logger");
const createRoutes = require("./routes");

module.exports = function createApiServer({ manifestService, cacheClient }) {
  const app = express();
  let server = null;

  app.disable("x-powered-by");
  app.use(express.json({ limit: "256kb" }));

  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      logger.info(
        {
          method: req.method,
          path: req.originalUrl,
          statusCode: res.statusCode,
          durationMs: Date.now() - start
        },
        "api_request"
      );
    });
    next();
  });

  app.use("/", createRoutes({ manifestService, cacheClient }));

  app.use((err, _req, res, _next) => {
    logger.error({ err }, "api_unhandled_error");
    res.status(500).json({ error: "Internal server error." });
  });

  return {
    async start() {
      if (server) {
        return server;
      }

      server = await new Promise((resolve, reject) => {
        const instance = app.listen(config.api.port, () => resolve(instance));
        instance.on("error", reject);
      });

      logger.info({ port: config.api.port }, "internal_api_started");
      return server;
    },

    async stop() {
      if (!server) {
        return;
      }

      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });

      logger.info("internal_api_stopped");
      server = null;
    }
  };
};
