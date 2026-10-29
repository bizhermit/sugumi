# CLAUDE.md

## ディレクトリ構成

```
src/
  main.ts
  routes.gen.ts   ルートの型（生成物）
  routes/         URL ごとの処理。ディレクトリと URL が対応する
    login/
      get.ts      GET /login の処理（HEAD も受ける）
      post.ts     POST /login の処理
      view.tsx    HTML の組み立て（慣例の名前。get.ts と post.ts から使う）
      _assets/    /login で読み込む JS・CSS（index.ts・index.css がエントリー）
  web/            HTTP の土台（app・ルーター・URL・CSRF・セキュリティヘッダー・HTML 文書・静的ファイル）
    _assets/      全ページで読み込む JS・CSS
  lib/            複数のディレクトリの画面で使う部品
    auth/         アカウント・パスワード・セッション
    db.ts         DB の接続
    schema-version.gen.ts  前提にする DB スキーマのバージョン（生成物）
    jsx-runtime.ts  JSX の変換先（deno.json の compilerOptions で指定）
    _shared/      サーバーとクライアントの両方で使う部品（必要になったら作る）
static/           URL が外部の取り決めで決まるファイル（favicon.ico・robots.txt など）。同じパスで配信する
scripts/          deno task から実行するスクリプト
docker/           コンテナのイメージと、サーバーごとの compose.yaml（db/・lb/・log-server/。アプリサーバーはリポジトリ直下）・本番の手順（README/）
  db/migrations/  マイグレーション（SQL ファイル）
  log-server/     ログ用サーバー（アプリサーバーとは別のサーバーで起動する）
tests/            テスト。src/ と同じ構成で *_test.ts を置く
  _support/       複数のテストで使う部品
bench/            性能の計測。src/ と同じ構成で *_bench.ts を置く
e2e/              ブラウザで画面を動かすテスト。専用の deno.json・deno.lock を持つ。src/ と同じ構成で *_test.ts を置く
  _support/       複数のテストで使う部品
.github/workflows/  CI
local/            手元だけで使うファイル（メモ・試作・調査の資料など）。コミットせず、deno の fmt・lint・check・test の対象にもしない
```

- 依存の向きは `routes → web → lib` の一方向にする。逆向きに import しない。
  - routes は lib も直接使ってよい。
