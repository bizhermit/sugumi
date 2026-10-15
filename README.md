# SUGUMI

外部依存ゼロのWebアプリケーションテンプレート

- Deno + TypeScript
- フレームワーク・ライブラリを使わない
- SSRを基本とし、JavaScriptは段階的な機能拡張を担う

## 開発

```sh
deno task dev    # 開発サーバー（ファイル監視あり）
deno task build  # クライアントコードをバンドル
deno task start  # サーバー起動（先に deno task build が必要）
deno task account:add <ユーザー名> <表示名>  # アカウントを追加（パスワードは入力を求める）
deno task check:imports  # サーバー・クライアント間の import の取り決めを確認
```
