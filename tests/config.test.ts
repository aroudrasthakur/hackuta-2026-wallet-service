import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../src/config.js";

const templateDir = path.resolve("templates", "hackuta.pass");

const validBase = {
  WALLET_SERVICE_API_KEY: "test-wallet-api-key-32-chars-min",
  APPLE_TEAM_IDENTIFIER: "ABCDE12345",
  APPLE_PASS_TYPE_IDENTIFIER: "pass.com.hackuta.2026",
  EVENT_LOCATION: "The University of Texas at Arlington",
  EVENT_START_DATE: "2026-11-14T09:00:00-06:00",
  EVENT_END_DATE: "2026-11-15T18:00:00-06:00",
  PASS_TEMPLATE_DIR: templateDir,
};

describe("loadConfig", () => {
  it("loads development config without Apple credentials", () => {
    const config = loadConfig({
      ...validBase,
      NODE_ENV: "development",
      PORT: "4000",
    });

    expect(config.port).toBe(4000);
    expect(config.nodeEnv).toBe("development");
    expect(config.certificates).toBeNull();
    expect(config.event.name).toBe("HackUTA 2026");
    expect(config.apiKey).toBe(validBase.WALLET_SERVICE_API_KEY);
  });

  it("rejects a short API key", () => {
    expect(() =>
      loadConfig({
        ...validBase,
        WALLET_SERVICE_API_KEY: "short",
      }),
    ).toThrow(ConfigError);
  });

  it("rejects an invalid pass type identifier", () => {
    expect(() =>
      loadConfig({
        ...validBase,
        APPLE_PASS_TYPE_IDENTIFIER: "not-a-pass-id",
      }),
    ).toThrow(/APPLE_PASS_TYPE_IDENTIFIER/);
  });

  it("rejects inverted event dates", () => {
    expect(() =>
      loadConfig({
        ...validBase,
        EVENT_START_DATE: "2026-11-16T00:00:00Z",
        EVENT_END_DATE: "2026-11-14T00:00:00Z",
      }),
    ).toThrow(/EVENT_END_DATE/);
  });

  it("requires signing files in production", () => {
    expect(() =>
      loadConfig({
        ...validBase,
        NODE_ENV: "production",
      }),
    ).toThrow(/APPLE_CERT_PATH/);
  });

  it("rejects a signing certificate that is not X.509", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "wallet-certs-"));
    const certPath = path.join(dir, "cert.pem");
    const keyPath = path.join(dir, "key.pem");
    const wwdrPath = path.join(dir, "wwdr.pem");
    writeFileSync(certPath, "not-a-certificate");
    writeFileSync(keyPath, "not-a-key");
    writeFileSync(wwdrPath, "not-wwdr");

    expect(() =>
      loadConfig({
        ...validBase,
        NODE_ENV: "development",
        APPLE_CERT_PATH: certPath,
        APPLE_KEY_PATH: keyPath,
        APPLE_WWDR_PATH: wwdrPath,
      }),
    ).toThrow(/not a valid X\.509 certificate/);
  });
});
