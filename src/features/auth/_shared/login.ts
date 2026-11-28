import { $object } from "../../../lib/_shared/schema/object.ts";
import { $string } from "../../../lib/_shared/schema/primitives.ts";
import { password, username } from "./account.ts";

export const RETURN_TO_PARAM_NAME = "to";

export const DEFAULT_RETURN_PATH = "/home";

export function loginPathWithReturnTo(url: URL): string {
  const returnPath = url.pathname + url.search;
  if (returnPath === DEFAULT_RETURN_PATH) {
    return "/login";
  }
  const params = new URLSearchParams({ [RETURN_TO_PARAM_NAME]: returnPath });
  return `/login?${params.toString()}`;
}

export const loginSchema = $object({
  username,
  password,
  [RETURN_TO_PARAM_NAME]: $string(),
});
