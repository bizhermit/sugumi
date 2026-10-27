/**
 * フォームの本文の解析。CSRF の検証（csrf.tsx）とページの ctx.form() が、同じ解析結果を使う。
 */

const FORM_TYPE = /^(?:application\/x-www-form-urlencoded|multipart\/form-data)\b/i;

// キーは app.ts が本文を読み込んだ Request。リクエストが終われば Request とともに消える
const parsed = new WeakMap<Request, Promise<FormData | undefined>>();

/** ctx.form() が投げる。app.ts が 400 にする。 */
export class InvalidFormError extends Error {}

/**
 * フォームの本文を解析して返す。同じ req では 1 回だけ解析する。
 * フォームの種類でないか、解析できなければ undefined を返す。
 * 複製して読むため、ページは req.formData() など標準の API でも本文を読める。
 */
export function parseForm(req: Request): Promise<FormData | undefined> {
  let form = parsed.get(req);
  if (form === undefined) {
    form = readForm(req);
    parsed.set(req, form);
  }
  return form;
}

async function readForm(req: Request) {
  if (!FORM_TYPE.test(req.headers.get("content-type") ?? "")) return undefined;
  try {
    return await req.clone().formData();
  } catch {
    return undefined;
  }
}
