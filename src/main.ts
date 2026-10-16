import { handler } from "./web/app.ts";
import { PORT } from "./lib/env.ts";

Deno.serve({ port: PORT }, handler);
