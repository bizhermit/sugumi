import { handler } from "./web/app.ts";
import { PORT } from "./lib/env.ts";
import { db } from "./lib/db.ts";

const server = Deno.serve({ port: PORT }, handler);

let shuttingDown = false;
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  Deno.addSignalListener(signal, async () => {
    // 処理中のリクエストが終わらないときに、もう一度送って止められるようにする
    if (shuttingDown) Deno.exit(1);
    shuttingDown = true;
    // 先に DB を閉じると、処理中のリクエストの問い合わせが失敗する
    await server.shutdown();
    await db.end();
  });
}
