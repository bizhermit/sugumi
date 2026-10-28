# 乗っ取られた後の復旧方法

[目次](index.md)

アプリやサーバーを乗っ取られた、またはその疑いがあるときに行う。

## ログを信用できる範囲

乗っ取られたサーバーからは、偽のログを送れる。共有鍵や IAM ロールは全サーバーで同じため、ほかのサーバーの名前（`server`）でも送れる。
乗っ取られた時点より後の、全サーバーのログを信用しない。乗っ取られる前に送ったログは、削除されていない（「[ログ](logs.md)」）。

## 乗っ取られる前のバックアップからの復元方法

乗っ取られたアプリ（DB ユーザー `app`）にできるのは、データの読み書きと、`app` 自身の設定やパスワードの変更だけ。テーブルや関数は作成できない。
そのため、ふつうの復元（「[DB バックアップからの復元方法](backup.md#db-バックアップからの復元方法)」）に、`app` の設定とパスワードを元に戻す手順を加える。

マイグレーションを実行するアプリサーバー（`DB_MIGRATOR_PASSWORD` を置いたサーバー）の OS まで乗っ取られたときは、`migrator` も乗っ取られたとみなす。
`migrator` は関数なども作成できるが、復元で `migrator` のスキーマはすべて作り直される。手順の 2・3 で、`migrator` も元に戻す。

前提条件：乗っ取られる前に取ったバックアップがある（「[DB バックアップ一覧の確認方法](backup.md#db-バックアップ一覧の確認方法)」）。

手順の 2〜6 は DB サーバーの `/opt/myapp-db` で、1・7 はすべてのアプリサーバーの `/opt/myapp` で行う。

1. すべてのアプリサーバーで、アプリを止める。

   ```sh
   docker compose --env-file docker/.env stop app
   ```

2. 管理者で、`app` の設定を元に戻す。
   管理者で実行するのは、ユーザーのコードが動かない、次のコマンドだけにする。

   ```sh
   docker compose --env-file .env exec db psql -U admin -d app -v ON_ERROR_STOP=1 --quiet \
     -c "ALTER ROLE app RESET ALL" -c "ALTER ROLE app IN DATABASE app RESET ALL" -c "ALTER ROLE app SET search_path = app"
   ```

   - `app` は、どの DB にも効く設定と、この DB だけに効く設定の両方を変更できるので、両方を元に戻す。
   - `migrator` も乗っ取られたときは、`migrator` の設定とデフォルトの権限も元に戻す。
     デフォルトの権限は、復元で作り直すテーブルなどに付くので、広げられたままだと乗っ取りが続く。
     違ったまま復元しようとすると、`db-restore` が失敗する。

     ```sh
     docker compose --env-file .env exec db psql -U admin -d app -v ON_ERROR_STOP=1 --quiet \
       -c "ALTER ROLE migrator RESET ALL" -c "ALTER ROLE migrator IN DATABASE app RESET ALL" \
       -c "ALTER ROLE migrator SET search_path = app" \
       -c "ALTER DEFAULT PRIVILEGES FOR ROLE migrator REVOKE ALL ON TABLES FROM PUBLIC, app" \
       -c "ALTER DEFAULT PRIVILEGES FOR ROLE migrator REVOKE ALL ON SEQUENCES FROM PUBLIC, app" \
       -c "ALTER DEFAULT PRIVILEGES FOR ROLE migrator REVOKE ALL ON FUNCTIONS FROM PUBLIC, app" \
       -c "ALTER DEFAULT PRIVILEGES FOR ROLE migrator REVOKE ALL ON TYPES FROM PUBLIC, app" \
       -c "ALTER DEFAULT PRIVILEGES FOR ROLE migrator REVOKE ALL ON SCHEMAS FROM PUBLIC, app" \
       -c "ALTER DEFAULT PRIVILEGES FOR ROLE migrator REVOKE ALL ON LARGE OBJECTS FROM PUBLIC, app" \
       -c "ALTER DEFAULT PRIVILEGES FOR ROLE migrator GRANT EXECUTE ON FUNCTIONS TO PUBLIC" \
       -c "ALTER DEFAULT PRIVILEGES FOR ROLE migrator GRANT USAGE ON TYPES TO PUBLIC" \
       -c "ALTER DEFAULT PRIVILEGES FOR ROLE migrator GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app" \
       -c "ALTER DEFAULT PRIVILEGES FOR ROLE migrator GRANT USAGE, SELECT ON SEQUENCES TO app"
     ```

   - スキーマに属さず、復元で消えないもの（ラージオブジェクト・パブリケーション）が残っていないか確認する。
     アプリは使わないので、どちらも 0 件になる。あれば、`lo_unlink(<oid>)`・`DROP PUBLICATION <名前>` で削除する。

     ```sh
     docker compose --env-file .env exec db psql -U admin -d app \
       -c "SELECT count(*) FROM pg_largeobject_metadata" -c "SELECT pubname FROM pg_publication"
     ```

3. `app` のパスワードを変更する（「[DB パスワードの変更方法](db-server.md#db-パスワードの変更方法)」の手順の 1・2）。
   アプリサーバーの `docker/.env` の `DB_APP_PASSWORD` も書き換える。アプリはまだ起動しない（手順の 7 で起動する）。
   `migrator` も乗っ取られたときは、`migrator` のパスワードも変更する（同じ節の手順の 4）。

4. 残っている `app`・`migrator` の接続を切る。パスワードを変えても、すでにある接続は切れないため。

   ```sh
   docker compose --env-file .env exec db psql -U admin -d app \
     -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename IN ('app', 'migrator')"
   ```

5. 乗っ取られる前のバックアップから復元する。

   ```sh
   docker compose --env-file .env exec -T db db-restore < /var/backups/myapp/20261027T030000Z.dump
   ```

6. セッション・覚えている端末・アプリの鍵を削除する。
   盗まれたセッションや、乗っ取りの間に読まれた鍵が、復元でまた使えるようになるため。
   アプリの鍵は、アプリの起動時に再作成される。

   ```sh
   docker compose --env-file .env exec db psql -U app -d app \
     -c "DELETE FROM sessions" -c "DELETE FROM login_devices" -c "DELETE FROM secrets"
   ```

7. すべてのアプリサーバーで、アプリを再起動する。新しいパスワードを読み込むため、`start` ではなく再作成する。

   ```sh
   docker compose --env-file docker/.env up -d --force-recreate app
   ```

8. 必要なら、利用者にパスワードを変更してもらう。

確認方法：手順の 2・5・6 でエラーが出ず、アプリを起動した後にログインできる。
