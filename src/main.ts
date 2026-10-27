import { createApp } from "./web/app.ts";
import { APP_MODE, LISTEN_HOST, PORT } from "./lib/env.ts";
import { db } from "./lib/db.ts";
import { logWarning } from "./lib/log.ts";

// deno.json の unstable の no-legacy-abort で、req.signal が中断になるのを、接続が切れたときだけにしている。
// デフォルトでは、レスポンスを返し終えたときにも中断になるので、ページから切断と見分けられない。
// また、ボディを読み込んだ Request を作る（app.ts）たびに、Deno が警告を出す。
const server = Deno.serve(
  { hostname: LISTEN_HOST, port: PORT },
  await createApp({ mock: APP_MODE === "MOCK" }),
);

// ボディを送り終えないまま開いたままの接続があると、shutdown() はクライアントが閉じるまで終わらない。
// docker stop は 10 秒で SIGKILL を送るので、それより短くする。
const SHUTDOWN_TIMEOUT_MS = 8_000;

let shuttingDown = false;
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  Deno.addSignalListener(signal, async () => {
    // 処理中のリクエストが終わらないときは、もう一度シグナルを送れば止められるようにする。
    if (shuttingDown) Deno.exit(1);
    shuttingDown = true;
    const timer = setTimeout(() => {
      logWarning(`終了処理が ${SHUTDOWN_TIMEOUT_MS} ms 以内に終わらないので、強制終了します`);
      Deno.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    // 先に DB を閉じると、処理中のリクエストのクエリが失敗する。
    await server.shutdown();
    await db.end();
    clearTimeout(timer);
  });
}
