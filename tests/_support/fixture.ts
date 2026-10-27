/**
 * テスト用のファイルを dist/test/ の一時ディレクトリに作る。
 * deno.json の permissions の test で、dist/test/ の読み書きを許可している。
 */
const FIXTURES_DIR = new URL("../../dist/test/", import.meta.url);

/** files（ディレクトリからの相対パス → 内容）のとおりにファイルを置いた一時ディレクトリを作って fn に渡し、fn が終わったら消す。 */
export async function withTempDir(
  files: Record<string, string | Uint8Array>,
  fn: (dir: URL) => void | Promise<void>,
): Promise<void> {
  await Deno.mkdir(FIXTURES_DIR, { recursive: true });
  const dir = new URL(
    `${await Deno.makeTempDir({ dir: decodeURIComponent(FIXTURES_DIR.pathname) })}/`,
    "file://",
  );
  for (const [relative, content] of Object.entries(files)) {
    const file = new URL(relative.split("/").map(encodeURIComponent).join("/"), dir);
    await Deno.mkdir(new URL(".", file), { recursive: true });
    if (typeof content === "string") {
      await Deno.writeTextFile(file, content);
    } else {
      await Deno.writeFile(file, content);
    }
  }
  try {
    await fn(dir);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
}
