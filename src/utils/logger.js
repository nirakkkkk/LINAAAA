const pino = require("pino");
const config = require("../config/config");

const loggerOptions = {
  level: config.logLevel,
  timestamp: pino.stdTimeFunctions.isoTime
};

const transport =
  config.nodeEnv === "production"
    ? undefined
    : pino.transport({
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname"
        }
      });

const logger = pino(loggerOptions, transport);

module.exports = logger;
