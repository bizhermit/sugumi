/**
 * res のヘッダーを edit で書き換えて返す。コピーを作らずに、res をその場で書き換える。
 * ヘッダーを変更できない res（Response.redirect() など）のときだけ、コピーしてから書き換える。
 * res をその場で書き換えるので、app.ts は、ページが同じ Response を使い回していないことを確かめてから呼ぶ。
 * edit にはモジュールの関数を渡し、リクエストごとの値は arg で渡す。呼ぶたびに関数を作らずに済む。
 */
export function editHeaders<T>(
  res: Response,
  edit: (headers: Headers, arg: T) => void,
  arg: T,
): Response {
  try {
    // 変更できないヘッダーは最初の書き換えで例外になるので、途中まで書き換わった状態にはならない。
    edit(res.headers, arg);
    return res;
  } catch (e) {
    if (!(e instanceof TypeError)) throw e;
  }
  const out = new Response(res.body, res);
  edit(out.headers, arg);
  return out;
}
