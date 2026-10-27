# SUGUMI

外部依存を最小にしたWebアプリケーションテンプレート

- Deno + TypeScript + PostgreSQL
- フレームワーク・ライブラリ不使用（外部サービスに接続するためのライブラリおよびテスト用ライブラリは例外）
- SSRを基本とし、クライアントサイドのJavaScriptは段階的な機能拡張を担う

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

`compose.yaml` で、アプリ（`docker/app/`）・DB（`docker/db/`）・ログの送り出し口（`docker/log-forwarder/`）のコンテナを起動する。
ログは、送り出し口が CloudWatch Logs か、別のサーバーに置く社内のログ用のサーバー（`docker/log-server/`）へ送る。手順は
[docker/README.md](docker/README.md) を参照。

```mermaid
flowchart LR
  user(["利用者"]) -->|"HTTPS"| proxy

  subgraph appserver["アプリのサーバー（compose.yaml）"]
    proxy["リバースプロキシ<br>（compose の外）"] -->|"127.0.0.1:3000"| app["app"]
    app -->|"ネットワーク db<br>（外部と通信できない）"| db[("db<br>ボリューム db-data")]
    app -.->|"標準出力・標準エラー<br>（Docker の fluentd ログドライバー）"| fwd["log-forwarder<br>ボリューム log-buffer"]
  end

  fwd -->|"LOG_DESTINATION=cloudwatch"| cw[("CloudWatch Logs")]
  fwd -->|"LOG_DESTINATION=internal<br>TLS・共有の鍵"| receiver

  subgraph logserver["社内のログ用のサーバー（docker/log-server/compose.yaml）"]
    receiver["receiver"] -->|"日付ごとのファイル"| logs[("ボリューム logs")]
    cleaner["log-cleaner"] -->|"日数・合計の上限で消す"| logs
  end
```
