# 更新するときはダイジェストを取得して置き換える。
# > docker buildx imagetools inspect node:<バージョン>-bookworm-slim
# > docker buildx imagetools inspect gcr.io/distroless/nodejs26-debian13:nonroot
FROM node:26.13.0-bookworm-slim@sha256:bc0a2afd3b74ce12222fc8bab99271e66257f021078f5f4a5d687a77d280c1d9 AS deps

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# 実行用
# - ENTRYPOINT: node
# - USER: nonroot(65532)
FROM gcr.io/distroless/nodejs26-debian13:nonroot@sha256:a51c5d631b90e1b298e17a88a307b77f0b959b47de942d033acce0c96be3fb83

ENV NODE_ENV=production

WORKDIR /app
COPY --from=deps /app/ ./
COPY src/ ./src/

EXPOSE 3000

CMD ["src/main.ts"]
