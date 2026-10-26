#!/bin/sh
# 受け口（receiver）が /logs に書いたファイルを、1 分ごとに確かめる。
# - 保存日数（APP_DAYS・AUDIT_DAYS）を過ぎたファイルを消す。
# - app-* は、合計が APP_MAX_TOTAL_SIZE_MB を超えた分を、最終更新が古いものから消す。
# - audit-* は、合計が AUDIT_WARN_TOTAL_SIZE_MB を超えても消さず、警告だけを出す。
#   共有の鍵を持つ送り手（乗っ取られたアプリのサーバーを含む）が、量を送るだけで過去の監査ログを消させられないようにするため。
set -eu

LOGS=/logs
# 監査ログの警告を出し直すまでの秒数。超えている間、1 分ごとに出し続けないようにする
WARN_INTERVAL_SECONDS=3600

for name in APP_DAYS AUDIT_DAYS APP_MAX_TOTAL_SIZE_MB AUDIT_WARN_TOTAL_SIZE_MB; do
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

# $1：種類（app・audit）。そのファイルを、最終更新が古い順に 1 行ずつ出す。
# ls を 1 回で呼ぶ。find | xargs ls にすると、ファイルが多いときに ls が何回かに分かれ、全体が古い順にならない。
# 名前は受け口が決めた形（空白や改行を含まない）のため、ls の出力を行ごとに扱える
oldest_first() {
  ls -tr "$LOGS" 2>/dev/null | grep "^$1-" || true
}

# $1：種類（app・audit）。合計のディスクの使用量を KB で出す。ディスクが埋まるかどうかは使用量で決まるため。
# 合計は並び順によらないため、ここは xargs で du が何回かに分かれてもよい
total_kb() {
  (cd "$LOGS" && oldest_first "$1" | xargs -r du -k 2>/dev/null) | awk '{ sum += $1 } END { print sum + 0 }'
}

# 確かめている間に、受け口がファイルを圧縮して名前を変えることがある。消えたファイルの失敗では止めず、次の回に回す
remove_expired() {
  find "$LOGS" -maxdepth 1 -type f -name "$1-*" -mtime +"$2" -delete 2>/dev/null || true
}

limit_app() {
  limit_kb=$((APP_MAX_TOTAL_SIZE_MB * 1024))
  # 受け口が書いているファイル。消すと、そのあとに書いた行も失われる
  current="app-$(date -u +%Y-%m-%d).jsonl"
  total=$(total_kb app)
  [ "$total" -gt "$limit_kb" ] || return 0
  # 消すたびに数え直すと、多くのファイルを消すときに遅いため、消した分を引いていく
  oldest_first app | grep -vxF "$current" | while read -r file; do
    [ "$total" -gt "$limit_kb" ] || break
    size=$(du -k "$LOGS/$file" 2>/dev/null | cut -f 1)
    rm -f "$LOGS/$file"
    total=$((total - ${size:-0}))
    # 保存日数より前にログが消えたことに気づけるよう、消したことを出す
    warn "app のログの合計が $APP_MAX_TOTAL_SIZE_MB MB を超えたため、$file を消しました"
  done
}

last_audit_warning=0
warn_audit() {
  [ "$(total_kb audit)" -gt $((AUDIT_WARN_TOTAL_SIZE_MB * 1024)) ] || return 0
  now=$(date +%s)
  [ $((now - last_audit_warning)) -ge "$WARN_INTERVAL_SECONDS" ] || return 0
  last_audit_warning=$now
  warn "audit のログの合計が $AUDIT_WARN_TOTAL_SIZE_MB MB を超えています。消さないため、ディスクの空きを確かめてください"
}

while :; do
  remove_expired app "$APP_DAYS"
  remove_expired audit "$AUDIT_DAYS"
  limit_app
  warn_audit
  sleep 60
done
