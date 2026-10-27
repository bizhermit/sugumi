/**
 * フォームのリクエストボディをパースする。CSRF の検証（csrf.tsx）とページの ctx.form() は、同じパース結果を使う。
 */

const FORM_TYPE = /^(?:application\/x-www-form-urlencoded|multipart\/form-data)\b/i;

// キーは、app.ts がリクエストボディを読み込んだあとの Request。リクエストが終われば、Request と一緒に消える。
const parsed = new WeakMap<Request, Promise<FormData | undefined>>();

/** フォームをパースできないときに ctx.form() が投げる。app.ts が受けて 400 を返す。 */
export class InvalidFormError extends Error {}

/**
 * フォームのリクエストボディをパースして返す。同じ req は 1 回だけパースする。
 * Content-Type がフォームでないか、パースできなければ undefined を返す。
 * req をクローンして読むので、ページは req.formData() など標準の API でもリクエストボディを読める。
 */
export function parseForm(req: Request): Promise<FormData | undefined> {
  let form = parsed.get(req);
  if (form === undefined) {
    form = readForm(req);
    parsed.set(req, form);
  }
  return form;
}

async function readForm(req: Request): Promise<FormData | undefined> {
  if (!FORM_TYPE.test(req.headers.get("content-type") ?? "")) return undefined;
  try {
    return await req.clone().formData();
  } catch {
    return undefined;
  }
}
