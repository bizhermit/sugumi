# DevContainer

このリポジトリを開発するための環境。VS Code の Dev Containers で開くと、開発用のコンテナと、開発用・テスト用の PostgreSQL が起動する。

前提条件：ホストに Docker と、VS Code の拡張機能 Dev Containers が入っている。

## 構成

[.devcontainer/compose.yaml](compose.yaml) で、次の 3 つのコンテナを起動する。

| コンテナ  | 内容                                                                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `dev`     | 開発で作業するコンテナ。Deno・Playwright（Chromium）・GitHub CLI・Claude Code が入っている。リポジトリを `/workspace` にマウントする |
| `db`      | 開発用の PostgreSQL（DB `app`）。データはボリューム `db-data` に置き、リビルドしても残る                                             |
| `db-test` | テスト用の PostgreSQL（DB `app_test`）。`deno task test` がテストのたびに空にする。データはメモリに置き、コンテナを止めると消える    |

- `db`・`db-test` は、本番と同じイメージ（[docker/db/](../docker/db/)）を使う。DB ユーザーの権限を本番と揃えるため。
  - TLS は使わない。ポートはホストに公開せず、`dev` からだけ接続できる。
- `dev` には sudo の権限がない。必要なときは、[Dockerfile](Dockerfile) の sudoers の行を有効にしてリビルドする。
- Claude Code と GitHub CLI のログインの状態は、ボリュームに置き、リビルドしても残る。

## 開発環境の構築方法

初めて使うときに行う。

1. [.devcontainer/.env.example](.env.example) を `.devcontainer/.env` にコピーする。`.env` がないと、コンテナが起動しない。
   値を変更するときは「[環境変数](#環境変数)」を参照。

   ```sh
   cp .devcontainer/.env.example .devcontainer/.env
   ```

2. VS Code でリポジトリを開き、コマンドパレットの「Dev Containers: Reopen in Container」を実行する。
   初回は、イメージのビルドに数分かかる。
3. 開発サーバーを起動する。先にマイグレーションが適用され、DB にテーブルが作成される。

   ```sh
   deno task dev
   ```

4. 別のターミナルで、ログインするアカウントを作成する。パスワードは入力を求められる。

   ```sh
   deno task account:add <ユーザー名> <表示名>
   ```

- GitHub CLI（`gh`）へのログインは任意。Claude Code などに PR の作成といった GitHub の操作をさせるときだけ、ターミナルでログインする。
  使わないなら、起動したときの `gh が未認証です` は無視してよい。

  ```sh
  gh auth login --git-protocol ssh
  ```

確認方法：ホストのブラウザで `http://localhost:3000/` を開くとログインの画面へ移り、作成したアカウントでログインできる。

- VS Code が `dev` のポート 3000 をホストへ転送する。
- `127.0.0.1` ではなく `localhost` で開く。Cookie に Secure を付けているので、ブラウザが安全とみなす `localhost` でないとログインできない。

## 環境変数

`.devcontainer/.env` に書いた値は、`dev` の環境変数になる。書かなければデフォルト値を使う。
変更したら、コマンドパレットの「Dev Containers: Rebuild Container」でリビルドする。

| 名前                                                    | 内容                                                                                                                                                                                        |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UID`・`GID`                                            | `dev` のユーザーの UID・GID（デフォルトは `1000`）。ホストのユーザー（`id -u`・`id -g`）と揃える。揃えないと、Linux・WSL では、コンテナで作成したファイルの所有者がホストのユーザーと異なる |
| `DATABASE_URL`                                          | 開発用 DB の接続先。デフォルトは `db` コンテナに、アプリと同じ DB ユーザー `app` で接続する                                                                                                 |
| `TEST_DATABASE_URL`                                     | テスト用 DB の接続先。デフォルトは `db-test` コンテナ。DB の名前は `_test` で終わらせる（テストは、それ以外の名前の DB を空にしない）                                                       |
| `MIGRATION_DATABASE_URL`・`TEST_MIGRATION_DATABASE_URL` | マイグレーション（`deno task migrate`・`test`）の接続先。開発用 DB・テスト用 DB に、スキーマを持つ DB ユーザー `migrator` で接続する                                                        |
| `APP_MODE`                                              | アプリのモード。`deno task dev`・`dev:mock`・`dev:prod` は、それぞれのモードを自分で設定するので、この値を使わない                                                                          |
| そのほかのアプリの値                                    | 待ち受けるポート・時間制限・セッション・ログイン制限など。意味とデフォルト値は [src/lib/env.ts](../src/lib/env.ts) を参照                                                                   |

## コンテナ内での Docker の利用

`dev` の `docker` コマンドは、ホストの Docker を使う（docker-outside-of-docker）。
本番イメージのビルド（「[イメージのビルド方法](../docker/README/build.md)」）も、`dev` の中でできる。

`docker` で作成したコンテナは、`dev` の中ではなく、ホストで `dev` と並んで動く。そのため、次のことに気を付ける。

- bind mount のパスは、ホストのパスで書く。`dev` の `/workspace` のパスは、ホストの Docker からは見えない。
  - リポジトリのホストのパスは、環境変数 `LOCAL_WORKSPACE_FOLDER` に入っている。
  - 例：`docker run -v "$LOCAL_WORKSPACE_FOLDER/docker/lb/nginx.conf:/etc/nginx/nginx.conf:ro" ...`
  - リポジトリの外のファイルは、`docker cp` でコンテナに渡す。
- コンテナが公開したポートは、`dev` の `localhost` ではなく、ホストで開く。`dev` からは `host.docker.internal` で接続する。
- 開発用・テスト用 DB コンテナの名前は、`<Compose のプロジェクト名>-db-1`・`<Compose のプロジェクト名>-db-test-1` になる。
  プロジェクト名はリポジトリのディレクトリの名前で決まるので、次のように調べる。

  ```sh
  project=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$HOSTNAME")
  docker exec -it "${project}-db-1" psql -U app -d app
  ```

## リビルドが必要な場合

次のときは、「Dev Containers: Rebuild Container」でリビルドする。

- `.devcontainer/` のファイル（`.env` を含む）を変更したとき。
- Playwright のバージョンを変更したとき（「[e2e/CLAUDE.md](../e2e/CLAUDE.md)」）。
  リビルドしないと、ブラウザを起動できない。

## 開発用 DB の初期化方法

開発用 DB のデータは、リビルドしても残る。最初からやり直したいときに行う。

1. `dev` のターミナルで、`db` のコンテナとボリュームを削除する。

   ```sh
   project=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$HOSTNAME")
   docker rm -f "${project}-db-1"
   docker volume rm "${project}_db-data"
   ```

2. 「Dev Containers: Rebuild Container」でリビルドする。`db` が空の状態で再作成される。
3. 「[開発環境の構築方法](#開発環境の構築方法)」の手順の 3 と 4 を行う。
