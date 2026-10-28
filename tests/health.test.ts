import request from "supertest";
import { describe, expect, it } from "vitest";
import { SERVICE_NAME } from "../src/constants.js";
import { buildTestApp } from "./helpers/app.js";

describe("GET /health", () => {
  it("returns a minimal ok payload without configuration secrets", async () => {
    const app = buildTestApp();
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "ok",
      service: SERVICE_NAME,
    });
    expect(response.headers["cache-control"]).toBe("no-store");

    const serialized = JSON.stringify(response.body).toLowerCase();
    expect(serialized).not.toContain("api");
    expect(serialized).not.toContain("cert");
    expect(serialized).not.toContain("passphrase");
    expect(serialized).not.toContain("begin ");
  });
});
