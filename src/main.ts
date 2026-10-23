import { createApp } from "./web/app.ts";
import { APP_MODE, LISTEN_HOST, PORT } from "./lib/env.ts";
import { db } from "./lib/db.ts";

// deno.json の unstable の no-legacy-abort で、req.signal を接続が切れたときだけ中断にする。
// 既定では応答を返し終えたときにも中断になり、ページが切断と見分けられない。
// 既定のままだと、本文を読み込んだ Request を作る（app.ts）たびに、Deno が警告を出す
const server = Deno.serve(
  { hostname: LISTEN_HOST, port: PORT },
  await createApp({ mock: APP_MODE === "MOCK" }),
);

// 本文を送り終えないまま開けておかれた接続があると、shutdown() はクライアントが閉じるまで終わらない。
// docker stop は 10 秒で SIGKILL を送るため、それより短くする
const SHUTDOWN_TIMEOUT_MS = 8_000;

let shuttingDown = false;
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  Deno.addSignalListener(signal, async () => {
    // 処理中のリクエストが終わらないときに、もう一度送って止められるようにする
    if (shuttingDown) Deno.exit(1);
    shuttingDown = true;
    const timer = setTimeout(() => {
      console.error(`終了処理が ${SHUTDOWN_TIMEOUT_MS} ms で終わらないため、強制終了します`);
      Deno.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    // 先に DB を閉じると、処理中のリクエストの問い合わせが失敗する
    await server.shutdown();
    await db.end();
    clearTimeout(timer);
  });
}
