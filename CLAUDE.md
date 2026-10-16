# CLAUDE.md

## ディレクトリ構成

```
src/
  main.ts
  routes.gen.ts   ルートの型（生成物）
  pages/          画面ごとの処理。ディレクトリと URL が対応する
    login/
      page.ts     /login のページ
      _assets/    /login で読み込む JS・CSS（index.ts・index.css がエントリー）
  web/            HTTP の土台（app・ルーター・URL・CSRF・セキュリティヘッダー・レイアウト・静的ファイル）
    _assets/      全ページで読み込む JS・CSS
  lib/            複数のディレクトリの画面で使う部品
    auth/         アカウント・パスワード・セッション
    db.ts         DB の接続と、全テーブルのスキーマ
    _shared/      サーバーとクライアントの両方で使う部品（必要になったら作る）
scripts/          deno task から実行するスクリプト
```

- 依存の向きは `pages → web → lib` の一方向にする。逆向きに import しない。
  - pages は lib も直接使ってよい。
- 画面の処理は、その画面の `page.ts` に書く。SQL もページから直接実行してよい。
- 共通の部品は、必要になったときに作る。置き場所は使う範囲で決める。
  - 同じディレクトリ配下の画面だけで使うもの：そのディレクトリに置く。
    - `page.ts` 以外のファイルはルートにならない。
  - ディレクトリをまたいで使うもの：`lib/` に置く。
  - サーバーとクライアントの両方で使うもの：使う範囲の `_shared/` に置く（後述）。
    - ディレクトリをまたいで使うものは `lib/_shared/` に置く。
    - `src/_shared/` は作らない（`deno task check:imports` で検出する）。
- 業務のルールがある書き込み（状態遷移の条件、ロック、ハッシュ化など）は、早めに共通の部品にする。
  - 同じテーブルを書き換える画面が 2 つ目になった時点で、共通の部品にする。
  - 画面ごとにルールが食い違うと、データが壊れるため。

## コメント

- 関数・型・ファイル先頭のコメントには、次のどちらかだけを書く。
  - 使い方：引数・戻り値の意味、呼び出し側が守るべき前提
  - コードを読んでも分からない補足：そうしている理由、制約、他ファイルや外部との取り決め
- 理由のコメントは、その判断をしているコードのそばに書く。
  - 呼び出し側の判断（どの関数を呼ぶか、どの条件で分岐するか）の理由は、呼び出し・分岐の直前に書く。呼ばれる関数のコメントには書かない。
  - 関数のコメントに書く理由は、その関数自身の作りについてのものだけにする。
- 名前やコードを言い換えただけの説明は書かない（例：`loginPage` に「ログインページ。」）。
- 処理の流れの説明や変更の経緯は書かない。経緯はコミットメッセージに残す。

## URL

- アプリ内のリンク先は `src/web/url.ts` の `path()` で組み立てる。文字列の連結で URL を作らない。
  - 存在しないルートやパラメータの過不足は型エラーになり、値はエンコードされる。
- リダイレクトは `redirect()` を使う。Location には `path()` の戻り値しか渡せない。
- `req.url` や Host ヘッダーから絶対 URL を作らない。Host ヘッダーは利用者が書き換えられる。
- ルートの型 `src/routes.gen.ts` は `deno task gen` で生成し、コミットする。
  - `deno task dev` の実行中は、ページを追加・削除すると自動で生成し直される。

## JS・CSS

- JS は段階的な機能拡張に使う。JS がなくてもフォームの送信や画面の移動ができるようにする。
- ページの JS・CSS は、`page.ts` と同じディレクトリの `_assets/` に置く。
  - `_assets/` 直下の `index.ts`・`index.css` がエントリーになる。
  - エントリーは `deno task build` でバンドルされる。
  - それ以外のファイルは部品として、`index.ts` から import し、`index.css` から `@import` する。
    - 実行・適用される順番は、import の順で決まる。
  - `_assets/` を新しく作ったら `deno task dev` を起動し直す。エントリーは起動時に決まるため。
- ページの HTML は `src/web/layout.ts` の `layout()` で組み立てる。
  - `page` には `import.meta.url` を渡す。
  - 全ページ共通の `src/web/_assets/` と、そのページの `_assets/` のエントリーが読み込まれる。
  - CSS を JS より先に、共通のものをページのものより先に読み込む。
- 静的ファイルの URL は `src/web/assets.ts` の `asset()`・`assetsOf()` で作る。
  - URL に内容のハッシュが付き、ブラウザにずっとキャッシュされる。
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
  - 例：`src/pages/orders/_shared/` は orders/ 配下の `page.ts` と `_assets/` から使う。
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
