#!/bin/sh
# アプリが使うDBユーザーとスキーマappを作る。
# - migrator: スキーマとテーブルを持ち、マイグレーション（src/migrate.ts）を実行する。
# - app: アプリが接続するユーザー。テーブルの読み書きだけができ、テーブルや関数を作ったり消したりできない。
#   アプリを乗っ取られても、データの読み書きより先へ進めないようにするため。
# 管理者（POSTGRES_USER）はDBの運用にだけ使い、アプリからは接続しない。
# パスワードはDB_APP_PASSWORDとDB_MIGRATOR_PASSWORDで渡す。
# このスクリプトは再実行されないので、パスワードを後から変えるときは管理者でALTER ROLE ... PASSWORDを実行する。
set -eu

if [ -z "${DB_APP_PASSWORD:-}" ] || [ -z "${DB_MIGRATOR_PASSWORD:-}" ]; then
  echo "DB_APP_PASSWORDとDB_MIGRATOR_PASSWORDを指定してください。" >&2
  exit 1
fi

# パスワードはpsqlの変数で渡し、:'...'でSQLのリテラルとしてクォートさせる。
psql -v ON_ERROR_STOP=1 -v app_password="$DB_APP_PASSWORD" -v migrator_password="$DB_MIGRATOR_PASSWORD" \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
CREATE ROLE migrator LOGIN PASSWORD :'migrator_password';
CREATE ROLE app LOGIN PASSWORD :'app_password';

-- 既定ではどのユーザーもすべてのDBに接続でき、publicスキーマに一時テーブルを作れる。
REVOKE ALL ON DATABASE :"DBNAME" FROM PUBLIC;
REVOKE CONNECT ON DATABASE postgres, template1 FROM PUBLIC;
GRANT CONNECT ON DATABASE :"DBNAME" TO app;
GRANT CONNECT, CREATE ON DATABASE :"DBNAME" TO migrator;

CREATE SCHEMA app AUTHORIZATION migrator;
GRANT USAGE ON SCHEMA app TO app;
-- migratorがこれから作るテーブルとシーケンスを、appが読み書きできるようにする。
ALTER DEFAULT PRIVILEGES FOR ROLE migrator GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app;
ALTER DEFAULT PRIVILEGES FOR ROLE migrator GRANT USAGE, SELECT ON SEQUENCES TO app;

ALTER ROLE app SET search_path = app;
ALTER ROLE migrator SET search_path = app;
SQL
