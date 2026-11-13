import { createLogger, type Logger } from "../../../src/lib/logger.ts";

export function createTestLogger(): Logger {
  return createLogger({
    level: "error",
    format: "json",
    write: () => {
      // テストのため出力しない
    },
  });
}
