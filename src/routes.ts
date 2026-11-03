import type { RouteMap } from "./web/routes.ts";
import * as index from "./features/index.ts";
import * as healthz from "./features/healthz.ts";
import * as login from "./features/login.tsx";

export const routes = {
  "/": {
    GET: index.get,
  },
  "/healthz": {
    GET: healthz.get,
  },
  "/login": {
    GET: login.get,
  },
} as const satisfies RouteMap;

export type RoutePath = keyof typeof routes;
