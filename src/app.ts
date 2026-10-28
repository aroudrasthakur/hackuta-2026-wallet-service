import express from "express";
import { JSON_BODY_LIMIT } from "./constants.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { healthRouter } from "./routes/health.js";
import { passesRouter } from "./routes/passes.js";
import type { PassGenerator } from "./services/generatePass.js";
import { notFound } from "./utils/errors.js";

export type CreateAppOptions = {
  apiKey: string;
  generatePass: PassGenerator;
};

export function createApp(options: CreateAppOptions): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("etag", false);

  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  app.use(
    express.json({
      limit: JSON_BODY_LIMIT,
      type: "application/json",
    }),
  );

  app.use(healthRouter());
  app.use(passesRouter(options));

  app.use((_req, _res, next) => {
    next(notFound());
  });

  app.use(errorHandler());
  return app;
}
