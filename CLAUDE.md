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
    db.ts         DB の接続と、全テーブルのスキーマ
    jsx-runtime.ts  JSX の変換先（deno.json の compilerOptions で指定）
    _shared/      サーバーとクライアントの両方で使う部品（必要になったら作る）
static/           URL が外部の取り決めで決まるファイル（favicon.ico・robots.txt など）。同じパスで配信する
scripts/          deno task から実行するスクリプト
docker/           コンテナのイメージ（app/・db/）と、本番の設定（.env。コミットしない）・手順（README.md）
tests/            テスト。src/ と同じ構成で *_test.ts を置く
  _support/       複数のテストで使う部品
bench/            性能の計測。src/ と同じ構成で *_bench.ts を置く
.github/workflows/  CI
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
    - `Response` を返すとそれを応答にする。`undefined` を返すとメソッドのファイルに進む。
  - `before.tree.ts` は `before.ts` と同じ形で、置いたディレクトリと配下のすべてのルートに適用する。
    - ルートでないディレクトリにも置ける。
    - `src/routes/` に近いものから順に実行し、最後に `before.ts` を実行する。
    - 置いたディレクトリ自身を除きたいときは、`before.tree.ts` の中で `ctx.route` を見て分岐する。
      - `ctx.route` は照合したルートのパターン（例：`"/admin"`、`"/user/[id]"`）。
      - `req.url` の pathname で判定しない。`/%61dmin` も `/admin` に照合されるため。
  - 405 を返すときは、どの before も実行しない。
  - すべてのルートは、既定でログインを求める（`src/routes/before.tree.ts`）。
    - ログインなしで開けるページは、そのファイルの `PUBLIC_ROUTES` に足す。
    - ページの中でログインを確かめない。
    - ログイン中のアカウントは `src/routes/login-account.ts` の `loginAccount` で受け取る。
      - `PUBLIC_ROUTES` のページでは設定されない。ログインの有無は `ctx.session` で判定する。
  - フォームの値は `ctx.form()` で受け取る。CSRF の検証で解析した結果を使い回す。
    - フォームでないか解析できない本文なら、`ctx.form()` が例外を投げ、基盤がページの応答の代わりに 400 を返す。ページで try/catch しない。
    - `req.formData()` も使えるが、もう一度解析することになる。
  - クエリは `ctx.query` で受け取る。`new URL(req.url)` で解析し直さない。
  - `Response` はリクエストごとに作る。モジュールに置いた `Response` を返さない。
    - 基盤がヘッダーをその場で書き足すため、使い回すと別の利用者の Cookie などが混ざる。2 回目は 500 になる。
  - before で用意した値を後に渡すときは、`src/web/slot.ts` の `slot()` を使う。
    - `ctx` に値を書き足さない。
    - `slot()` は、set する before と同じディレクトリのファイルで定義する。
    - set する before を必ず通るなら `get`（なければ例外）で受け取る。
    - 通らないこともあるなら `find`（なければ undefined）で受け取る。
  - `APP_MODE` が `MOCK` のときは、`.mock` を付けたファイル（`get.mock.ts` など）を代わりに使う。
    - メソッドのファイルと `before`・`layout` のファイルに置ける。`PROD`・`DEV` では無視する。
    - 付けないファイルがないと例外になる。モードでルートの一覧が変わらないようにするため。
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
  - `dist/public/` を読み込むテスト（`src/web/app.ts` の `createApp()` や `src/web/assets.ts` を使うもの）は、先に `deno task build` が要る。
- `src/`・`scripts/` のファイルの動作は、`tests/` の同じパスの `*_test.ts` で確かめる（`src/web/csrf.tsx` → `tests/web/csrf_test.ts`、`scripts/gen-routes.ts` → `tests/scripts/gen-routes_test.ts`）。
  - アサーションは `node:assert/strict` を使う。ライブラリは足さない。
  - ディレクトリやファイルを読むものは、テスト用のものを `tests/_support/fixture.ts` の `withTempDir()` で `dist/test/` に作って渡す。
    - そのため、読む場所を引数で受け取れるようにしておく（`loadRouter()` の `root`、`createApp()` の `routes`・`staticDir` など）。
  - 環境変数の検証は、`src/lib/env.ts` の `parse` で始まる関数に値を渡して確かめる。
