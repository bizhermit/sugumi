# ログ

[目次](index.md)

アプリは、1 行に 1 つの JSON でログを出し、ファイルには書かない。
同じサーバーの `log-forwarder`（Fluent Bit）がアプリのログを受け取り、`LOG_DESTINATION` の送信先へ送る。

- `cloudwatch`：CloudWatch Logs へ送る。
- `internal`：ログ用サーバー（[docker/log-server/](../log-server/)）へ送る。

どちらでも、次のことは同じ。

- 送信先に届くまでは、`log-forwarder` がディスク（ボリューム `log-buffer`）にためて送り直す。
  - 送信先が止まっても捨てない。ためる量の上限は `LOG_BUFFER_MAX_SIZE`（デフォルト `5G`）で、超えると古いものから捨てる。
- ログはすぐにアプリサーバーの外へ出る。アプリサーバーを乗っ取られても、送った監査ログは削除できない。
  - ただし、乗っ取られたサーバーからは、偽のログを送れる（「[ログを信用できる範囲](incident.md#ログを信用できる範囲)」）。
- 各行に、`server`（`SERVER_NAME`）と、`container_name`・`source`（`stdout`・`stderr`）が付く。
  - アプリサーバーが複数台になっても、どのサーバーのログか分かる。`SERVER_NAME` はサーバーごとに違う値にする。
  - JSON でない行（Deno が起動時に出す表示など）は、`log` に文字列のまま入る。
- `log-forwarder` はホストのネットワークで動き、`127.0.0.1:24224` だけで待ち受ける（Docker がホストから接続するため）。
  - アプリのコンテナからは届かない。
  - 同じサーバーのほかのプロセスからは送れるので、信頼できない OS のアカウントやサービスを同じサーバーに置かない。

## ログ送信先の設定方法

構築するとき、または送信先を変更するときに行う。設定値は「[ログ送信先の設定値](env.md#ログ送信先の設定値)」を参照。

<details>
<summary>CloudWatch Logs に送る場合（<code>LOG_DESTINATION='cloudwatch'</code>）</summary>

アプリサーバーを乗っ取られても送ったログを削除されないよう、サーバーに与える権限は書き込みだけに絞る。

1. 管理者が、ロググループを作成し、保存日数を決める。アプリサーバーには作成させない。

   ```sh
   aws logs create-log-group --log-group-name <ロググループ>
   aws logs put-retention-policy --log-group-name <ロググループ> --retention-in-days 90
   ```

2. アプリサーバー（EC2）に IAM ロールを付け、次の権限だけを与える。アクセスキーを `docker/.env` に書かない。
   - `logs:CreateLogStream`・`logs:PutLogEvents`
   - 対象は、そのロググループだけにする（`arn:aws:logs:<リージョン>:<アカウント>:log-group:<ロググループ>:*`）。
   - `logs:PutRetentionPolicy`・`logs:Delete*`・`logs:CreateLogGroup` は与えない。保存日数を縮めたりロググループを削除したりして、送ったログを削除されないようにするため。
   - サーバーごとに IAM ロールを分け、対象をそのサーバーのストリーム（`…:log-group:<ロググループ>:log-stream:<SERVER_NAME>`）に絞ると、
     乗っ取られたサーバーがほかのサーバーのストリームに書けなくなる。
3. インスタンスのメタデータを、IMDSv2 だけにし（`HttpTokens=required`）、レスポンスのホップ数（`HttpPutResponseHopLimit`）を 1 にする。
   - Amazon Linux 2023 の AMI などは、デフォルトのホップ数が 2 なので、必ず設定して確認する。

     ```sh
     aws ec2 modify-instance-metadata-options --instance-id <インスタンス> --http-tokens required --http-put-response-hop-limit 1
     aws ec2 describe-instances --instance-ids <インスタンス> --query 'Reservations[].Instances[].MetadataOptions'
     ```

   - `log-forwarder` はホストのネットワークで動くので、ホップ数 1 で届く。
   - アプリのコンテナからは届かない。ホップ数が 2 以上だと、アプリのコンテナを乗っ取られたときに IAM ロールの権限を使われる。
   - サーバーの root を取られると権限は使われるが、与えているのは書き込みの権限だけなので、送ったログは削除できない。
4. `docker/.env` に `LOG_DESTINATION='cloudwatch'` と `AWS_REGION`・`CLOUDWATCH_LOG_GROUP` を書く。
5. 監視のため、メトリクスフィルターと警報を作成する。例：`{ $.type = "audit" && $.event = "login_failed" }` の件数、`{ $.type = "error" }` の件数、ロググループの `IncomingLogEvents` が 0 になったこと。

確認方法：ロググループに、`SERVER_NAME` の名前のストリームができ、ログが届いている。

</details>

<details>
<summary>ログ用サーバーに送る場合（<code>LOG_DESTINATION='internal'</code>）</summary>

「[ログ用サーバー](log-server.md)」の手順で行う。

アクセスログなどは、ログ用サーバーで合計の上限を超えると古いものから削除する。
そのため、大量に送られると古いログが押し出される（「[古いログの自動削除](log-server.md#古いログの自動削除)」）。

</details>

## ログの調査方法

エラーの原因や、ログイン・リクエストの経緯を調べるときに行う。

そのサーバーの直近のログは、`docker compose --env-file docker/.env logs app` でも読める。
それより前のログは、送信先で読む。

<details>
<summary>CloudWatch Logs の場合</summary>

Logs Insights で、JSON の項目のまま絞り込める。

```
fields @timestamp, server, type, event, method, path, status
| filter requestId = "<requestId>"
```

</details>

<details>
<summary>ログ用サーバーの場合</summary>

ログは、ログ用サーバーのボリューム `myapp-log-server_logs` に、UTC の日付ごとのファイルで書かれる。読めるのは root（と `docker` グループに入っている OS のアカウント）だけ。

- `app-<日付>.jsonl`：`access`・`error`・`warning` など
- `audit-<日付>.jsonl`：`audit`
- 日付は、受け口が受け取った時刻で決まる（アプリが出した時刻は各行の `time`）。送り手に、過去の日付のファイルへ書かせないため。
- `app-*` は、書いているファイルが `LOG_FILE_MAX_SIZE` を超えると、gzip で圧縮して `<元の名前>.<分けた時刻>_<ランダムな文字>.gz` に移し、元の名前で書き直す。
  - 例：`app-2026-10-26.jsonl.20261026_113154_ba22e1c0.gz`。名前順に並べると古い順になる。
  - 名前の付け方は Fluent Bit が決めていて、変更できない。

`zgrep` は、圧縮したファイルとしていないファイルの両方を読める。

```sh
LOGS=$(docker volume inspect myapp-log-server_logs --format '{{ .Mountpoint }}')
sudo ls -l "$LOGS"
sudo zgrep -h '"requestId":"<requestId>"' "$LOGS"/app-2026-10-26.jsonl*
sudo zgrep -h '"sessionLogId":"<sessionLogId>"' "$LOGS"/audit-*
```

</details>

### 関連するログの追跡方法

リクエストの処理中に出たログには `requestId` が入る。エラーや監査ログのリクエストは、同じ `requestId` のアクセスログで探す。

`sessionLogId` は、1 回のログインごとに振る ID。アクセスログの `sessionLogId` と同じ値の `login_succeeded`
を探すと、そのリクエストがいつ・どの接続元からのログインによるものかが分かる。

## ログの種類と項目

`type` で種類を見分ける。

- `access`：1 リクエストにつき 1 行。静的ファイルも含む。標準出力に出す。
  - `durationMs` はレスポンスを返し始めるまでの時間で、レスポンスボディを送り終えるまでの時間は含まない。
  - `accountId`・`sessionLogId` はログイン中のときだけ出す。
- `audit`：ログイン・ログアウトなどの監査ログ。標準出力に出す。
- `error`：500・503 にした例外など。`error` にスタックトレースが入る。標準エラーに出す。
- `warning`：設定の不備など。標準エラーに出す。

クエリ文字列・Cookie・リクエストボディは出さない。ログイン後の戻り先やトークンが入るため。

`login_failed` の `username`（64 文字まで）には、ユーザーが誤ってパスワードを入力した値が入ることがある。ログを読める人を絞る。
