import { errorPage } from "./error-page.ts";
import { loadRoutes } from "./router.ts";

const routes = await loadRoutes();

export async function handler(req: Request): Promise<Response> {
  const page = routes.get(new URL(req.url).pathname);
  if (!page) return errorPage(404);
  try {
    return await page(req);
  } catch (e) {
    console.error(e);
    return errorPage(500);
  }
}