- 画面の処理は、そのディレクトリのメソッドのファイルに書く。SQL もページから直接実行してよい。
  - メソッドのファイル（`get.ts`・`post.ts`・`put.ts`・`patch.ts`・`delete.ts`）に振り分けられる。
    - HEAD は `get.ts` で処理する。ファイルのないメソッドには 405 を返す。
    - JSX を書くファイルは拡張子を `.tsx` にする（`get.tsx` など。`before`・`layout` も同じ）。
      - 同じ名前の `.ts` と `.tsx` は両方置けない。
    - メソッドの判定や 405 をページで書かない。
  - `before.ts` を置くと、そのディレクトリのどのメソッドでも、メソッドのファイルより前に実行する。
    - `Response` を返すと、それをレスポンスにする。`undefined` を返すと、メソッドのファイルに進む。
  - `before.tree.ts` は `before.ts` と同じ形で、置いたディレクトリと配下のすべてのルートに適用する。
    - ルートでないディレクトリにも置ける。
    - `src/routes/` に近いものから順に実行し、最後に `before.ts` を実行する。
    - 置いたディレクトリ自身を除きたいときは、`before.tree.ts` の中で `ctx.route` を見て分岐する。
      - `ctx.route` は、マッチしたルートのパターン（例：`"/admin"`, `"/user/[id]"`）。
      - `req.url` の pathname で判定しない。`/%61dmin` も `/admin` にマッチするため。
  - 405 を返すときは、どの before も実行しない。
  - すべてのルートは、デフォルトでログインを求める（`src/routes/before.tree.ts`）。
    - ログインなしで開けるページは、そのファイルの `PUBLIC_ROUTES` に足す。
    - ページの中でログインを確かめない。
    - ログイン中のアカウントは `src/routes/login-account.ts` の `loginAccount` で受け取る。
      - `PUBLIC_ROUTES` のページでは設定されない。ログインの有無は `ctx.session` で判定する。
  - フォームの値は `ctx.form()` で受け取る。CSRF の検証でパースした結果を使い回す。
    - リクエストボディがフォームでないか、パースできないときは、`ctx.form()` が例外を投げ、基盤がページのレスポンスの代わりに 400 を返す。ページで try/catch しない。
    - `req.formData()` も使えるが、もう一度パースすることになる。
  - クエリ文字列は `ctx.query` で受け取る。`new URL(req.url)` でパースし直さない。
  - `Response` はリクエストごとに作る。モジュールに置いた `Response` を返さない。
    - 基盤がヘッダーをその場で追加するので、使い回すと別のユーザーの Cookie などが混ざる。2 回目は 500 になる。
  - before で用意した値を後に渡すときは、`src/web/slot.ts` の `slot()` を使う。
    - `ctx` に値を追加しない。
    - `slot()` は、set する before と同じディレクトリのファイルで定義する。
    - set する before を必ず通るなら `get`（なければ例外）で受け取る。
    - 通らないこともあるなら `find`（なければ undefined）で受け取る。
  - `APP_MODE` が `MOCK` のときは、`.mock` を付けたファイル（`get.mock.ts` など）を代わりに使う。
    - メソッドのファイルと `before`・`layout` のファイルに置ける。`PROD`・`DEV` では無視する。
    - `.mock` を付けないファイルがないと、例外になる。モードによってルートの一覧が変わらないようにするため。
    - モックだけで使う部品も `*.mock.*` の名前にする。
    - `*.mock.*` は `*.mock.*` からだけ import できる。本番のイメージに含めないため。
      - `check:imports` で検出する。
  - メソッドのファイル以外の名前は自由。次の慣例に揃える。
    - HTML の組み立ては `view.tsx`。メソッドごとに分けるなら `view.post.tsx` のようにする。
- 共通の部品は、必要になったときに作る。置き場所は使う範囲で決める。
  - 同じディレクトリ配下の画面だけで使うもの：そのディレクトリに置く。
    - メソッドのファイルと `before`・`layout` のファイル以外はルートにならない。
  - ディレクトリをまたいで使うもの：`lib/` に置く。
  - サーバーとクライアントの両方で使うもの：使う範囲の `_shared/` に置く（後述）。
    - ディレクトリをまたいで使うものは `lib/_shared/` に置く。
    - `src/_shared/` は作らない（`deno task check:imports` で検出する）。
- 業務のルールがある書き込み（状態遷移の条件、ロック、ハッシュ化など）は、早めに共通の部品にする。
  - 同じテーブルを書き換える画面が 2 つ目になった時点で、共通の部品にする。
  - 画面ごとにルールが食い違うと、データが壊れるため。

## テスト

- `deno task test` で実行する。ファイルを指定すると、そのファイルだけを実行する。
  - テストは環境変数 `TEST_DATABASE_URL` の DB を使う。`deno task test` は `DATABASE_URL` をこの値に差し替えてから実行するので、`deno test` を直接実行しない。
    - マイグレーションは適用しない。`deno task migrate:test`（`TEST_MIGRATION_DATABASE_URL` の同じ DB に `migrator` で接続する）で適用しておく。
      - DevContainer は起動のたびに適用する（`.devcontainer/postStart.sh`）。マイグレーションを足したときは、手で実行する。
  - `dist/public/` を読み込むテスト（`src/web/app.ts` の `createApp()` や `src/web/assets.ts` を使うもの）は、先に `deno task build` が要る。
- `src/`・`scripts/` のファイルの動作は、`tests/` の同じパスの `*_test.ts` で確かめる（`src/web/csrf.tsx` → `tests/web/csrf_test.ts`, `scripts/gen-routes.ts` → `tests/scripts/gen-routes_test.ts`）。
  - 書き方は `tests/CLAUDE.md` に従う。
