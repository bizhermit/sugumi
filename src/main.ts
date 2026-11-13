import { createServer } from "node:http";
import { createApp } from "./web/app.ts";
import { ConfigError, loadConfig } from "./lib/config.ts";
import { createLogger } from "./lib/logger.ts";
import { routes } from "./routes.ts";
import { createDb } from "./lib/db.ts";

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

async function main() {
  const config = loadConfigOrExit();
  const logger = createLogger(config.log);

  const db = createDb(config.databaseUrl, logger);
  try {
    await db.query("SELECT 1");
  } catch (err) {
    logger.error("DBに接続できません。", { err });
    process.exit(1);
  }

  const server = createServer(
    createApp(routes, { logger, db, trustProxy: config.trustProxy, login: config.login, session: config.session }),
  );
  server.on("error", (err) => {
    logger.error("サーバーの起動に失敗しました。", { err });
    process.exit(1);
  });
  server.listen(config.port, () => {
    logger.info("サーバーを起動しました。", { env: config.env, port: config.port });
  });

  async function shutdown() {
    let failed = false;
    try {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      });
    } catch (err) {
      logger.error("サーバーの停止に失敗しました。", { err });
      failed = true;
    }

    try {
      await db.end();
      logger.info("DBの接続を終了しました。");
    } catch (err) {
      logger.error("DBの切断に失敗しました。", { err });
      failed = true;
    }

    if (failed) {
      process.exitCode = 1;
      return;
    }
    logger.info("サーバーを停止しました。");
  }

  process.on("SIGTERM", () => {
    logger.info("SIGTERMを受信しました。サーバーを停止します。");
    void shutdown();
  });
}

await main();
