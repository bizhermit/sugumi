/**
 * サーバー用イメージ作成スクリプト
 * - イメージのビルド、書き出し、gitタグの作成を行う。
 * - 引数
 *   0. タグ（任意）: 指定がない場合は対話形式で入力を受け付ける。
 */

import { execFile, spawn } from "node:child_process";
import { createWriteStream, readSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { createGzip } from "node:zlib";

const COMPOSE_FILE = "deploy/server/compose.yaml";
const APP_NAME = "myapp";
const IMAGES = [`${APP_NAME}/app`, `${APP_NAME}/lb`];
const OUTPUT_DIR = "dist/server-images";
const TAG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

const execFileAsync = promisify(execFile);

async function git(args: Array<string>) {
  const { stdout } = await execFileAsync("git", args).catch(() => {
    throw new Error(`失敗しました: git ${args.join(" ")}`);
  });
  return stdout.trim();
}

/** 終了コード0ならtrue。出力は端末にそのまま流す。 */
function run(command: string, args: Array<string>, env?: Record<string, string>) {
  return new Promise<boolean>((resolve) => {
    spawn(command, args, { stdio: "inherit", env: { ...process.env, ...env } })
      .on("close", (code) => resolve(code === 0));
  });
}

/** 標準入力から1行読む。EOFなら空文字。 */
function prompt(message: string) {
  process.stdout.write(`${message}: `);
  const bytes: Array<number> = [];
  const buf = Buffer.alloc(1);
  while (readSync(0, buf, 0, 1, null) === 1 && buf[0] !== 0x0a) {
    bytes.push(buf[0]!);
  }
  return Buffer.from(bytes).toString().replace(/\r$/, "").trim();
}

function confirm(message: string) {
  return prompt(`${message} [y/N]`).toLowerCase() === "y";
}

function fail(...messages: Array<string>): never {
  messages.forEach((m) => console.error(m));
  process.exit(1);
}

async function main() {
  const hash = await git(["rev-parse", "--short", "HEAD"]);
  let tag = process.argv[2]?.trim() ?? "";
  let createTag = tag !== "";

  const changes = await git(["status", "--porcelain"]);
  if (changes === "") {
    if (tag === "") {
      const inputReleaseTag = prompt(`タグを入力してください（未入力: ${hash}）`);
      if (inputReleaseTag === "") {
        tag = hash;
        createTag = false;
      } else {
        tag = inputReleaseTag;
        createTag = true;
      }
    }
  } else {
    if (!confirm("コミットしていない変更があります。続行しますか？")) {
      fail("処理を中止しました。");
    }
    console.warn(`未コミットがあるため、タグはハッシュ（${hash}）で作成します。`);
    tag = hash;
    createTag = false;
  }

  if (!TAG_PATTERN.test(tag)) {
    fail(
      "タグに使えない名前です。",
      "  半角英数字で始まり、半角英数字と記号（._-）のみ可。1~128文字",
      `: ${tag}`,
    );
  }

  if (createTag) {
    const exists = await execFileAsync("git", ["rev-parse", "--quiet", "--verify", `refs/tags/${tag}`])
      .then(() => true, () => false);
    if (exists) {
      fail(`すでにタグが存在します: ${tag}`);
    }
  }

  console.log("イメージを作成します。");
  console.log(`  イメージタグ: ${tag}`);
  console.log(`  gitタグの作成: ${createTag ? "する" : "しない"}`);
  if (!confirm("よろしいですか？")) {
    console.log("処理を中止しました。");
    process.exit(0);
  }

  if (createTag) {
    await git(["tag", "--annotate", "--message", tag, tag]);
  }

  const output = `${OUTPUT_DIR}/${APP_NAME}-${tag}.tar.gz`;

  try {
    if (!(await run("docker", ["compose", "-f", COMPOSE_FILE, "build"], { IMAGE_TAG: tag }))) {
      throw new Error("イメージのビルドに失敗しました。");
    }

    await mkdir(OUTPUT_DIR, { recursive: true });
    const save = spawn("docker", ["save", ...IMAGES.map((img) => `${img}:${tag}`)], {
      stdio: ["ignore", "pipe", "inherit"],
    });
    const saved = new Promise<boolean>((resolve) => save.on("close", (code) => resolve(code === 0)));
    await pipeline(save.stdout, createGzip(), createWriteStream(output));
    if (!(await saved)) {
      throw new Error("イメージの作成に失敗しました。");
    }
  } catch (e) {
    if (createTag) {
      await git(["tag", "--delete", tag]);
    }
    throw e;
  }

  console.log(`イメージを作成しました: ${output}`);

  if (createTag) {
    await git(["push", "origin", `refs/tags/${tag}`]);
    console.log(`タグをpushしました: ${tag}`);
  }
}

if (import.meta.main) {
  await main();
}
