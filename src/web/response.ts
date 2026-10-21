/**
 * res のヘッダーを edit で書き換えた Response を返す。複製を作らないよう、res をその場で書き換える。
 * ヘッダーが変更不可の res（Response.redirect() など）だけは、複製してから書き換える。
 * その場で書き換えるため、app.ts はページが同じ Response を使い回していないことを確かめてから呼ぶ。
 * edit はモジュールの関数にし、リクエストごとの値は arg で渡す（呼ぶたびに関数を作らないため）。
 */
export function editHeaders<T>(
  res: Response,
  edit: (headers: Headers, arg: T) => void,
  arg: T,
): Response {
  try {
    // 変更不可なら最初の書き換えで例外になるため、途中まで書き換わることはない
    edit(res.headers, arg);
    return res;
  } catch (e) {
    if (!(e instanceof TypeError)) throw e;
  }
  const out = new Response(res.body, res);
  edit(out.headers, arg);
  return out;
}
