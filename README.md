# Sugumi

Node.js + TypeScript + PostgreSQL のWebアプリケーションテンプレート

## 開発

環境構築は[DevContainer](.devcontainer/README.md)を参照。

| コマンド              | 説明                                                                          |
| --------------------- | ----------------------------------------------------------------------------- |
| `npm run dev`         | 開発サーバーを起動する。                                                      |
| `npm run build`       | ソースをビルドする。（サーバーサイド: `tsc`, クライアントサイド: `esbuild`）  |
| `npm run start`       | サーバーを起動する。（事前にビルドする必要あり）                              |
| `npm run check`       | 型チェック（tsc）を実行する。                                                 |
| `npm run lint`        | lint（oxlint）を実行する。`npm run lint:fix`で自動修正を実行する。            |
| `npm run format`      | フォーマット（oxfmt）を実行する。チェックのみの場合は`npm run format:check`。 |
| `npm run i18n:types`  | 言語リソース（locales/）から文言のキーの型を生成する。                        |
| `npm run test`        | テストを実行する。                                                            |
| `npm run build:image` | 本番イメージを作成する。手順は[サーバー](deploy/server/README.md)を参照       |

## ディレクトリ構成

```
.
├── .devcontainer/      開発環境（VSCode DevContainers）
├── .github/
│   └── workflows/      CI
├── deploy/             デプロイ
│   ├── app/            アプリのDockerイメージ
│   ├── lb/             リバースプロキシ（nginx）のDockerイメージ
│   └── server/         自前サーバーでの運用手順とcompose
├── scripts/            開発・ビルド用スクリプト
│   ├── dev.ts          開発サーバー起動スクリプト
│   ├── build-assets.ts ブラウザ側のビルド（esbuild）
│   └── build-image.ts  本番イメージの作成
├── src/
│   ├── main.ts         エントリーコード
│   ├── routes.ts       URLとハンドラの対応表。全ルートをここに明示する
│   ├── lib/            HTTPに依存しない共通処理
│   │   └── _shared/        サーバーとブラウザの両方で使う処理
│   ├── web/            HTTPの仕組み。アプリ固有の処理は置かない
│   │   ├── app.ts              リクエストの受付、ルーティング、アクセスログ、エラー処理
│   │   ├── routes.ts           ルート表の型とprefix/middleware/layout
│   │   ├── html-document.tsx   Page/LayoutとHTML文書の生成
│   │   ├── jsx-runtime.ts      JSX変換処理
│   │   ├── assets.ts           アセット（_client/）のビルド結果の配信と設定
│   │   ├── static.ts           静的リソース（static/）の配信
│   │   ├── security-headers.ts 全レスポンスに付けるセキュリティヘッダ
│   │   ├── slot.ts             middlewareから下層へ値を渡す仕組み
│   │   ├── context.ts          AppContext（loggerなど、全体で共有するもの）
│   │   ├── csrf.ts             CSRF対策
│   │   ├── form.ts             フォームの読み取り
│   │   └── _shared/            サーバーとブラウザの両方で使うフォーム検証、HTML属性への展開、HTML要素の属性の型
│   ├── components/     画面部品。featureをまたいで使用するJSXの部品
│   │   └── form/
│   │       ├── form.tsx
│   │       └── _client/        部品のCSS/ClientJS
│   └── features/       機能部品。機能ごとにディレクトリを切る
│       ├── layout.tsx          全画面共通のレイアウト
│       ├── _client/            全画面共通のCSS/ClientJS
│       ├── auth/               認証関連
│       └── user/               認証後の画面
├── locales/            言語リソース（<lang>.json, <lang>.<addon>.json）
├── static/             静的リソース（favicon.ico, robots.txt）
├── tests/              テスト。src/と同じ構成にする
└── dist/               ビルド結果（git 管理外）
    ├── src/            tscの出力
    └── public/         esbuildの出力
```

- 依存の向きは `features → components → web → lib` の一方向のみ許可。逆向きにimportしない。featuresからweb,lib、componentsからlibの直接使用も可。
- `asset()`はモジュールの先頭で呼び、起動時に解決させる。
- コードの置き場所は、どこで動かしてよいかで決める。
  - `_client/`: ブラウザで使用するもの（DOM操作、リアルタイムバリデーション等）。公開される。importしてよいのは`_client/`と`_shared/`のもののみ。
  - `_shared/`: サーバーとブラウザの両方で使用するもの。公開される前提。importしてよいのは`_shared/`のもののみ。
  - `_client/`にも`_shared/`にも属さない: サーバーで動かすもの。公開されない。`_client/`のものはimportしてはならない。
    - DBアクセス、環境変数の読み取り、Node.jsのAPIを使用するもの
    - セキュリティ・認証周りのもの
    - リクエスト処理の部品

## 規約

### コメント

- 設計書は書かない。コードとコメントで説明する
  - コードの外に書くと、コードを直したときに更新されず陳腐化しやすいため
  - 仕組みはコードを読めばわかるように書き、読んでもわからないことだけをコメントにする
- 関数・型・ファイル先頭のコメントには、次のどちらかだけを記述する
  - 使い方: 引数・戻り値の意味、呼び出し側が留意する点
  - コードの補完説明: そうしている理由、制約、他ファイルや外部との取り決め
- 理由のコメントは、その判断をしているコードのそばに記述する
  - 呼び出し側の判断の理由は、呼び出し・分岐の直前に書く。呼ばれる関数側には書かない。
  - 関数のコメントに書く理由は、その関数自身についてのもののみ
- 処理の流れの説明や変更の経緯は書かない。経緯はコミットメッセージに残す

### セキュリティ

- 状態を変える処理をGETに置かない。CSRFの検証（[`src/web/csrf.ts`](src/web/csrf.ts)）はGET/HEAD/OPTIONSでは行われない。

### ログ

- トークンやパスワードをGETのクエリに入れない。アクセスログには残らないが、エラーログにはクエリの値も記録される。

### HTML/JS/CSS

- クライアントサイドでのJSは段階的な機能拡張に使用する。JSが無効でもフォームの送信や画面の移動といった基本的な操作は可能であるようにする
