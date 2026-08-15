export type AiMode = "auto" | "mock" | "openai";
export type DataMode = "memory" | "postgres";

export interface AppConfig {
  nodeEnv: "development" | "test" | "production";
  port: number;
  webOrigin: string;
  dataMode: DataMode;
  databaseUrl: string;
  jwtSecret: string;
  accessTokenTtlMinutes: number;
  refreshTokenTtlDays: number;
  cookieSecure: boolean;
  aiMode: AiMode;
  resolvedAiMode: "mock" | "openai";
  openAiConfigured: boolean;
  modelFree: string;
  modelPlus: string;
  modelHousehold: string;
  openAiTimeoutMs: number;
  openAiMaxRetries: number;
  uploadDir: string;
  maxUploadBytes: number;
  maxImagePixels: number;
  imageRetentionDays: number;
}

function numberEnv(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer from ${min} to ${max}`);
  return value;
}

function booleanEnv(name: string, fallback: boolean): boolean {
  const value = String(process.env[name] ?? fallback).toLowerCase();
  if (value !== "true" && value !== "false") throw new Error(`${name} must be true or false`);
  return value === "true";
}

export function appConfig(): AppConfig {
  const nodeEnv = (process.env.NODE_ENV ?? "development") as AppConfig["nodeEnv"];
  if (!(["development", "test", "production"] as string[]).includes(nodeEnv)) throw new Error("NODE_ENV is invalid");

  const dataMode = (process.env.DATA_MODE ?? (nodeEnv === "test" ? "memory" : "postgres")) as DataMode;
  if (dataMode !== "memory" && dataMode !== "postgres") throw new Error("DATA_MODE must be memory or postgres");

  const aiMode = (process.env.AI_MODE ?? "auto") as AiMode;
  if (!(["auto", "mock", "openai"] as string[]).includes(aiMode)) throw new Error("AI_MODE must be auto, mock or openai");
  if (booleanEnv("OPENAI_STORE", false)) throw new Error("OPENAI_STORE must remain false");

  const databaseUrl = process.env.DATABASE_URL ?? "postgresql://resort:resort@localhost:5432/resort";
  const jwtSecret = process.env.JWT_ACCESS_SECRET ?? "change-me-at-least-32-characters";
  if (jwtSecret.length < 32) throw new Error("JWT_ACCESS_SECRET must contain at least 32 characters");
  if (nodeEnv === "production" && (databaseUrl.includes("resort:resort") || jwtSecret.startsWith("change-me"))) {
    throw new Error("Production refuses default database or JWT credentials");
  }

  const openAiConfigured = Boolean(process.env.OPENAI_API_KEY);
  const resolvedAiMode = aiMode === "mock" || (aiMode === "auto" && !openAiConfigured) ? "mock" : "openai";

  return {
    nodeEnv,
    port: numberEnv("API_PORT", 3000, 1, 65535),
    webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
    dataMode,
    databaseUrl,
    jwtSecret,
    accessTokenTtlMinutes: numberEnv("ACCESS_TOKEN_TTL_MINUTES", 15, 1, 1440),
    refreshTokenTtlDays: numberEnv("REFRESH_TOKEN_TTL_DAYS", 30, 1, 365),
    cookieSecure: booleanEnv("COOKIE_SECURE", nodeEnv === "production"),
    aiMode,
    resolvedAiMode,
    openAiConfigured,
    modelFree: process.env.OPENAI_MODEL_FREE ?? process.env.OPENAI_MODEL ?? "gpt-5.6-luna",
    modelPlus: process.env.OPENAI_MODEL_PLUS ?? process.env.OPENAI_MODEL ?? "gpt-5.6-terra",
    modelHousehold: process.env.OPENAI_MODEL_HOUSEHOLD ?? "gpt-5.6-sol",
    openAiTimeoutMs: numberEnv("OPENAI_TIMEOUT_MS", 45_000, 1_000, 180_000),
    openAiMaxRetries: numberEnv("OPENAI_MAX_RETRIES", 2, 0, 2),
    uploadDir: process.env.UPLOAD_DIR ?? "./uploads",
    maxUploadBytes: numberEnv("MAX_UPLOAD_BYTES", 10 * 1024 * 1024, 1024, 50 * 1024 * 1024),
    maxImagePixels: numberEnv("MAX_IMAGE_PIXELS", 25_000_000, 1_000_000, 100_000_000),
    imageRetentionDays: numberEnv("IMAGE_RETENTION_DAYS", 30, 1, 3650),
  };
}
