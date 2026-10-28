import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { PKPASS_FILENAME, PKPASS_MIME_TYPE } from "../src/constants.js";
import { signingFailed, signingUnavailable } from "../src/utils/errors.js";
import { buildTestApp, errorBody, TEST_API_KEY, VALID_PASS_REQUEST } from "./helpers/app.js";

function authorized(app: ReturnType<typeof buildTestApp>) {
  return request(app).post("/passes/generate").set("Authorization", `Bearer ${TEST_API_KEY}`);
}

describe("POST /passes/generate", () => {
  it("rejects missing fields", async () => {
    const response = await authorized(buildTestApp()).send({
      serialNumber: VALID_PASS_REQUEST.serialNumber,
    });

    expect(response.status).toBe(400);
    expect(errorBody(response).code).toBe("invalid_request");
    expect(errorBody(response).details?.attendeeName).toBeTruthy();
    expect(errorBody(response).details?.qrToken).toBeTruthy();
  });

  it("rejects malformed participant names", async () => {
    const response = await authorized(buildTestApp()).send({
      ...VALID_PASS_REQUEST,
      attendeeName: "Jane\nDoe",
    });

    expect(response.status).toBe(400);
    expect(errorBody(response).details?.attendeeName).toMatch(/invalid/i);
  });

  it("rejects oversized QR tokens", async () => {
    const response = await authorized(buildTestApp()).send({
      ...VALID_PASS_REQUEST,
      qrToken: "a".repeat(300),
    });

    expect(response.status).toBe(400);
    expect(errorBody(response).details?.qrToken).toMatch(/too long/i);
    expect(JSON.stringify(response.body)).not.toContain("a".repeat(300));
  });

  it("rejects unknown fields", async () => {
    const response = await authorized(buildTestApp()).send({
      ...VALID_PASS_REQUEST,
      extra: true,
    });

    expect(response.status).toBe(400);
  });

  it("rejects a non-JSON content type", async () => {
    const response = await request(buildTestApp())
      .post("/passes/generate")
      .set("Authorization", `Bearer ${TEST_API_KEY}`)
      .set("Content-Type", "text/plain")
      .send("not-json");

    expect(response.status).toBe(400);
  });

  it("rejects an oversized JSON body", async () => {
    const response = await authorized(buildTestApp()).send({
      ...VALID_PASS_REQUEST,
      padding: "x".repeat(20_000),
    });

    expect(response.status).toBe(413);
    expect(errorBody(response).code).toBe("payload_too_large");
  });

  it("invokes pass generation and returns binary pkpass headers", async () => {
    const pkpass = Buffer.from("fake-pkpass-bytes");
    const generatePass = vi.fn(() => Promise.resolve(pkpass));
    const response = await authorized(buildTestApp(generatePass))
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
        });
        res.on("end", () => {
          callback(null, Buffer.concat(chunks));
        });
      })
      .send(VALID_PASS_REQUEST);

    expect(generatePass).toHaveBeenCalledOnce();
    expect(generatePass).toHaveBeenCalledWith(VALID_PASS_REQUEST);
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain(PKPASS_MIME_TYPE);
    expect(response.headers["content-disposition"]).toBe(
      `attachment; filename="${PKPASS_FILENAME}"`,
    );
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(Buffer.isBuffer(response.body) && response.body.equals(pkpass)).toBe(true);
  });

  it("returns 503 when signing is not configured", async () => {
    const generatePass = vi.fn(() => Promise.reject(signingUnavailable()));
    const response = await authorized(buildTestApp(generatePass)).send(VALID_PASS_REQUEST);

    expect(response.status).toBe(503);
    expect(errorBody(response).code).toBe("signing_unavailable");
    expect(errorBody(response).message).toBe("Pass signing is not configured on this server.");
  });

  it("returns a generic error when signing fails and does not leak secrets", async () => {
    const generatePass = vi.fn(() => {
      return Promise.reject(signingFailed(new Error("BEGIN CERTIFICATE mismatch passphrase")));
    });
    const response = await authorized(buildTestApp(generatePass)).send(VALID_PASS_REQUEST);

    expect(response.status).toBe(500);
    expect(errorBody(response).code).toBe("signing_failed");
    expect(errorBody(response).message).toBe("Unable to generate a Wallet pass.");
    const serialized = JSON.stringify(response.body).toLowerCase();
    expect(serialized).not.toContain("certificate");
    expect(serialized).not.toContain("passphrase");
    expect(serialized).not.toContain(TEST_API_KEY);
  });
});
