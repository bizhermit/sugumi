import { errorPage } from "./error-page.ts";
import { loadRouter } from "./router.ts";

const match = await loadRouter();

export async function handler(req: Request): Promise<Response> {
  const route = match(new URL(req.url).pathname);
  if (!route) return errorPage(404);
  try {
    return await route.handler(req, { params: route.params });
  } catch (e) {
    console.error(e);
    return errorPage(500);
  }
}
