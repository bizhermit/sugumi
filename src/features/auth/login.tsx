import { Form } from "../../components/form/form.tsx";
import { asset } from "../../web/assets.ts";
import { appSlot } from "../../web/context.ts";
import { createCsrfCookie, createCsrfToken } from "../../web/csrf.ts";
import { formSlot } from "../../web/form.ts";
import { Page, page } from "../../web/html-document.tsx";
import { STATUS_TEXTS } from "../../web/http-error.ts";
import { authenticate, USERNAME_MAX_LENGTH } from "./accounts.ts";
import { PASSWORD_MAX_LENGTH } from "./password.ts";
import { createSession, deleteSession, findSession, sessionCookie } from "./session.ts";

const styles = [asset(import.meta.resolve("./_assets/login.css"))];
const scripts = [asset(import.meta.resolve("./_assets/login.ts"))];

type LoginPageOptions = {
  readonly username?: string;
  readonly message?: string;
  readonly status?: number;
};

function loginPage(req: Request, options: LoginPageOptions = {}) {
  return page({
    status: options.status,
    title: "ログイン",
    styles,
    scripts,
    slots: {
      main: (
        <main>
          <h1>ログイン</h1>
          {options.message != null && <p className="login-message">{options.message}</p>}
          <Form req={req} method="post" action="/login" className="login-form">
            <p>
              <label>
                ユーザー{" "}
                <input
                  name="username"
                  autocomplete="username"
                  required
                  maxlength={USERNAME_MAX_LENGTH}
                  value={options.username ?? ""}
                />
              </label>
            </p>
            <p>
              <label>
                パスワード{" "}
                <input
                  type="password"
                  name="password"
                  autocomplete="current-password"
                  required
                  maxlength={PASSWORD_MAX_LENGTH}
                />
              </label>
            </p>
            <p>
              <button type="submit">ログイン</button>
            </p>
          </Form>
        </main>
      ),
    },
  });
}

function get(req: Request): Page {
  return loginPage(req);
}

async function post(req: Request): Promise<Response | Page> {
  const { db } = appSlot.get(req);
  const form = formSlot.get(req);
  const username = form.get("username");
  const password = form.get("password");
  if (typeof username !== "string" || typeof password !== "string") {
    return new Response(STATUS_TEXTS[400], { status: 400 });
  }

  const account = await authenticate(db, username, password);
  if (account == null) {
    return loginPage(req, { status: 401, username, message: "ユーザー名またはパスワードが違います。" });
  }

  const previous = await findSession(db, req);
  if (previous != null) {
    await deleteSession(db, previous.token);
  }
  const token = await createSession(db, account.id);
  const headers = new Headers({ Location: "/home" });
  headers.append("set-cookie", sessionCookie(token));
  headers.append("set-cookie", createCsrfCookie(createCsrfToken()));
  return new Response(null, { status: 303, headers });
}

export { get, post };
