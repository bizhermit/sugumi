// T1-10 (f-1) 用プローブ。§6.5 が名指しで禁止する「誤った実装」
// （`process.permission?.has(...)` のオプショナルチェーン記法）を再現し、
// --permission を付けずに起動したときに**無言で通過してしまう**ことを実際に確認する。
// 納品物ではない。正しい実装（assert-correct.mjs）との対比のためだけに存在する。
const forbidden = ["./src", "./.env"];
for (const p of forbidden) {
  // eslint-disable-next-line -- 意図的な悪い例
  const has = process.permission?.has("fs.read", p);
  if (has === true) {
    console.error(`fatal: fs.read permission unexpectedly granted for ${p}`);
    process.exit(1);
  }
}

console.log(
  "assert passed (BUT this is the WRONG implementation): startup proceeded",
);
