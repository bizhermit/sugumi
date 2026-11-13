# 更新するときはダイジェストを取得して置き換える。
# > docker buildx imagetools inspect postgres:<バージョン>
FROM postgres:18@sha256:e3d24f6906d0760bf4da0dae872415391ededefad23fd471c47dc53b0ddf3c42

COPY init/ /docker-entrypoint-initdb.d/
