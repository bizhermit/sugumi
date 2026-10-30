/**
 * サーバー用イメージ作成スクリプト
 * - イメージのビルド、書き出し、gitタグの作成を行う。
 * - 引数
 *   0. タグ（任意）: 指定がない場合は対話形式で入力を受け付ける。
 */

const COMPOSE_FILE = "deploy/server/compose.yaml";
const APP_NAME = "myapp";
const IMAGES = [`${APP_NAME}/app`, `${APP_NAME}/lb`];
const OUTPUT_DIR = "dist/server-images";
const TAG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

async function git(args: Array<string>) {
  const { success, stdout } = await new Deno.Command("git", {
    args,
    stderr: "inherit",
  }).output();
  if (!success) throw new Error(`失敗しました: git ${args.join(" ")}`);
  return new TextDecoder().decode(stdout).trim();
}

function fail(...messages: Array<string>): never {
  messages.forEach(console.error);
  Deno.exit(1);
}

async function main() {
  const hash = await git(["rev-parse", "--short", "HEAD"]);
  let tag = Deno.args[0]?.trim() ?? "";
  let createTag = tag !== "";

  const changes = await git(["status", "--porcelain"]);
  if (changes === "") {
    if (tag === "") {
      const inputReleaseTag = prompt(`タグを入力してください（未入力: ${hash}）:`)?.trim() ?? "";
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
      fail(`処理を中止しました。`);
    }
    console.warn(`未コミットがあるため、タグはハッシュ（${hash}）で作成します。`);
    tag = hash;
    createTag = false;
  }

  if (tag === "") {
    // NOTE: 分岐には入らないが念のため
    fail(`タグが設定されていません。`);
  }

  if (!TAG_PATTERN.test(tag)) {
    fail(
      "タグに使えない名前です。",
      "  半角英数字で始まり、半角英数字と記号（._-）のみ可。1~128文字",
      `: ${tag}`,
    );
  }

  if (createTag) {
    const { success } = await new Deno.Command("git", {
      args: [
        "rev-parse",
        "--quiet",
        "--verify",
        `refs/tags/${tag}`,
      ],
      stdout: "null",
    }).output();

    if (success) {
      fail(`すでにタグが存在します: ${tag}`);
    }
  }

  console.log("イメージを作成します。");
  console.log(`  イメージタグ: ${tag}`);
  console.log(`  gitタグの作成: ${createTag ? "する" : "しない"}`);
  if (!confirm("よろしいですか？")) {
    console.log("処理を中止しました。");
    Deno.exit(0);
  }

  if (createTag) {
    await git(["tag", "--annotate", "--message", tag, tag]);
  }

  const output = `${OUTPUT_DIR}/${APP_NAME}-${tag}.tar.gz`;

  try {
    const { success: buildSuccess } = await new Deno.Command("docker", {
      args: ["compose", "-f", COMPOSE_FILE, "build"],
      env: { IMAGE_TAG: tag },
      stdout: "inherit",
      stderr: "inherit",
    }).output();
    if (!buildSuccess) {
      throw new Error(`イメージのビルドに失敗しました。`);
    }

    await Deno.mkdir(OUTPUT_DIR, { recursive: true });
    const file = await Deno.open(output, {
      write: true,
      create: true,
      truncate: true,
    });
    const save = new Deno.Command("docker", {
      args: ["save", ...IMAGES.map((img) => `${img}:${tag}`)],
      stdout: "piped",
      stderr: "inherit",
    }).spawn();
    await save.stdout.pipeThrough(new CompressionStream("gzip")).pipeTo(file.writable);
    const { success: saveSuccess } = await save.status;
    if (!saveSuccess) {
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
