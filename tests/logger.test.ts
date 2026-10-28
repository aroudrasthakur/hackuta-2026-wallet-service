import { afterEach, describe, expect, it, vi } from "vitest";
import { log } from "../src/utils/logger.js";

describe("log", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redacts secrets and PEM material", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    log("info", "boot", {
      authorization: "Bearer super-secret",
      signerCert: "-----BEGIN CERTIFICATE-----\nABC\n-----END CERTIFICATE-----",
      serialNumber: "hackuta-2026-abc",
    });
    const payload = String(spy.mock.calls[0]?.[0]);
    expect(payload).toContain("hackuta-2026-abc");
    expect(payload).toContain("[redacted]");
    expect(payload).not.toContain("super-secret");
    expect(payload).not.toContain("BEGIN CERTIFICATE");
  });
});