- `_assets/` の JS と、画面が CSP の違反なく動くことは、`e2e/` のテストでブラウザを動かして確かめる。`deno task test:e2e` で実行する。
  - 書き方は `e2e/CLAUDE.md` に従う。
  - 環境変数 `E2E_BASE_URL` で、動いているアプリに対して実行できる。受け付けるのはこのマシンのアプリだけで、`scripts/test-e2e.ts` が確かめている。この制限は外さない。本番やステージングに向けると、テストのログインでアカウントや接続元がロックされるため。
  - ルートの `deno fmt`・`deno lint`・`deno check` は `e2e/` を除外する。`e2e/` の中で実行する。
- PR では `.github/workflows/ci.yml` が、`deno fmt --check`・`deno lint`・`deno check`（ルートと `e2e/`）・`routes.gen.ts`・`schema-version.gen.ts` の差分・`deno task build`・本番のイメージのビルド・`deno task test`・本番のイメージに対する `deno task test:e2e` を確かめる。

## ライブラリ

- フレームワーク・ライブラリは使わない。
  - 例外：
    - サーバーから外部サービスに接続するためのクライアントライブラリ（DB のドライバ、外部 API の SDK など）。
    - テストで、Deno と標準の API ではできないことをするためのライブラリ（ブラウザを操作する Playwright など）。
      - アサーション・モック・テストランナーは含めない（`node:assert/strict` と `deno test` を使う）。
      - ルートの `deno.json` には入れず、`e2e/` のように別の `deno.json` を持つディレクトリに入れる。
        - ルートの `deno.lock` にある npm のパッケージは、import していなくても本番のイメージに入るため。
        - `e2e/deno.lock` のパッケージ（推移的な依存を含む）がルートの `deno.lock` にないことを、`tests/scripts/test-e2e_test.ts` で確かめている。
  - ブラウザで読み込む外部のスクリプト（解析ツールのタグなど）は、例外に含めない。
    - CSP を緩める必要があるため、個別に判断する。
- 追加するときは、`deno.json` の `imports` に正確なバージョンで書き、`deno.lock` もコミットする。
  - `deno.lock` は `deno.json` の `lock.frozen` で固定している。食い違うと、その場で解決せずに失敗する。
    - 依存を変えたら、`deno install --frozen=false` で `deno.lock` を更新する。`e2e/` の依存は `e2e/` の中で実行する。
  - ライブラリが読む環境変数やファイルにも、`deno.json` の `permissions` での許可が要る。
    - 使わない環境変数は `env.ignore` に入れ、未設定として扱われるようにする（`pg` の `USER` など）。
    - 許可も `ignore` もしないと、端末から起動したときに確認が出る。端末のない本番では拒否される。
- Playwright のバージョンを変えるときは、`e2e/CLAUDE.md` の手順に従う。`e2e/deno.json` のほかに、DevContainer のリビルドも要る。

## DB

- PostgreSQL を `src/lib/db.ts` の `db`（node-postgres の Pool）で使う。
- 値は必ずパラメータ（`$1` など）で渡す。SQL の文字列に値を連結しない。
- 読んだ値をもとに書き込むときは、`transaction()` の中で `SELECT ... FOR UPDATE` などを使って守る。
  - await のたびに別のリクエストの処理が割り込むうえ、アプリが複数のインスタンスで動くこともあるため。
- スキーマの変更（マイグレーション）は、`docker/db/migrations/` に SQL ファイルで足す。
  - 書き方は `docker/db/migrations/CLAUDE.md` に従う。
  - アプリはマイグレーションに関わらない。DB のコンテナの `docker/db/bin/db-migrate` が適用する（開発・テストでは `deno task migrate`・`migrate:test`）。
  - アプリは起動時に、`src/lib/schema-version.gen.ts` の `SCHEMA_VERSION` と DB のバージョンを突き合わせ、違えば起動しない。
    - `SCHEMA_VERSION` は、`deno task gen` が最後のマイグレーションの番号から生成する（`deno task migrate` も先に実行する）。生成したファイルはコミットする。
    - ファイル名と番号の並びは、生成のときに `db-migrate --check` で確かめる。本番で適用できない並びは、生成で失敗する。
    - 生成し忘れは、`deno task build`（`check:schema-version`）が検出する。本番のイメージのビルドでも実行される。