- テストは環境変数 `TEST_DATABASE_URL` の DB を使う。開発用の DB とは分ける。
  - `deno task test` が `DATABASE_URL` を差し替えて実行する。`deno test` を直接実行しない。
  - DB を使うテストは、初めに `tests/_support/db.ts` の `resetDb()` で空にする。
  - テスト用の DB は、名前を `_test` で終わらせる。`resetDb()` は、それ以外の名前の DB を空にしない。
- 失敗したテストの DB を確かめるときは、そのテストだけを実行してから接続する。
  - ほかのテストも実行すると、次のテストの `resetDb()` で行が消える。
  - `deno task test tests/routes/before.tree_test.ts --filter "テストの名前の一部"`
  - DevContainer では `docker exec -it sugumi_devcontainer-db-test-1 psql -U app -d app_test` で接続する。
- タイムアウトなどの値は、テストに書かず `src/lib/env.ts` の値を使う。開発環境で変えていても通るようにするため。
- PR では `.github/workflows/ci.yml` が、`deno fmt --check`・`deno lint`・`deno check`・`routes.gen.ts` の差分・`deno task build`・`deno task test` を確かめる。

## ライブラリ

- フレームワーク・ライブラリは使わない。
  - 例外：サーバーから外部サービスに接続するためのクライアントライブラリ。
    - DB のドライバ、外部 API の SDK など。
  - ブラウザで読み込む外部のスクリプト（解析ツールのタグなど）は、例外に含めない。
    - CSP を緩める必要があるため、個別に判断する。
- 追加するときは、`deno.json` の `imports` に正確なバージョンで書き、`deno.lock` もコミットする。
  - ライブラリが読む環境変数やファイルにも、`deno.json` の `permissions` での許可が要る。
    - 使わない環境変数は、`env.ignore` に入れて未設定として扱わせる（`pg` の `USER` など）。
    - 許可も `ignore` もしないと、端末から起動したときに確認が出る。端末がない本番では拒否される。

## DB

- PostgreSQL を `src/lib/db.ts` の `db`（node-postgres の Pool）で使う。
- 値は必ずパラメータ（`$1` など）で渡す。SQL の文字列に値を連結しない。
- 読んだ値をもとに書き込むときは、`transaction()` の中で `SELECT ... FOR UPDATE` などを使って守る。
  - await のたびに別のリクエストの処理が割り込み、アプリが複数のインスタンスで動くこともあるため。
- スキーマの変更は、`src/lib/db.ts` の `MIGRATIONS` の末尾に足す。適用済みの要素は書き換えない。
- アプリは、スキーマ `app` だけを持つユーザーで接続する（`docker/db/init/`）。開発環境も同じ。
  - 拡張の追加など、管理者の権限が要る変更はマイグレーションに書けない。管理者で実行する。

## サーバーの性能

- 基盤（`src/web/`・`src/lib/`）は「セキュリティ > パフォーマンス > メンテナンス・可読性」の順で優先する。
  - ページから呼ぶ API は、直観的に使える形にする。速くするためにページの書き方を難しくしない。
    - 例：`ctx` から分割代入で取り出しても動くようにする。標準の API（`req.formData()` など）を呼んでも壊れないようにする。
  - 機能が増えたときに比例して増える処理（ページの大きさ、リンクの数、ルートの数、フォームの数）を優先して軽くする。
- サーバー側は、リクエストのたびに作るオブジェクト・関数・バッファの複製と、DB の往復を最小にする。
  - 性能のために検証を省いたり弱めたりしない。
  - 対象はリクエストの処理で通るコード。起動時に 1 回だけ実行するコードは読みやすさを優先する。
