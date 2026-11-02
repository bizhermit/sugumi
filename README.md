# Sugumi

Node.js + TypeScript + PostgreSQL のWebアプリケーションテンプレート

## 開発

環境構築は[DevContainer](.devcontainer/README.md)を参照。

| コマンド              | 説明                                                                    |
| --------------------- | ----------------------------------------------------------------------- |
| `npm run dev`         | 開発サーバーを起動する                                                  |
| `npm run check`       | 型チェック（tsc）を実行する                                             |
| `npm run lint`        | lint（oxlint）を実行する                                                |
| `npm run format`      | フォーマと（oxfmt）を実行する                                           |
| `npm test`            | テストを実行する                                                        |
| `npm run build:image` | 本番イメージを作成する。手順は[サーバー](deploy/server/README.md)を参照 |
