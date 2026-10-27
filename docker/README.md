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

3. 起動する。初回は DB にアプリ用の DB ユーザーとスキーマが作られ、アプリの起動時にテーブルが作られる。

   ```sh
   docker compose --env-file docker/.env up -d --build
   ```

4. HTTPS を受けるリバースプロキシを同じサーバーに置き、`127.0.0.1:3000` へ転送する。
   - Cookie に Secure を付けているので、HTTP のままではログインできない。
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

| 名前                                                                                                           | 必須 | 内容                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `APP_MODE`                                                                                                     |      | アプリのモード。本番では書かないか `PROD` にする（`DEV`・`MOCK` にしない）                                                                         |
| `TRUSTED_PROXIES`                                                                                              |      | 信頼するプロキシの IP アドレス。「[接続元の IP アドレス](#接続元の-ip-アドレス)」を参照                                                            |
| `REQUEST_BODY_TIMEOUT_SECONDS`・`DB_POOL_MAX`・`DB_CONNECTION_TIMEOUT_SECONDS`・`DB_STATEMENT_TIMEOUT_SECONDS` |      | リクエストボディの読み込みと DB の時間制限、DB の接続数。「[時間制限](#時間制限)」を参照                                                           |
| `SESSION_*`・`LOGIN_*`・`PRE_LOGIN_CSRF_TIMEOUT_MINUTES`                                                       |      | セッションの期限、ログインの制限、ログイン前の CSRF のトークンの期限。書かなければデフォルト値を使う。意味とデフォルト値は `src/lib/env.ts` を参照 |
| `DB_ADMIN_PASSWORD`                                                                                            | ○    | DB の管理者のパスワード                                                                                                                            |
| `DB_APP_PASSWORD`                                                                                              | ○    | アプリが DB に接続するときの DB ユーザー `app` のパスワード                                                                                        |
| `BACKUP_DIR`                                                                                                   | ○    | DB のバックアップを置く、ホストのディレクトリ（絶対パス）。「[バックアップと復元](#バックアップと復元)」を参照                                     |
| `LOG_DESTINATION` ほか                                                                                         | ○    | ログの送り先。「[ログ](#ログ)」を参照                                                                                                              |
| `APP_NETWORK_SUBNET`                                                                                           | ○    | アプリのコンテナを置くネットワークの範囲（例：`172.30.255.0/24`）                                                                                  |
| `APP_NETWORK_GATEWAY`                                                                                          | ○    | そのネットワークのゲートウェイ。ふつうは範囲の最初のアドレス（例：`172.30.255.1`）                                                                 |

### APP_NETWORK_SUBNET・APP_NETWORK_GATEWAY

- サーバーのほかのネットワーク（ほかの Docker のネットワーク、LAN、VPN）と重ならない範囲を選ぶ。
  - 使われている範囲は、`ip route` や `docker network inspect` で確かめる。
  - 重なると、起動時に `Pool overlaps` のエラーになる。
- 同じサーバーのリバースプロキシから `127.0.0.1:3000`
  へ転送すると、アプリにはゲートウェイのアドレスから接続したように見える。
  - ネットワークを作り直すたびにこのアドレスが変わらないよう、固定している。

## 時間制限

アプリは、リクエストボディの読み込みと DB の待ちを、次の値で打ち切る。書かなければ、括弧の中のデフォルト値を使う。

| 名前                            | 内容                                                                          |
| ------------------------------- | ----------------------------------------------------------------------------- |
| `REQUEST_BODY_TIMEOUT_SECONDS`  | リクエストボディを読み終えるまでの秒数（30）。過ぎたら 408 を返す             |
| `DB_POOL_MAX`                   | 1 つのアプリのインスタンスが開く DB の接続の数（10）                          |
| `DB_CONNECTION_TIMEOUT_SECONDS` | DB の接続の空きを待つ秒数（5）。過ぎたら 503 を返す                           |
| `DB_STATEMENT_TIMEOUT_SECONDS`  | 1 つの SQL の文にかけてよい秒数（10）。過ぎたら DB が文を取り消し、503 を返す |

- `DB_POOL_MAX` にアプリのインスタンスの数を掛けた数は、PostgreSQL の `max_connections`
  （デフォルト 100）より少なくする。
  - 管理者で `psql` から接続する分の余裕を残す。
- 起動時のマイグレーションには、`DB_STATEMENT_TIMEOUT_SECONDS` をかけない。
- リクエストボディのタイムアウトは、1 回の読み込みではなくボディ全体にかかる。遅い回線で 1 MB 近くを送るユーザーがいるなら、長くする。

リバースプロキシでも、遅い接続を打ち切る。アプリのタイムアウトは、アプリまで届いた接続にしか効かない。
nginx の例：

```nginx
client_header_timeout 10s;
client_body_timeout 10s;   # リクエストボディを読み込む間隔。全体の時間ではない
client_max_body_size 1m;   # アプリのリクエストボディの上限（src/web/app.ts の MAX_BODY_BYTES）と揃える
send_timeout 10s;
limit_conn_zone $binary_remote_addr zone=perip:10m;  # http に書く
limit_conn perip 20;       # 接続元ごとの同時接続数
```

- nginx はデフォルト（`proxy_request_buffering on`）では、リクエストボディを受け取り終えてからアプリに送る。
  - ボディを少しずつ送ってくる接続は、アプリではなく nginx が受け持つ。上の設定で打ち切る。
- `proxy_read_timeout`（デフォルト 60 秒）は、`DB_CONNECTION_TIMEOUT_SECONDS` と
  `DB_STATEMENT_TIMEOUT_SECONDS` の合計より十分に長くする。
  - 短いと、アプリが 503 を返す前に nginx が 504 を返す。

## 接続元の IP アドレス

リバースプロキシの裏では、アプリから見た接続元はすべてプロキシ（`APP_NETWORK_GATEWAY`）になる。

- 接続元は、監査ログと、ログインの失敗の回数（`LOGIN_IP_MAX_FAILED_ATTEMPTS`）に使う。
- すべてプロキシのままだと、誰かが失敗を重ねるだけで、全員がしばらくログインできなくなる。

ユーザーのアドレスを得るには、次の 2 つを両方とも行う。

1. リバースプロキシで、X-Forwarded-For の右端に接続元を追記するか、接続元だけで上書きする。
   - nginx の例：`proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`（追記）、
     `proxy_set_header X-Forwarded-For $remote_addr;`（上書き）
   - ユーザーが送った値をそのまま転送すると、ユーザーがどの IP アドレスでも名乗れてしまう。
   - nginx は、`proxy_set_header` を書かないと、ユーザーが送った値をそのまま転送する。
   - nginx の `proxy_set_header` は、location に 1 つでも書くと、server や http
     に書いたものを引き継がない。 `proxy_pass` を書くすべての location に書く。
2. `docker/.env` の `TRUSTED_PROXIES` に、`APP_NETWORK_GATEWAY` と同じ値を書く。
   - カンマ区切りで複数書ける。CIDR（例：`10.0.1.0/24`）でも書ける。
   - IPv4 は `/8`、IPv6 は `/32` より広い範囲は書けない（起動時にエラーになる）。

設定したら、ブラウザの拡張機能などで `X-Forwarded-For: 192.0.2.1` を付けてログインする。
`docker compose logs app` の監査ログで、`remoteAddress` が自分のアドレスになることを確かめる。

- `192.0.2.1` なら、リバースプロキシがユーザーの送った値をそのまま転送している（1 が抜けている）。
- `APP_NETWORK_GATEWAY` の値なら、`TRUSTED_PROXIES` が合っていない（2 が抜けている）。

### ログインの試行の制限

同じ接続元からログインに `LOGIN_IP_MAX_FAILED_ATTEMPTS` 回失敗すると、`LOGIN_IP_LOCKOUT_MINUTES`
の間、その接続元からはログインできない。制限を始めると、監査ログに `address_blocked` が出る。

- 回数は、最初の失敗から `LOGIN_IP_WINDOW_MINUTES` ごとに数え直す。
  - 期間ごとに上限未満の回数で試し続ける攻撃は、止められない。遅くなるだけ。
- NAT の裏のユーザーは、同じ接続元として数える。
  - 同じ NAT の中の誰かが失敗を重ねると、ほかのユーザーもログインできなくなる。
- IPv6 は `/64` ごとに数える。
  - それより広い範囲（`/48` など）を持つ攻撃者は、`/64` を変えながら試せる。
- 多数の接続元から分散して試す攻撃は止められない。
  - 監査ログの `login_failed` の件数を監視し、急に増えたら気付けるようにする。
- 制限中もパスワードの検証と同じだけ CPU を使う。
  - レスポンスまでの時間から、制限中だと分からないようにするため。
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
偽れると、接続元ごとのログインの制限をすり抜けたり、ほかのユーザーのアドレスに制限をかけたりできてしまう。

- `TRUSTED_PROXIES` にプロキシ以外のアドレスを含めたとき：その範囲の端末は、X-Forwarded-For
  を書いて送れば偽れる。 プロキシのアドレスだけを書く。
- 同じサーバーのプロセス：`127.0.0.1:3000` に直接つなぐと、どれも `APP_NETWORK_GATEWAY`
  から届くので偽れる。 信頼できない OS のアカウントやサービスを同じサーバーに置かない。
- `compose.yaml` の ports を `127.0.0.1`
  以外にも公開したとき：外からの接続もゲートウェイから届く場合があり、偽れる。 公開するなら
  `TRUSTED_PROXIES` を外す。

## ログ

アプリは、1 行に 1 つの JSON でログを出す。`type` で種類を見分ける。

- `access`：1 リクエストにつき 1 行。静的ファイルも含む。標準出力に出す。
  - `durationMs` はレスポンスを返し始めるまでの時間で、レスポンスボディを送り終えるまでの時間は含まない。
  - `accountId`・`sessionLogId` はログイン中のときだけ出す。
- `audit`：ログイン・ログアウトなどの監査ログ。標準出力に出す。
- `error`：500・503 にした例外など。`error` にスタックトレースが入る。標準エラーに出す。
- `warning`：設定の不備など。標準エラーに出す。

クエリ文字列・Cookie・リクエストボディは出さない。ログイン後の戻り先やトークンが入るため。

`login_failed` の `username`（64 文字まで）には、ユーザーが誤ってパスワードを入力した値が入ることがある。ログを読める人を絞る。

### 送り先

アプリはファイルに書かない。同じサーバーの `log-forwarder`（Fluent Bit）がアプリのログを受け取り、`LOG_DESTINATION` の送り先へ送る。

- `cloudwatch`：CloudWatch Logs へ送る。
- `internal`：社内のログ用のサーバー（`docker/log-server/`）へ送る。

どちらでも、次のことは同じ。

- 送り先に届くまでは、`log-forwarder` がディスク（ボリューム `log-buffer`）にためて送り直す。
  - 送り先が止まっても捨てない。ためる量の上限は `LOG_BUFFER_MAX_SIZE`（デフォルト `5G`）で、超えると古いものから捨てる。
- ログはすぐにアプリのサーバーの外へ出る。アプリのサーバーを乗っ取られても、送った監査ログは消せない。
  - 乗っ取られたサーバーからは、偽のログを送れる。共有の鍵や IAM ロールは全サーバーで同じため、ほかのサーバーの名前（`server`）でも送れる。
    乗っ取りに気づいたら、乗っ取られた時点より後の、全サーバーのログを信用しない。
  - `internal` では、アクセスログなどは合計の上限を超えると古いものから消す。そのため、大量に送られると古いログが押し出される（「[古いファイルの削除](#古いファイルの削除)」）。
- 各行に、`server`（`SERVER_NAME`）と、`container_name`・`source`（`stdout`・`stderr`）が付く。
  - アプリのサーバーが複数台になっても、どのサーバーのログか分かる。`SERVER_NAME` はサーバーごとに違う値にする。
  - JSON でない行（Deno が起動時に出す表示など）は、`log` に文字列のまま入る。
- `docker compose --env-file docker/.env logs app` でも、そのサーバーの直近のログを読める。
- `log-forwarder` はホストのネットワークで動き、`127.0.0.1:24224` だけで待ち受ける（Docker がホストから接続するため）。
  - アプリのコンテナからは届かない。
  - 同じサーバーのほかのプロセスからは送れるので、信頼できない OS のアカウントやサービスを同じサーバーに置かない。

| 名前                    | 必須 | 内容                                                         |
| ----------------------- | ---- | ------------------------------------------------------------ |
| `LOG_DESTINATION`       | ○    | `cloudwatch` か `internal`                                   |
| `SERVER_NAME`           | ○    | このサーバーの名前（例：`app-1`）。ログの `server` に入る    |
| `LOG_BUFFER_MAX_SIZE`   |      | 送れない間にためる量の上限（`5G`）                           |
| `AWS_REGION`            |      | `cloudwatch`：送り先のリージョン（例：`ap-northeast-1`）     |
| `CLOUDWATCH_LOG_GROUP`  |      | `cloudwatch`：ロググループの名前。先に作っておく             |
| `LOG_SERVER_HOST`       |      | `internal`：ログ用のサーバーのホスト名。証明書の名前と揃える |
| `LOG_SERVER_PORT`       |      | `internal`：ログ用のサーバーのポート（`24224`）              |
| `LOG_SERVER_SHARED_KEY` |      | `internal`：ログ用のサーバーと揃える共有の鍵                 |

### CloudWatch

アプリのサーバーを乗っ取られても送ったログを消されないよう、サーバーに与える権限は書き込みだけに絞る。

1. 管理者が、ロググループを作り、保存日数を決める。アプリのサーバーには作らせない。

   ```sh
   aws logs create-log-group --log-group-name <ロググループ>
   aws logs put-retention-policy --log-group-name <ロググループ> --retention-in-days 90
   ```

2. アプリのサーバー（EC2）に IAM ロールを付け、次の権限だけを与える。アクセスキーを `docker/.env` に書かない。
   - `logs:CreateLogStream`・`logs:PutLogEvents`
   - 対象は、そのロググループだけにする（`arn:aws:logs:<リージョン>:<アカウント>:log-group:<ロググループ>:*`）。
   - `logs:PutRetentionPolicy`・`logs:Delete*`・`logs:CreateLogGroup` は与えない。保存日数を縮めたりロググループを消したりして、送ったログを消されないようにするため。
   - サーバーごとに IAM ロールを分け、対象をそのサーバーのストリーム（`…:log-group:<ロググループ>:log-stream:<SERVER_NAME>`）に絞ると、
     乗っ取られたサーバーがほかのサーバーのストリームに書けなくなる。
3. インスタンスのメタデータを、IMDSv2 だけにし（`HttpTokens=required`）、レスポンスのホップ数（`HttpPutResponseHopLimit`）を 1 にする。
   - Amazon Linux 2023 の AMI などは、デフォルトのホップ数が 2 なので、必ず設定して確かめる。

     ```sh
     aws ec2 modify-instance-metadata-options --instance-id <インスタンス> --http-tokens required --http-put-response-hop-limit 1
     aws ec2 describe-instances --instance-ids <インスタンス> --query 'Reservations[].Instances[].MetadataOptions'
     ```

   - `log-forwarder` はホストのネットワークで動くので、ホップ数 1 で届く。
   - アプリのコンテナからは届かない。ホップ数が 2 以上だと、アプリのコンテナを乗っ取られたときに IAM ロールの権限を使われる。
   - サーバーの root を取られると権限は使われるが、与えているのは書き込みの権限だけなので、送ったログは消せない。
4. `docker/.env` に `LOG_DESTINATION='cloudwatch'` と `AWS_REGION`・`CLOUDWATCH_LOG_GROUP` を書く。

ログは Logs Insights で、JSON の項目のまま絞り込める。

```
fields @timestamp, server, type, event, method, path, status
| filter requestId = "<requestId>"
```

監視には、メトリクスフィルターと警報を使う。例：`{ $.type = "audit" && $.event = "login_failed" }` の件数、`{ $.type = "error" }` の件数、ロググループの `IncomingLogEvents` が 0 になったこと。

### 社内のログ用のサーバー

アプリのサーバーとは別のサーバーに置く。`docker/log-server/` に、受け口（`receiver`）と、古いファイルを消す `log-cleaner`（「[古いファイルの削除](#古いファイルの削除)」）がある。

アプリのサーバーの `log-forwarder` は、TLS で暗号化し、共有の鍵で認証してログを送るだけで、ログ用のサーバーのファイルを読んだり、指定して消したりできない。

#### 証明書を作る

アプリのサーバーとログ用のサーバー以外の、管理者の端末の作業用のディレクトリ（リポジトリの外）で作る。
`log.example.internal` は、アプリのサーバーから接続するホスト名（`LOG_SERVER_HOST`）にする。IP アドレスで接続するなら `DNS:` を `IP:` にする。

```sh
mkdir -p ~/sugumi-log-ca && cd ~/sugumi-log-ca
umask 077
openssl req -x509 -newkey rsa:3072 -nodes -days 3650 -subj "/CN=sugumi-log-ca" -keyout ca.key -out ca.crt
openssl req -newkey rsa:3072 -nodes -subj "/CN=log.example.internal" -keyout server.key -out server.csr
openssl x509 -req -days 825 -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -extfile <(printf "subjectAltName=DNS:log.example.internal") -out server.crt
```

- `server.crt`・`server.key` を、ログ用のサーバーの `docker/log-server/certs/` に置く。置いたら、端末の `server.key` は消す。
- `ca.crt` を、アプリのサーバーの `docker/log-forwarder/certs/log-server-ca.crt` に置く。
- `ca.key` は、どのサーバーにも置かず、端末の外（オフラインの保管場所など）で保管する。漏れると、偽のログ用のサーバーを作れる。
- 証明書はイメージに入れるので、差し替えたら `--build` を付けて起動し直す。
  ログ用のサーバーのイメージには秘密鍵が入るので、レジストリへ push しない。
- `.gitignore` は `*.key`・`*.csr`・`*.srl` を除外しているが、リポジトリの中では作らない。

#### ログ用のサーバーを用意する

1. サーバーを外部から隔離する。
   - 公開 IP を持たせない。
   - 受け口のポート（`LOG_SERVER_PORT`）は、アプリのサーバーのアドレスからだけ受け付ける。
     - Docker が公開したポートへの通信は、ufw・firewalld などの INPUT の規則を通らない。そのため、それらでは絞れない。
     - クラウドのセキュリティグループ・ネットワーク ACL か、ホストの `DOCKER-USER` チェーンで絞る。

       ```sh
       sudo iptables -I DOCKER-USER -p tcp -m conntrack --ctdir ORIGINAL --ctorigdstport <LOG_SERVER_PORT> ! -s <アプリのサーバーの範囲> -j DROP
       ```

       `--ctdir ORIGINAL` を付けないと、受け口が返すパケットも止めてしまい、アプリのサーバーからもつながらない。

       iptables の規則は再起動で消えるので、`iptables-persistent` などで残す。
     - サーバーに複数のネットワークがあるなら、`LOG_SERVER_LISTEN_ADDRESS` でアプリのサーバー側のアドレスだけで待ち受ける。
   - SSH などの管理は、社内のネットワークか VPN からだけ受け付ける。
   - アプリのサーバーがクラウドにあるなら、拠点間の VPN などで社内とつなぐ。
   - 入れる人を、アプリのサーバーを管理する人と分けられるとよい。両方を管理できる人のアカウントを乗っ取られると、痕跡ごと消されてしまう。
2. 「[証明書を作る](#証明書を作る)」で作った `server.crt`・`server.key` を、`docker/log-server/certs/` に置く。
3. `.env` を作り、値を書く。
   - `LOG_SERVER_SHARED_KEY` は、`openssl rand -hex 32` などで作った長いランダムな値にする。アプリのサーバーと同じ値を使う。

   ```sh
   cd docker/log-server
   cp .env.example .env
   chmod 600 .env
   ```

4. 起動する。

   ```sh
   docker compose --env-file .env up -d --build
   ```

| 名前                           | 必須 | 内容                                                                           |
| ------------------------------ | ---- | ------------------------------------------------------------------------------ |
| `LOG_SERVER_NAME`              | ○    | ログ用のサーバーの名前。共有の鍵での認証に使う                                 |
| `LOG_SERVER_SHARED_KEY`        | ○    | アプリのサーバーと揃える共有の鍵                                               |
| `LOG_SERVER_LISTEN_ADDRESS`    |      | 受け口が待ち受けるアドレス（`0.0.0.0`）                                        |
| `LOG_SERVER_PORT`              |      | 受け口のポート（`24224`）                                                      |
| `LOG_FILE_MAX_SIZE`            |      | `app-*` のファイル 1 つの大きさの上限。超えると分ける（`100M`）                |
| `LOG_APP_RETENTION_DAYS`       |      | `app-*` のファイルを残す日数（`90`）                                           |
| `LOG_AUDIT_RETENTION_DAYS`     |      | `audit-*` のファイルを残す日数（`90`）                                         |
| `LOG_APP_MAX_TOTAL_SIZE_MB`    |      | `app-*` のファイルの合計の上限（MB）。超えたら古いものから消す（`51200`）      |
| `LOG_AUDIT_WARN_TOTAL_SIZE_MB` |      | `audit-*` のファイルの合計がこれを超えたら警告を出す（MB）。消さない（`5120`） |

#### アプリのサーバーを設定する

1. 「[証明書を作る](#証明書を作る)」で作った `ca.crt` を、`docker/log-forwarder/certs/log-server-ca.crt` に置く（コミットしない）。
2. `docker/.env` に `LOG_DESTINATION='internal'` と `LOG_SERVER_HOST`・`LOG_SERVER_SHARED_KEY` を書く。
3. `--build` を付けて起動する（証明書はイメージに入れる）。

#### ログを読む

ログは、ボリューム `log-server_logs` に、UTC の日付ごとのファイルで書かれる。読めるのは root（と `docker` グループに入っている OS のアカウント）だけ。

- `app-<日付>.jsonl`：`access`・`error`・`warning` など
- `audit-<日付>.jsonl`：`audit`
- 日付は、受け口が受け取った時刻で決まる（アプリが出した時刻は各行の `time`）。送り手に、過去の日付のファイルへ書かせないため。
- `app-*` は、書いているファイルが `LOG_FILE_MAX_SIZE` を超えると、gzip で圧縮して `<元の名前>.<分けた時刻>_<ランダムな文字>.gz` に移し、元の名前で書き直す。
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

`log-cleaner` が 1 分ごとに確かめる。

- 保存日数（`LOG_APP_RETENTION_DAYS`・`LOG_AUDIT_RETENTION_DAYS`）を過ぎたファイルを消す。
- `app-*` は、合計が `LOG_APP_MAX_TOTAL_SIZE_MB` を超えた分を、最終更新が古いファイルから消す。
  - 受け口が書いている今日のファイルは消さない。
  - 上限で消すと、保存日数より前にログが消える。そのときは `log-cleaner` のログに `warning` が出る（`docker compose --env-file .env logs log-cleaner`）。
  - 確かめるのは 1 分ごとなので、その間に流れ込んだ分だけ一時的に上限を超える。
- `audit-*` は、合計が `LOG_AUDIT_WARN_TOTAL_SIZE_MB` を超えても消さず、1 時間ごとに `warning` を出す。
  - 共有の鍵を持つ送り手（乗っ取られたアプリのサーバーを含む）が、大量に送るだけで過去の監査ログを消せないようにするため。
  - 警告が出たら、ディスクの空きを確かめ、必要ならディスクを増やすか、保存日数を見直す。

ディスクの空きは、`LOG_APP_MAX_TOTAL_SIZE_MB` と監査ログの量の合計より十分大きくする。受け口が書けない間にためる分（ボリューム `log-server_buffer`）の余裕も残す。
ディスクの使用量を見張り、埋まる前に気づけるようにする。ディスクが埋まると、新しいログを書けなくなる。

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

- 値は、画面を開いたときに読み込むファイルの数やユーザーの数に合わせて決める。
- NAT の裏のユーザーは同じ接続元として数えるので、ユーザーの数に合わせて余裕を持たせる。

## バックアップと復元

DB のスキーマ `app`（アプリのテーブル）のバックアップを、DB のコンテナの `db-backup` で取り、そこから復元する。
バックアップは、`docker/.env` の `BACKUP_DIR` のディレクトリに置く。

- アプリを動かしたままバックアップを取れる。取り始めた時点の、そろった状態が書き出される。
- バックアップには、パスワードのハッシュ・セッション・アプリの鍵（`secrets` テーブル）が入る。
  DB と同じように扱い、ほかの人が読めない場所に置く。別の場所へ写すときは、暗号化する。
- DB のユーザー `app` とそのパスワードは含まない。復元先の DB の初期化で、`docker/.env` の値から作られる。

### 置き場所を用意する

`BACKUP_DIR` のディレクトリを、起動する前に作っておく。
ないと Docker が root のディレクトリとして作り、バックアップを別の場所へ写すのに root の権限が要る。

```sh
mkdir -p -m 700 /var/backups/sugumi
```

- 書き込めるのは持ち主だけにする。すでにあるディレクトリは、`mkdir -m` では権限が変わらないので、`chmod 700` する。
  - 書き込める人は、細工したバックアップを置いて、復元させられるため。
  - 中身は DB のユーザー `app` の権限で実行するので、影響はアプリのデータの範囲にとどまる。
- バックアップのファイルは、このディレクトリの持ち主のものになり、持ち主だけが読める。
  `db-backup` は、このディレクトリのファイルを持ち主の権限で読み書きする。
- リポジトリの中には置かない。`git clean` などで消えるため。

### バックアップを取る

```sh
docker compose --env-file docker/.env exec db db-backup create
```

- 取ったファイルの名前（`sugumi-20261027T030000Z.dump` のような、UTC の日時）が出力される。
- サーバーが壊れたときに備え、別のサーバーやストレージにも写す。

### バックアップの一覧を出す

ファイル名と大きさを、古い順に出力する。

```sh
docker compose --env-file docker/.env exec db db-backup list
```

### バックアップを消す

ファイル名を 1 つ以上渡す。1 つでもないファイルや誤った名前があると、どれも消さない。

```sh
docker compose --env-file docker/.env exec db db-backup delete sugumi-20261027T030000Z.dump
```

### バックアップから復元する

1. 使うバックアップを、一覧から選ぶ。
   ほかの場所に写したものを使うときは、`BACKUP_DIR` に置く。
   新しいサーバーに復元するときは、先に「[手順](#手順)」で起動しておく。

2. アプリを止める。DB のテーブルを置き換えた後に、起動し直す必要があるため。

   ```sh
   docker compose --env-file docker/.env stop app
   ```

3. 復元する。今の DB のスキーマ `app` を消し、バックアップの内容で作り直す。
   - 先に、今の状態のバックアップを自動で取り、その名前を出力する。
     途中で失敗したときは、そのバックアップから自動で戻す。
   - アプリのテーブルがないバックアップ（アプリを起動する前に取ったものなど）は、データをすべて消してしまうので、復元しない。
   - 復元が始まった後は、Ctrl-C などで中断しても止まらない。途中で止めると、テーブルのない状態で残るため。

   ```sh
   docker compose --env-file docker/.env exec db db-backup restore sugumi-20261027T030000Z.dump
   ```

4. アプリを起動する。

   ```sh
   docker compose --env-file docker/.env start app
   ```

- バックアップを取ったときと同じか、新しいバージョンのアプリで起動する。
  新しいバージョンでは、足りないマイグレーションが起動時に適用される。
- バックアップを取った後のログアウト・パスワードの変更・アカウントの削除やロックも、取り消される。
  - 乗っ取りなどの後に復元したときは、盗まれたセッションや古いパスワードが、また使えるようになる。
  - その場合は、アプリを起動する前にセッションと覚えている端末を消す。必要なら、パスワードを変更してもらう。

    ```sh
    docker compose --env-file docker/.env exec db psql -U app -d app -c "DELETE FROM sessions" -c "DELETE FROM login_devices"
    ```