- DB ユーザーを、権限で分けている（`docker/db/init/`）。開発環境も同じ。
  - `app`：アプリが接続する。テーブルの読み書きだけができ、テーブル・関数などを作ったり消したりできない。アプリを乗っ取られたときの被害を、データの読み書きに留めるため。
  - `migrator`：スキーマとテーブルを持ち、マイグレーションとバックアップ・復元を行う。本番では DB のコンテナの中からだけ接続し、パスワードを持たない。

## サーバーの性能

- 基盤（`src/web/`・`src/lib/`）は「セキュリティ > パフォーマンス > メンテナンス・可読性」の順で優先する。
  - ページから呼ぶ API は、直観的に使える形にする。速くするためにページの書き方を難しくしない。
    - 例：`ctx` から分割代入で取り出しても動くようにする。標準の API（`req.formData()` など）を呼んでも壊れないようにする。
  - 機能が増えたときに比例して増える処理（ページの大きさ、リンクの数、ルートの数、フォームの数）を優先して軽くする。
- サーバー側では、リクエストのたびに作るオブジェクト・関数・バッファのコピーと、DB との往復を最小にする。
  - 性能のために検証を省いたり弱めたりしない。
  - 対象はリクエストの処理で通るコード。起動時に 1 回だけ実行するコードは読みやすさを優先する。
- 次のことは、速くなってもしない。
  - セッションやアカウントをメモリにキャッシュする：ログアウトや削除がすぐに反映されず、複数のインスタンスで食い違うため。
  - CSRF のトークンをリクエストをまたいで使い回す、検証を後回しにする。
  - トークンを含む HTML のレスポンスを圧縮する：BREACH 攻撃の対象になるため。
- リクエストの処理で通るコードでは、次のことをしない。
  - コールバックを作る：`map()`・`some()`・`every()`・`replace()` などに関数を渡さず、ループかモジュールの関数にする。
  - レスポンスをコピーする：`new Response(res.body, res)` でヘッダーを足さず、その場で書き換える。
    - ヘッダーを変更できないレスポンス（`Response.redirect()` など）だけをコピーする。
  - 毎回同じものを作る：`TextEncoder`・固定のヘッダー・固定の HTML は、モジュールに 1 つだけ置く。
  - ボディを何度も読む：リクエストボディは 1 回だけ読み、パースも 1 回にする。
  - 使い捨ての配列やキーを作る：マッチさせるためだけの `split()`・`JSON.stringify()`・スプレッドを避ける。
  - DB と何度も往復する：同じリクエストで使う行は 1 回のクエリ（JOIN など）で読み、使う列だけを選ぶ（`SELECT *` を使わない）。
- 読みやすさを損なう書き方（手書きのループ、`indexOf` でのパースなど）は、リクエストのたびに通るコードと、ページの大きさやリンクの数に比例して呼ばれるコードでだけ使う。
  - `src/web/app.ts`・`src/web/router.ts`・`src/web/url.ts`・`src/lib/cookie.ts`・`src/lib/ip.ts`・`src/lib/jsx-runtime.ts` など。
  - そう書いた理由を、そのコードのそばにコメントで書く。
- scrypt のように重い処理を含む経路では、その処理と比べて無視できるものは直さなくてよい。
- 直したら `deno task bench` で前後を比べる。
  - `bench/` の同じパスの `*_bench.ts` で測る。DB は `deno task test` と同じく `TEST_DATABASE_URL` を使う。
  - 比べるときは、直す前のコミットを `git worktree` で別に取り出し、両方で実行する。

## アプリの名前

- このリポジトリはテンプレート。アプリの名前が要るところには `myapp` と書く。
  - コピーした後に、`myapp` を一括で置き換えて使う（`README.md` の「テンプレートから作る方法」）。
  - テンプレートの名前（`README.md` の見出し）は、ほかの場所に書かない。
- 名前を含めなくて済むところには含めない（コンテナの中のパス、ログのタグなど）。

## コードの書き方

- 整形は `deno fmt` に任せる。設定は `deno.json` と `e2e/deno.json` の `fmt` に同じ値で書く。
  - デフォルトと同じ値は書かない。
