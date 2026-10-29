# DB サーバー

[目次](index.md)

PostgreSQL を動かすサーバー。1 つだけ置き、すべてのアプリサーバーから TLS で接続する。
[docker/db/compose.yaml](../db/compose.yaml) で起動する。アプリサーバーと同じサーバーに置いてもよい。

- アプリサーバーからの接続は、転送役の `db-proxy`（[docker/db-proxy/nginx.conf](../db-proxy/nginx.conf)）が受け、DB のコンテナへそのまま流す。TLS は DB まで素通しにする。
  - DB のコンテナは、外へ通信できない Docker のネットワーク（`internal`）だけに置く。乗っ取られても、データを外へ送れない。
  - Docker では、ポートを公開するコンテナは外へも通信できてしまう。そのため、データを持たない `db-proxy` にポートを受け持たせている。
  - DB のログに出る接続元は、アプリサーバーではなく `db-proxy` のアドレスになる。

- DB ユーザーは、権限で 3 つに分けている（[docker/db/init/10-app-role.sh](../db/init/10-app-role.sh)）。

  | DB ユーザー | 権限                                           | 使う場面                                                    |
  | ----------- | ---------------------------------------------- | ----------------------------------------------------------- |
  | `admin`     | 管理者                                         | DB の初期化、パスワードの変更などの DB サーバーでの管理作業 |
  | `migrator`  | スキーマとテーブルを持つ。スキーマを作成できる | マイグレーション、DB バックアップの取得と復元               |
  | `app`       | テーブルの読み書きだけ                         | アプリ                                                      |

  アプリを乗っ取られても、テーブルや関数を作成・削除できず、被害はデータの読み書きに留まる。
- `db-proxy` を通しては、`app` だけが、TLS で、アプリの DB にだけ接続できる（[docker/db/conf/pg_hba.conf](../db/conf/pg_hba.conf)）。
- `migrator` と管理者は、コンテナの外から接続できない。マイグレーション・DB バックアップ・管理の作業は、DB サーバーで `docker compose exec` で行う。
  `migrator` にはパスワードがなく、アプリサーバーにはスキーマを変更できる資格情報を置かない。
- RDS などのマネージドな DB を使うなら、このページは使わない。
  [docker/db/init/10-app-role.sh](../db/init/10-app-role.sh) と同じ DB ユーザー・スキーマ・権限を作成し、アプリサーバーの `DB_HOST` と CA 証明書を、その DB のものにする。

## 証明書の作成方法

DB サーバーを用意するときと、証明書の期限（例では 825 日）が来る前に行う。
アプリサーバーとも DB サーバーとも別の、管理者の端末の作業ディレクトリ（リポジトリの外）で作成する。

```sh
umask 077
mkdir -p ~/myapp-db-ca && cd ~/myapp-db-ca
openssl req -x509 -newkey rsa:3072 -nodes -days 3650 -subj "/CN=myapp-db-ca" -keyout ca.key -out ca.crt
openssl req -newkey rsa:3072 -nodes -subj "/CN=db.example.internal" -keyout server.key -out server.csr
openssl x509 -req -days 825 -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -extfile <(printf "subjectAltName=DNS:db.example.internal") -out server.crt
```

- `db.example.internal` は、アプリサーバーの `DB_HOST` に書く名前にする。アプリは、証明書の名前が `DB_HOST` と同じかを確認する。
  - IP アドレスで接続するなら、`subjectAltName=IP:10.0.1.21` のようにする。
