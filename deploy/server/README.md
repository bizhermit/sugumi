# サーバー

## 前提条件

- サーバーにDockerがインストール済みであること（`docker compose`が実行可能であること）
- サーバーに`scp`などでファイルを配置できること

## 初回セットアップ方法

1. サーバーに配置先のディレクトリ（例：`/opt/myapp`）を作成する

2. 作成したディレクトリに以下のファイルを配置する
   - [compose.yaml](compose.yaml)
   - [.env.example](.env.example)
   - [deploy](deploy)
   - [switch-image](switch-image)
   - [remove-image](remove-image)

3. 同ディレクトリに環境変数ファイル（`.env`）を`.env.example`から作成する

4. 環境変数ファイルの値を適宜設定する

   | キー        |             必須              | 説明           |
   | ----------- | :---------------------------: | -------------- |
   | `IMAGE_TAG` | ○（deploy実行で自動書き換え） | イメージのタグ |

## デプロイ方法

1. 開発コンテナでイメージを作成する

   ターミナルで以下のコマンドを実行する。タグの入力を求められるので、任意の値（例：`v1.2.0`）を入力する。入力したタグはgitのタグとして作成およびpushされる。未入力の場合はコミットハッシュがタグになる（gitのタグは作成されない）。
   ```bash
   deno task build:image
   ```

2. 作成されたイメージファイル（`dist/server-images/myapp-<タグ>.tar.gz`）をサーバーに配置する

   ```bash
   scp dist/server-images/myapp-<タグ>.tar.gz <サーバー>:/opt/myapp/
   ```

3. デプロイ用スクリプトを実行する

   ```bash
   cd /opt/myapp
   ./deploy
   ```

   ※ 実行権限がない場合は、`chmod +x deploy`を実行する。

## 切り戻し方法

読み込み済みのタグに切り替える。

```bash
cd /opt/myapp
./switch-image
```

※ 実行権限がない場合は、`chmod +x switch-image`を実行する。

## イメージの削除方法

起動や切り戻しに使わないタグのイメージを削除する。

```bash
cd /opt/myapp
./remove-image
```

※ 実行権限がない場合は、`chmod +x remove-image`を実行する。
