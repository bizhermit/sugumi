import { createServer } from "node:http";
import { createApp } from "./web/app.ts";
import { ConfigError, loadConfig } from "./lib/config.ts";
import { createLogger } from "./lib/logger.ts";
import { routes } from "./routes.ts";

function loadConfigOrExit() {
  try {
    return loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
}

function main() {
  const config = loadConfigOrExit();
  const logger = createLogger(config.log);

  const server = createServer(createApp(routes, { logger }));
  server.on("error", (err) => {
    logger.error("サーバーの起動に失敗しました。", { err });
    process.exit(1);
  });
  server.listen(config.port, () => {
    logger.info("サーバーを起動しました。", { env: config.env, port: config.port });
  });

  process.on("SIGTERM", () => {
    logger.info("SIGTERMを受信しました。サーバーを停止します。");
    server.close((err) => {
      if (err) {
        logger.error("サーバーの停止に失敗しました。", { err });
        process.exitCode = 1;
        return;
      }
      logger.info("サーバーを停止しました。");
    });
  });
}

main();
