# 保存日数を過ぎたファイルと、アクセスログなどの合計の上限を超えた分を消すイメージ。docker/log-server/compose.yaml の log-cleaner で使う
# 更新時は `docker buildx imagetools inspect busybox:<タグ>` で manifest list のダイジェストを取得して置き換える
FROM busybox:1.38.0@sha256:fd7dc98638c8e305f4dc34e979f1c0fdfdcaeb0fbf8fcff77ae834b6da3d7e6e

COPY --chmod=555 log-cleaner.sh /usr/local/bin/log-cleaner

# 受け口（receiver）と同じユーザーで動かす。受け口が書いたファイルを消すため
USER 65532:65532
CMD ["/usr/local/bin/log-cleaner"]
