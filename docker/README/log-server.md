# ログ用サーバー

[目次](index.md)

ログを CloudWatch Logs ではなく、自分で用意したサーバーに置くときに使う。アプリサーバーとは別のサーバーに置く。
[docker/log-server/](../log-server/) に、受け口（`receiver`）と、古いファイルを削除する `log-cleaner`（「[古いログの自動削除](#古いログの自動削除)」）がある。

アプリサーバーの `log-forwarder` は、TLS で暗号化し、共有鍵で認証してログを送るだけで、ログ用サーバーのファイルを読んだり、指定して削除したりできない。

用意するときは、次の順に行う。

1. [証明書の作成方法](#証明書の作成方法)
2. [ログ用サーバーの構築方法](#ログ用サーバーの構築方法)
3. [アプリサーバーの設定方法](#アプリサーバーの設定方法)

ログの読み方は「[ログの調査方法](logs.md#ログの調査方法)」を参照。

## 証明書の作成方法

アプリサーバーとログ用サーバー以外の、管理者の端末の作業ディレクトリ（リポジトリの外）で作成する。
`log.example.internal` は、アプリサーバーから接続するホスト名（`LOG_SERVER_HOST`）にする。IP アドレスで接続するなら `DNS:` を `IP:` にする。

```sh
mkdir -p ~/myapp-log-ca && cd ~/myapp-log-ca
umask 077
openssl req -x509 -newkey rsa:3072 -nodes -days 3650 -subj "/CN=myapp-log-ca" -keyout ca.key -out ca.crt
openssl req -newkey rsa:3072 -nodes -subj "/CN=log.example.internal" -keyout server.key -out server.csr
openssl x509 -req -days 825 -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -extfile <(printf "subjectAltName=DNS:log.example.internal") -out server.crt
```

- `server.crt`・`server.key` を、ログ用サーバーの `docker/log-server/certs/` に置く。置いたら、端末の `server.key` は削除する。
- `ca.crt` を、アプリサーバーの `docker/log-forwarder/certs/log-server-ca.crt` に置く（「[アプリサーバーの設定方法](#アプリサーバーの設定方法)」）。
- `ca.key` は、どのサーバーにも置かず、端末の外（オフラインの保管場所など）で保管する。漏れると、偽のログ用サーバーを作成できる。
- ログ用サーバーの証明書はイメージに入れるので、差し替えたら `--build` を付けて再起動する。
  ログ用サーバーのイメージには秘密鍵が入るので、レジストリへ push しない。
- [.gitignore](../../.gitignore) は `*.key`・`*.csr`・`*.srl` を除外しているが、リポジトリの中では作成しない。

## ログ用サーバーの構築方法

1. サーバーを外部から隔離する。
   - 公開 IP を持たせない。
   - 受け口のポート（`LOG_SERVER_PORT`）は、アプリサーバーのアドレスからだけ受け付ける。
     - Docker が公開したポートへの通信は、ufw・firewalld などの INPUT の規則を通らない。そのため、それらでは絞れない。
     - クラウドのセキュリティグループ・ネットワーク ACL か、ホストの `DOCKER-USER` チェーンで絞る。

       ```sh
       sudo iptables -I DOCKER-USER -p tcp -m conntrack --ctdir ORIGINAL --ctorigdstport <LOG_SERVER_PORT> ! -s <アプリサーバーの範囲> -j DROP
       ```

       `--ctdir ORIGINAL` を付けないと、受け口が返すパケットも止めてしまい、アプリサーバーからもつながらない。

       iptables の規則は再起動で消えるので、`iptables-persistent` などで残す。
     - サーバーに複数のネットワークがあるなら、`LOG_SERVER_LISTEN_ADDRESS` でアプリサーバー側のアドレスだけで待ち受ける。
   - SSH などの管理は、管理用のネットワークか VPN からだけ受け付ける。
   - アプリサーバーと別のネットワーク（クラウドと拠点など）に置くなら、VPN などでつなぐ。受け口をインターネットに公開しない。
   - 入れる人を、アプリサーバーを管理する人と分けられるとよい。両方を管理できる人のアカウントを乗っ取られると、痕跡ごと削除されてしまう。
2. 「[証明書の作成方法](#証明書の作成方法)」で作成した `server.crt`・`server.key` を、`docker/log-server/certs/` に置く。
3. `.env` を作成し、値を書く（「[環境変数](#環境変数)」）。
   - `LOG_SERVER_SHARED_KEY` は、`openssl rand -hex 32` などで作成した長いランダムな値にする。アプリサーバーと同じ値を使う。

   ```sh
   cd docker/log-server
   cp .env.example .env
   chmod 600 .env
   ```

4. 起動する。

   ```sh
   docker compose --env-file .env up -d --build
   ```

## アプリサーバーの設定方法

アプリサーバーの、`compose.yaml` を置いたディレクトリで行う。

1. 「[証明書の作成方法](#証明書の作成方法)」で作成した `ca.crt` を、`docker/log-forwarder/certs/log-server-ca.crt` に置く。
   `log-forwarder` は root 以外のユーザーで動くので、誰でも読めるようにする（CA 証明書は秘密ではない）。

   ```sh
   install -d docker/log-forwarder/certs
   install -m 644 ca.crt docker/log-forwarder/certs/log-server-ca.crt
   ```

2. `docker/.env` に `LOG_DESTINATION='internal'` と `LOG_SERVER_HOST`・`LOG_SERVER_SHARED_KEY` を書く。
3. 再起動する。

   ```sh
   docker compose --env-file docker/.env up -d
   ```

確認方法：ログ用サーバーで、その日の `app-<日付>.jsonl` にアプリのログが書かれている（「[ログの調査方法](logs.md#ログの調査方法)」）。

## 古いログの自動削除

`log-cleaner` が 1 分ごとに確認する。

- 保存日数（`LOG_APP_RETENTION_DAYS`・`LOG_AUDIT_RETENTION_DAYS`）を過ぎたファイルを削除する。
- `app-*` は、合計が `LOG_APP_MAX_TOTAL_SIZE_MB` を超えた分を、最終更新が古いファイルから削除する。
  - 受け口が書いている今日のファイルは削除しない。
  - 上限で削除すると、保存日数より前にログが消える。そのときは `log-cleaner` のログに `warning` が出る（`docker compose --env-file .env logs log-cleaner`）。
  - 確認するのは 1 分ごとなので、その間に流れ込んだ分だけ一時的に上限を超える。
- `audit-*` は、合計が `LOG_AUDIT_WARN_TOTAL_SIZE_MB` を超えても削除せず、1 時間ごとに `warning` を出す。
  - 共有鍵を持つ送り手（乗っ取られたアプリサーバーを含む）が、大量に送るだけで過去の監査ログを削除できないようにするため。
  - 警告が出たら、ディスクの空きを確認し、必要ならディスクを増やすか、保存日数を見直す。

ディスクの空きは、`LOG_APP_MAX_TOTAL_SIZE_MB` と監査ログの量の合計より十分大きくする。受け口が書けない間にためる分（ボリューム `myapp-log-server_buffer`）の余裕も残す。
ディスクの使用量を見張り、埋まる前に気づけるようにする。ディスクが埋まると、新しいログを書けなくなる。

## 環境変数

`docker/log-server/.env` に書く。

| 名前                           | 必須 | 内容                                                                             |
| ------------------------------ | ---- | -------------------------------------------------------------------------------- |
| `LOG_SERVER_NAME`              | ○    | ログ用サーバーの名前。共有鍵での認証に使う                                       |
| `LOG_SERVER_SHARED_KEY`        | ○    | アプリサーバーと揃える共有鍵                                                     |
| `LOG_SERVER_LISTEN_ADDRESS`    |      | 受け口が待ち受けるアドレス（`0.0.0.0`）                                          |
| `LOG_SERVER_PORT`              |      | 受け口のポート（`24224`）                                                        |
| `LOG_FILE_MAX_SIZE`            |      | `app-*` のファイル 1 つの大きさの上限。超えると分ける（`100M`）                  |
| `LOG_APP_RETENTION_DAYS`       |      | `app-*` のファイルを残す日数（`90`）                                             |
| `LOG_AUDIT_RETENTION_DAYS`     |      | `audit-*` のファイルを残す日数（`90`）                                           |
| `LOG_APP_MAX_TOTAL_SIZE_MB`    |      | `app-*` のファイルの合計の上限（MB）。超えたら古いものから削除する（`51200`）    |
| `LOG_AUDIT_WARN_TOTAL_SIZE_MB` |      | `audit-*` のファイルの合計がこれを超えたら警告を出す（MB）。削除しない（`5120`） |
