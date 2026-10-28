import { z } from "zod";
import { invalidRequest } from "../utils/errors.js";

function hasControlChars(value: string): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
}

export const passRequestSchema = z
  .object({
    serialNumber: z
      .string()
      .trim()
      .min(8, "serialNumber is too short.")
      .max(128, "serialNumber is too long.")
      .regex(
        /^[A-Za-z0-9._-]+$/,
        "serialNumber may contain only letters, numbers, periods, underscores, and hyphens.",
      ),
    attendeeName: z
      .string()
      .trim()
      .min(1, "attendeeName is required.")
      .max(80, "attendeeName is too long.")
      .refine((value) => !hasControlChars(value), "attendeeName contains invalid characters."),
    qrToken: z
      .string()
      .min(16, "qrToken is too short.")
      .max(256, "qrToken is too long.")
      .regex(/^[A-Za-z0-9._~-]+$/, "qrToken contains invalid characters."),
  })
  .strict();

export type PassRequest = z.infer<typeof passRequestSchema>;

export function parsePassRequest(body: unknown): PassRequest {
  const result = passRequestSchema.safeParse(body);
  if (result.success) {
    return result.data;
  }

  const details: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && details[field] === undefined) {
      details[field] = issue.message;
    }
  }
  throw invalidRequest("The request body is invalid.", details);
}
