import { FieldErrors } from "../../components/form/field-errors.tsx";
import { Form } from "../../components/form/form.tsx";
import { asset } from "../../web/assets.ts";
import { appSlot } from "../../web/context.ts";
import { createCsrfCookie, createCsrfToken } from "../../web/csrf.ts";
import { formSlot, inputAttributes, validateForm, type FormErrors } from "../../web/form.ts";
import { Page, page } from "../../web/html-document.tsx";
import { remoteAddressSlot } from "../../web/remote-address.ts";
import { s } from "../../lib/schema/index.ts";
import { authenticate, USERNAME_MAX_LENGTH } from "./accounts.ts";
import { deviceCookie, readDeviceToken, readUserAgent } from "./login-devices.ts";
import { PASSWORD_MAX_LENGTH } from "./password.ts";
import { DEFAULT_RETURN_PATH, RETURN_TO_PARAM_NAME, toReturnPath } from "./return-to.ts";
import { createSession, deleteSession, findSession, sessionCookie } from "./session.ts";

const styles = [asset(import.meta.resolve("./_assets/login.css"))];
const scripts = [asset(import.meta.resolve("./_assets/login.ts"))];

const loginForm = s.object({
  username: s.string({ required: true, maxLength: USERNAME_MAX_LENGTH, label: "ユーザー" }),
  password: s.string({ required: true, maxLength: PASSWORD_MAX_LENGTH, trim: false, label: "パスワード" }),
  [RETURN_TO_PARAM_NAME]: s.string(),
});

type LoginPageOptions = {
  readonly username?: string;
  readonly returnTo?: string;
  readonly message?: string;
  readonly errors?: FormErrors;
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
          <FieldErrors errors={options.errors} name="" />
          <Form req={req} method="post" action="/login" className="login-form">
            {options.returnTo != null && <input type="hidden" name={RETURN_TO_PARAM_NAME} value={options.returnTo} />}
            <p>
              <label>
                ユーザー{" "}
                <input
                  {...inputAttributes(loginForm, "username")}
                  name="username"
                  autocomplete="username"
                  value={options.username ?? ""}
                />
              </label>
              <FieldErrors errors={options.errors} name="username" />
            </p>
            <p>
              <label>
                パスワード{" "}
                <input
                  {...inputAttributes(loginForm, "password")}
                  type="password"
                  name="password"
                  autocomplete="current-password"
                />
              </label>
              <FieldErrors errors={options.errors} name="password" />
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
  const returnTo = toReturnPath(new URL(req.url).searchParams.get(RETURN_TO_PARAM_NAME));
  return loginPage(req, returnTo == null ? {} : { returnTo });
}

async function post(req: Request): Promise<Response | Page> {
  const { db, logger, login, session } = appSlot.get(req);
  const form = validateForm(loginForm, formSlot.get(req));
  if (form.warnings.length > 0) {
    logger.warn("ログインフォームに想定外の入力があります。", {
      count: form.warnings.length,
      paths: form.warnings.slice(0, 10).map((warning) => warning.path.join(".")),
    });
  }
  if (!form.ok) {
    const returnTo = toReturnPath(form.values[RETURN_TO_PARAM_NAME]);
    return loginPage(req, {
      status: 400,
      errors: form.errors,
      ...(form.values.username == null ? {} : { username: form.values.username }),
      ...(returnTo == null ? {} : { returnTo }),
    });
  }
  const { username, password } = form.data;
  const returnTo = toReturnPath(form.data[RETURN_TO_PARAM_NAME]);

  const remoteAddress = remoteAddressSlot.get(req);
  const result = await authenticate(db, login, {
    username,
    password,
    remoteAddress,
    deviceToken: readDeviceToken(req),
    userAgent: readUserAgent(req),
  });
  if (result.status !== "ok") {
    // 失敗の種類は画面に出さず、ログに残す。ロックと遮断の開始は運用で気付けるようwarnにする。
    const accountId = "accountId" in result ? result.accountId : undefined;
    logger.info("ログインに失敗しました。", { reason: result.status, accountId, remoteAddress });
    if (result.status === "wrong_password" && result.locksAccount) {
      logger.warn("アカウントをロックしました。", { accountId });
    }
    if (result.status === "address_blocked" && result.blocksAddress) {
      logger.warn("接続元からのログインを遮断しました。", { remoteAddress });
    }
    return loginPage(req, {
      status: 401,
      username,
      message: "ユーザー名またはパスワードが違います。",
      ...(returnTo == null ? {} : { returnTo }),
    });
  }

  const previous = await findSession(db, session, req);
  if (previous != null) {
    await deleteSession(db, previous.token);
  }
  const { account, device } = result;
  const token = await createSession(db, session, account.id);
  logger.info("ログインしました。", { accountId: account.id, newDevice: device.isNew, remoteAddress });
  const headers = new Headers({ Location: returnTo ?? DEFAULT_RETURN_PATH });
  headers.append("set-cookie", sessionCookie(token));
  headers.append("set-cookie", deviceCookie(login, device.token));
  headers.append("set-cookie", createCsrfCookie(createCsrfToken()));
  return new Response(null, { status: 303, headers });
}

export { get, post };
