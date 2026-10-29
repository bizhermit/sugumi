# SUGUMI

外部依存を最小にしたWebアプリケーションテンプレート

- Deno + TypeScript + PostgreSQL
- フレームワーク・ライブラリ不使用（外部サービスに接続するためのライブラリおよびテスト用ライブラリは例外）
- SSRを基本とし、クライアントサイドのJavaScriptは段階的な機能拡張を担う

## テンプレートから作る方法

アプリの名前が必要なところ（イメージの保存先・ボリューム・手順書の例など）には `myapp` と書いてある。
コピーした後に、アプリの名前（英小文字・数字・`-`）へ一括で置き換える。

```sh
git grep -lz myapp | xargs -0 sed -i 's/myapp/<アプリの名前>/g'
```

置き換えた後に、この README の見出しを書き換え、この節を削除する。

## 開発

- DevContainer の用意と使い方は [.devcontainer/README.md](.devcontainer/README.md) を参照。
- DevContainer では、開発用とテスト用の PostgreSQL が別のコンテナで起動する。
  - 接続先は、環境変数 `DATABASE_URL`（開発用）と `TEST_DATABASE_URL`（テスト用）に設定される。
  - マイグレーションの接続先（スキーマを持つ DB ユーザー `migrator`）は、`MIGRATION_DATABASE_URL` と `TEST_MIGRATION_DATABASE_URL` に設定される。
  - テスト用 DB はテストのたびに空にする。コンテナを止めると、データは消える。
- DevContainer の外で動かすときは、`DATABASE_URL`・`TEST_DATABASE_URL`・`MIGRATION_DATABASE_URL`・`TEST_MIGRATION_DATABASE_URL` に接続先を設定する。
  - 例：`postgres://user:password@host:5432/dbname`
  - DB ユーザーとスキーマは、[docker/db/init/10-app-role.sh](docker/db/init/10-app-role.sh) と同じように作る。
  - 開発用とテスト用は別の DB にし、テスト用 DB には管理者で使い捨ての印を付ける（`COMMENT ON DATABASE <DB の名前> IS 'disposable'`）。
    テストは、印のない DB を空にしない。

```sh
deno task dev       # 開発サーバーを起動（ファイル監視あり、APP_MODE=DEV。先に deno task migrate が必要）
deno task dev:mock  # 開発サーバーを APP_MODE=MOCK で起動（routes の *.mock.* を使う）
deno task dev:prod  # 開発サーバーを APP_MODE=PROD で起動
deno task build  # クライアントコードをバンドル
deno task gen  # ルートの型（src/routes.gen.ts）と SCHEMA_VERSION（src/lib/schema-version.gen.ts）を生成
deno task migrate  # 開発用 DB にマイグレーション（docker/db/migrations/）を適用し、SCHEMA_VERSION を生成（MIGRATION_DATABASE_URL の DB を使う。psql が必要）
deno task migrate:test  # テスト用 DB にマイグレーションを適用（TEST_MIGRATION_DATABASE_URL の DB を使う。psql が必要。DevContainer は起動のたびに実行する）
deno task start  # サーバー起動（先に deno task build と deno task migrate が必要）
deno task account:add <ユーザー名> <表示名>  # アカウントを追加（パスワードは入力を求める）
deno task account:unlock <アカウントの id>  # ロックしたアカウントを解除
deno task check:imports  # サーバー・クライアント間の import の取り決めを確認
deno task check:bundle   # バンドルにサーバーのコードが入っていないかを確認（build でも実行される）
deno task check:schema-version  # SCHEMA_VERSION を生成し忘れていないかを確認（build でも実行される）
deno task test   # テストを実行（TEST_DATABASE_URL の DB を使う。先に deno task build と deno task migrate:test が必要）
```

## 本番

ビルドサーバーで [docker/bake.hcl](docker/bake.hcl) からイメージをビルドしてレジストリに置き、各サーバーで取得して起動する。

- ロードバランサー（[docker/lb/](docker/lb/)）：HTTPS を受け、アプリサーバーへ振り分ける。1 つ。
- アプリサーバー（[compose.yaml](compose.yaml)）：アプリ（[docker/app/](docker/app/)）とログの転送役（[docker/log-forwarder/](docker/log-forwarder/)）。1 台以上。
- DB サーバー（[docker/db/](docker/db/)）：アプリサーバーから TLS で接続する。接続は転送役（[docker/db-proxy/](docker/db-proxy/)）が受け、外へ通信できない DB に流す。1 つ。

1 台にまとめてもよい。ログは転送役が、CloudWatch Logs か、別のサーバーに置いたログ用サーバー（[docker/log-server/](docker/log-server/)）へ送る。
手順は [docker/README/index.md](docker/README/index.md) を参照。

```mermaid
flowchart TB
  user(["ユーザー"]) -->|"HTTPS"| lb

  subgraph lbserver["ロードバランサー"]
    lb["lb（nginx）<br>docker/lb/compose.yaml"]
  end

  lb -->|"HTTP<br>X-Forwarded-For"| app

  subgraph appserver["アプリサーバー × n"]
    app["app<br>compose.yaml"]
    app -.->|"標準出力・標準エラー<br>（Docker の fluentd ログドライバー）"| fwd["log-forwarder<br>ボリューム log-buffer"]
  end

  app -->|"TLS"| dbproxy
  fwd ~~~ dbproxy

  subgraph dbserver["DB サーバー"]
    dbproxy["db-proxy（nginx）<br>docker/db/compose.yaml"] -->|"TLS（そのまま流す）"| db[("db<br>ボリューム db-data")]
  end

  fwd -->|"LOG_DESTINATION=cloudwatch"| cw[("CloudWatch Logs")]
  fwd -->|"LOG_DESTINATION=internal<br>TLS・共有鍵"| logserver[("ログ用サーバー<br>docker/log-server/compose.yaml<br>ボリューム logs")]
```
