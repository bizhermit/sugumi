export type RouteHandler = (req: Request) => Response | Promise<Response>;

export type Middleware = (req: Request, next: () => Promise<Response>) => Response | Promise<Response>;

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export type Method = (typeof METHODS)[number];

export type Route = Readonly<Partial<Record<Method, RouteHandler>>> & {
  readonly middleware?: readonly Middleware[];
};

export type RouteMap = Readonly<Record<string, Route>>;

export function prefix(path: string, routes: RouteMap): RouteMap {
  const result: Record<string, Route> = {};
  for (const [key, route] of Object.entries(routes)) {
    result[key === "/" ? path : path + key] = route;
  }
  return result;
}

export function middleware(handlers: readonly Middleware[], routes: RouteMap): RouteMap {
  const result: Record<string, Route> = {};
  for (const [key, route] of Object.entries(routes)) {
    result[key] = {
      ...route,
      middleware: [...handlers, ...(route.middleware ?? [])],
    };
  }
  return result;
}
