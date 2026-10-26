# 本番

リポジトリ直下の `compose.yaml` で、アプリ（`app/`）と DB（`db/`）のコンテナを起動する。

## 手順

1. `docker/.env.example` を `docker/.env` にコピーし、値を書く（コミットしない）。
   - 書く値は「[docker/.env の値](#dockerenv-の値)」を参照。
   - AWS のパラメータストアなどから作ってもよい。

   ```sh
   cp docker/.env.example docker/.env
   chmod 600 docker/.env
   ```

2. ログの送り先（CloudWatch か社内のログ用のサーバー）を用意する。「[ログ](#ログ)」を参照。

3. 起動する。初回は DB にアプリ用のユーザーとスキーマが作られ、アプリの起動時にテーブルが作られる。

   ```sh
   docker compose --env-file docker/.env up -d --build
   ```

4. HTTPS を受けるリバースプロキシを同じサーバーに置き、`127.0.0.1:3000` へ転送する。
   - Cookie に Secure を付けているため、HTTP のままではログインできない。
   - 「[接続元の IP アドレス](#接続元の-ip-アドレス)」の設定をする。
     しないと、接続元ごとのログインの制限が全員にまとめてかかる。
   - 「[時間制限](#時間制限)」の設定をする。
   - 「[大量のリクエスト](#大量のリクエスト)」の設定をする。

- パスワードは、コンテナには環境変数ではなく `/run/secrets/` のファイルとして渡る。
- DB の初期化は、データのボリュームが空のときにだけ行われる。
  - あとからパスワードを変えるときは、`docker/.env` を書き換える。
  - そのうえで、管理者で `ALTER ROLE` を実行する。

## docker/.env の値

- 値は単一引用符で囲む。囲まないと `$` が変数として展開される。値に `'` は使えない。
- 「必須」の値を空のままにすると起動しない。

| 名前                         | 必須 | 内容                                                                                    |
| ---------------------------- | ---- | --------------------------------------------------------------------------------------- |
| `DB_ADMIN_PASSWORD`          | ○    | DB の管理者のパスワード                                                                 |
| `DB_APP_PASSWORD`            | ○    | アプリが DB に接続するユーザー `app` のパスワード                                       |
| `APP_NETWORK_SUBNET`         | ○    | アプリのコンテナを置くネットワークの範囲（例：`172.30.255.0/24`）                       |
| `APP_NETWORK_GATEWAY`        | ○    | そのネットワークのゲートウェイ。ふつうは範囲の最初のアドレス（例：`172.30.255.1`）      |
| `TRUSTED_PROXIES`            |      | 信頼するプロキシの IP アドレス。「[接続元の IP アドレス](#接続元の-ip-アドレス)」を参照 |
| `DB_POOL_MAX` ほか           |      | DB の接続数と時間制限。「[時間制限](#時間制限)」を参照                                  |
| `LOGIN_LOCKOUT_MINUTES` ほか |      | アプリの設定。書かなければ既定値を使う。意味と既定値は `src/lib/env.ts` を参照          |
| `LOG_DESTINATION` ほか       | ○    | ログの送り先。「[ログ](#ログ)」を参照                                                   |

### APP_NETWORK_SUBNET・APP_NETWORK_GATEWAY

- サーバーのほかのネットワーク（ほかの Docker のネットワーク、LAN、VPN）と重ならない範囲を選ぶ。
  - 使われている範囲は、`ip route` や `docker network inspect` で確かめる。
  - 重なると、起動時に `Pool overlaps` のエラーになる。
- 同じサーバーのリバースプロキシから `127.0.0.1:3000`
  へ転送すると、アプリにはゲートウェイのアドレスから接続したように見える。
  - ネットワークを作り直すたびにこのアドレスが変わらないよう、固定している。

## 時間制限

アプリは、本文の読み込みと DB の待ちを、次の値で打ち切る。書かなければ括弧の中の既定値を使う。

| 名前                            | 内容                                                                          |
| ------------------------------- | ----------------------------------------------------------------------------- |
| `REQUEST_BODY_TIMEOUT_SECONDS`  | 本文を読み終えるまでの秒数（30）。過ぎたら 408 を返す                         |
| `DB_POOL_MAX`                   | 1 つのアプリのインスタンスが開く DB の接続の数（10）                          |
| `DB_CONNECTION_TIMEOUT_SECONDS` | DB の接続の空きを待つ秒数（5）。過ぎたら 503 を返す                           |
| `DB_STATEMENT_TIMEOUT_SECONDS`  | 1 つの SQL の文にかけてよい秒数（10）。過ぎたら DB が文を取り消し、503 を返す |

- `DB_POOL_MAX` にアプリのインスタンスの数を掛けた数は、PostgreSQL の `max_connections`
  （既定 100）より少なくする。
  - 管理者で `psql` から接続する分の余裕を残す。
- 起動時のマイグレーションには、`DB_STATEMENT_TIMEOUT_SECONDS` をかけない。
- 本文の締め切りは、本文の全体にかける。遅い回線で 1 MB 近くを送る利用者がいるなら長くする。

リバースプロキシでも、遅い接続を打ち切る。アプリの締め切りは、アプリまで届いた接続にしか効かないため。
nginx の例：

```nginx
client_header_timeout 10s;
client_body_timeout 10s;   # 本文の読み込みの間隔。全体ではない
client_max_body_size 1m;   # アプリの本文の上限（src/web/app.ts の MAX_BODY_BYTES）と揃える
send_timeout 10s;
limit_conn_zone $binary_remote_addr zone=perip:10m;  # http に書く
limit_conn perip 20;       # 接続元ごとの同時接続数
```

- nginx は既定（`proxy_request_buffering on`）で本文を受け取り終えてからアプリに送る。
  - 本文を少しずつ送る接続は、アプリではなく nginx が抱える。上の設定で打ち切る。
- `proxy_read_timeout`（既定 60 秒）は、`DB_CONNECTION_TIMEOUT_SECONDS` と
  `DB_STATEMENT_TIMEOUT_SECONDS` の合計より十分に長くする。
  - 短いと、アプリが 503 を返す前に nginx が 504 を返す。

## 接続元の IP アドレス

リバースプロキシの裏では、アプリから見た接続元はすべてプロキシ（`APP_NETWORK_GATEWAY`）になる。

- 接続元は、監査ログと、ログインの失敗の回数（`LOGIN_IP_MAX_FAILED_ATTEMPTS`）に使う。
- すべてプロキシのままだと、誰かが失敗を重ねるだけで、全員がしばらくログインできなくなる。

利用者のアドレスを取るには、次の 2 つを両方とも行う。

1. リバースプロキシで、X-Forwarded-For の右端に接続元を追記するか、接続元だけで上書きする。
   - nginx の例：`proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`（追記）、
     `proxy_set_header X-Forwarded-For $remote_addr;`（上書き）
   - 利用者が送った値をそのまま転送すると、利用者がどの IP アドレスでも名乗れる。
   - nginx は `proxy_set_header` を書かないと、利用者が送った値をそのまま転送する。
   - nginx の `proxy_set_header` は、location に 1 つでも書くと、server や http
     に書いたものを引き継がない。 `proxy_pass` を書くすべての location に書く。
2. `docker/.env` の `TRUSTED_PROXIES` に、`APP_NETWORK_GATEWAY` と同じ値を書く。
   - カンマ区切りで複数書ける。CIDR（例：`10.0.1.0/24`）でも書ける。
   - IPv4 は `/8`、IPv6 は `/32` より広い範囲は書けない（起動時にエラーになる）。

設定したら、ブラウザの拡張機能などで `X-Forwarded-For: 192.0.2.1` を付けてログインする。
`docker compose logs app` の監査ログで、`remoteAddress` が自分のアドレスになることを確かめる。

- `192.0.2.1` なら、リバースプロキシが利用者の値をそのまま転送している（1 が抜けている）。
- `APP_NETWORK_GATEWAY` の値なら、`TRUSTED_PROXIES` が合っていない（2 が抜けている）。

### ログインの試行の制限

同じ接続元からログインに `LOGIN_IP_MAX_FAILED_ATTEMPTS` 回失敗すると、`LOGIN_IP_LOCKOUT_MINUTES`
の間、その接続元からはログインできない。制限を始めると、監査ログに `address_blocked` が出る。

- 回数は、最初の失敗から `LOGIN_IP_WINDOW_MINUTES` ごとに数え直す。
  - 期間ごとに上限より少なく試し続ける攻撃は、止まらずに遅くなるだけ。
- NAT の裏の利用者は、同じ接続元として数える。
  - 同じ NAT の中の誰かが失敗を重ねると、ほかの利用者もログインできなくなる。
- IPv6 は `/64` ごとに数える。
  - それより広い範囲（`/48` など）を持つ攻撃者は、`/64` を変えながら試せる。
- 多数の接続元から分散して試す攻撃は止められない。
  - 監査ログの `login_failed` の件数を監視し、急に増えたら気付けるようにする。
- 制限中もパスワードの検証と同じだけ CPU を使う。
  - 応答時間から制限中だと分からないようにするため。
  - 大量のリクエストを抑えるには、リバースプロキシでも `POST /login` の頻度を制限する（nginx の
    `limit_req` など）。

制限を手で解除するには、監査ログの `blockedAddress` の値を指定して、DB の行を消す。

```sh
docker compose --env-file docker/.env exec db \
  psql -U admin -d app -c "DELETE FROM app.login_throttles WHERE address = '192.0.2.1'"
```

### アカウントのロック

同じアカウントでログインに `LOGIN_MAX_FAILED_ATTEMPTS` 回続けて失敗すると、`LOGIN_LOCKOUT_MINUTES`
の間、そのアカウントはロックされる。ロックすると、監査ログに `account_locked` が出る。

- ユーザー名さえ分かれば、誰でも失敗を重ねて本人を締め出せる。
  - 接続元ごとの制限では、多数の接続元から分散して試されると止められない。
- そのため、ログインに成功した端末を `LOGIN_DEVICE_DAYS` 日の間覚えておく（Cookie `__Host-device`）。
  - 覚えている端末からは、ロック中でも、接続元が制限されていてもログインできる。
  - その端末からの失敗は、アカウントではなく端末ごとに数える。`LOGIN_MAX_FAILED_ATTEMPTS`
    回失敗した端末は、ほかの端末と同じ扱いになる。
  - 監査ログの `login_succeeded`・`login_failed` の `trustedDevice` が `true` なら、覚えている端末からの試行。
- 新しい端末や、Cookie を消したブラウザからは、ロック中はログインできない。
  - ユーザー名を推測しにくくすると、締め出されにくくなる（連番やメールアドレスを使わない）。
- `LOGIN_MAX_FAILED_ATTEMPTS` を 0 にすると、ロックせず、端末も覚えない。

ロックを手で解除するには、監査ログの `accountId` の値を指定して、失敗の回数を消す。

```sh
docker compose --env-file docker/.env exec db \
  psql -U admin -d app -c "UPDATE app.accounts SET failed_attempts = 0, locked_until = NULL WHERE id = 1"
```

リポジトリから DB に接続できる環境では、`deno task account:unlock <accountId>` でも解除できる。

### 注意

アプリは、`TRUSTED_PROXIES` のアドレスから届いた X-Forwarded-For
を信用する。次の場合は接続元を偽れる。
偽れると、接続元ごとのログインの制限を逃れたり、ほかの利用者のアドレスを制限させたりできる。

- `TRUSTED_PROXIES` にプロキシ以外のアドレスを含めたとき：その範囲の端末は、X-Forwarded-For
  を書いて送れば偽れる。 プロキシのアドレスだけを書く。
- 同じサーバーのプロセス：`127.0.0.1:3000` に直接つなぐと、どれも `APP_NETWORK_GATEWAY`
  から届くため偽れる。 信頼しない利用者やサービスを同じサーバーに置かない。
- `compose.yaml` の ports を `127.0.0.1`
  以外にも公開したとき：外からの接続もゲートウェイから届く場合があり、偽れる。 公開するなら
  `TRUSTED_PROXIES` を外す。

## ログ

アプリは、1 行に 1 つの JSON でログを出す。`type` で種類を見分ける。

- `access`：1 リクエストにつき 1 行。静的ファイルも含む。標準出力に出す。
  - `durationMs` は応答を返し始めるまでの時間で、本文を送り終えるまでは含まない。
  - `accountId`・`sessionLogId` はログイン中のときだけ出す。
- `audit`：ログイン・ログアウトなどの監査ログ。標準出力に出す。
- `error`：500・503 にした例外など。`error` にスタックトレースが入る。標準エラーに出す。
- `warning`：設定の不備など。標準エラーに出す。

クエリ文字列・Cookie・本文は出さない。ログイン後の戻り先やトークンが入るため。

### 送り先

アプリはファイルに書かない。同じサーバーの `log-forwarder`（Fluent Bit）がアプリのログを受け取り、`LOG_DESTINATION` の送り先へ送る。

- `cloudwatch`：CloudWatch Logs へ送る。
- `internal`：社内のログ用のサーバー（`docker/log-server/`）へ送る。

どちらでも、次のことは同じ。

- 送り先に届くまでは、`log-forwarder` がディスク（ボリューム `log-buffer`）にためて送り直す。
  - 送り先が止まっても捨てない。ためる量の上限は `LOG_BUFFER_MAX_SIZE`（既定 `5G`）で、超えると古いものから捨てる。
- ログはすぐにアプリのサーバーの外へ出るため、アプリのサーバーを乗っ取られても、送ったログは消せない。
- 各行に、`server`（`SERVER_NAME`）と、`container_name`・`source`（`stdout`・`stderr`）が付く。
  - アプリのサーバーが複数台になっても、どのサーバーのログか分かる。`SERVER_NAME` はサーバーごとに違う値にする。
  - JSON でない行（Deno が起動時に出す表示など）は、`log` に文字列のまま入る。
- `docker compose --env-file docker/.env logs app` でも、そのサーバーの直近のログを読める。
- `log-forwarder` は、ホストの `127.0.0.1:24224` で受け付ける（Docker がホストから接続するため）。
  同じサーバーのほかのプロセスからも送れるため、信頼しない利用者やサービスを同じサーバーに置かない。

| 名前                        | 必須 | 内容                                                         |
| --------------------------- | ---- | ------------------------------------------------------------ |
| `LOG_DESTINATION`           | ○    | `cloudwatch` か `internal`                                   |
| `SERVER_NAME`               | ○    | このサーバーの名前（例：`app-1`）。ログの `server` に入る    |
| `LOG_BUFFER_MAX_SIZE`       |      | 送れない間にためる量の上限（`5G`）                           |
| `AWS_REGION`                |      | `cloudwatch`：送り先のリージョン（例：`ap-northeast-1`）     |
| `CLOUDWATCH_LOG_GROUP`      |      | `cloudwatch`：ロググループの名前。なければ作る               |
| `CLOUDWATCH_RETENTION_DAYS` |      | `cloudwatch`：ロググループを作るときの保存日数（`90`）       |
| `LOG_SERVER_HOST`           |      | `internal`：ログ用のサーバーのホスト名。証明書の名前と揃える |
| `LOG_SERVER_PORT`           |      | `internal`：ログ用のサーバーのポート（`24224`）              |
| `LOG_SERVER_SHARED_KEY`     |      | `internal`：ログ用のサーバーと揃える共有の鍵                 |

### CloudWatch

1. アプリのサーバー（EC2）に IAM ロールを付け、次の権限を与える。アクセスキーを `docker/.env` に書かない。
   - `logs:CreateLogGroup`・`logs:PutRetentionPolicy`（ロググループがなければ作るため）
   - `logs:CreateLogStream`・`logs:PutLogEvents`
   - 対象は `CLOUDWATCH_LOG_GROUP` のロググループだけにする。
2. インスタンスのメタデータの応答のホップ数（`HttpPutResponseHopLimit`）を 2 以上にする。
   - `log-forwarder` はコンテナの中から IAM ロールの権限を取りに行くため、1 だと届かない。
3. `docker/.env` に `LOG_DESTINATION='cloudwatch'` と `AWS_REGION`・`CLOUDWATCH_LOG_GROUP` を書く。

ロググループの保存日数は、ロググループを作るときにだけ `CLOUDWATCH_RETENTION_DAYS` で決まる。あとから変えるときは、CloudWatch の画面か CLI で変える。

ログは Logs Insights で、JSON の項目のまま絞り込める。

```
fields @timestamp, server, type, event, method, path, status
| filter requestId = "<requestId>"
```

監視には、メトリクスフィルターと警報を使う。例：`{ $.type = "audit" && $.event = "login_failed" }` の件数、`{ $.type = "error" }` の件数、ロググループの `IncomingLogEvents` が 0 になったこと。

### 社内のログ用のサーバー

アプリのサーバーとは別のサーバーに置く。`docker/log-server/` に、受け口（`receiver`）と、古いファイルを消す `log-cleaner`（「[古いファイルの削除](#古いファイルの削除)」）がある。

アプリのサーバーの `log-forwarder` は、TLS で暗号化し、共有の鍵で認証してログを送るだけで、ログ用のサーバーのファイルを読んだり消したりできない。

#### ログ用のサーバーを用意する

1. サーバーを外部から隔離する。
   - 公開 IP を持たせない。
   - 受け口のポート（`LOG_SERVER_PORT`）は、アプリのサーバーのアドレスからだけ受け付ける。
   - SSH などの管理は、社内のネットワークか VPN からだけ受け付ける。
   - アプリのサーバーがクラウドにあるなら、拠点間の VPN などで社内とつなぐ。
   - 入れる人を、アプリのサーバーを管理する人と分けられるとよい。両方を管理できる人のアカウントを取られると、痕跡ごと消せるため。
2. 証明書を作る。CA の鍵は、サーバーの外で保管する（漏れると、偽のログ用のサーバーを作れる）。
   `log.example.internal` は、アプリのサーバーから接続するホスト名（`LOG_SERVER_HOST`）にする。IP アドレスで接続するなら `DNS:` を `IP:` にする。

   ```sh
   openssl req -x509 -newkey rsa:3072 -nodes -days 3650 -subj "/CN=sugumi-log-ca" -keyout ca.key -out ca.crt
   openssl req -newkey rsa:3072 -nodes -subj "/CN=log.example.internal" -keyout docker/log-server/certs/server.key -out server.csr
   openssl x509 -req -days 825 -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
     -extfile <(printf "subjectAltName=DNS:log.example.internal") -out docker/log-server/certs/server.crt
   chmod 600 docker/log-server/certs/server.key
   ```

   - `ca.crt` は、アプリのサーバーに置く（次の節）。
   - 証明書はイメージに入れるため、差し替えたら `--build` を付けて起動し直す。
3. `docker/log-server/.env.example` を `docker/log-server/.env` にコピーし、値を書く。
   - `LOG_SERVER_SHARED_KEY` は、`openssl rand -hex 32` などで作った長いランダムな値にする。アプリのサーバーと同じ値を使う。
4. 起動する。

   ```sh
   cd docker/log-server
   cp .env.example .env
   chmod 600 .env
   docker compose --env-file .env up -d --build
   ```

| 名前                          | 必須 | 内容                                                  |
| ----------------------------- | ---- | ----------------------------------------------------- |
| `LOG_SERVER_NAME`             | ○    | ログ用のサーバーの名前。共有の鍵での認証に使う        |
| `LOG_SERVER_SHARED_KEY`       | ○    | アプリのサーバーと揃える共有の鍵                      |
| `LOG_SERVER_PORT`             |      | 受け口のポート（`24224`）                             |
| `LOG_FILE_MAX_SIZE`           |      | ファイル 1 つの大きさの上限。超えると分ける（`100M`） |
| `LOG_APP_RETENTION_DAYS`      |      | `app-*` のファイルを残す日数（`90`）                  |
| `LOG_AUDIT_RETENTION_DAYS`    |      | `audit-*` のファイルを残す日数（`90`）                |
| `LOG_APP_MAX_TOTAL_SIZE_MB`   |      | `app-*` のファイルの合計の上限（MB）（`51200`）       |
| `LOG_AUDIT_MAX_TOTAL_SIZE_MB` |      | `audit-*` のファイルの合計の上限（MB）（`5120`）      |

#### アプリのサーバーを設定する

1. ログ用のサーバーの `ca.crt` を、`docker/log-forwarder/certs/log-server-ca.crt` に置く（コミットしない）。
2. `docker/.env` に `LOG_DESTINATION='internal'` と `LOG_SERVER_HOST`・`LOG_SERVER_SHARED_KEY` を書く。
3. `--build` を付けて起動する（証明書はイメージに入れる）。

#### ログを読む

ログは、ボリューム `log-server_logs` に、UTC の日付ごとのファイルで書かれる。読めるのは root（と `docker` グループの利用者）だけ。

- `app-<日付>.jsonl`：`access`・`error`・`warning` など
- `audit-<日付>.jsonl`：`audit`
- 書いているファイルが `LOG_FILE_MAX_SIZE` を超えると、gzip で圧縮して `<元の名前>.<分けた時刻>_<ランダムな文字>.gz` に移し、元の名前で書き直す。
  - 例：`app-2026-10-26.jsonl.20261026_113154_ba22e1c0.gz`。名前順に並べると古い順になる。
  - 名前の付け方は Fluent Bit が決めていて、変えられない。

`zgrep` は、圧縮したファイルとしていないファイルの両方を読める。

```sh
LOGS=$(docker volume inspect log-server_logs --format '{{ .Mountpoint }}')
sudo ls -l "$LOGS"
sudo zgrep -h '"requestId":"<requestId>"' "$LOGS"/app-2026-10-26.jsonl*
sudo zgrep -h '"sessionLogId":"<sessionLogId>"' "$LOGS"/audit-*
```

#### 古いファイルの削除

`log-cleaner` が 1 分ごとに、種類（`app-*`・`audit-*`）ごとに消す。

- 保存日数（`LOG_APP_RETENTION_DAYS`・`LOG_AUDIT_RETENTION_DAYS`）を過ぎたファイル。
- 合計の上限（`LOG_APP_MAX_TOTAL_SIZE_MB`・`LOG_AUDIT_MAX_TOTAL_SIZE_MB`）を超えた分を、最終更新が古いファイルから。
  - 受け口が書いている今日のファイルは消さない。
  - 上限を種類ごとに分けているため、アクセスログを大量に出させても監査ログは消えない。
  - 上限で消すと、保存日数より前にログが消える。そのときは `log-cleaner` のログに `warning` が出る（`docker compose --env-file .env logs log-cleaner`）。
  - 1 分ごとに確かめるため、その間に流れ込んだ分だけ一時的に上限を超える。

2 つの上限の合計は、ディスクの空きより十分小さくする。受け口が書けない間にためる分（ボリューム `log-server_buffer`）の余裕も残す。
上限に届く前にディスクが埋まると、新しいログを書けなくなる。

### 突き合わせ

リクエストの処理中に出たログには `requestId` が入る。エラーや監査ログのリクエストは、同じ `requestId` のアクセスログで探す。

`sessionLogId` は、1 回のログインごとに振る ID。アクセスログの `sessionLogId` と同じ値の `login_succeeded`
を探すと、そのリクエストがいつ・どの接続元からのログインによるものかが分かる。

## 大量のリクエスト

アクセスログは、ログインなしで送れるリクエスト（静的ファイル・404 を含む）にも 1 行ずつ出る。
大量に送られると、アプリや DB の負荷に加えて、次のことが起きる。

- `log-forwarder` がためる量の上限（`LOG_BUFFER_MAX_SIZE`）を超え、送り先が止まっている間のログが捨てられる。
- CloudWatch の取り込みの費用が増える。社内のログ用のサーバーでは、ディスクが埋まる。

そのため、リバースプロキシで、接続元ごとにすべてのリクエストの頻度を制限する。nginx の例：

```nginx
# http に書く
limit_req_zone $binary_remote_addr zone=per_ip:10m rate=20r/s;
# proxy_pass を書くすべての location に書く
limit_req zone=per_ip burst=100 nodelay;
```

- 値は、画面を開いたときに読み込むファイルの数や利用者の数に合わせて決める。
- NAT の裏の利用者は同じ接続元として数えるため、利用者の数に合わせて余裕を持たせる。
