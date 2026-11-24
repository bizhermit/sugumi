import { spawn, spawnSync } from "node:child_process";
import { rmSync, watch } from "node:fs";

const BUILDS = [
  ["node_modules/.bin/tsc", "-p", "tsconfig.build.json"],
  ["node", "scripts/build-assets.ts"],
] as const;

function build(): boolean {
  for (const [command, ...args] of BUILDS) {
    const result = spawnSync(command, args, { stdio: "inherit" });
    if (result.status !== 0) return false;
  }
  return true;
}

// 起動時に前回の出力を消す。tsc は移動や削除したファイルの出力を消さないため。
rmSync("dist", { recursive: true, force: true });
if (!build()) {
  process.exit(1);
}

const server = spawn("node", ["--watch-path=dist", "--watch-path=static", "dist/src/main.js"], { stdio: "inherit" });

// 保存は短い間隔で複数のイベントを出すため、少し待ってからまとめてビルドする。
let timer: NodeJS.Timeout | undefined;
let building = false;
let pending = false;

function rebuild() {
  if (building) {
    pending = true;
    return;
  }
  building = true;
  console.log(`${new Date().toLocaleTimeString()} - ファイルの変更を検知しました。ビルドします。`);
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
