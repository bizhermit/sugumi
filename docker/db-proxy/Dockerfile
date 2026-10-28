# DB の転送役のイメージ。アプリサーバーからの接続を受け、DB のコンテナへそのまま流す。docker/bake.hcl で作り、docker/db/compose.yaml で使う
# ロードバランサー（docker/lb/Dockerfile）と同じ nginx を使う。更新するときは揃える
FROM nginx:1.30.6-alpine@sha256:47928bf67eb62a1863cb08d9ecb52d3e704304ba614eaee17884204677702951

# イメージのデフォルトの設定（conf.d/ の default.conf など）は使わない
RUN rm -r /etc/nginx/conf.d
COPY nginx.conf /etc/nginx/nginx.conf