- 名前のある関数は `function` で宣言する。アロー関数は、引数に渡すその場の関数だけに使う。
- 状態を持つ部品は、関数（関数を並べたオブジェクトを返すもの）で作る。
  - クラスにするのは、リクエストごとに作るもの（メソッドを毎回作らないため）・`instanceof` で判定するもの・文字列などと区別する型が要るものだけ。理由をコメントに書く。
- `if`・`else` は波括弧を付ける。次の 1 文だけで 1 行に収まるときは、波括弧を付けずに 1 行で書く。
  - 値を返さない `return`、またはリテラル（数値・文字列・`true`・`false`・`null`・`undefined`・`[]`）か名前だけを返す `return`
  - 名前だけを投げる `throw`（`throw e`）
  - `continue`・`break`
  - 関数の呼び出し・`new`・プロパティの読み出しを返す `return` や、名前以外を投げる `throw`（`throw new Error(...)` など）には波括弧を付ける。
- 値がないことは `undefined` で表し、`=== undefined` で判定する。
  - 標準の API や DB が返す `null` は `=== null` で判定する。
  - `null` と `undefined` の両方が来る外部の値（JSON など）だけ `== null` を使う。
- 名前は省略しない。
  - ループの添字や、数行で終わる範囲の一時的な値は短くてよい。
  - `req`・`res`・`ctx`・`db` は使ってよい。
- 変数は 1 つの文で 1 つだけ宣言する。
- リクエストの処理で通らないコードのループは、値の変換なら `map()`・`filter()`、それ以外は `for...of` にする。`forEach()` は使わない。
  - リクエストの処理で通るコードは「サーバーの性能」に従う。
- 比較は、調べる値を左、定数を右に置く（`c === "@"`）。
- オブジェクトの型は `type` で書く。`interface` は JSX の型など、仕組みで必要なときだけ使う。
- 配列の型は `Array<T>`、読み取り専用は `ReadonlyArray<T>` で書く。`T[]` は使わない。
  - `string | number[]` のように、括弧の付け忘れで別の型になるのを防ぐため。
- `export` する関数には、戻り値の型を書く（`deno lint` の `explicit-module-boundary-types` で検出する）。ファイルの中だけで使う関数は、推論に任せる。
  - ただし、次のときはファイルの中だけで使う関数でも書く。
    - 戻り値が union のとき（`| undefined` を含む）。返しうる結果を型で示し、`return` を足したときに結果の種類が黙って増えないようにするため。判別 union は、推論すると `status` が `string` に広がり、判別できなくなる。
    - 推論では意図した型にならないとき（再帰する関数、`any` や広すぎる型になるとき）。
- 想定内の失敗（パスワードの誤り、ロックなど）は例外にせず、`status` で判別する union で返す。結果が 2 通りでも `status` にする。
  - 例：`{ status: "ok"; account: Account } | { status: "locked" }`
  - 例外は想定外のことだけに使う。
- 中身ごと変わらないモジュールの定数（固定の値・正規表現・固定の `Set` など）は `UPPER_SNAKE_CASE`、中身が変わるものやインスタンスは camelCase にする。
- ファイル名はケバブケースにする。
- 例外とログのメッセージは日本語で書く。値を添えるときは半角の `:` と空白で区切る（`属性名に使えません: ${name}`）。
  - 検索や集計に使う値は、決まった英語の値をフィールドに持たせる（監査ログの `event` など）。メッセージの文で検索しない。
  - ユーザーに見せる文言に、例外のメッセージを使わない。

## コメント

- 設計書は書かない。コードとコメントで説明する。
  - コードの外に書くと、コードを直したときに更新されず、内容が食い違うため。
  - 仕組みはコードを読めば分かるように書き、読んでも分からないことだけをコメントにする。
- 関数・型・ファイル先頭のコメントには、次のどちらかだけを書く。
  - 使い方：引数・戻り値の意味、呼び出し側が守るべき前提
  - コードを読んでも分からない補足：そうしている理由、制約、他ファイルや外部との取り決め
- 理由のコメントは、その判断をしているコードのそばに書く。
  - 呼び出し側の判断（どの関数を呼ぶか、どの条件で分岐するか）の理由は、呼び出し・分岐の直前に書く。呼ばれる関数のコメントには書かない。
  - 関数のコメントに書く理由は、その関数自身の作りについてのものだけにする。
