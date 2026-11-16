function get(): Response {
  return new Response("OK", { headers: { "content-type": "text/plain; charset=utf-8" } });
}

export { get };
