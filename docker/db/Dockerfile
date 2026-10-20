# DB のイメージ。本番の compose.yaml と、開発の .devcontainer/compose.yaml の両方で使う
# 更新時は `docker buildx imagetools inspect postgres:<タグ>` で manifest list のダイジェストを取得して置き換える
FROM postgres:18.6-alpine@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873

# データのディレクトリが空のとき（初回の起動時）だけ実行される
COPY init/ /docker-entrypoint-initdb.d/
