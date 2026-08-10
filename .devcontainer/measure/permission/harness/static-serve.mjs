// T1-10 (d) 用の使い捨て静的配信サーバー。
// 目的: public/assets/** の CSS を実際に HTTP 経由で配信できることを、node --permission 下で確認する。
// 納品物ではない。.devcontainer/measure/permission/ 配下にのみ存在する。
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

const port = Number(process.argv[2] ?? 8321);
const root = process.argv[3] ?? "./public";

const server = createServer(async (req, res) => {
  try {
    const rel =
      req.url === "/" ? "/assets/platform/client/styles/global.css" : req.url;
    const body = await readFile(root + rel);
    res.writeHead(200, { "content-type": "text/css; charset=utf-8" });
    res.end(body);
  } catch (e) {
    res.writeHead(404);
    res.end(String(e.code ?? e));
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(
    `[static-serve] listening on http://127.0.0.1:${port} root=${root}`,
  );
});

// 呼び出し元(bash)がcurl後にkillするまで待つ。念のためのタイムアウトも設ける。
setTimeout(() => {
  console.log("[static-serve] timeout, exiting");
  process.exit(0);
}, 15000).unref();
