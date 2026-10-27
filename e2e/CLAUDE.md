# e2e/

ブラウザで画面を動かすテスト。`deno task test:e2e` で実行する。

- テストは、`e2e/` の同じパスに置く（`src/routes/login/_assets/index.ts` → `e2e/routes/login/_assets/index_test.ts`）。
- ファイルは `e2e/` からのパスで指定する（`deno task test:e2e routes_test.ts --filter "テストの名前の一部"`）。
- `deno task test:e2e` は、テスト用の DB を空にしてアカウントを作り、本番と同じ方法でアプリを起動してから、`e2e/` のテストを実行する（`scripts/test-e2e.ts`）。
  - 環境変数 `E2E_BASE_URL` があれば、アプリを起動せず、その URL で動いているアプリに対して実行する。そのアプリは `TEST_DATABASE_URL` と同じ DB に接続しておく。
    - 受け付けるのは、このマシンで動いているアプリ（`127.0.0.1`・`localhost`・`[::1]`）だけ。テストではテスト用のアカウントで何度もログインするので、本番やステージングに向けると、同じ名前のアカウントや接続元がロックされてしまう。
  - CI では、デプロイするものと同じイメージで確かめるために、本番のイメージ（`docker/app/Dockerfile`）を起動して渡す。
- `e2e/` のテストは、アプリを外から操作するだけにする。
  - DB を触らない。アプリの部品を import しない（`src/web/url.ts` の `path()` と `src/routes.gen.ts` は使ってよい）。
  - 使うデータは `scripts/test-e2e.ts` で用意し、環境変数で渡す。
- テストどうしが影響し合わないようにする。並列に実行したり、CI でジョブを分けて実行したりできるようにするため。
  - ページは `e2e/_support/browser.ts` の `withPage()` で開く。テストごとに Cookie などの保存先が分かれる。
  - ログインは、テストごとに `login()` で行う。GET でも状態が変わるルートがある（`/login` を開くとログアウトする）。
  - アカウントの状態（パスワード、ロックなど）を変えるテストは、そのテスト用のアカウントを `scripts/test-e2e.ts` で作る。
- `withPage()` は、コンソールにエラーが出るか、ページで捕まえていない例外が起きると、テストを失敗にする。
  - CSP・Trusted Types で止められた処理は、ブラウザがコンソールのエラーか例外として出すので、ここで検出できる。
- `e2e/routes_test.ts` が、GET で開けるすべてのルートを、ログインせずに開く場合とログインして開く場合の両方で確かめる。
  - パラメータのあるルートを足したら、`SAMPLE_URLS` に開く URL を書く。書いていないとテストが失敗する。
  - レスポンスの CSP が緩んでいないこと（`script-src` が `'self'` だけ、Trusted Types の指定がある、`'unsafe-` を含まない）も確かめる。CSP が緩むと違反そのものが起きなくなり、`withPage()` では気づけないため。
    - ページで CSP を緩めるときは、ここで認める範囲も見直す。
- `evaluate()` などに渡す関数はブラウザで動くので、ファイルの先頭に `/// <reference lib="dom" />` を書く。

## Playwright

- バージョンを変えるときは、次の 2 つを揃えてから DevContainer をリビルドする。ずれていると、ブラウザを起動できない。
  - `e2e/deno.json` の `imports`
  - `e2e/deno.json` の `permissions` の `run`（パスにブラウザのリビジョンが入る）
  - DevContainer と CI は、`e2e/deno.json` の `imports` のバージョンを、`e2e/deno.lock` でハッシュを確かめて入れる。