- 次のことは、速くなってもしない。
  - セッションやアカウントをメモリにキャッシュする：ログアウトや削除がすぐに反映されず、複数のインスタンスで食い違うため。
  - CSRF のトークンをリクエストをまたいで使い回す、検証を後回しにする。
  - トークンを含む HTML の応答を圧縮する：BREACH 攻撃の対象になるため。
- リクエストの処理で通るコードでは、次のことをしない。
  - コールバックを作る：`map()`・`some()`・`every()`・`replace()` などに関数を渡さず、ループかモジュールの関数にする。
  - 応答を複製する：`new Response(res.body, res)` でヘッダーを足さず、その場で書き換える。
    - ヘッダーを変更できない応答（`Response.redirect()` など）だけを複製する。
  - 毎回同じものを作る：`TextEncoder`・固定のヘッダー・固定の HTML は、モジュールに 1 つだけ置く。
  - 本文を何度も読む：本文は 1 回だけ読み、解析も 1 回にする。
  - 使い捨ての配列やキーを作る：照合のためだけの `split()`・`JSON.stringify()`・スプレッドを避ける。
  - DB を何度も往復する：同じリクエストで使う行は 1 回の問い合わせ（JOIN など）で読み、使う列だけを選ぶ（`SELECT *` を使わない）。
- 読みやすさを損なう書き方（手書きのループ、`indexOf` での解析など）は、リクエストのたびに通るコードと、ページの大きさやリンクの数に比例して呼ばれるコードでだけ使う。
  - `src/web/app.ts`・`src/web/router.ts`・`src/web/url.ts`・`src/lib/cookie.ts`・`src/lib/ip.ts`・`src/lib/jsx-runtime.ts` など。
  - そう書いた理由を、そのコードのそばにコメントで書く。
- scrypt のように重い処理を含む経路では、その処理と比べて無視できるものは直さなくてよい。
- 直したら `deno task bench` で前後を比べる。
  - `bench/` の同じパスの `*_bench.ts` で測る。DB は `deno task test` と同じく `TEST_DATABASE_URL` を使う。
  - 比べるときは、直す前のコミットを `git worktree` で別に取り出し、両方で実行する。

## コメント

- 設計書は書かない。コードとコメントで説明する。
  - コードの外に書くと、コードを直したときに更新されず、食い違うため。
  - 仕組みはコードを読めば分かるように書き、読んでも分からないことだけをコメントにする。
- 関数・型・ファイル先頭のコメントには、次のどちらかだけを書く。
  - 使い方：引数・戻り値の意味、呼び出し側が守るべき前提
  - コードを読んでも分からない補足：そうしている理由、制約、他ファイルや外部との取り決め
- 理由のコメントは、その判断をしているコードのそばに書く。
  - 呼び出し側の判断（どの関数を呼ぶか、どの条件で分岐するか）の理由は、呼び出し・分岐の直前に書く。呼ばれる関数のコメントには書かない。
  - 関数のコメントに書く理由は、その関数自身の作りについてのものだけにする。
- 名前やコードを言い換えただけの説明は書かない（例：`loginPage` に「ログインページ。」）。
- 処理の流れの説明や変更の経緯は書かない。経緯はコミットメッセージに残す。
- `.env.example` には、見出しと値だけを書く。値の意味や選び方は、環境構築の手順と同じドキュメントに書く。
  - 本番は `docker/README.md`、開発環境は `.devcontainer/README.md`。
  - `.env` は手順を読みながら書くため。長いコメントは、コメントアウトした値と見分けにくいため。

## URL

- アプリ内のリンク先は `src/web/url.ts` の `path()` で組み立てる。文字列の連結で URL を作らない。
  - 存在しないルートやパラメータの過不足は型エラーになり、値はエンコードされる。
