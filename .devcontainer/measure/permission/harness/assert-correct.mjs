// T1-10 (f-1)/(f-2) 用プローブ。規約 §6.5 が要求する起動時アサートの「正しい実装」
// （オプショナルチェーン `?.` を使わない2段検査）を単独スクリプトとして再現し、
// 実際の起動失敗/成功を観測する。納品物ではない。
// 第1段: process.permission が存在しなければ起動失敗。
if (typeof process.permission === "undefined") {
  console.error(
    "fatal: --permission flag missing (process.permission is undefined)",
  );
  process.exit(1);
}

// 第2段: 意図せず広がっていないかを検査する対象パス（<repo> は本来 resolveRepoRoot 由来だが、
// このプローブでは cwd 相対の "src" と ".env" を対象にする。本番実装は §6.5 のとおり
// resolveRepoRoot(hostMainUrl) の値を使うこと。ここでは検査ロジックそのものの正しさを見る）。
const forbidden = ["./src", "./.env"];
for (const p of forbidden) {
  const has = process.permission.has("fs.read", p);
  if (has === true) {
    console.error(`fatal: fs.read permission unexpectedly granted for ${p}`);
    process.exit(1);
  }
}

console.log("assert passed: startup permission scope looks correct");
