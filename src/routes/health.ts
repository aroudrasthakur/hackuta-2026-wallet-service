import { Router } from "express";
import { SERVICE_NAME } from "../constants.js";

export function healthRouter(): Router {
  const router = Router();

  router.get("/health", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      status: "ok",
      service: SERVICE_NAME,
    });
  });

  return router;
}
