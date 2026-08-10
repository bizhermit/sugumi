# 0002. `@types/node` の採用

## 状況

制約は当初「devDependencies は `typescript` のみ」だった（P1〜P11 の暗黙の前提）。しかし sugumi の
サーバーは `node:http` を自作し、ルーティングに `URLPattern` を使う（P9）。`@types/node` を追加せずに
`server` レイヤーを型検査すると、次の型エラーが発生することを実測した（実測 F4・F5。§1.1 X1）。

- `import { createServer } from "node:http"` → `TS2591`（コンパイル不能）
- `new URLPattern(...)` → `TS2304`（未解決）

`@types/node@26.2.0` を追加し `types: ["node"]`（`dom` なし）を指定した構成では、`node:http` /
`node:sqlite` / `URLPattern` のいずれも解決に成功することを確認した（実測 F6）。

## 決定

**`@types/node` を devDependencies に追加する。**

- テスト用 tsconfig（`tsconfig.test.server.json`）でも `types: ["node"]` を使う。
- 本体側の `shared` / `client` レイヤーは `types: []` のままとし、Node 型の漏れ込みを機械的に防ぐ
  （§10.4）。
- README には「devDependencies は `typescript` / `@types/node` / `@biomejs/biome` の3つ、いずれも
  成果物に入らない」と正確に書く（0005 で3つ目を追加した後の最終形。§10.7）。

## 理由

- **`@types/node` が無いと `server` レイヤーは1行も型検査できない**（実測 F4・F5）。「Node.js の API を
  使う以上、その型定義は Node.js の一部という考え方」を採る（利用者裁定）。
- **型定義のみで実行時コードを1バイトも含まないため、制約 P2「runtime dependencies ゼロ」は完全に
  維持される。** `npm ci --ignore-scripts` でも問題なく解決することを確認済み（実測 F7）。
- この理由（型定義のみ）は、後に整形ツール（`@biomejs/biome`）を追加する際に採用した §1.1 の3条件
  （成果物に入らない／ビルドに参加しない／1コミットで外せる）とは別の軸であり、**置換ではなく併存する
  追加の軸**である。`@types/node` の従来の理由（型定義のみで実行時コードを含まない）は据え置いたまま、
  整形ツールにはこの理由が使えないために新しい軸（3条件）を追加で立てた（0001・0005 参照）。

## 影響

- `server` レイヤーの `tsconfig.json` は `types: ["node"]` を指定する。`shared` / `client` は
  `types: []` のままとし、`process.env` 等の Node API がこれらのレイヤーで型エラーになることを
  意図的な検査として利用する（実測 F13・F14）。
- devDependencies は「`typescript` のみ」という当初の看板から「`typescript` と `@types/node` の2つ、
  いずれも実行時コードを含まない」に更新する必要が生じた（後に0005でさらに3つになる）。README・本書の
  数値表記は実態と一致させ続けること（§10.7「実態と異なる看板を掲げない」）。
- サプライチェーン上の扱いは `typescript` と同じで、`.npmrc` の `ignore-scripts=true`（§11.6）の
  対象に含まれる。

## 却下した代替案

- **`/server` 配下に必要な Node API だけの ambient 宣言（`.d.ts`）を自作する**: devDependencies を
  `typescript` のみに保てるが、`node:http` / `node:sqlite` / `node:crypto` / `node:test` /
  `URLPattern` / `process` を自前で宣言することになり保守量が大きく、型の誤りがそのままバグになる。
  テンプレートを fork する利用者にも同じ負担を強いるため却下した。
- **`/server` の型検査を諦める**: 品質ゲート（`tsc` 通過）が意味を失い、実質論外として却下した。
