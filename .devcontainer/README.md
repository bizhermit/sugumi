# DevContainer

## 前提条件

- Dockerがインストール済みであること（`docker compose`が実行可能であること）
- [Visual Studio Code（VSCode）](https://code.visualstudio.com/download)がインストール済みであること
- VSCodeに拡張機能「[Dev Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)」が追加されていること

## 構成

| コンテナ | 内容               |
| -------- | ------------------ |
| `dev`    | 開発作業用コンテナ |

## セットアップ方法

1. 環境変数ファイル（`.devcontainer/.env`）を[.env.example](.env.example)から作成する

   ```bash
   cp .devcontainer/.env.example .devcontainer/.env
   ```

2. 環境変数ファイルの値を適宜設定する

   | キー  |           必須           | 説明          |
   | ----- | :----------------------: | ------------- |
   | `UID` | LinuxまたはWSL使用時のみ | ホストの`UID` |
   | `GID` | LinuxまたはWSL使用時のみ | ホストの`GID` |

   **UID/GIDの調べ方**
   ```bash
   # UID
   id -u

   # GID
   id -g
   ```

3. VSCodeでリポジトリを開き、コマンドパレットの「Dev Containers: Reopen in Container」を実行する

## その他

### GitHub CLI ログイン方法

ターミナルで以下のコマンドを実行する。

```bash
gh auth login --git-protocol ssh
```

※ ログイン情報はボリュームに残り、リビルドしても消えない

### Claude Code ログイン方法

ターミナルで以下のコマンドを実行する。

```bash
claude
```

※ ログイン情報はボリュームに残り、リビルドしても消えない

### `.devcontainer/`のファイルを変更した場合

コマンドパレットの「Dev Containers: Rebuild Container」で開発コンテナを作成し直す。
