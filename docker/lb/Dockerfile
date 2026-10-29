# ロードバランサーのイメージ。HTTPS を受け、アプリサーバーへ振り分ける。docker/bake.hcl で作り、docker/lb/compose.yaml で使う。
# 更新時は `docker buildx imagetools inspect nginx:<タグ>` で manifest list のダイジェストを取得して置き換える。
FROM nginx:1.30.6-alpine@sha256:47928bf67eb62a1863cb08d9ecb52d3e704304ba614eaee17884204677702951

# イメージのデフォルトの設定（conf.d/ の default.conf など）は使わない。
# conf.d/ は、起動時に templates/ から作るファイルの置き場所として残す。
RUN rm /etc/nginx/conf.d/*
COPY nginx.conf /etc/nginx/nginx.conf
COPY templates/ /etc/nginx/templates/
# templates/ を展開する（20-envsubst-on-templates.sh）より前に実行する。
COPY --chmod=755 check-server-name.sh /docker-entrypoint.d/15-check-server-name.sh
