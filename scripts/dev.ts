// 開発サーバー。src/ の変更を検知して tsc で dist/ に出力し、node --watch が dist/ の変更でサーバーを再起動する。
// tsc --watch を使わないのは、この環境で変更を拾わなくなることがあったため。検知は Node の fs.watch で行う。
import { spawn, spawnSync } from "node:child_process";
import { watch } from "node:fs";

const TSC = ["node_modules/.bin/tsc", "-p", "tsconfig.build.json"] as const;

function build(): boolean {
  const result = spawnSync(TSC[0], TSC.slice(1), { stdio: "inherit" });
  return result.status === 0;
}

if (!build()) {
  process.exit(1);
}

const server = spawn("node", ["--watch", "dist/src/main.js"], { stdio: "inherit" });

// 保存は短い間隔で複数のイベントを出すので、少し待ってからまとめてビルドする。
let timer: NodeJS.Timeout | undefined;
let building = false;
let pending = false;

function rebuild() {
  if (building) {
    pending = true;
    return;
  }
  building = true;
  console.log(`${new Date().toLocaleTimeString()} - src/ の変更を検知しました。ビルドします。`);
  build();
  building = false;
  if (pending) {
    pending = false;
    rebuild();
  }
}

watch("src", { recursive: true }, () => {
  clearTimeout(timer);
  timer = setTimeout(rebuild, 100);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.kill(signal);
    process.exit(0);
  });
}
