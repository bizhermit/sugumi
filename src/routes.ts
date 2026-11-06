import { layout, middleware, prefix, type RouteMap } from "./web/routes.ts";
import * as index from "./features/index.ts";
import * as healthz from "./features/healthz.ts";
import * as login from "./features/auth/login.tsx";
import * as authMiddleware from "./features/auth/middleware.ts";
import * as home from "./features/user/home.tsx";
import * as settings from "./features/user/settings.tsx";
import * as user from "./features/user/index.tsx";
import { userLayout } from "./features/user/layout.tsx";
import { rootLayout } from "./features/layout.tsx";

export const routes = layout(rootLayout, {
  "/": {
    GET: index.get,
  },
  "/healthz": {
    GET: healthz.get,
  },
  "/login": {
    GET: login.get,
    POST: login.post,
  },
  ...layout(
    userLayout,
    middleware([authMiddleware.requireLogin], {
      "/home": {
        GET: home.get,
      },
      "/settings": {
        GET: settings.get,
      },
      ...prefix("/user", {
        "/": {
          GET: user.get,
        },
      }),
    }),
  ),
}) satisfies RouteMap;

export type RoutePath = keyof typeof routes;
