type EnvName = `APP_${string}` | "NODE_ENV";

const ENVS = ["development", "test", "production"] as const;
export type Env = (typeof ENVS)[number];

const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const LOG_FORMATS = ["json", "pretty"] as const;
export type LogFormat = (typeof LOG_FORMATS)[number];

export interface Config {
  readonly env: Env;
  readonly port: number;
  readonly log: {
    readonly level: LogLevel;
    readonly format: LogFormat;
  };
}

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

export function loadConfig(envValues: NodeJS.ProcessEnv = process.env): Config {
  const errors: string[] = [];

  const env = oneOf(envValues, "NODE_ENV", ENVS, "development", errors);
  const isProduction = env === "production";
  const port = integer(envValues, "APP_PORT", 3000, { min: 1, max: 65535 }, errors);
  const logLevel = oneOf(envValues, "APP_LOG_LEVEL", LOG_LEVELS, isProduction ? "info" : "debug", errors);
  const logFormat = oneOf(envValues, "APP_LOG_FORMAT", LOG_FORMATS, isProduction ? "json" : "pretty", errors);

  if (errors.length > 0) {
    throw new ConfigError(errors);
  }

  return Object.freeze<Config>({
    env,
    port,
    log: Object.freeze<Config["log"]>({
      level: logLevel,
      format: logFormat,
    }),
  });
}
