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
   - DB のパスワード、アプリのコンテナを置くネットワークの範囲、アプリの設定を書く。
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
   - 利用者のアドレスを監査ログに出すには、次の 2 つを両方とも行う。
     行わないと、監査ログの接続元がすべてプロキシのアドレス（`APP_NETWORK_GATEWAY`）になる。
     1. リバースプロキシで、X-Forwarded-For の右端に接続元を追記するか、接続元だけで上書きする。
        - nginx の例：`proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`（追記）、
          `proxy_set_header X-Forwarded-For $remote_addr;`（上書き）
        - 利用者が送った値をそのまま転送すると、利用者がどの IP アドレスでも名乗れる。
        - nginx は `proxy_set_header` を書かないと、利用者が送った値をそのまま転送する。
        - nginx の `proxy_set_header` は、location に 1 つでも書くと、server や http に書いたものを
          引き継がない。`proxy_pass` を書くすべての location に書く。
     2. `docker/.env` の `TRUSTED_PROXIES` に、`APP_NETWORK_GATEWAY` と同じ値を書く。
   - 設定したら、ブラウザの拡張機能などで `X-Forwarded-For: 192.0.2.1` を付けてログインする。
     `docker compose logs app` の監査ログで、`remoteAddress` が自分のアドレスになることを確かめる。
     - `192.0.2.1` なら、リバースプロキシが利用者の値をそのまま転送している（1 が抜けている）。
     - `APP_NETWORK_GATEWAY` の値なら、`TRUSTED_PROXIES` が合っていない（2 が抜けている）。

- パスワードは、コンテナには環境変数ではなく `/run/secrets/` のファイルとして渡る。
- DB の初期化は、データのボリュームが空のときにだけ行われる。
  - あとからパスワードを変えるときは、`docker/.env` を書き換える。
  - そのうえで、管理者で `ALTER ROLE` を実行する。
