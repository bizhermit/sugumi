#!/bin/sh
# アプリが使う DB ユーザーと、スキーマ app を作る。
# - migrator：スキーマとテーブルを持ち、マイグレーション・バックアップ・復元（db-migrate・db-backup・db-restore）を行う。
# - app：アプリが常に接続するユーザー。テーブルの読み書きだけができ、テーブル・関数・トリガーを作ったり消したりできない。
# アプリを乗っ取られても、データの読み書きより先へは進めないようにするため。
# 管理者（POSTGRES_USER）でアプリが接続すると、COPY ... TO PROGRAM で DB のコンテナ上でコマンドを実行されたり、
# サーバーの設定を変えられたりするので、どちらも管理者とは分けている。
#
# パスワードは、POSTGRES_PASSWORD と同じく、*_FILE（ファイルのパス。compose の secrets 用）か、その名前の環境変数に指定する。
# app：APP_DB_PASSWORD_FILE か APP_DB_PASSWORD、migrator：MIGRATOR_DB_PASSWORD_FILE か MIGRATOR_DB_PASSWORD。
# 本番の migrator にはパスワードを付けない。DB のコンテナの中からだけ接続する（conf/pg_hba.conf）ので、要らないため。
# 開発と CI は、コンテナの外から migrator で接続してマイグレーションを適用するので、パスワードを付ける。
# このスクリプトは再実行されないので、パスワードを後から変えるときは、管理者で ALTER ROLE ... PASSWORD を実行する。
set -eu

# $1 の名前の環境変数か、$1_FILE のファイルからパスワードを読む
read_password() {
  file=$(printenv "$1_FILE" || true)
  if [ -n "$file" ]; then
    cat "$file"
  else
    printenv "$1" || true
  fi
}

app_password=$(read_password APP_DB_PASSWORD)
migrator_password=$(read_password MIGRATOR_DB_PASSWORD)
# app はパスワードが空だと、パスワード認証でログインできなくなるので、初期化を止める
if [ -z "$app_password" ]; then
  echo "app のパスワードがありません。APP_DB_PASSWORD か APP_DB_PASSWORD_FILE を指定してください" >&2
  exit 1
fi

# パスワードは psql の変数で渡し、:'...' で SQL のリテラルとしてクォートさせる
psql -v ON_ERROR_STOP=1 -v app_password="$app_password" -v migrator_password="$migrator_password" \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
-- 空の文字列を渡すと、パスワードなし（パスワード認証ではログインできない）になる
CREATE ROLE migrator LOGIN PASSWORD :'migrator_password';
CREATE ROLE app LOGIN PASSWORD :'app_password';
-- デフォルトでは、どのユーザーもすべての DB に接続でき、一時テーブルを作れる。
-- app はアプリの DB に接続するだけにし、一時テーブルも含めて、何も作れないようにする
REVOKE ALL ON DATABASE :"DBNAME" FROM PUBLIC;
REVOKE CONNECT ON DATABASE postgres, template1 FROM PUBLIC;
GRANT CONNECT ON DATABASE :"DBNAME" TO app;
-- migrator は、マイグレーションでスキーマを足せるようにする
GRANT CONNECT, CREATE ON DATABASE :"DBNAME" TO migrator;
CREATE SCHEMA app AUTHORIZATION migrator;
GRANT USAGE ON SCHEMA app TO app;
-- migrator がこれから作るテーブル・シーケンスを、app が読み書きできるようにする。スキーマを問わない。
-- 変えるときは、docker/db/bin/db-restore で戻す権限も揃える
ALTER DEFAULT PRIVILEGES FOR ROLE migrator GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app;
ALTER DEFAULT PRIVILEGES FOR ROLE migrator GRANT USAGE, SELECT ON SEQUENCES TO app;
-- ラージオブジェクトはスキーマに属さず、バックアップにも入らず、復元でも消えない。アプリは使わないので、作れないようにする
REVOKE EXECUTE ON FUNCTION lo_creat(integer), lo_create(oid), lo_from_bytea(oid, bytea) FROM PUBLIC;
ALTER ROLE app SET search_path = app;
ALTER ROLE migrator SET search_path = app;
SQL
