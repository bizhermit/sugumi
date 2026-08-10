# sugumi

sugumi は、Web プラットフォーム標準機能のみで動く、runtime dependencies ゼロの汎用 Web アプリケーションテンプレートです。
fork してそのまま自分のプロダクトの土台にする使い方を想定しています。

## 看板

- **devDependencies は `typescript` / `@types/node` / `@biomejs/biome` の3つです。** いずれも成果物（`dist/`）には含まれません。
  - `typescript` — ビルドと型検査
  - `@types/node` — `server` レイヤーの型検査用の型定義のみ（実行時コードは含まない）
  - `@biomejs/biome` — 整形（詳細は下記「整形コマンド」）
- **runtime dependencies はゼロです。** 本番プロセスが読み込む外部パッケージはありません。
- **3層プログレッシブエンハンスメント**で動作します。層1（JS 無しでも動く `<form>` POST + PRG によるフル機能）を土台に、
  層2（`fetch` + DOM API での断片適用）・層3（実験的な DOM Parsing API 経路）が使える環境ではその分だけ体感を底上げします。
  JS が動かない環境でも全機能が使えることが不変条件です。

このテンプレートが「やらないこと」（同梱 DB 実装の前提・実験的経路の扱い等）は
[`docs/spec/behavior.md`](docs/spec/behavior.md) を参照してください。

## 文書の地図

どれを読めばよいか迷ったら、まずここから該当の文書へ進んでください。各文書の正本・読者・機械検査との対応は
[`docs/conventions.md` §11.8](docs/conventions.md) にまとめてあります。

- [`docs/conventions.md`](docs/conventions.md) — 開発規約（どう書くか）の正本
- [`docs/decisions/`](docs/decisions/) — ADR。個々の技術判断が「なぜそう決まったか」の正本
- [`docs/spec/behavior.md`](docs/spec/behavior.md) — このテンプレート自体の観測可能な挙動と「やらないこと」
- [`docs/spec/reference-app.md`](docs/spec/reference-app.md) — 参照実装（`app` / `admin`）の機能仕様
- [`docs/spec/routes.md`](docs/spec/routes.md) — ルート一覧（URL・認可・region の対応）
- [`docs/spec/data.md`](docs/spec/data.md) — テーブル定義（保持期間・個人情報の所在を含む）
- [`docs/operations.md`](docs/operations.md) — 動かす・配る・守るための運用手引き
- [`docs/manual-checklist.md`](docs/manual-checklist.md) — ブラウザでしか確認できない項目の手動確認表

## fork するときに必ず行う操作

### 1. Custom Elements の接頭辞を置き換える

すべてのカスタム要素のタグ名には既定の接頭辞 `sg-` が付いています。タグ名は静的文字列リテラルで書かれているため
（動的に組み立てていないため）、次のような一括置換だけで安全に改名できます。

```sh
grep -rl 'sg-' src public | xargs sed -i 's/sg-/<your-prefix>-/g'
```

ファイル名には接頭辞を含めていないため、ファイル名の変更は不要です。置換後は `npm run typecheck` を実行し、
型検査が通ることを確認してください。

### 2. リポジトリ構成を把握する

`src/` はリポジトリ直下に単一で置き、4つのエリアをその配下に収めます（サービスごとに `src/` を分けません）。
`src/` に置いてよいのは `.ts` と各プロジェクトの `tsconfig.json` だけで、それ以外の資材は `src/` の外に置きます。

```
src/
├─ platform/   基盤レイヤー。全サービス共通で、業務知識を一切持たない
├─ packages/   業務共有部品。サービス間で共有し、platform にのみ依存する
├─ services/   1ディレクトリ = 1マイクロサービス
└─ hosts/      1ディレクトリ = 1プロセス（複数サービスを束ねる合成ルート）

public/        配信専用（tsc の管理外）。CSS 等はここに置く
db/            スキーマ定義（schema.sql のみ）
tests/         architecture.test.ts と統合テスト
docs/          文書一式（本書はその入口）
```

### 3. サービスを追加する

1. `src/services/<name>/{shared,server,client}/` と `src/services/<name>/server/service.ts` を作成する
2. 各レイヤー（`shared` / `server` / `client`）に `tsconfig.json` を置く
3. `src/hosts/<name>/` と `src/hosts/<name>/tsconfig.json` を作成する（これを省くとそのサービスは起動経路を持てません）
4. ルートの `tsconfig.json` の `references` に (2)(3) を追加する

`package.json` やテスト用 tsconfig、import map の変更は不要です。詳細は `docs/conventions.md` §10.1 を参照してください。

### 4. CSS の置き場所

CSS はソースツリー（`src/`）には置かず、配信専用ディレクトリ `public/assets/` に置きます。コンポーネント CSS は
次のパス規則で `.ts` と対応付けます（相対パスとファイル名は同一にする）。

```
src/<エリア>/client/components/<相対パス>.ts  ⇔  public/assets/<エリア>/client/components/<相対パス>.css
```

コンポーネントに対応しないグローバル CSS は `public/assets/<エリア>/client/styles/**` に置きます。詳細は
`docs/conventions.md` §11.5 を参照してください。

### 5. 整形コマンド

整形は `@biomejs/biome` で機械的に行います。

- `npm run format` — 書き換えを伴う整形
- `npm run format:check` — 検査のみ（CI で実行するのはこちら）

整形規則の正本は `biome.json` と `.editorconfig` です（本書には規則を列挙しません）。
