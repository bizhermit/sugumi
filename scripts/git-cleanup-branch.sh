#!/usr/bin/env bash

set -euo pipefail

# git リポジトリの外で実行されたことを、早めに検出する。
# リポジトリの外では、後の `git status --porcelain` が空の出力を返す。「変更なし」と誤って判定したまま、分かりにくい箇所で失敗する。
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Error: 現在のディレクトリは git リポジトリではありません。" >&2
  exit 1
fi

# デフォルトのブランチは `main`。
target_branch="${1:-main}"

is_safe_branch_name() {
  local name="$1"
  case "$name" in
    (""|-*) return 1 ;;
    (*[!A-Za-z0-9._/-]*) return 1 ;;
    (*) return 0 ;;
  esac
}

if ! is_safe_branch_name "$target_branch"; then
  echo "Error: 使用できないブランチ名です（$target_branch）" >&2
  exit 1
fi

# 作業ディレクトリに変更がないかを確かめる。
if [ -n "$(git status --porcelain)" ]; then
  echo "Warning: 現在の作業ディレクトリに変更があります。" >&2
  git status --short >&2

  # 非対話の実行（VS Code のタスクや CI など、標準入力が端末でないとき）では確認できないので、中断する。
  if [ ! -t 0 ]; then
    echo "Error: 非対話の実行なので中断します。" >&2
    exit 1
  fi

  # 変更があっても、対話の実行なら続けるかどうかを尋ねる。
  # 後の switch や merge --ff-only は、変更を上書きしそうなときに git 自身が失敗するので、続けてもコミットしていない変更は失われない。
  read -r -p "コミットしていない変更を残したまま実行しますか？ [y/N]: " force_answer || force_answer=""
  case "$force_answer" in
    (y|Y|yes|YES) echo "続行します。" ;;
    (*)
      echo "中止しました。" >&2
      exit 1
      ;;
  esac
fi

echo "ブランチを変更します: $target_branch"

git fetch --prune

remote_target_branch="origin/$target_branch"

if ! git show-ref --verify --quiet "refs/remotes/$remote_target_branch"; then
  echo "Error: リモートブランチ（$remote_target_branch）が存在しません。" >&2
  exit 1
fi

if git show-ref --verify --quiet "refs/heads/$target_branch"; then
  git switch -- "$target_branch"
else
  echo "リモートブランチからローカルに追跡ブランチを作成しています..."
  git switch --track -c "$target_branch" -- "$remote_target_branch"
fi

git merge --ff-only "$remote_target_branch"

# 削除するブランチを探す。
if ! gone_branches=$(
  git for-each-ref --format '%(refname:short) %(upstream:track)' refs/heads \
  | awk '$2 == "[gone]" {print $1}'
); then
  echo "Error: ローカルブランチの一覧が取得できませんでした。" >&2
  exit 1
fi

has_delete_error=0

if [ -z "$gone_branches" ]; then
  echo
  echo "削除対象のブランチは存在しません。"
else
  echo
  echo "削除対象のブランチ:"
  # パイプ（... | while）でつなぐと while がサブシェルで実行され、ループの中で変数を更新しても外側に反映されない。
  while IFS= read -r branch; do
    # 空行を飛ばす。
    if [ -n "$branch" ]; then
      echo "  - $branch"
      if ! is_safe_branch_name "$branch"; then
        echo "    処理できないブランチ名なので、スキップします。" >&2
        has_delete_error=1
        continue
      fi

      # squash マージでは元のコミットが祖先に入らず、`git branch -d` が削除を拒否する。そのため、履歴ではなく内容で判定する。
      # 対象のブランチへマージしてもツリーが変わらなければ、変更はすべて取り込み済みとみなす。
      if ! merged_tree=$(git merge-tree --write-tree "$target_branch" "$branch" 2>/dev/null) \
        || [ "$merged_tree" != "$(git rev-parse "$target_branch^{tree}")" ]; then
        echo "    取り込まれていない変更があるので、スキップします。" >&2
        continue
      fi

      if ! git branch -D -- "$branch"; then
        echo "    削除に失敗しました。" >&2
        has_delete_error=1
      fi
    fi
  done <<< "$gone_branches"
fi

echo
if [ "$has_delete_error" -ne 0 ]; then
  echo "削除に失敗したブランチがあります。" >&2
  echo
  exit 1
fi

echo "完了しました。"
echo
