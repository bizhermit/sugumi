#!/bin/sh
# 受け口（receiver）が /logs に書いたファイルを、種類（app・audit）ごとに消す。1 分ごとに確かめる。
# - 保存日数（APP_DAYS・AUDIT_DAYS）を過ぎたファイル
# - 合計（APP_MAX_TOTAL_SIZE_MB・AUDIT_MAX_TOTAL_SIZE_MB）を超えた分を、最終更新が古いものから
# 上限を種類ごとに分けるのは、アクセスログを大量に出させて監査ログを消させないため。
set -eu

LOGS=/logs

for name in APP_DAYS AUDIT_DAYS APP_MAX_TOTAL_SIZE_MB AUDIT_MAX_TOTAL_SIZE_MB; do
  eval "value=\${$name:-}"
  case "$value" in
    '' | *[!0-9]*)
      echo "環境変数 $name は 0 以上の整数にしてください: $value" >&2
      exit 1
      ;;
  esac
done

warn() {
  printf '{"type":"warning","time":"%s","message":"%s"}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1"
}

# $1：種類（app・audit）、$2：保存日数、$3：合計の上限（MB）
clean() {
  find "$LOGS" -maxdepth 1 -type f -name "$1-*" -mtime +"$2" -delete
  limit_kb=$(($3 * 1024))
  # 受け口が書いているファイル。消すと、そのあとに書いた行も失われる
  current="$LOGS/$1-$(date -u +%Y-%m-%d).jsonl"
  while :; do
    # 名前順ではなく最終更新の順に並べる。名前順だと、書いているファイルが同じ日の分けたファイルより前に並ぶ
    files=$(find "$LOGS" -maxdepth 1 -type f -name "$1-*" | xargs -r ls -tr)
    [ -n "$files" ] || return 0
    # du -k はディスクの使用量を KB で数える。ディスクが埋まるかどうかは使用量で決まるため
    total_kb=$(echo "$files" | xargs du -k | awk '{ sum += $1 } END { print sum + 0 }')
    [ "$total_kb" -gt "$limit_kb" ] || return 0
    oldest=$(echo "$files" | grep -vxF "$current" | head -n 1)
    [ -n "$oldest" ] || return 0
    rm -f "$oldest"
    # 保存日数より前にログが消えたことに気づけるよう、消したことを出す
    warn "$1 のログの合計が $3 MB を超えたため、$(basename "$oldest") を消しました"
  done
}

while :; do
  clean app "$APP_DAYS" "$APP_MAX_TOTAL_SIZE_MB"
  clean audit "$AUDIT_DAYS" "$AUDIT_MAX_TOTAL_SIZE_MB"
  sleep 60
done