- リダイレクトは `redirect()` を使う。Location には `path()` の戻り値しか渡せない。
- `req.url` や Host ヘッダーから絶対 URL を作らない。Host ヘッダーは利用者が書き換えられる。
- 利用者から受け取った URL（プロフィールのリンクなど）を `href`・`src` などに入れるときは、`safeUrl()` を通す。
  - JSX は値をエスケープするだけで、`javascript:` などの URL もそのまま出力する。CSP だけに頼らないため。
  - `undefined` が返ったら、属性ごと出力しないか、リンクにしない。
  - メールアドレス・電話番号は、URL ではなくアドレスや番号として受け取り、`mailtoUrl()`・`telUrl()` でリンクにする。
    - `safeUrl()` は `mailto:`・`tel:` を通さない。`mailto:` の URL を受け付けると、cc や本文を足されるため。
  - フォームの `action` には `path()` か `appPathOf()` の値だけを渡す。`safeUrl()` は外部の URL も通し、CSRF のトークンごと外部へ送信されるため。
- ルートの型 `src/routes.gen.ts` は `deno task gen` で生成し、コミットする。
  - `deno task dev` の実行中は、ページを追加・削除すると自動で生成し直される。

## JS・CSS

- JS は段階的な機能拡張に使う。JS がなくてもフォームの送信や画面の移動ができるようにする。
- ページの JS・CSS は、メソッドのファイルと同じディレクトリの `_assets/` に置く。
  - `_assets/` 直下の `index.ts`・`index.css` がエントリーになる。
  - エントリーは `deno task build` でバンドルされる。
  - それ以外のファイルは部品として、`index.ts` から import し、`index.css` から `@import` する。
    - 実行・適用される順番は、import の順で決まる。
  - `_assets/` を新しく作ったら `deno task dev` を起動し直す。エントリーは起動時に決まるため。
- HTML は JSX で書く。文字列の連結やテンプレート文字列で HTML を作らない。
  - `{...}` で埋め込んだ値はエスケープされる。JSX の値（型 `Html`）はそのまま埋め込まれる。
  - 属性を型チェックするのは `src/lib/html-attributes.ts` にあるタグだけ。
    - ほかのタグは、どの属性でも書ける。`-` を含む属性名はどのタグでもチェックされない。
    - 型にない属性が必要になったら、仕様を確かめてから型に足す。
  - `key` は付けない。HTML の属性として出力される。`deno lint` の `jsx-key` は外してある。
  - JSX はサーバー専用。`_assets/`・`_shared/` に `.tsx` を置かない（`check:imports` で検出）。
- ページの HTML は `src/web/html-document.tsx` の `htmlDocument()` で組み立てる。
  - `page` には、ページのディレクトリにあるファイル（`view.tsx` など）の `import.meta.url` を渡す。
  - 本文は `slots.main` に渡す。layout が使う差し込み位置があれば、`slots` にほかのキーで渡す。
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
  - URL にハッシュを付けられないため、毎回 ETag で確かめさせる。
    - ページから読み込むものは `_assets/` に置く。
  - 置ける種類は `src/web/static.ts` の `CONTENT_TYPES` の拡張子だけ。HTML・SVG・XML は置けない。
    - このオリジンでスクリプトを実行できる文書になるため。
  - `.` で始まるものは、`.well-known/` を除いて配信しない。
  - ルートや `/assets/` と同じ URL になるファイルは、起動時に例外になる。
  - 起動時に読み込むため、変更したら起動し直す（`deno task dev` は自動で起動し直す）。
- `_assets/` の `.ts` は、先頭に `/// <reference lib="dom" />` を書く。
- CSP（`script-src 'self'` と Trusted Types）のため、次のことはできない。
  - インラインの `<script>` や `onclick` などの属性：`addEventListener` を使う。
  - `innerHTML` などへの文字列の代入：`createElement` と `textContent` を使う。
    - まとまった HTML は、サーバーが出力した `<template>` を複製する。
  - インラインの `<style>` や `style` 属性：`_assets/` の CSS に書く。
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
- `_shared/` のコードはブラウザに配信される。秘密の値や、利用者に見せたくない判定は置かない。
- `deno task build` は、バンドルの前に `check:imports` を、あとに `check:bundle` を実行する。
  - `check:bundle` は、バンドルに `_assets/` と `_shared/` 以外のソースが入っていたら失敗する。
  - `deno task dev` の監視中の再ビルドでは、どちらも実行されない。
- `src/` にシンボリックリンクを置かない。
