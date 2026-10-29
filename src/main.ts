function handler(_req: Request) {
  return new Response("OK");
}

Deno.serve({ port: 3000 }, handler);
