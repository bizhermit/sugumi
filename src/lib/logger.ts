import { inspect } from "node:util";
import type { LogFormat, LogLevel } from "./config.ts";

export type LogFields = Readonly<Record<string, unknown>>;

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  /**
   * 指定したフィールドを以降のすべてのレコードに含めるロガーを作成する
   *
   * ```
   * const child = logger.child({ requestId: 123 });
   * child.info("ログアウト", { action: "logout" });
   * // [INFO ] 12:34:56.123 ログアウト
   * //                      - requestId: 123
   * //                      - action: 'logout'
   * ```
   */
  child(fields: LogFields): Logger;
}

export interface LoggerOptions {
  readonly level: LogLevel;
  /**
   * - json: 本番用（docker logs/CloudWatch Logsでフィールド検索可能な形式で出力する）
   * - pretty: 開発用
   */
  readonly format: LogFormat;
  readonly write?: (line: string) => void;
  readonly now?: () => Date;
}

interface SerializedError {
  name: string;
  message: string;
  stack?: string;
  cause?: unknown;
}

const LOG_LEVEL_ORDER = Object.freeze({
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
});

const TIME_NAME = "time";
const LEVEL_NAME = "level";
const MESSAGE_NAME = "msg";
const RESERVED_KEYS = new Set([TIME_NAME, LEVEL_NAME, MESSAGE_NAME]);

const LOG_STACK_INDENT = " ".repeat("[LEVEL] HH:MM:SS.mmm ".length);
const PRETTY_CONTENT_LINE_PREFIX = `\n${LOG_STACK_INDENT}- `;

function serializeError(error: Error, depth = 0): SerializedError {
  const serialized: SerializedError = {
    name: error.name,
    message: error.message,
  };
  if (error.stack !== undefined) {
    serialized.stack = error.stack;
  }
  if (error.cause !== undefined && depth < 3) {
    if (error.cause instanceof Error) {
      serialized.cause = serializeError(error.cause, depth + 1);
    } else {
      serialized.cause = error.cause;
    }
  }
  return serialized;
}

function jsonReplacer(_key: string, value: unknown) {
  if (value instanceof Error) {
    return serializeError(value);
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  return value;
}

function renderJson(time: Date, logLevel: LogLevel, message: string, fields: LogFields): string {
  const record: Record<string, unknown> = {
    [TIME_NAME]: time.toISOString(),
    [LEVEL_NAME]: logLevel,
    [MESSAGE_NAME]: message,
  };
  for (const [key, value] of Object.entries(fields)) {
    if (!RESERVED_KEYS.has(key)) {
      record[key] = value;
    }
  }
  try {
    return JSON.stringify(record, jsonReplacer);
  } catch (err) {
    const reason = err instanceof Error ? err.message : "unknown";
    return JSON.stringify({
      [TIME_NAME]: record[TIME_NAME],
      [LEVEL_NAME]: record[LEVEL_NAME],
      [MESSAGE_NAME]: record[MESSAGE_NAME],
      logError: reason,
    });
  }
}

function pad(n: number, width = 2) {
  return String(n).padStart(width, "0");
}

function formatLocalTime(time: Date) {
  return `${pad(time.getHours())}:${pad(time.getMinutes())}:${pad(time.getSeconds())}.${pad(time.getMilliseconds(), 3)}`;
}

function formatStack(error: Error, depth = 0): string {
  const stack = (error.stack ?? `${error.name}: ${error.message}`)
    .split("\n")
    .map((line) => LOG_STACK_INDENT + line)
    .join("\n");
  if (error.cause instanceof Error && depth < 3) {
    return `${stack}\n${LOG_STACK_INDENT}caused by:\n${formatStack(error.cause, depth + 1)}`;
  }
  return stack;
}

function renderPretty(time: Date, level: LogLevel, message: string, fields: LogFields): string {
  const parts: string[] = [];
  const stacks: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (RESERVED_KEYS.has(key)) continue;
    if (value instanceof Error) {
      parts.push(`${key}: ${value.name}: ${value.message}`);
      stacks.push(formatStack(value));
    } else {
      parts.push(`${key}: ${inspect(value, { depth: 4, breakLength: Infinity })}`);
    }
  }
  const head = `[${level.toUpperCase().padEnd(5)}] ${formatLocalTime(time)} ${message}`;
  const line =
    parts.length === 0 ? head : `${head}${PRETTY_CONTENT_LINE_PREFIX}${parts.join(PRETTY_CONTENT_LINE_PREFIX)}`;
  return stacks.length === 0 ? line : `${line}\n${stacks.join("\n")}`;
}

export function createLogger(options: LoggerOptions): Logger {
  const threshold = LOG_LEVEL_ORDER[options.level];
  const write = options.write ?? ((line: string) => process.stdout.write(`${line}\n`));
  const now = options.now ?? (() => new Date());
  const render = options.format === "json" ? renderJson : renderPretty;

  function build(bound: LogFields): Logger {
    const log = (level: LogLevel, message: string, fields?: LogFields) => {
      if (LOG_LEVEL_ORDER[level] < threshold) return;
      write(render(now(), level, message, { ...bound, ...fields }));
    };
    return {
      debug: (message, fields) => log("debug", message, fields),
      info: (message, fields) => log("info", message, fields),
      warn: (message, fields) => log("warn", message, fields),
      error: (message, fields) => log("error", message, fields),
      child: (fields) => build({ ...bound, ...fields }),
    } satisfies Logger;
  }

  return build({});
}
