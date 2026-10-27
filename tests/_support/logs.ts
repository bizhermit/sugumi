/**
 * fn の実行中に console.log・console.error に出したログを、JSON として解析して出した順に返す。
 * 集めたログは端末に出さない。アプリのログは 1 行の JSON のため、解析できなければ例外にする。
 */
export async function captureLogs(
  fn: () => void | Promise<void>,
): Promise<Array<Record<string, unknown>>> {
  const lines: Array<string> = [];
  const { log, error } = console;
  console.log = console.error = (line: string) => {
    lines.push(line);
  };
  try {
    await fn();
  } finally {
    console.log = log;
    console.error = error;
  }
  return lines.map((line) => JSON.parse(line));
}