- `server.crt`・`server.key` を、DB サーバーの `certs/` に置く（「[DB サーバーの構築方法](#db-サーバーの構築方法)」の手順の 3）。置いたら、端末の `server.key` は削除する。
- `ca.crt` を、すべてのアプリサーバーの `docker/certs/db-ca.crt` に置く（「[アプリサーバーの構築方法](setup.md#アプリサーバーの構築方法)」）。
- `ca.key` は、どのサーバーにも置かず、端末の外（オフラインの保管場所など）で保管する。漏れると、偽の DB サーバーを作成できる。

## DB サーバーの構築方法

構築するときに 1 回だけ行う。

前提条件：「[イメージのビルド方法](build.md)」で、イメージをレジストリに置いてある。DB サーバーに Docker と Docker Compose が入っている。

1. サーバーを隔離する。
   - DB のポート（5432）は、アプリサーバーのアドレスからだけ受け付ける。
     - Docker が公開したポートへの通信は、ufw・firewalld などの INPUT の規則を通らない。
       クラウドのセキュリティグループ・ネットワーク ACL か、ホストの `DOCKER-USER` チェーンで絞る（「[ログ用サーバーの構築方法](log-server.md#ログ用サーバーの構築方法)」の例と同じ）。
   - 公開 IP を持たせない。

2. ディレクトリを作成し、リポジトリの [docker/db/compose.yaml](../db/compose.yaml) と [docker/db/.env.example](../db/.env.example) を置く。
   イメージをビルドしたのと同じコミットのものを使う。`.env.example` は `.env` にコピーし、値を書く（「[DB サーバー（.env）](env.md#db-サーバーenv)」）。

   ```sh
   sudo install -d -o "$USER" /opt/myapp-db
   cd /opt/myapp-db
   cp .env.example .env
   chmod 600 .env
   ```

   - `DB_LISTEN_ADDRESS` は、アプリサーバーから届くこのサーバーのアドレスにする。
     アプリサーバーと同じサーバーでも、`127.0.0.1` にはしない。アプリのコンテナからは、サーバーの `127.0.0.1` に届かないため。

3. 「[証明書の作成方法](#証明書の作成方法)」で作成した `server.crt`・`server.key` を、`certs/` に置く。
   鍵は、DB コンテナの PostgreSQL（イメージの中のユーザー ID 70）が読めて、ほかのユーザーが読めないようにする。

   ```sh
   install -d certs
   install -m 644 server.crt certs/server.crt
   sudo install -o root -g 70 -m 640 server.key certs/server.key
   ```

4. レジストリにログインする（「[イメージのビルド方法](build.md)」の手順の 2 と同じ）。

5. 起動する。初回は、DB ユーザー `app`・`migrator` とスキーマ `app` が作成される。
   テーブルは、手順の 6 のマイグレーションで作成される。

   ```sh
   docker compose --env-file .env up -d
   ```

6. マイグレーションを実行し、テーブルを作成する（「[マイグレーションの実行方法](migration.md#マイグレーションの実行方法)」）。

   ```sh
   docker compose --env-file .env exec db db-migrate
   ```

7. DB バックアップの保存先として、ほかのユーザーが読み書きできないディレクトリを作成する。
   `/opt/myapp-db` の中には置かない。使い方は「[DB バックアップ](backup.md)」を参照。

   ```sh
   sudo install -d -m 700 -o "$USER" /var/backups/myapp
   ```

- パスワードは、コンテナには環境変数ではなく `/run/secrets/` のファイルとして渡る。
- DB の初期化は、データのボリュームが空のときにだけ行われる。

確認方法：`docker compose --env-file .env ps` で、`db` が `healthy` になっている。アプリサーバーから接続できることは、アプリサーバーを用意したときに確認する。

## DB パスワードの変更方法

DB の初期化（パスワードの設定を含む）は、データのボリュームが空のときにだけ行われる。あとから変更するときは、次のようにする。

1. 管理者で、パスワードを変更する。入力を求められるので、新しいパスワードを入れる。

   ```sh
   docker compose --env-file .env exec db psql -U admin -d app -c '\password app'
   ```

   管理者は `\password admin` で変更する。`migrator` にはパスワードがない（コンテナの中からだけ接続する）。

2. DB サーバーの `.env` の `DB_APP_PASSWORD`（管理者なら `DB_ADMIN_PASSWORD`）を、新しい値に書き換える。

3. `app` のパスワードを変更したときは、すべてのアプリサーバーで、`docker/.env` の `DB_APP_PASSWORD` を書き換え、再起動する。

   ```sh
   docker compose --env-file docker/.env up -d --force-recreate app
   ```

確認方法：アプリサーバーで `docker compose --env-file docker/.env ps` を実行し、`app` が再起動を繰り返していない。
