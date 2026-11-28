import { FormMessages } from "../../components/form/form-message.tsx";
import { Form } from "../../components/form/form.tsx";
import { PasswordInput } from "../../components/form/password-input.tsx";
import { asset } from "../../web/assets.ts";
import { appSlot } from "../../web/context.ts";
import { createCsrfCookie, createCsrfToken } from "../../web/csrf.ts";
import type { Issue } from "../../lib/_shared/schema/types.ts";
import { inputAttributes, validateForm } from "../../web/_shared/form.ts";
import { formSlot } from "../../web/form.ts";
import { i18nSlot } from "../../web/i18n.ts";
import { Page, page } from "../../web/html-document.tsx";
import { remoteAddressSlot } from "../../web/remote-address.ts";
import { DEFAULT_RETURN_PATH, loginSchema, RETURN_TO_PARAM_NAME } from "./_shared/login.ts";
import { authenticate } from "./accounts.ts";
import { deviceCookie, readDeviceToken, readUserAgent } from "./login-devices.ts";
import { toReturnPath } from "./return-to.ts";
import { createSession, deleteSession, findSession, sessionCookie } from "./session.ts";

const styles = [asset(import.meta.resolve("./_client/login.css"))];

type LoginPageOptions = {
  readonly username?: string;
  readonly returnTo?: string;
  readonly message?: string;
  readonly issues?: readonly Issue[];
  readonly status?: number;
};

function loginPage(req: Request, options: LoginPageOptions = {}) {
  const { t } = i18nSlot.get(req);
  const pageTitle = t("auth.login.title");

  return page({
    status: options.status,
    title: (outer) => `${outer} | ${pageTitle}`,
    styles,
    slots: {
      main: (
        <main>
          <h1>{pageTitle}</h1>
          {options.message != null && <p className="login-message">{options.message}</p>}
          <FormMessages req={req} issues={options.issues} />
          <Form req={req} method="post" action="/login" className="login-form">
            {options.returnTo != null && <input type="hidden" name={RETURN_TO_PARAM_NAME} value={options.returnTo} />}
            <p>
              <label>
                <span>{t("auth.username")}</span>
                <input
                  {...inputAttributes(loginSchema, "username")}
                  name="username"
                  autocomplete="username"
                  value={options.username ?? ""}
                />
              </label>
              <FormMessages req={req} issues={options.issues} name="username" />
            </p>
            <p>
              <label>
                <span>{t("auth.password")}</span>
                <PasswordInput
                  {...inputAttributes(loginSchema, "password")}
                  name="password"
                  autocomplete="current-password"
                />
              </label>
              <FormMessages req={req} issues={options.issues} name="password" />
            </p>
            <p>
              <button type="submit">{t("auth.login.submit")}</button>
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
  const form = validateForm(loginSchema, formSlot.get(req));
  if (!form.ok) {
    const returnTo = toReturnPath(form.values[RETURN_TO_PARAM_NAME]);
    return loginPage(req, {
      status: 400,
      issues: form.issues,
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
      message: i18nSlot.get(req).t("auth.login.failed"),
      ...(returnTo == null ? {} : { returnTo }),
    });
  }

  const previousSession = await findSession(db, session, req);
  if (previousSession != null) {
    await deleteSession(db, previousSession.token);
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
