import type { RequestHandler } from "express";
import { safeEqual } from "../utils/crypto.js";
import { unauthorized } from "../utils/errors.js";

export function authenticate(apiKey: string): RequestHandler {
  return (req, _res, next) => {
    const header = req.headers.authorization;
    if (typeof header !== "string" || !header.startsWith("Bearer ")) {
      next(unauthorized());
      return;
    }

    const token = header.slice("Bearer ".length);
    if (!token || !safeEqual(token, apiKey)) {
      next(unauthorized());
      return;
    }

    next();
  };
}
