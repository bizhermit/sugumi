import assert from "node:assert/strict";
import { createLogger, type LoggerOptions } from "../../../src/lib/logger.ts";
import { describe, it } from "node:test";

const FIXED_TIME = new Date("2026-11-02T01:02:03.456Z");

function capture(options: Partial<LoggerOptions> = {}) {
  const lines: string[] = [];
  const logger = createLogger({
    level: "debug",
    format: "json",
    write: (line) => lines.push(line),
    now: () => FIXED_TIME,
    ...options,
  });
  return { logger, lines };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseLine(line: string | undefined): Record<string, unknown> {
  const value: unknown = JSON.parse(line ?? "");
  assert.ok(isRecord(value));
  return value;
}

describe("createLogger (json)", () => {
  it("JSONレコード", () => {
    const { logger, lines } = capture();
    logger.info("起動", { port: 3000 });
    assert.equal(lines.length, 1);
    assert.deepEqual(parseLine(lines[0]), {
      time: "2026-11-02T01:02:03.456Z",
      level: "info",
      msg: "起動",
      port: 3000,
    });
  });

  it("指定されたログレベル未満のレコードを出力しない", () => {
    const { logger, lines } = capture({ level: "warn" });
    logger.debug("d");
    logger.info("i");
    logger.warn("w");
    logger.error("e");
    assert.deepEqual(
      lines.map((line) => parseLine(line).level),
      ["warn", "error"],
    );
  });

  it("childのフィールドは以降のレコードに含まれ、呼び出し側のフィールドを優先する", () => {
    const { logger, lines } = capture();
    const child = logger.child({ requestId: "r1", user: "a" });
    child.info("x", { user: "b" });
    const record = parseLine(lines[0]);
    assert.equal(record.requestId, "r1");
    assert.equal(record.user, "b");
  });

  it("固定フィールドは上書き不可", () => {
    const { logger, lines } = capture();
    logger.info("x", { time: "t", level: "fatal", msg: "y" });
    const record = parseLine(lines[0]);
    assert.equal(record.time, "2026-11-02T01:02:03.456Z");
    assert.equal(record.level, "info");
    assert.equal(record.msg, "x");
  });

  it("Errorオブジェクトの展開", () => {
    const { logger, lines } = capture();
    const cause = new TypeError("inner");
    logger.error("失敗", { err: new Error("outer", { cause }) });
    const err = parseLine(lines[0]).err;
    assert.ok(isRecord(err));
    assert.equal(err.name, "Error");
    assert.equal(err.message, "outer");
    const stack = err.stack;
    assert.ok(typeof stack === "string");
    assert.match(stack, /^Error: outer\n/);
    assert.ok(isRecord(err.cause));
    assert.equal(err.cause.name, "TypeError");
    assert.equal(err.cause.message, "inner");
  });

  it("BigIntや循環参照があっても例外を投げない", () => {
    const { logger, lines } = capture();
    logger.info("bigint", { n: 10n });
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    logger.info("circular", { circular });
    assert.equal(parseLine(lines[0]).n, "10");
    const fallback = parseLine(lines[1]);
    assert.equal(fallback.msg, "circular");
    assert.equal(typeof fallback.logError, "string");
  });
});

describe("createLogger (pretty)", () => {
  it("ログレベル・時刻・メッセージを並べる", () => {
    const { logger, lines } = capture({ format: "pretty" });
    logger.warn("注意");
    assert.equal(lines.length, 1);
    const [head = "", ...rest] = (lines[0] ?? "").split("\n");
    assert.match(head, /^\[WARN \] \d{2}:\d{2}:\d{2}\.456 注意$/);
    assert.equal(rest[0], undefined);
  });

  it("ログレベル・時刻・メッセージ・フィールドを並べる", () => {
    const { logger, lines } = capture({ format: "pretty" });
    logger.warn("注意", { port: 3000, name: "a b" });
    assert.equal(lines.length, 1);
    const [head = "", ...rest] = (lines[0] ?? "").split("\n");
    assert.match(head, /^\[WARN \] \d{2}:\d{2}:\d{2}\.456 注意$/);
    assert.match(rest[0] ?? "", /^\s+- port: 3000$/);
    assert.match(rest[1] ?? "", /^\s+- name: 'a b'$/);
  });

  it("Errorはスタックを続く行に出す", () => {
    const { logger, lines } = capture({ format: "pretty" });
    logger.error("失敗", { err: new Error("boom", { cause: new Error("root") }) });
    const [head = "", ...rest] = (lines[0] ?? "").split("\n");
    assert.match(head, /\[ERROR\] \d{2}:\d{2}:\d{2}\.456 失敗$/);
    assert.match(rest[0] ?? "", /^(\s+)- err: Error: boom$/);
    const indent = /^(\s+)/.exec(rest[0] ?? "")?.[1] ?? "";
    assert.equal(rest[1], `${indent}Error: boom`);
    assert.ok(rest.some((line) => line.includes("caused by:")));
    assert.ok(rest.some((line) => line.includes("Error: root")));
  });
});
