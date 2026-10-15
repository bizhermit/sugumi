# 本番用イメージ
# 更新時は `docker buildx imagetools inspect denoland/deno:<タグ>` で manifest list のダイジェストを取得して置き換える

# ---- build: ブラウザ側のコードをバンドルする ----
FROM denoland/deno:2.9.7@sha256:fa335acdf6b72106eda2cb6a8cb5f4187e7630e357467489db4b2e7352d5e432 AS build

WORKDIR /app
COPY deno.json ./
COPY src/ ./src/
RUN deno task build && mkdir data

# ---- runtime: サーバーを実行する ----
# distroless はシェルやパッケージマネージャを含まないため、攻撃対象を小さくできる
FROM denoland/deno:distroless-2.9.7@sha256:16583ef81ce73d6fdf806174fbda68bf4c57e914659ffe6b1c2b600ac2327962

WORKDIR /app
COPY deno.json ./
COPY src/ ./src/
COPY --from=build /app/dist/ ./dist/
# SQLite のデータベースを置く。コンテナを作り直しても消えないよう、/app/data にボリュームをマウントすること
COPY --from=build --chown=65532:65532 /app/data/ ./data/

# root で動かさない（65532 は distroless の nonroot ユーザー）
USER 65532:65532

EXPOSE 3000

# ENTRYPOINT は /tini -- /bin/deno のため、deno のサブコマンドから書く
# 権限は deno.json の permissions.default で管理する
CMD ["run", "-P", "src/main.ts"]
