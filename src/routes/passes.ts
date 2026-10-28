import { Router } from "express";
import { PKPASS_FILENAME, PKPASS_MIME_TYPE } from "../constants.js";
import { authenticate } from "../middleware/authenticate.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { invalidRequest } from "../utils/errors.js";
import { log } from "../utils/logger.js";
import type { PassGenerator } from "../services/generatePass.js";
import { parsePassRequest } from "../validators/passRequest.js";

export function passesRouter(options: { apiKey: string; generatePass: PassGenerator }): Router {
  const router = Router();

  router.post(
    "/passes/generate",
    authenticate(options.apiKey),
    asyncHandler(async (req, res) => {
      if (!isJsonRequest(req.headers["content-type"])) {
        throw invalidRequest("Content-Type must be application/json.");
      }

      const payload = parsePassRequest(req.body);
      const pkpass = await options.generatePass(payload);

      log("info", "Issued Wallet pass", { serialNumber: payload.serialNumber });

      res.status(200);
      res.setHeader("Content-Type", PKPASS_MIME_TYPE);
      res.setHeader("Content-Disposition", `attachment; filename="${PKPASS_FILENAME}"`);
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.send(pkpass);
    }),
  );

  return router;
}

function isJsonRequest(contentType: string | undefined): boolean {
  if (!contentType) {
    return false;
  }
  return contentType.toLowerCase().includes("application/json");
}
