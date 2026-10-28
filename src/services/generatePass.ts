import { PKPass } from "passkit-generator";
import type { EventConfig, PassSigningCertificates } from "../config.js";
import { EVENT_LATITUDE, EVENT_LONGITUDE } from "../constants.js";
import { formatEventWindow } from "../utils/dates.js";
import { signingFailed, signingUnavailable } from "../utils/errors.js";
import type { PassRequest } from "../validators/passRequest.js";

export type PassGenerator = (request: PassRequest) => Promise<Buffer>;

export type PassGeneratorOptions = {
  templateDir: string;
  certificates: PassSigningCertificates | null;
  event: EventConfig;
  passTypeIdentifier: string;
  teamIdentifier: string;
};

type WritableField = { key?: string; value?: string };

export async function generateSignedPass(
  request: PassRequest,
  options: PassGeneratorOptions,
): Promise<Buffer> {
  if (!options.certificates) {
    throw signingUnavailable();
  }

  const datesLabel = formatEventWindow(options.event.startDate, options.event.endDate);
  const startIso = options.event.startDate.toISOString();
  const endIso = options.event.endDate.toISOString();

  let pass: PKPass;
  try {
    pass = await PKPass.from(
      {
        model: options.templateDir,
        certificates: {
          wwdr: options.certificates.wwdr,
          signerCert: options.certificates.signerCert,
          signerKey: options.certificates.signerKey,
          ...(options.certificates.signerKeyPassphrase
            ? { signerKeyPassphrase: options.certificates.signerKeyPassphrase }
            : {}),
        },
      },
      {
        serialNumber: request.serialNumber,
        passTypeIdentifier: options.passTypeIdentifier,
        teamIdentifier: options.teamIdentifier,
        organizationName: "HackUTA",
        description: `${options.event.name} Check-in Pass`,
        logoText: "HackUTA",
        semantics: {
          eventName: options.event.name,
          eventType: "PKEventTypeConference",
          eventStartDate: startIso,
          eventEndDate: endIso,
          venueName: options.event.location,
          venueLocation: {
            latitude: EVENT_LATITUDE,
            longitude: EVENT_LONGITUDE,
          },
        },
      },
    );
  } catch (cause) {
    throw signingFailed(cause);
  }

  try {
    pass.setRelevantDate(options.event.startDate);
    pass.setExpirationDate(options.event.endDate);
    pass.setRelevantDates([
      { startDate: options.event.startDate, endDate: options.event.endDate },
    ]);

    setField(pass.secondaryFields as WritableField[], "participant_name", request.attendeeName);
    setField(pass.auxiliaryFields as WritableField[], "event_dates", datesLabel);
    setField(pass.auxiliaryFields as WritableField[], "event_location", options.event.location);
    setField(pass.backFields as WritableField[], "event_location_back", options.event.location);
    setField(pass.backFields as WritableField[], "event_dates_back", datesLabel);

    pass.setBarcodes({
      format: "PKBarcodeFormatQR",
      message: request.qrToken,
      messageEncoding: "iso-8859-1",
      altText: "Check-in QR · Valid until badge pickup",
    });

    const buffer = pass.getAsBuffer();
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw signingFailed();
    }
    return buffer;
  } catch (cause) {
    if (cause && typeof cause === "object" && "code" in cause) {
      throw cause;
    }
    throw signingFailed(cause);
  }
}

export function createPassGenerator(options: PassGeneratorOptions): PassGenerator {
  return (request) => generateSignedPass(request, options);
}

function setField(fields: WritableField[], key: string, value: string): void {
  const match = fields.find((field) => field.key === key);
  if (match) {
    match.value = value;
  }
}
