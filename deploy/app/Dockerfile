# 更新するときはダイジェストを取得して置き換える。
# > docker buildx imagetools inspect denoland/deno:distroless-<バージョン>
FROM denoland/deno:distroless-2.9.7@sha256:16583ef81ce73d6fdf806174fbda68bf4c57e914659ffe6b1c2b600ac2327962

WORKDIR /app
COPY deno.json ./
COPY src/ ./src/

# nonrootユーザー
USER 65532:65532

EXPOSE 3000

CMD ["run", "--allow-net", "src/main.ts"]
