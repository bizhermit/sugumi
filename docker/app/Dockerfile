# 本番用のアプリのイメージ。compose.yaml から DB のイメージ（docker/db/）と一緒に起動する
# コンテキストはリポジトリのルート。除外するファイルは、隣の Dockerfile.dockerignore に書く
# 更新時は `docker buildx imagetools inspect denoland/deno:<タグ>` で manifest list のダイジェストを取得して置き換える

# ---- build: ブラウザ側のコードをバンドルし、依存を取得する ----
FROM denoland/deno:2.9.7@sha256:fa335acdf6b72106eda2cb6a8cb5f4187e7630e357467489db4b2e7352d5e432 AS build

WORKDIR /app
COPY deno.json deno.lock ./
COPY src/ ./src/
# build タスクがバンドルの前後で import とバンドルの中身を確かめる
COPY scripts/ ./scripts/
# 実行時に npm からダウンロードしないよう、DENO_DIR に取得しておく。deno.lock と食い違えば失敗する
RUN deno task build && deno cache --frozen src/main.ts

# ---- runtime: サーバーを実行する ----
# distroless はシェルやパッケージマネージャを含まないので、攻撃対象を小さくできる
FROM denoland/deno:distroless-2.9.7@sha256:16583ef81ce73d6fdf806174fbda68bf4c57e914659ffe6b1c2b600ac2327962

WORKDIR /app
COPY deno.json deno.lock ./
COPY src/ ./src/
COPY static/ ./static/
COPY --from=build /app/dist/ ./dist/
COPY --from=build /deno-dir/ /deno-dir/

# root で動かさない（65532 は distroless の nonroot ユーザー）
USER 65532:65532

EXPOSE 3000

# ENTRYPOINT が /tini -- /bin/deno なので、deno のサブコマンドから書く
# 権限は deno.json の permissions.default で管理する
# --cached-only で、DENO_DIR にない依存を実行時にダウンロードしない
CMD ["run", "--cached-only", "-P", "src/main.ts"]
