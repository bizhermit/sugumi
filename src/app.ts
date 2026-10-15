import { errorPage } from "./error-page.ts";
import { loadRouter } from "./router.ts";

const match = await loadRouter();

// Deno の req.url は Host ヘッダーを検証せずに連結して作られるため、
// Host に `/` や `#` を含めると URL として解析したときの pathname を差し替えられる。
const VALID_HOST = /^(?:[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*|\[[0-9A-Fa-f:.]+\])(?::\d{1,5})?$/;

export async function handler(req: Request): Promise<Response> {
  const host = req.headers.get("host");
  if (host !== null && !VALID_HOST.test(host)) return errorPage(400);
  let url: URL;
  try {
    url = new URL(req.url);
  } catch {
    return errorPage(400);
  }
  if (url.hash !== "") return errorPage(400);

  const route = match(url.pathname);
  if (!route) return errorPage(404);
  try {
    return await route.handler(req, { params: route.params });
  } catch (e) {
    console.error(e);
    return errorPage(500);
  }
}
