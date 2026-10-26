# 社内のログ用のサーバーで、アプリのサーバーから送られたログを受け取り、ファイルに書くイメージ。
# docker/log-server/compose.yaml で使う
# 更新時は `docker buildx imagetools inspect <イメージ>:<タグ>` で manifest list のダイジェストを取得して置き換える

# ---- dirs: ログとためる場所を、nonroot の所有で作る ----
# fluent-bit のイメージはシェルを含まないため、ここで作ってからコピーする。
# 名前付きボリュームは、初めてマウントするときにこの所有者を引き継ぐ。
# ログには接続元の IP アドレスなどが入るため、所有者だけが読めるようにする
FROM busybox:1.38.0@sha256:fd7dc98638c8e305f4dc34e979f1c0fdfdcaeb0fbf8fcff77ae834b6da3d7e6e AS dirs
RUN mkdir -p /out/buffer /out/logs
# TLS のサーバー証明書と秘密鍵（docker/README.md の手順で作る）。COPY の --chmod はディレクトリにもかかるため、ここで絞る
COPY certs/server.crt certs/server.key /out/certs/
RUN chmod 400 /out/certs/*

# ---- runtime ----
FROM fluent/fluent-bit:5.1.3@sha256:c5542543523c9678398dd78d927c05e8425ec15b038f226b67b3b019b1a70845

COPY --from=dirs --chown=65532:65532 --chmod=700 /out/buffer/ /fluent-bit/buffer/
COPY --from=dirs --chown=65532:65532 --chmod=700 /out/logs/ /logs/
COPY fluent-bit.yaml receive-time.lua /fluent-bit/etc/sugumi/
# 秘密鍵は nonroot だけが読めるようにする
COPY --from=dirs --chown=65532:65532 /out/certs/ /fluent-bit/etc/sugumi/certs/

USER 65532:65532
CMD ["/fluent-bit/bin/fluent-bit", "-c", "/fluent-bit/etc/sugumi/fluent-bit.yaml"]
