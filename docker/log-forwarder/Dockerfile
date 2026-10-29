# アプリサーバーで、アプリのログを受け取って送り先へ送るイメージ。docker/bake.hcl で作り、compose.yaml の log-forwarder で使う。
# 送り先は LOG_DESTINATION で選び、同じ名前の設定ファイル（cloudwatch.yaml・internal.yaml）を使う。
# 更新時は `docker buildx imagetools inspect <イメージ>:<タグ>` で manifest list のダイジェストを取得して置き換える。

# ---- dirs: 送れない間にためる場所を、nonroot の所有で作る ----
# fluent-bit のイメージはシェルを含まないので、ここで作ってからコピーする。
# 名前付きボリュームは、初めてマウントするときにこの所有者を引き継ぐ。
FROM busybox:1.38.0@sha256:fd7dc98638c8e305f4dc34e979f1c0fdfdcaeb0fbf8fcff77ae834b6da3d7e6e AS dirs
RUN mkdir -p /out/buffer

# ---- runtime ----
FROM fluent/fluent-bit:5.1.3@sha256:c5542543523c9678398dd78d927c05e8425ec15b038f226b67b3b019b1a70845

COPY --from=dirs --chown=65532:65532 --chmod=700 /out/buffer/ /fluent-bit/buffer/
COPY *.yaml /fluent-bit/etc/custom/

# root で動かさない（65532 は distroless の nonroot ユーザー）。
USER 65532:65532
