# 更新するときはダイジェストを取得して置き換える。
# > docker buildx imagetools inspect node:<バージョン>-bookworm-slim
# > docker buildx imagetools inspect gcr.io/distroless/nodejs26-debian13:nonroot
FROM node:26.13.0-bookworm-slim@sha256:bc0a2afd3b74ce12222fc8bab99271e66257f021078f5f4a5d687a77d280c1d9 AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src/ ./src/
COPY scripts/build-assets.ts ./scripts/
# dependenciesが空だとnode_modules/が作られず、後のCOPYが失敗するため、空でも作っておく。
RUN npx tsc -p tsconfig.build.json \
    && node scripts/build-assets.ts \
    && npm prune --omit=dev \
    && mkdir -p node_modules

# 実行用
# - ENTRYPOINT: node
# - USER: nonroot(65532)
FROM gcr.io/distroless/nodejs26-debian13:nonroot@sha256:a51c5d631b90e1b298e17a88a307b77f0b959b47de942d033acce0c96be3fb83

ENV NODE_ENV=production

WORKDIR /app
COPY --from=build /app/node_modules/ ./node_modules/
# package.json は imports（#jsx）の解決に要る。
COPY package.json ./
COPY --from=build /app/dist/src/ ./dist/src/
COPY --from=build /app/dist/public/ ./dist/public/

EXPOSE 3000

CMD ["dist/src/main.js"]
