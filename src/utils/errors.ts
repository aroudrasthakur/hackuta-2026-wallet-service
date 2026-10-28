export type ErrorCode =
  | "unauthorized"
  | "invalid_request"
  | "not_found"
  | "payload_too_large"
  | "unsupported_media_type"
  | "signing_unavailable"
  | "signing_failed"
  | "internal_error";

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly details?: Readonly<Record<string, string>>;
  readonly expose: boolean;

  constructor(
    statusCode: number,
    code: ErrorCode,
    message: string,
    options?: {
      details?: Readonly<Record<string, string>>;
      expose?: boolean;
      cause?: unknown;
    },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    if (options?.details !== undefined) {
      this.details = options.details;
    }
    this.expose = options?.expose ?? statusCode < 500;
  }
}

export function unauthorized(): AppError {
  return new AppError(401, "unauthorized", "Missing or invalid authorization.");
}

export function invalidRequest(
  message = "The request body is invalid.",
  details?: Readonly<Record<string, string>>,
): AppError {
  return new AppError(400, "invalid_request", message, {
    ...(details ? { details } : {}),
  });
}

export function notFound(): AppError {
  return new AppError(404, "not_found", "Not found.");
}

export function signingUnavailable(): AppError {
  return new AppError(
    503,
    "signing_unavailable",
    "Pass signing is not configured on this server.",
    { expose: true },
  );
}

export function signingFailed(cause?: unknown): AppError {
  return new AppError(500, "signing_failed", "Unable to generate a Wallet pass.", {
    expose: true,
    cause,
  });
}
