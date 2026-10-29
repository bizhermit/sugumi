#!/bin/sh
# nginx のイメージが起動時に実行する（/docker-entrypoint.d/）。失敗すると起動しない。
# LB_SERVER_NAME がないと、templates/ の ${LB_SERVER_NAME} が展開されずに残り、どのホスト名も受け付けないまま起動してしまう。
set -eu

if [ -z "${LB_SERVER_NAME:-}" ]; then
  echo "LB_SERVER_NAME を指定してください" >&2
  exit 1
fi
