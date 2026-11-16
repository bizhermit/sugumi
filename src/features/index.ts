function get(): Response {
  return new Response(null, { status: 302, headers: { Location: "/login" } });
}

export { get };
