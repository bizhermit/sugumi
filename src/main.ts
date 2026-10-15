import { handler } from "./app.ts";
import { PORT } from "./config.ts";

Deno.serve({ port: PORT }, handler);
