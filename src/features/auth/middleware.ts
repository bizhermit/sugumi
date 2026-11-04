import type { Middleware } from "../../web/routes.ts";

const requireLogin: Middleware = async (req, next) => {
  // console.log("before");
  const response = await next();
  // console.log("after");
  return response;
};

export { requireLogin };
