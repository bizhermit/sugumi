#!/usr/bin/env bash
set -eu

cd "$(dirname "$0")"

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  c_reset=$'\033[0m'
  c_bold=$'\033[1m'
  c_dim=$'\033[2m'
  c_orange=$'\033[38;5;209m'
  c_yellow=$'\033[38;5;220m'
  c_cyan=$'\033[38;5;73m'
else
  c_reset='' c_bold='' c_dim='' c_orange='' c_yellow='' c_cyan=''
fi

info() {
  printf '%s✻%s %s\n' "${c_orange}${c_bold}" "${c_reset}" "$1"
}

warn() {
  printf '%s⚠%s %s\n' "${c_yellow}${c_bold}" "${c_reset}" "$1" >&2
}

code() {
  printf '%s%s%s' "${c_cyan}" "$1" "${c_reset}"
}

if ! git config --global --get-all safe.directory | grep -qx '/workspace'; then
  git config --global --add safe.directory /workspace
fi

if ! gh auth status </dev/null >/dev/null 2>&1; then
  warn "gh が未認証です。ターミナルでログインしてください。
  $(code 'gh auth login --git-protocol ssh')"
fi

# db-test はデータをメモリに置くので、起動するたびに空になる。テストの前に要るマイグレーションを、ここで適用する。
# 初期化の途中は Unix ソケットだけで待ち受けるので、TCP で受け付けるまで待つ。
if timeout 60 sh -c 'until pg_isready -q -d "$TEST_DATABASE_URL"; do sleep 1; done'; then
  if ! (cd .. && deno task migrate:test </dev/null >/dev/null); then
    warn "テスト用 DB へのマイグレーションに失敗しました。ターミナルで実行し、エラーを確認してください。
  $(code 'deno task migrate:test')"
  fi
else
  warn "テスト用 DB（db-test）が起動していません。起動したら、マイグレーションを適用してください。
  $(code 'deno task migrate:test')"
fi

if ! command -v claude >/dev/null 2>&1; then
  warn "claude コマンドが見つかりません。Claude Code のインストールを確認してください。"
else
  info "claude update を実行しています (更新がある場合は数分かかることがあります)"
  if ! timeout --foreground -k 5 300 claude update </dev/null; then
    warn "claude update が失敗またはタイムアウトしました。既存の版のまま続行します。"
  fi
  if unauthorized=$(timeout --foreground -k 5 30 claude mcp list </dev/null 2>/dev/null | grep 'Needs authentication'); then
    echo ''
    info "${c_bold}未認可の claude.ai コネクタがあります${c_reset}。使用する場合は認可してください"
    printf '%s%s%s\n' "${c_dim}" "${unauthorized}" "${c_reset}"
  fi
fi
