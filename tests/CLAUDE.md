# tests/

`src/`・`scripts/` の動作を確かめるテスト。実行方法はルートの `CLAUDE.md` を参照。

- アサーションは `node:assert/strict` を使う。ライブラリは足さない。
- ディレクトリやファイルを読む処理には、`tests/_support/fixture.ts` の `withTempDir()` で `dist/test/` にテスト用のものを作って渡す。
  - そのために、読む場所を引数で受け取れるようにしておく（`loadRouter()` の `root`、`createApp()` の `routes`・`staticDir` など）。
- 環境変数の検証は、`src/lib/env.ts` の `parse` で始まる関数に値を直接渡して確かめる。
- テストは環境変数 `TEST_DATABASE_URL` の DB を使う。開発用の DB とは分ける。
  - 本番と同じく、アプリの DB ユーザー `app` で接続する。テーブルの読み書きしかできないので、テストでも `TRUNCATE` やテーブルの作成はできない。
  - 行の `id` は決め打ちしない。`resetDb()` は行を消すだけで、`id` の番号は戻さない。作った行の `id` を使う。
  - DB を使うテストは、初めに `tests/_support/db.ts` の `resetDb()` で空にする。
  - 結果を読むクエリは、`db.query<{ ... }>` で行の型を付ける。付けないと行が `any` になる。
  - テスト用の DB は、名前を `_test` で終わらせる。`resetDb()` は、それ以外の名前の DB を空にしない。
- 失敗したテストの DB の中身を見るときは、そのテストだけを実行してから接続する。
  - ほかのテストも一緒に実行すると、次のテストの `resetDb()` で行が消えてしまう。
  - `deno task test tests/routes/before.tree_test.ts --filter "テストの名前の一部"`
  - DevContainer では、次のコマンドで接続する。

    ```sh
    project=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$HOSTNAME")
    docker exec -it "${project}-db-test-1" psql -U app -d app_test
    ```
- タイムアウトなどの値は、テストに直接書かず `src/lib/env.ts` の値を使う。開発環境で値を変えていてもテストが通るようにするため。
