# サーバー

<!-- TODO: -->

```bash
docker compose -f deploy/server/compose.yaml up --build -d

# ビルド済みを使う場合
docker compose -f deploy/server/compose.yaml up -d
```

```bash
docker compose -f deploy/server/compose.yaml down

# 消したい場合
docker compose -f deploy/server/compose.yaml down --rmi local
```

