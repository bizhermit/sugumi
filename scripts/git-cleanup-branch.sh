#!/usr/bin/env bash

set -euo pipefail

# gitリポジトリ外での実行を早期に検出する
# git リポジトリ外では後段の`git status --porcelain`が空出力を返し、「クリーン」と誤判定されたまま分かりにくい箇所で失敗する
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Error: 現在のディレクトリはgitリポジトリではありません。" >&2
  exit 1
fi

# 既定ブランチは`main`
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

# 作業ディレクトリがクリーンかチェックする
if [ -n "$(git status --porcelain)" ]; then
  echo "Warning: 現在の作業ディレクトリに変更があります。" >&2
  git status --short >&2

  # 非対話実行（VSCodeタスク・CI等で標準入力が端末でない）では問えないため、従来どおり中断する。
  if [ ! -t 0 ]; then
    echo "Error: 非対話実行のため中断します。" >&2
    exit 1
  fi

  # クリーンでなくても、対話実行なら続行可否を問う
  #（後段の switch / merge --ff-only は変更を上書きしそうな場合にgit自身が失敗するため、強制続行しても未コミットの変更は失われない）
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

# 削除対象ブランチ抽出
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
  # パイプ経由（... | while）だとwhileがサブシェルで実行され、ループ内での変数更新が外側に反映されなくなる
  while IFS= read -r branch; do
    # 空行対策
    if [ -n "$branch" ]; then
      echo "  - $branch"
      if ! is_safe_branch_name "$branch"; then
        echo "    処理できないブランチ名のため、処理をスキップします。" >&2
        has_delete_error=1
        continue
      fi

      # squashマージでは元のコミットが祖先に入らず`git branch -d`が拒否するため、履歴ではなく内容で判定する
      # 対象ブランチへマージしても木が変わらなければ、変更はすべて取り込み済みと見なす
      if ! merged_tree=$(git merge-tree --write-tree "$target_branch" "$branch" 2>/dev/null) \
        || [ "$merged_tree" != "$(git rev-parse "$target_branch^{tree}")" ]; then
        echo "    取り込まれていない変更があるため、処理をスキップします。" >&2
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
