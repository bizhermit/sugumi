type EnvName = `APP_${string}` | "NODE_ENV";

const ENVS = ["development", "test", "production"] as const;
export type Env = (typeof ENVS)[number];

const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const LOG_FORMATS = ["json", "pretty"] as const;
export type LogFormat = (typeof LOG_FORMATS)[number];

export interface LoginLimits {
  readonly maxFailedAttempts: number;
  readonly lockoutMs: number;
  readonly addressMaxFailedAttempts: number;
  readonly addressWindowMs: number;
  readonly addressBlockMs: number;
  readonly deviceLifetimeMs: number;
}

export interface SessionLimits {
  readonly idleTimeoutMs: number;
  readonly absoluteTimeoutMs: number;
}

export interface Config {
  readonly env: Env;
  readonly port: number;
  readonly databaseUrl: string;
  readonly trustProxy: boolean;
  readonly login: LoginLimits;
  readonly session: SessionLimits;
  readonly log: {
    readonly level: LogLevel;
    readonly format: LogFormat;
  };
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const ATTEMPTS_RANGE = { min: 1, max: 1000 };
const MINUTES_RANGE = { min: 1, max: 365 * 24 * 60 };
const HOURS_RANGE = { min: 1, max: 365 * 24 };
const DAYS_RANGE = { min: 1, max: 3650 };

export class ConfigError extends Error {
  readonly errors: readonly string[];

  constructor(errors: readonly string[]) {
    super(`環境変数に不正な値が含まれています。\n${errors.map((err) => `  - ${err}`).join("\n")}`);
    this.name = "ConfigError";
    this.errors = errors;
  }
}

function readEnvValue(envValues: NodeJS.ProcessEnv, name: EnvName) {
  const value = envValues[name]?.trim();
  if (value === undefined || value === "") {
    return undefined;
  }
  return value;
}

function oneOf<const T extends readonly string[]>(
  envValues: NodeJS.ProcessEnv,
  name: EnvName,
  validValues: T,
  fallbackValue: T[number],
  errors: string[],
): T[number] {
  const value = readEnvValue(envValues, name);
  if (value === undefined) {
    return fallbackValue;
  }
  const found = validValues.find((choice) => choice === value);
  if (found === undefined) {
    errors.push(`${name}: ${validValues.join(" | ")} のいずれかを指定してください（指定値: ${value}）`);
    return fallbackValue;
  }
  return found;
}

function integer(
  envValues: NodeJS.ProcessEnv,
  name: EnvName,
  fallbackValue: number,
  range: { min: number; max: number },
  errors: string[],
): number {
  const value = readEnvValue(envValues, name);
  if (value === undefined) {
    return fallbackValue;
  }
  const parsed = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(parsed) || parsed < range.min || parsed > range.max) {
    errors.push(`${name}: ${range.min}〜${range.max} の整数を指定してください（指定値: ${value}）`);
    return fallbackValue;
  }
  return parsed;
}

function boolean(envValues: NodeJS.ProcessEnv, name: EnvName, fallbackValue: boolean, errors: string[]): boolean {
  const value = readEnvValue(envValues, name);
  if (value === undefined) {
    return fallbackValue;
  }
  if (value !== "true" && value !== "false") {
    errors.push(`${name}: true|falseのいずれかを指定してください（指定値: ${value}）`);
    return fallbackValue;
  }
  return value === "true";
}

function databaseUrl(envValues: NodeJS.ProcessEnv, name: EnvName, errors: string[]): string {
  const value = readEnvValue(envValues, name);
  if (value === undefined) {
    errors.push(`${name}: DB接続用URLを設定してください（postgres://ユーザー:パスワード@ホスト:ポート/DB名）。`);
    return "";
  }
  if (!URL.canParse(value) || !/^postgres(?:ql)?:$/.test(new URL(value).protocol)) {
    errors.push(`${name}: DB接続用URLの形式が不正です（postgres://ユーザー:パスワード@ホスト:ポート/DB名）。`);
    return "";
  }
  return value;
}

export interface MigrationConfig {
  readonly databaseUrl: string;
}

export function loadMigrationConfig(envValues: NodeJS.ProcessEnv = process.env): MigrationConfig {
  const errors: string[] = [];
  const url = databaseUrl(envValues, "APP_MIGRATION_DATABASE_URL", errors);
  if (errors.length > 0) {
    throw new ConfigError(errors);
  }
  return Object.freeze<MigrationConfig>({ databaseUrl: url });
}

export function loadConfig(envValues: NodeJS.ProcessEnv = process.env): Config {
  const errors: string[] = [];

  const env = oneOf(envValues, "NODE_ENV", ENVS, "development", errors);
  const isProduction = env === "production";
  const port = integer(envValues, "APP_PORT", 3000, { min: 1, max: 65535 }, errors);
  const logLevel = oneOf(envValues, "APP_LOG_LEVEL", LOG_LEVELS, isProduction ? "info" : "debug", errors);
  const logFormat = oneOf(envValues, "APP_LOG_FORMAT", LOG_FORMATS, isProduction ? "json" : "pretty", errors);
  const dbUrl = databaseUrl(envValues, "APP_DATABASE_URL", errors);
  const trustProxy = boolean(envValues, "APP_TRUST_PROXY", false, errors);
  const login: LoginLimits = {
    maxFailedAttempts: integer(envValues, "APP_LOGIN_MAX_FAILED_ATTEMPTS", 5, ATTEMPTS_RANGE, errors),
    lockoutMs: integer(envValues, "APP_LOGIN_LOCKOUT_MINUTES", 15, MINUTES_RANGE, errors) * MINUTE_MS,
    addressMaxFailedAttempts: integer(envValues, "APP_LOGIN_ADDRESS_MAX_FAILED_ATTEMPTS", 20, ATTEMPTS_RANGE, errors),
    addressWindowMs: integer(envValues, "APP_LOGIN_ADDRESS_WINDOW_MINUTES", 15, MINUTES_RANGE, errors) * MINUTE_MS,
    addressBlockMs: integer(envValues, "APP_LOGIN_ADDRESS_BLOCK_MINUTES", 15, MINUTES_RANGE, errors) * MINUTE_MS,
    deviceLifetimeMs: integer(envValues, "APP_LOGIN_DEVICE_DAYS", 90, DAYS_RANGE, errors) * DAY_MS,
  };
  const session: SessionLimits = {
    idleTimeoutMs: integer(envValues, "APP_SESSION_IDLE_MINUTES", 30, MINUTES_RANGE, errors) * MINUTE_MS,
    absoluteTimeoutMs: integer(envValues, "APP_SESSION_ABSOLUTE_HOURS", 12, HOURS_RANGE, errors) * HOUR_MS,
  };

  if (errors.length > 0) {
    throw new ConfigError(errors);
  }

  return Object.freeze<Config>({
    env,
    port,
    databaseUrl: dbUrl,
    trustProxy,
    login: Object.freeze(login),
    session: Object.freeze(session),
    log: Object.freeze<Config["log"]>({
      level: logLevel,
      format: logFormat,
    }),
  });
}
