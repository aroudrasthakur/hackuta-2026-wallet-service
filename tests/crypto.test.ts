import { describe, expect, it } from "vitest";
import { safeEqual } from "../src/utils/crypto.js";

describe("safeEqual", () => {
  it("accepts identical strings", () => {
    expect(safeEqual("wallet-secret", "wallet-secret")).toBe(true);
  });

  it("rejects different strings of the same length", () => {
    expect(safeEqual("wallet-secret", "wallet-secreX")).toBe(false);
  });

  it("rejects different lengths", () => {
    expect(safeEqual("short", "much-longer-value")).toBe(false);
  });
});
