# tests/

`src/`・`scripts/` の動作を確かめるテスト。実行のしかたはルートの `CLAUDE.md` を参照。

- アサーションは `node:assert/strict` を使う。ライブラリは足さない。
- ディレクトリやファイルを読むものは、テスト用のものを `tests/_support/fixture.ts` の `withTempDir()` で `dist/test/` に作って渡す。
  - そのため、読む場所を引数で受け取れるようにしておく（`loadRouter()` の `root`、`createApp()` の `routes`・`staticDir` など）。
- 環境変数の検証は、`src/lib/env.ts` の `parse` で始まる関数に値を渡して確かめる。
- テストは環境変数 `TEST_DATABASE_URL` の DB を使う。開発用の DB とは分ける。
  - DB を使うテストは、初めに `tests/_support/db.ts` の `resetDb()` で空にする。
  - テスト用の DB は、名前を `_test` で終わらせる。`resetDb()` は、それ以外の名前の DB を空にしない。
- 失敗したテストの DB を確かめるときは、そのテストだけを実行してから接続する。
  - ほかのテストも実行すると、次のテストの `resetDb()` で行が消える。
  - `deno task test tests/routes/before.tree_test.ts --filter "テストの名前の一部"`
  - DevContainer では `docker exec -it sugumi_devcontainer-db-test-1 psql -U app -d app_test` で接続する。
- タイムアウトなどの値は、テストに書かず `src/lib/env.ts` の値を使う。開発環境で変えていても通るようにするため。
