-- テスト用の DB に、使い捨ての印を付ける。テストは、この印がない DB を空にしない（tests/_support/db.ts の resetDb()）。
-- DB の初期化（データのディレクトリが空のとき）に、管理者で実行される（.devcontainer/compose.yaml の db-test）。
COMMENT ON DATABASE :"DBNAME" IS 'disposable';
