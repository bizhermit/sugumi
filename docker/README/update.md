# アプリの更新方法

[目次](index.md)

改修したアプリを、本番サーバーに反映する。すべてのサーバーを、同じタグのイメージに揃える。

## 前提条件

- 「[イメージのビルド方法](build.md)」で、反映するコミットのイメージをレジストリに置いてある。
- 必要なら、更新の前に DB バックアップを取る（「[DB バックアップの取得方法](backup.md#db-バックアップの取得方法)」）。

## 手順

各サーバーでは、`compose.yaml` を置いたディレクトリで行う（アプリサーバーは `/opt/myapp`、DB サーバーは `/opt/myapp-db`、ロードバランサーは `/opt/myapp-lb`）。

1. すべてのアプリサーバーで、アプリを止める。
   DB スキーマを変更している間や変更した後に、古いアプリが DB を使わないようにするため。

   ```sh
   docker compose --env-file docker/.env stop app
   ```

2. DB サーバーを更新する。
   1. [docker/db/compose.yaml](../db/compose.yaml) を、イメージをビルドしたのと同じコミットのものに置き換える。
      [docker/db/.env.example](../db/.env.example) に増えた値があれば、`.env` にも書く。
   2. `.env` の `IMAGE_TAG` を、新しいイメージのタグに書き換える。
   3. レジストリにログインする（「[イメージのビルド方法](build.md)」の手順の 2 と同じ）。
   4. イメージを取得し、再起動する。

      ```sh
      docker compose --env-file .env pull
      docker compose --env-file .env up -d
      ```

3. すべてのアプリサーバーで、ファイルとタグを新しくし、イメージを取得する。まだ起動しない。
   1. [compose.yaml](../../compose.yaml) を、イメージをビルドしたのと同じコミットのものに置き換える。
      [docker/.env.example](../.env.example) に増えた値があれば、`docker/.env` にも書く。
   2. `docker/.env` の `IMAGE_TAG` を、新しいイメージのタグに書き換える。
   3. レジストリにログインし（「[イメージのビルド方法](build.md)」の手順の 2 と同じ）、イメージを取得する。

      ```sh
      docker compose --env-file docker/.env pull
      ```

4. マイグレーションを実行するアプリサーバー（`DB_MIGRATOR_PASSWORD` を書いたサーバー）で、マイグレーションを実行する。

   ```sh
   docker compose --env-file docker/.env run --rm migrate
   ```

   - 適用したときは `マイグレーションを適用しました: 4 → 5` のように、なければ `適用するマイグレーションはありません: 5` と出る。
   - 1 つのトランザクションで適用するので、失敗したときは元のスキーマのまま残る。
     アプリは起動せず、「[マイグレーションに失敗した](troubleshooting.md#マイグレーションに失敗した)」を参照する。

5. すべてのアプリサーバーで、アプリを起動する。

   ```sh
   docker compose --env-file docker/.env up -d
   ```

6. ロードバランサーを、手順 2 と同じように更新する（`/opt/myapp-lb` で、[docker/lb/compose.yaml](../lb/compose.yaml)・[docker/lb/.env.example](../lb/.env.example) を使う）。

- 更新の間、アプリは止まる。
- アプリは起動時に、DB スキーマのバージョンが自身と同じかを確認し、違えば起動しない。
  マイグレーションを忘れると、`app` が再起動を繰り返す（「[アプリが再起動を繰り返す](troubleshooting.md#アプリが再起動を繰り返す)」）。
- DB のデータは、DB サーバーのボリュームに残る。DB コンテナを再起動しても消えない。
- DB のイメージ（[docker/db/Dockerfile](../db/Dockerfile)）の PostgreSQL のメジャーバージョンが変わる更新は、この手順ではできない。
  データの形式がメジャーバージョンごとに違うため。

## 確認方法

- 各サーバーで `docker compose --env-file .env ps`（アプリは `--env-file docker/.env`）を実行し、コンテナが動いていて、`db` が `healthy` になっている。
  `app` が再起動を繰り返しているときは、ログでエラーを確認する（「[アプリが再起動を繰り返す](troubleshooting.md#アプリが再起動を繰り返す)」）。
- 各サーバーで `docker compose --env-file .env images` を実行し、動いているイメージのタグが `IMAGE_TAG` と同じになっている。
- ブラウザで HTTPS の URL の `/login` を開くと、ログインの画面が出る。
