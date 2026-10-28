import type { Express } from "express";
import { createApp } from "../../src/app.js";
import type { PassGenerator } from "../../src/services/generatePass.js";

export const TEST_API_KEY = "test-wallet-api-key-32-chars-min";

export const VALID_PASS_REQUEST = {
  serialNumber: "hackuta-2026-participant123",
  attendeeName: "Jane Q. Hacker",
  qrToken: "a".repeat(64),
};

export type ErrorBody = {
  error: {
    code: string;
    message: string;
    details?: Record<string, string>;
  };
};

export function errorBody(response: { body: unknown }): ErrorBody["error"] {
  return (response.body as ErrorBody).error;
}

export function buildTestApp(
  generatePass: PassGenerator = () => Promise.resolve(Buffer.from("PKPASS")),
): Express {
  return createApp({
    apiKey: TEST_API_KEY,
    generatePass,
  });
}
