export type RouteHandler = (req: Request) => Response | Promise<Response>;

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export type Method = (typeof METHODS)[number];

export type RouteMap = Readonly<Record<string, Readonly<Partial<Record<Method, RouteHandler>>>>>;
