import { Form } from "../../components/form/form.tsx";
import { appSlot } from "../../web/context.ts";
import { page } from "../../web/html-document.tsx";
import { clearSessionCookie, deleteSession, sessionSlot } from "./session.ts";

function get(req: Request) {
  return page({
    title: "ログアウト",
    slots: {
      main: (
        <main>
          <h1>ログアウト</h1>
          <Form req={req} method="post" action="/logout">
            <button type="submit">ログアウト</button>
          </Form>
        </main>
      ),
    },
  });
}

async function post(req: Request): Promise<Response> {
  const { db } = appSlot.get(req);
  const session = sessionSlot.get(req);
  await deleteSession(db, session.token);
  return new Response(null, {
    status: 303,
    headers: { Location: "/login", "set-cookie": clearSessionCookie() },
  });
}

export { get, post };
