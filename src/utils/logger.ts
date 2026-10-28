const SENSITIVE_KEY = /passphrase|password|secret|apikey|api_key|authorization|cookie|cert|private.?key|wwdr|token|pem/i;

function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redact);
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).map(([key, nested]) => {
      if (SENSITIVE_KEY.test(key)) {
        return [key, "[redacted]"];
      }
      return [key, redact(nested)];
    });
    return Object.fromEntries(entries);
  }
  if (typeof value === "string" && value.includes("BEGIN ")) {
    return "[redacted]";
  }
  return value;
}

export function log(
  level: "info" | "warn" | "error",
  message: string,
  extra?: Record<string, unknown>,
): void {
  const line = {
    ts: new Date().toISOString(),
    level,
    message,
    ...(extra ? (redact(extra) as Record<string, unknown>) : {}),
  };
  const serialized = JSON.stringify(line);
  if (level === "error") {
    console.error(serialized);
    return;
  }
  if (level === "warn") {
    console.warn(serialized);
    return;
  }
  console.log(serialized);
}
