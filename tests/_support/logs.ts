/**
 * fn の実行中に console.log・console.error へ出力されたログを、出力された順に JSON としてパースして返す。
 * 集めたログは端末には出さない。アプリのログは 1 行に 1 つの JSON なので、パースできない行があれば例外を投げる。
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
