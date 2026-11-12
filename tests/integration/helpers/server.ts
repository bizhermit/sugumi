import { createServer } from "node:http";
import { routes } from "../../../src/routes.ts";
import { createApp } from "../../../src/web/app.ts";
import type { DataBase } from "../../../src/lib/db.ts";
import { createTestLogger } from "./logger.ts";

export type TestServer = {
  readonly baseUrl: string;
  readonly close: () => Promise<void>;
};

/** アプリを空いているポートで起動する。 */
export async function startTestServer(db: DataBase): Promise<TestServer> {
  const server = createServer(createApp(routes, { logger: createTestLogger(), db }));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address == null || typeof address !== "object") {
    throw new Error("サーバーのポートを取得できません。");
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
