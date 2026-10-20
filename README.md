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

## 本番

`compose.yaml` で、アプリ（`docker/app/`）と DB（`docker/db/`）のコンテナを起動する。

1. `docker/.env.example` を `docker/.env` にコピーし、値を書く（コミットしない）。
   - DB のパスワードと、アプリの設定を書く。
   - AWS のパラメータストアなどから作ってもよい。値は単一引用符で囲む。

   ```sh
   cp docker/.env.example docker/.env
   chmod 600 docker/.env
   ```

2. 起動する。初回は DB にアプリ用のユーザーとスキーマが作られ、アプリの起動時にテーブルが作られる。

   ```sh
   docker compose --env-file docker/.env up -d --build
   ```

3. HTTPS を受けるリバースプロキシを同じサーバーに置き、`127.0.0.1:3000` へ転送する。
   - Cookie に Secure を付けているため、HTTP のままではログインできない。

- パスワードは、コンテナには環境変数ではなく `/run/secrets/` のファイルとして渡る。
- DB の初期化は、データのボリュームが空のときにだけ行われる。
  - あとからパスワードを変えるときは、`docker/.env` を書き換える。
  - そのうえで、管理者で `ALTER ROLE` を実行する。
