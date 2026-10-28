# DB のイメージ。本番（docker/bake.hcl で作り、docker/db/compose.yaml で使う）と、開発の .devcontainer/compose.yaml の両方で使う
# 更新時は `docker buildx imagetools inspect postgres:<タグ>` で manifest list のダイジェストを取得して置き換える
FROM postgres:18.6-alpine@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873

# データのディレクトリが空のとき（初回の起動時）だけ実行される
COPY init/ /docker-entrypoint-initdb.d/

# マイグレーション・DB バックアップ・復元のコマンド（docker/README/migration.md・backup.md を参照）
COPY --chmod=755 bin/ /usr/local/bin/

# マイグレーション。db-migrate が適用する
COPY migrations/ /migrations/

# 本番の DB サーバーで、接続を受け付ける範囲（docker/db/compose.yaml で指定する）
COPY conf/pg_hba.conf /etc/postgresql/pg_hba.conf
