# SUGUMI

外部依存を最小にしたWebアプリケーションテンプレート

- Deno + TypeScript + PostgreSQL
- フレームワーク・ライブラリを使わない
  - 例外として、サーバーから外部サービス（DB など）に接続するためのクライアントライブラリは使う
- SSRを基本とし、JavaScriptは段階的な機能拡張を担う

## 開発

- DevContainer では、開発用の PostgreSQL が別のコンテナで起動する。
  - 接続先は、環境変数 `DATABASE_URL` に設定される。
- DevContainer の外で動かすときは、`DATABASE_URL` に接続先を設定する。
  - 例：`postgres://user:password@host:5432/dbname`

```sh
deno task dev       # 開発サーバー（ファイル監視あり、APP_MODE=DEV）
deno task dev:mock  # 開発サーバーを APP_MODE=MOCK で起動（routes の *.mock.* を使う）
deno task dev:prod  # 開発サーバーを APP_MODE=PROD で起動
deno task build  # クライアントコードをバンドル
deno task start  # サーバー起動（先に deno task build が必要）
deno task account:add <ユーザー名> <表示名>  # アカウントを追加（パスワードは入力を求める）
deno task check:imports  # サーバー・クライアント間の import の取り決めを確認
deno task check:bundle   # バンドルにサーバーのコードが入っていないかを確認（build でも実行される）
```
