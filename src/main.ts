import { createServer } from "node:http";
import { handler } from "./web/app.ts";

const port = Number(process.env.APP_PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`APP_PORTが不正です: ${process.env.APP_PORT}`);
  process.exit(1);
}

const server = createServer(handler);
server.listen(port, () => {
  console.log(`Listening on http://localhost:${port}/`);
});

process.on("SIGTERM", () => {
  console.log("SIGTERMを受信しました。サーバーを停止します。");
  server.close(() => {
    console.log("サーバーを停止しました。");
  });
});
