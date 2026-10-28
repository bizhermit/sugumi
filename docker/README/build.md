# イメージのビルド方法

[目次](index.md)

リポジトリのソースから本番イメージ（`app`・`log-forwarder`・`db`・`db-proxy`・`lb`）を作成し、レジストリに置く。
アプリサーバーとは別の、ビルドサーバー（CI など）で行う。

## 前提条件

- Docker（`docker buildx` を含む）が入ったサーバーに、このリポジトリを置いてある。
- レジストリに push できる。
  - ECR なら、リポジトリ `myapp/app`・`myapp/log-forwarder`・`myapp/db`・`myapp/db-proxy`・`myapp/lb` を先に作成しておく。
    タグのイミュータビリティを有効にし、同じタグで違う中身を push できないようにする。

## 手順

1. リポジトリを、反映するコミットにする。

   ```sh
   git fetch
   git checkout <コミットかタグ>
   ```

2. レジストリにログインする。

   ```sh
   docker login <レジストリ>
   ```

   ECR の例：

   ```sh
   aws ecr get-login-password --region ap-northeast-1 \
     | docker login --username AWS --password-stdin 123456789012.dkr.ecr.ap-northeast-1.amazonaws.com
   ```

3. スクリプトを実行し、尋ねられた値を答える。イメージをビルドし、レジストリに push する。

   ```sh
   docker/scripts/build-images
   ```

   | 尋ねられる値     | 答え                                                                                                               |
   | ---------------- | ------------------------------------------------------------------------------------------------------------------ |
   | イメージの保存先 | レジストリとアプリの名前（例：`123456789012.dkr.ecr.ap-northeast-1.amazonaws.com/myapp`）。`IMAGE_PREFIX` に書く値 |
   | タグ             | 空のままにすると、コミットのハッシュになる                                                                         |
   | CPU              | アプリサーバーの CPU（`linux/amd64` か `linux/arm64`）。空のままにすると、ビルドサーバーと同じものになる           |

   - 最後に出る `IMAGE_PREFIX`・`IMAGE_TAG` の値を、各サーバーの `.env` に書くので、控えておく。
   - コミットしていない変更があると、実行しない。タグからコミットを特定できなくなるため。
   - CI などの端末がない環境では尋ねず、環境変数 `IMAGE_PREFIX`・`IMAGE_TAG`・`IMAGE_PLATFORM` の値で実行する。
   - イメージには、パスワードや証明書は入らない。それらはアプリサーバーに置く。

## 確認方法

5 つのイメージ（`app`・`log-forwarder`・`db`・`db-proxy`・`lb`）が、レジストリにそのタグで置かれている。

```sh
docker buildx imagetools inspect <IMAGE_PREFIX>/app:<タグ>
```

レジストリにあるタグの一覧は、レジストリの機能で見る。ECR の例（push した日時の順）：

```sh
aws ecr describe-images --repository-name myapp/app \
  --query 'sort_by(imageDetails, &imagePushedAt)[*].[imagePushedAt, join(`,`, imageTags || `[]`)]' \
  --output table
```

- タグはコミットのハッシュなので、どの変更かはリポジトリで `git show --no-patch <タグ>` で分かる。
- ECR 以外では、`crane ls <IMAGE_PREFIX>/app` などのツールを使う。
