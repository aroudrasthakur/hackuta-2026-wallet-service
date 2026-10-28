import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildTestApp, errorBody, TEST_API_KEY, VALID_PASS_REQUEST } from "./helpers/app.js";

describe("POST /passes/generate authentication", () => {
  it("rejects a missing Authorization header", async () => {
    const response = await request(buildTestApp())
      .post("/passes/generate")
      .send(VALID_PASS_REQUEST);

    expect(response.status).toBe(401);
    expect(errorBody(response).code).toBe("unauthorized");
    expect(errorBody(response).message).toBe("Missing or invalid authorization.");
  });

  it("rejects a non-bearer scheme", async () => {
    const response = await request(buildTestApp())
      .post("/passes/generate")
      .set("Authorization", `Basic ${TEST_API_KEY}`)
      .send(VALID_PASS_REQUEST);

    expect(response.status).toBe(401);
    expect(errorBody(response).code).toBe("unauthorized");
  });

  it("rejects an invalid API key", async () => {
    const response = await request(buildTestApp())
      .post("/passes/generate")
      .set("Authorization", "Bearer totally-wrong-api-key-value-xxxx")
      .send(VALID_PASS_REQUEST);

    expect(response.status).toBe(401);
    expect(errorBody(response).code).toBe("unauthorized");
    expect(JSON.stringify(response.body)).not.toContain(TEST_API_KEY);
  });

  it("rejects an empty bearer token", async () => {
    const response = await request(buildTestApp())
      .post("/passes/generate")
      .set("Authorization", "Bearer ")
      .send(VALID_PASS_REQUEST);

    expect(response.status).toBe(401);
  });
});
