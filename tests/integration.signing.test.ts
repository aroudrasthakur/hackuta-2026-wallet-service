import { describe, expect, it } from "vitest";

/**
 * Optional live signing test. Skipped unless WALLET_SERVICE_INTEGRATION=1 and
 * Apple PEM paths are present. See README → “Testing with real Apple credentials”.
 */
const enabled = process.env.WALLET_SERVICE_INTEGRATION === "1";

describe.skipIf(!enabled)("live Apple pass signing", () => {
  it("builds a non-empty .pkpass with real certificates", async () => {
    const { loadConfig } = await import("../src/config.js");
    const { generateSignedPass } = await import("../src/services/generatePass.js");
    const config = loadConfig();
    expect(config.certificates).not.toBeNull();

    const buffer = await generateSignedPass(
      {
        serialNumber: "hackuta-2026-integration",
        attendeeName: "Integration Tester",
        qrToken: "b".repeat(64),
      },
      {
        templateDir: config.templateDir,
        certificates: config.certificates,
        event: config.event,
        passTypeIdentifier: config.passTypeIdentifier,
        teamIdentifier: config.teamIdentifier,
      },
    );

    expect(buffer.length).toBeGreaterThan(100);
    expect(buffer.subarray(0, 2).toString()).toBe("PK");
  });
});
