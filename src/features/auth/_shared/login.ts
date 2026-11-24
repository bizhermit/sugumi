import { s } from "../../../lib/_shared/schema/index.ts";
import { password, username } from "./account.ts";

export const RETURN_TO_PARAM_NAME = "to";

export const loginSchema = s.object({
  username,
  password,
  [RETURN_TO_PARAM_NAME]: s.string(),
});
