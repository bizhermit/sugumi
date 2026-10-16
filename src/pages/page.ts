import { path, redirect } from "../web/url.ts";

export default function (_req: Request): Response {
  return redirect(path("/login"));
}
