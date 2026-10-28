import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PassGeneratorOptions } from "../src/services/generatePass.js";
import { VALID_PASS_REQUEST } from "./helpers/app.js";

const from = vi.fn();

vi.mock("passkit-generator", () => ({
  PKPass: {
    from: (...args: unknown[]) => from(...args) as unknown,
  },
}));

describe("generateSignedPass", () => {
  const certificates = {
    wwdr: Buffer.from("wwdr"),
    signerCert: Buffer.from("cert"),
    signerKey: Buffer.from("key"),
  };

  const options = (): PassGeneratorOptions => ({
    templateDir: "/tmp/hackuta.pass",
    certificates,
    event: {
      name: "HackUTA 2026",
      location: "The University of Texas at Arlington",
      startDate: new Date("2026-11-14T09:00:00-06:00"),
      endDate: new Date("2026-11-15T18:00:00-06:00"),
    },
    passTypeIdentifier: "pass.com.hackuta.2026",
    teamIdentifier: "ABCDE12345",
  });

  beforeEach(() => {
    from.mockReset();
  });

  it("personalizes the template, sets the QR token, and returns the signed buffer", async () => {
    const setBarcodes = vi.fn();
    const setRelevantDate = vi.fn();
    const setExpirationDate = vi.fn();
    const setRelevantDates = vi.fn();
    const getAsBuffer = vi.fn(() => Buffer.from("signed-pkpass"));
    const pass = {
      secondaryFields: [{ key: "participant_name", value: "Participant" }],
      auxiliaryFields: [
        { key: "event_dates", value: "placeholder" },
        { key: "event_location", value: "placeholder" },
      ],
      backFields: [
        { key: "event_location_back", value: "placeholder" },
        { key: "event_dates_back", value: "placeholder" },
      ],
      setBarcodes,
      setRelevantDate,
      setExpirationDate,
      setRelevantDates,
      getAsBuffer,
    };
    from.mockResolvedValue(pass);

    const { generateSignedPass } = await import("../src/services/generatePass.js");
    const buffer = await generateSignedPass(VALID_PASS_REQUEST, options());

    expect(from).toHaveBeenCalledOnce();
    const [source, props] = from.mock.calls[0] as [
      { model: string; certificates: { signerCert: Buffer } },
      { serialNumber: string; passTypeIdentifier: string; teamIdentifier: string },
    ];
    expect(source.model).toBe("/tmp/hackuta.pass");
    expect(source.certificates.signerCert).toBe(certificates.signerCert);
    expect(props.serialNumber).toBe(VALID_PASS_REQUEST.serialNumber);
    expect(props.passTypeIdentifier).toBe("pass.com.hackuta.2026");
    expect(props.teamIdentifier).toBe("ABCDE12345");
    expect(pass.secondaryFields[0]?.value).toBe(VALID_PASS_REQUEST.attendeeName);
    expect(setRelevantDate).toHaveBeenCalledOnce();
    expect(setExpirationDate).toHaveBeenCalledOnce();
    expect(setBarcodes).toHaveBeenCalledWith({
      format: "PKBarcodeFormatQR",
      message: VALID_PASS_REQUEST.qrToken,
      messageEncoding: "iso-8859-1",
      altText: "Check-in QR · Valid until badge pickup",
    });
    expect(buffer.toString()).toBe("signed-pkpass");
  });

  it("returns signing_unavailable when certificates are missing", async () => {
    const { generateSignedPass } = await import("../src/services/generatePass.js");
    await expect(
      generateSignedPass(VALID_PASS_REQUEST, { ...options(), certificates: null }),
    ).rejects.toMatchObject({
      code: "signing_unavailable",
      statusCode: 503,
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("maps PKPass failures to a generic signing error", async () => {
    from.mockRejectedValue(new Error("invalid signer certificate"));
    const { generateSignedPass } = await import("../src/services/generatePass.js");
    await expect(generateSignedPass(VALID_PASS_REQUEST, options())).rejects.toMatchObject({
      code: "signing_failed",
      statusCode: 500,
      message: "Unable to generate a Wallet pass.",
    });
  });
});