- `export` する関数には、必ず JSDoc を書く。
  - 名前の言い換えしか書けないときは、戻り値の意味・呼ぶ場面・前提など、使う人が知るべきことを書く。
  - `@param`・`@returns` は、説明があるときだけ書く。
- 名前やコードを言い換えただけの説明は書かない（例：`loginPage` に「ログインページ。」）。
- コメントの文末には「。」を付ける。
- 処理の流れの説明や変更の経緯は書かない。経緯はコミットメッセージに残す。
- `.env.example` には、見出しと値だけを書く。値の意味や選び方は、環境構築の手順と同じドキュメントに書く。
  - 本番は `docker/README/`（値の意味は `docker/README/env.md`）、開発環境は `.devcontainer/README.md`。
  - `.env` は手順を読みながら書くため。また、長いコメントは、コメントアウトした値と見分けにくいため。

## URL

- アプリ内のリンク先は `src/web/url.ts` の `path()` で組み立てる。文字列の連結で URL を作らない。
  - 存在しないルートやパラメータの過不足は型エラーになり、値はエンコードされる。
- リダイレクトは `redirect()` を使う。Location には `path()` の戻り値しか渡せない。
- `req.url` や Host ヘッダーから絶対 URL を作らない。Host ヘッダーはユーザーが書き換えられる。
- トークンなどの秘密の値を URL のパスに入れない。パスはアクセスログにそのまま出る（クエリ文字列は出さない）。
- ユーザーから受け取った URL（プロフィールのリンクなど）を `href`・`src` などに入れるときは、`safeUrl()` を通す。
  - JSX は値をエスケープするだけなので、`javascript:` などの URL もそのまま出力される。CSP だけには頼らない。
  - `undefined` が返ったら、属性ごと出力しないか、リンクにしない。
  - メールアドレス・電話番号は、URL ではなくアドレスや番号として受け取り、`mailtoUrl()`・`telUrl()` でリンクにする。
    - `safeUrl()` は `mailto:`・`tel:` を通さない。`mailto:` の URL を受け付けると、cc や本文を足されてしまう。
  - フォームの `action` には `path()` か `appPathOf()` の値だけを渡す。`safeUrl()` は外部の URL も通すので、CSRF のトークンごと外部へ送信されてしまう。
- ルートの型 `src/routes.gen.ts` は `deno task gen` で生成し、コミットする。
  - `deno task dev` の実行中は、ページを追加・削除すると自動で生成し直される。

## JS・CSS

- JS は段階的な機能拡張に使う。JS がなくてもフォームの送信や画面の移動ができるようにする。
- ページの JS・CSS は、メソッドのファイルと同じディレクトリの `_assets/` に置く。
  - `_assets/` 直下の `index.ts`・`index.css` がエントリーになる。
  - エントリーは `deno task build` でバンドルされる。
  - それ以外のファイルは部品として、`index.ts` から import し、`index.css` から `@import` する。
    - 実行・適用される順番は、import の順で決まる。
  - `_assets/` を新しく作ったら、`deno task dev` を起動し直す。エントリーは起動時に決まるため。
- HTML は JSX で書く。文字列の連結やテンプレート文字列で HTML を作らない。
  - `{...}` で埋め込んだ値はエスケープされる。JSX の値（型 `Html`）はそのまま埋め込まれる。
  - 属性を型チェックするのは `src/lib/html-attributes.ts` にあるタグだけ。
    - ほかのタグは、どの属性でも書ける。`-` を含む属性名はどのタグでもチェックされない。
    - 型にない属性が必要になったら、仕様を確かめてから型に足す。
  - `key` は付けない。HTML の属性として出力される。`deno lint` の `jsx-key` は外してある。
  - JSX はサーバー専用。`_assets/`・`_shared/` に `.tsx` を置かない（`check:imports` で検出）。
