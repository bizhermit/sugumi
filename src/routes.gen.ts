// deno task gen で src/routes/ から生成する。直接編集しないこと。
export type RoutePath =
  | "/"
  | "/healthz"
  | "/home"
  | "/login"
  | "/logout";

/** GET で開けるルート。e2e/ のテストが、すべての画面を開いて確かめるのに使う。 */
export const GET_ROUTES: ReadonlyArray<RoutePath> = [
  "/",
  "/healthz",
  "/home",
  "/login",
  "/logout",
];
