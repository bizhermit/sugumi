# SUGUMI

外部依存を最小にしたWebアプリケーションテンプレート

- Deno + TypeScript + PostgreSQL
- フレームワーク・ライブラリを使わない
  - 例外として、サーバーから外部サービス（DB など）に接続するためのクライアントライブラリは使う
- SSRを基本とし、JavaScriptは段階的な機能拡張を担う

## 開発

- DevContainer では、開発用とテスト用の PostgreSQL が別のコンテナで起動する。
  - 接続先は、環境変数 `DATABASE_URL`（開発用）と `TEST_DATABASE_URL`（テスト用）に設定される。
  - テスト用の DB はテストのたびに空にし、コンテナを止めるとデータが消える。
- DevContainer の外で動かすときは、`DATABASE_URL` と `TEST_DATABASE_URL` に接続先を設定する。
  - 例：`postgres://user:password@host:5432/dbname`
  - 2 つは別の DB にし、テスト用の DB は名前を `_test` で終わらせる（例：`app_test`）。
    テストは、名前が `_test` で終わらない DB を空にしない。

```sh
deno task dev       # 開発サーバー（ファイル監視あり、APP_MODE=DEV）
deno task dev:mock  # 開発サーバーを APP_MODE=MOCK で起動（routes の *.mock.* を使う）
deno task dev:prod  # 開発サーバーを APP_MODE=PROD で起動
deno task build  # クライアントコードをバンドル
deno task start  # サーバー起動（先に deno task build が必要）
deno task account:add <ユーザー名> <表示名>  # アカウントを追加（パスワードは入力を求める）
deno task account:unlock <アカウントの id>  # ロックしたアカウントを解除
deno task check:imports  # サーバー・クライアント間の import の取り決めを確認
deno task check:bundle   # バンドルにサーバーのコードが入っていないかを確認（build でも実行される）
deno task test   # テストを実行（TEST_DATABASE_URL の DB を使う。先に deno task build が必要）
```

## 本番

`compose.yaml` で、アプリ（`docker/app/`）と DB（`docker/db/`）のコンテナを起動する。手順は
[docker/README.md](docker/README.md) を参照。
