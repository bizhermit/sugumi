import { path, redirect } from "../url.ts";

export default function (_req: Request): Response {
  return redirect(path("/login"));
}