- ページの HTML は `src/web/html-document.tsx` の `htmlDocument()` で組み立てる。
  - `page` には、ページのディレクトリにあるファイル（`view.tsx` など）の `import.meta.url` を渡す。
  - ページの中身は `slots.main` に渡す。layout が使う差し込み位置があれば、`slots` にほかのキーで渡す。
  - `layout.tree.ts`・`layout.ts` が、ページの HTML を外側から包む。
    - 適用する範囲と順番は `before.tree.ts`・`before.ts` と同じ。
    - default export は `Layout`（`title` と `render`）。
    - `render` は `slots` を受け取り、差し込んだ HTML を返す。
    - 内側の layout が返した HTML は、外側の layout の `main` になる。
    - layout を外すページは、`htmlDocument()` に `layout: false` を渡す。
  - `title` は、layout・ページのどちらも任意で、文字列か `(外側のタイトル) => 文字列` を渡す。
    - 外側の layout から順に決め、最後にページの `title` を適用する。
    - タイトルが決まらないときと、外側のタイトルがないのに関数を渡したときは例外になる。
  - 全ページ共通の `src/web/_assets/` と、そのページの `_assets/` のエントリーが読み込まれる。
  - CSS を JS より先に、共通のものをページのものより先に読み込む。
- 静的ファイルの URL は `src/web/assets.ts` の `asset()`・`assetsOf()` で作る。
  - URL に内容のハッシュが付き、ブラウザにずっとキャッシュされる。
- `favicon.ico`・`robots.txt` など URL が決まっているファイルは、直下の `static/` に置く。
  - `static/robots.txt` は `/robots.txt` で配信される。ログインなしで誰でも取得できる。
  - URL にハッシュを付けられないので、ブラウザには毎回 ETag で確かめてもらう。
    - ページから読み込むものは `_assets/` に置く。
  - 置ける種類は `src/web/static.ts` の `CONTENT_TYPES` の拡張子だけ。HTML・SVG・XML は置けない。
    - このオリジンでスクリプトを実行できる文書になってしまうため。
  - `.` で始まるものは、`.well-known/` を除いて配信しない。
  - ルートや `/assets/` と同じ URL になるファイルは、起動時に例外になる。
  - 起動時に読み込むので、変更したら起動し直す（`deno task dev` は自動で起動し直す）。
- `_assets/` の `.ts` は、先頭に `/// <reference lib="dom" />` を書く。
- CSP（`script-src 'self'` と Trusted Types）のため、次のことはできない。
  - インラインの `<script>` や `onclick` などの属性：`addEventListener` を使う。
  - `innerHTML` などへの文字列の代入：`createElement` と `textContent` を使う。
    - まとまった HTML は、サーバーが出力した `<template>` をクローンする。
  - インラインの `<style>` や `style` 属性：`_assets/` の CSS に書く。
- CSP を緩めるときは、`e2e/routes_test.ts` が認める範囲も見直す。CSP が緩んでいないことを、そこで確かめているため。
- サーバーからクライアントへ渡す値は `data-*` 属性に入れる。

## サーバーとクライアントの境界

- `_assets/` の中はクライアント専用、`_shared/` の中は両方で使う部品、それ以外はサーバー専用。
- `_shared/` は `src/` の直下以外のどの階層にも置ける。置き場所は使う範囲で決める。
  - 例：`src/routes/orders/_shared/` は orders/ 配下のルートと `_assets/` から使う。
  - 例：`src/lib/_shared/` はディレクトリをまたいで使う。
- import してよい先は次のとおり。`deno task check:imports` で確かめる。
  - `_assets/` の中：同じ `_assets/` の中と `_shared/`
  - `_shared/` の中：`_shared/` だけ
  - それ以外：`_assets/` 以外
  - `_assets/` と `_shared/` からは相対パスだけを import できる（`node:` などは使えない）。
- `_shared/` では Deno の API も DOM の API も使わない。
- `_shared/` のコードはブラウザに配信される。秘密の値や、ユーザーに見せたくない判定は置かない。
- `deno task build` は、バンドルの前に `check:imports` を、あとに `check:bundle` を実行する。
  - `check:bundle` は、バンドルに `_assets/` と `_shared/` 以外のソースが入っていたら失敗する。
  - `deno task dev` の監視中の再ビルドでは、どちらも実行されない。
- `src/` にシンボリックリンクを置かない。
