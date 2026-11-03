import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ConfigError, loadConfig } from "../../src/lib/config.ts";

describe("loadConfig", () => {
  it("開発環境向け既定値", () => {
    const config = loadConfig({});
    assert.deepEqual(config, {
      env: "development",
      port: 3000,
      log: {
        level: "debug",
        format: "pretty",
      },
    });
  });

  it("本番環境向け既定値", () => {
    const config = loadConfig({ NODE_ENV: "production" });
    assert.deepEqual(config, {
      env: "production",
      port: 3000,
      log: {
        level: "info",
        format: "json",
      },
    });
  });

  it("指定した値を優先使用", () => {
    const config = loadConfig({
      NODE_ENV: "test",
      APP_PORT: "3003",
      APP_LOG_LEVEL: "warn",
      APP_LOG_FORMAT: "json",
    });
    assert.deepEqual(config, {
      env: "test",
      port: 3003,
      log: {
        level: "warn",
        format: "json",
      },
    });
  });

  it("空白文字による未指定処理", () => {
    const config = loadConfig({
      NODE_ENV: "",
      APP_PORT: "",
      APP_LOG_LEVEL: "",
      APP_LOG_FORMAT: "",
    });
    assert.deepEqual(config, {
      env: "development",
      port: 3000,
      log: {
        level: "debug",
        format: "pretty",
      },
    });
  });

  it("前後空白文字のトリム", () => {
    const config = loadConfig({
      APP_PORT: " 8000 ",
    });
    assert.equal(config.port, 8000);
  });

  it("不正値の検出", () => {
    assert.throws(
      () => {
        return loadConfig({
          NODE_ENV: "prod",
          APP_PORT: "-1",
          APP_LOG_LEVEL: "test",
          APP_LOG_FORMAT: "plain",
        });
      },
      (err) => {
        assert.ok(err instanceof ConfigError);
        assert.equal(err.errors.length, 4);
        assert.match(err.errors[0] ?? "", /^NODE_ENV: /);
        assert.match(err.errors[1] ?? "", /^APP_PORT: /);
        assert.match(err.errors[2] ?? "", /^APP_LOG_LEVEL: /);
        assert.match(err.errors[3] ?? "", /^APP_LOG_FORMAT: /);
        assert.match(err.message, /環境変数に不正な値が含まれています。/);
        return true;
      },
    );
  });

  for (const port of ["0", "65536", "-1", "1.5", "0x59", "80a"]) {
    it(`ポート番号無効: ${port}`, () => {
      assert.throws(() => loadConfig({ APP_PORT: port }), ConfigError);
    });
  }

  it("設定オブジェクトの変更禁止", () => {
    const config = loadConfig({});
    assert.ok(Object.isFrozen(config));
    assert.ok(Object.isFrozen(config.log));
  });
});
