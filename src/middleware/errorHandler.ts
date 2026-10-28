import type { ErrorRequestHandler } from "express";
import { AppError, type ErrorCode } from "../utils/errors.js";
import { log } from "../utils/logger.js";

function clientMessage(error: AppError): string {
  if (error.expose) {
    return error.message;
  }
  return "An unexpected error occurred.";
}

export function errorHandler(): ErrorRequestHandler {
  return (err, req, res, _next) => {
    if (isPayloadTooLarge(err)) {
      res.status(413).json({
        error: {
          code: "payload_too_large" satisfies ErrorCode,
          message: "Request body is too large.",
        },
      });
      return;
    }

    if (err instanceof SyntaxError && "body" in err) {
      res.status(400).json({
        error: {
          code: "invalid_request" satisfies ErrorCode,
          message: "The request body is not valid JSON.",
        },
      });
      return;
    }

    if (err instanceof AppError) {
      if (err.statusCode >= 500) {
        log(err.statusCode === 503 ? "warn" : "error", "Request failed", {
          code: err.code,
          path: req.path,
          method: req.method,
        });
      }
      res.status(err.statusCode).json({
        error: {
          code: err.code,
          message: clientMessage(err),
          ...(err.details ? { details: err.details } : {}),
        },
      });
      return;
    }

    log("error", "Unhandled server error", {
      path: req.path,
      method: req.method,
      name: err instanceof Error ? err.name : "unknown",
    });
    res.status(500).json({
      error: {
        code: "internal_error" satisfies ErrorCode,
        message: "An unexpected error occurred.",
      },
    });
  };
}

function isPayloadTooLarge(err: unknown): boolean {
  return Boolean(
    err &&
      typeof err === "object" &&
      "type" in err &&
      (err as { type?: string }).type === "entity.too.large",
  );
}
