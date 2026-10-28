import { createPrivateKey, X509Certificate } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

export type PassSigningCertificates = {
  wwdr: Buffer;
  signerCert: Buffer;
  signerKey: Buffer;
  signerKeyPassphrase?: string;
};

export type EventConfig = {
  name: string;
  location: string;
  startDate: Date;
  endDate: Date;
};

export type AppConfig = {
  port: number;
  nodeEnv: "development" | "test" | "production";
  apiKey: string;
  passTypeIdentifier: string;
  teamIdentifier: string;
  event: EventConfig;
  certificates: PassSigningCertificates | null;
  templateDir: string;
};

const nodeEnvSchema = z.enum(["development", "test", "production"]);

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  NODE_ENV: nodeEnvSchema.default("development"),
  WALLET_SERVICE_API_KEY: z
    .string()
    .min(32, "WALLET_SERVICE_API_KEY must be at least 32 characters."),
  APPLE_TEAM_IDENTIFIER: z
    .string()
    .trim()
    .regex(/^[A-Z0-9]{10}$/, "APPLE_TEAM_IDENTIFIER must be the 10-character Apple Team ID."),
  APPLE_PASS_TYPE_IDENTIFIER: z
    .string()
    .trim()
    .regex(/^pass\.[A-Za-z0-9.-]+$/, "APPLE_PASS_TYPE_IDENTIFIER must look like pass.com.example.id."),
  APPLE_CERT_PATH: z.string().trim().optional(),
  APPLE_KEY_PATH: z.string().trim().optional(),
  APPLE_KEY_PASSPHRASE: z.string().optional(),
  APPLE_WWDR_PATH: z.string().trim().optional(),
  EVENT_NAME: z.string().trim().min(1).default("HackUTA 2026"),
  EVENT_LOCATION: z.string().trim().min(1).default("The University of Texas at Arlington"),
  EVENT_START_DATE: z.string().trim().min(1).default("2026-11-14T09:00:00-06:00"),
  EVENT_END_DATE: z.string().trim().min(1).default("2026-11-15T18:00:00-06:00"),
  PASS_TEMPLATE_DIR: z.string().trim().optional(),
});

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

function parseDate(value: string, name: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ConfigError(`${name} is not a valid date or ISO-8601 timestamp.`);
  }
  return parsed;
}

function readRequiredFile(filePath: string, label: string): Buffer {
  const resolved = path.resolve(filePath);
  if (!existsSync(resolved) || !statSync(resolved).isFile()) {
    throw new ConfigError(`${label} was not found.`);
  }
  const contents = readFileSync(resolved);
  if (contents.length === 0) {
    throw new ConfigError(`${label} is empty.`);
  }
  return contents;
}

function loadCertificates(env: z.infer<typeof envSchema>): PassSigningCertificates {
  if (!env.APPLE_CERT_PATH || !env.APPLE_KEY_PATH || !env.APPLE_WWDR_PATH) {
    throw new ConfigError(
      "APPLE_CERT_PATH, APPLE_KEY_PATH, and APPLE_WWDR_PATH are required when signing is enabled.",
    );
  }

  const signerCert = readRequiredFile(env.APPLE_CERT_PATH, "APPLE_CERT_PATH");
  const signerKey = readRequiredFile(env.APPLE_KEY_PATH, "APPLE_KEY_PATH");
  const wwdr = readRequiredFile(env.APPLE_WWDR_PATH, "APPLE_WWDR_PATH");

  try {
    new X509Certificate(signerCert);
  } catch {
    throw new ConfigError("APPLE_CERT_PATH is not a valid X.509 certificate.");
  }

  try {
    new X509Certificate(wwdr);
  } catch {
    throw new ConfigError("APPLE_WWDR_PATH is not a valid X.509 certificate.");
  }

  try {
    createPrivateKey({
      key: signerKey,
      ...(env.APPLE_KEY_PASSPHRASE ? { passphrase: env.APPLE_KEY_PASSPHRASE } : {}),
    });
  } catch {
    throw new ConfigError(
      "APPLE_KEY_PATH is not a valid private key, or APPLE_KEY_PASSPHRASE is incorrect.",
    );
  }

  return {
    wwdr,
    signerCert,
    signerKey,
    ...(env.APPLE_KEY_PASSPHRASE ? { signerKeyPassphrase: env.APPLE_KEY_PASSPHRASE } : {}),
  };
}

export function defaultTemplateDir(cwd = process.cwd()): string {
  return path.resolve(cwd, "templates", "hackuta.pass");
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const pathLabel = first?.path.join(".") || "configuration";
    throw new ConfigError(`${pathLabel}: ${first?.message ?? "Invalid configuration."}`);
  }

  const values = parsed.data;
  const startDate = parseDate(values.EVENT_START_DATE, "EVENT_START_DATE");
  const endDate = parseDate(values.EVENT_END_DATE, "EVENT_END_DATE");
  if (endDate.getTime() <= startDate.getTime()) {
    throw new ConfigError("EVENT_END_DATE must be after EVENT_START_DATE.");
  }

  const requireCertificates = values.NODE_ENV === "production";
  const hasAnyCertPath = Boolean(
    values.APPLE_CERT_PATH || values.APPLE_KEY_PATH || values.APPLE_WWDR_PATH,
  );

  let certificates: PassSigningCertificates | null = null;
  if (requireCertificates || hasAnyCertPath) {
    certificates = loadCertificates(values);
  }

  const templateDir = values.PASS_TEMPLATE_DIR
    ? path.resolve(values.PASS_TEMPLATE_DIR)
    : defaultTemplateDir();
  if (!existsSync(templateDir) || !statSync(templateDir).isDirectory()) {
    throw new ConfigError(`Pass template directory was not found at ${templateDir}.`);
  }

  return {
    port: values.PORT,
    nodeEnv: values.NODE_ENV,
    apiKey: values.WALLET_SERVICE_API_KEY,
    passTypeIdentifier: values.APPLE_PASS_TYPE_IDENTIFIER,
    teamIdentifier: values.APPLE_TEAM_IDENTIFIER,
    event: {
      name: values.EVENT_NAME,
      location: values.EVENT_LOCATION,
      startDate,
      endDate,
    },
    certificates,
    templateDir,
  };
}
