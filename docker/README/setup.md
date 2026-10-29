# 本番環境の構築方法

[目次](index.md)

本番サーバーを初めて用意するときに行う。
イメージはビルドサーバーで作り、ほかのサーバーはレジストリから取得して起動する。ビルドサーバー以外には、ソースを置かない。

## サーバー構成

| サーバー         | 数     | 起動するもの                                                     | 手順                                                  |
| ---------------- | ------ | ---------------------------------------------------------------- | ----------------------------------------------------- |
| ビルド           | 1      | （イメージをビルドするだけ）                                     | [イメージのビルド方法](build.md)                      |
| DB               | 1      | [docker/db/compose.yaml](../db/compose.yaml)（`db`・`db-proxy`） | [DB サーバー](db-server.md)                           |
| アプリ           | 1 以上 | [compose.yaml](../../compose.yaml)（`app`・`log-forwarder`）     | [アプリサーバーの構築方法](#アプリサーバーの構築方法) |
| ロードバランサー | 1      | [docker/lb/compose.yaml](../lb/compose.yaml)（`lb`）             | [ロードバランサー](load-balancer.md)                  |
| ログ用           | 0 か 1 | [docker/log-server/compose.yaml](../log-server/compose.yaml)     | [ログ用サーバー](log-server.md)                       |

- DB・アプリ・ロードバランサーを、1 つのサーバーにまとめてもよい（アプリサーバーが 1 台のときなど）。
  - DB の `DB_LISTEN_ADDRESS` は、`127.0.0.1` ではなく、そのサーバーのアドレスにする（「[DB サーバーの構築方法](db-server.md#db-サーバーの構築方法)」）。
  - アプリは `127.0.0.1` で待ち受け、ロードバランサーから `127.0.0.1:3000` へ振り分ける（「[接続元 IP アドレスの受け渡し](load-balancer.md#接続元-ip-アドレスの受け渡し)」）。
- アプリサーバーを複数にするなら、どのサーバーも同じ値（`SERVER_NAME`・`APP_LISTEN_ADDRESS` を除く）で用意する。

## 構築の順序

1. [イメージのビルド方法](build.md)。
2. ログ送信先を用意する（「[ログ送信先の設定方法](logs.md#ログ送信先の設定方法)」）。
3. [DB サーバーの構築方法](db-server.md#db-サーバーの構築方法)。
4. [アプリサーバーの構築方法](#アプリサーバーの構築方法)。アプリサーバーの数だけ繰り返す。
5. [ロードバランサーの構築方法](load-balancer.md#ロードバランサーの構築方法)。

## アプリサーバーの構築方法

前提条件：

- 「[イメージのビルド方法](build.md)」で、イメージをレジストリに置いてある。
- 「[DB サーバーの構築方法](db-server.md#db-サーバーの構築方法)」を終えている。
- アプリサーバーに Docker と Docker Compose が入っていて、レジストリから pull できる。

以降の例では、アプリサーバーの `/opt/myapp` に置く。ほかのページの、アプリサーバーのコマンドも、このディレクトリで実行する。

1. サーバーを隔離する。
   - アプリのポート（3000）は、ロードバランサーのアドレスからだけ受け付ける。
     ロードバランサーが同じサーバーにあり、アプリが `127.0.0.1` で待ち受けるなら、絞らなくてよい。
     - 絞り方は、DB サーバーと同じ（「[DB サーバーの構築方法](db-server.md#db-サーバーの構築方法)」の手順の 1）。
   - 公開 IP を持たせない。

2. ディレクトリを作成し、リポジトリの [compose.yaml](../../compose.yaml) と [docker/.env.example](../.env.example) を同じ構成で置く。
   イメージをビルドしたのと同じコミットのものを使う。

   ```sh
   sudo install -d -o "$USER" /opt/myapp
   install -d -m 700 /opt/myapp/docker
   ```

3. [docker/.env.example](../.env.example) を `docker/.env` にコピーし、値を書く。
   - 書く値は「[アプリサーバー（docker/.env）](env.md#アプリサーバーdockerenv)」を参照。
   - `IMAGE_PREFIX`・`IMAGE_TAG` は、「[イメージのビルド方法](build.md)」で指定したものにする。
   - `SERVER_NAME` は、アプリサーバーごとに違う値にする。

   ```sh
   cd /opt/myapp
   cp docker/.env.example docker/.env
   chmod 600 docker/.env
   ```

4. DB の CA 証明書（「[証明書の作成方法](db-server.md#証明書の作成方法)」の `ca.crt`）を、`docker/certs/db-ca.crt` に置く。
   アプリは root 以外のユーザーで動くので、誰でも読めるようにする（CA 証明書は秘密ではない）。

   ```sh
   install -d docker/certs
   install -m 644 ca.crt docker/certs/db-ca.crt
   ```

5. ログ用サーバーに送るなら、「[アプリサーバーの設定方法](log-server.md#アプリサーバーの設定方法)」の手順の 1 を行う。

6. レジストリにログインする（「[イメージのビルド方法](build.md)」の手順の 2 と同じ）。

7. 起動する。

   ```sh
   docker compose --env-file docker/.env up -d
   ```

- DB パスワードは、コンテナには環境変数ではなく `/run/secrets/` のファイルとして渡る。
- アプリサーバーには、スキーマを変更できる DB ユーザー（`migrator`）の資格情報を置かない。テーブルは、DB サーバーの構築時にマイグレーションで作成してある。

確認方法：

- `docker compose --env-file docker/.env ps` で、`app`・`log-forwarder` が動いている。
  `app` が再起動を繰り返しているときは、DB に接続できていないか、マイグレーションを実行していない（「[アプリが再起動を繰り返す](troubleshooting.md#アプリが再起動を繰り返す)」）。
- 動いているイメージの保存先とタグが、`docker/.env` の `IMAGE_PREFIX`・`IMAGE_TAG` と同じになっている。

  ```sh
  docker compose --env-file docker/.env images
  ```
- ロードバランサーを用意した後に、ブラウザで HTTPS の URL の `/login` を開くと、ログインの画面が出る。
- 監査ログの `remoteAddress` が自分のアドレスになる（「[接続元 IP アドレスの受け渡し](load-balancer.md#接続元-ip-アドレスの受け渡し)」の確認方法）。
- ログが送信先に届いている（「[ログの調査方法](logs.md#ログの調査方法)」）。
