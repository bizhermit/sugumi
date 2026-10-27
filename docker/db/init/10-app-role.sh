#!/bin/sh
# アプリが接続するユーザー app と、app が持つスキーマ app を作る。
# アプリが管理者（POSTGRES_USER）で接続していると、乗っ取られたときに COPY ... TO PROGRAM で
# DB のコンテナ上でコマンドを実行されたり、サーバーの設定を変えられたりする。そのため、権限を分ける。
# app はスキーマ app の中だけでテーブルを作り変えられ、マイグレーションもその権限で行う。
#
# app のパスワードは、POSTGRES_PASSWORD と同じく、APP_DB_PASSWORD_FILE（ファイルのパス。compose の secrets 用）か
# APP_DB_PASSWORD に指定する。このスクリプトは再実行されないので、パスワードを後から変えるときは、
# 管理者で ALTER ROLE app PASSWORD ... を実行する。
set -eu

if [ -n "${APP_DB_PASSWORD_FILE:-}" ]; then
  app_password=$(cat "$APP_DB_PASSWORD_FILE")
else
  app_password=${APP_DB_PASSWORD:?APP_DB_PASSWORD か APP_DB_PASSWORD_FILE を指定してください}
fi
# パスワードが空だと、app がパスワード認証でログインできなくなるので、初期化を止める
if [ -z "$app_password" ]; then
  echo "app のパスワードが空です" >&2
  exit 1
fi

# パスワードは psql の変数で渡し、:'...' で SQL のリテラルとしてクォートさせる
psql -v ON_ERROR_STOP=1 -v app_password="$app_password" \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
CREATE ROLE app LOGIN PASSWORD :'app_password';
-- デフォルトではどのユーザーもすべての DB に接続できるので、app はアプリの DB にだけ接続できるようにする
REVOKE ALL ON DATABASE :"DBNAME" FROM PUBLIC;
REVOKE CONNECT ON DATABASE postgres, template1 FROM PUBLIC;
GRANT CONNECT ON DATABASE :"DBNAME" TO app;
CREATE SCHEMA app AUTHORIZATION app;
ALTER ROLE app SET search_path = app;
SQL
