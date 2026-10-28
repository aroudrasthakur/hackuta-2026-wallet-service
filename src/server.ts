import "dotenv/config";
import type { Server } from "node:http";
import { createApp } from "./app.js";
import { ConfigError, loadConfig } from "./config.js";
import { SERVICE_NAME } from "./constants.js";
import { createPassGenerator } from "./services/generatePass.js";
import { log } from "./utils/logger.js";

function start(): Server {
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    const message = error instanceof ConfigError ? error.message : "Invalid configuration.";
    log("error", "Refusing to start", { reason: message });
    process.exit(1);
  }

  if (config.nodeEnv === "production" && !config.certificates) {
    log("error", "Refusing to start", { reason: "Apple signing certificates are required in production." });
    process.exit(1);
  }

  if (!config.certificates) {
    log("warn", "Starting without Apple signing certificates; pass generation will return 503.");
  }

  const app = createApp({
    apiKey: config.apiKey,
    generatePass: createPassGenerator({
      templateDir: config.templateDir,
      certificates: config.certificates,
      event: config.event,
      passTypeIdentifier: config.passTypeIdentifier,
      teamIdentifier: config.teamIdentifier,
    }),
  });

  const server = app.listen(config.port, "0.0.0.0", () => {
    log("info", `${SERVICE_NAME} listening`, {
      port: config.port,
      env: config.nodeEnv,
      signingConfigured: Boolean(config.certificates),
    });
  });

  const shutdown = (signal: string) => {
    log("info", "Shutting down", { signal });
    server.close((closeError) => {
      if (closeError) {
        log("error", "Error during shutdown");
        process.exit(1);
      }
      process.exit(0);
    });
    setTimeout(() => {
      log("error", "Forced shutdown after timeout");
      process.exit(1);
    }, 10_000).unref();
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  return server;
}

start();
