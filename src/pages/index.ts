export default function (req: Request): Response {
  return Response.redirect(new URL("/login", req.url), 302);
}
