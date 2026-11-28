import { FormMessages } from "../../components/form/form-message.tsx";
import { Form } from "../../components/form/form.tsx";
import { PasswordInput } from "../../components/form/password-input.tsx";
import { appSlot } from "../../web/context.ts";
import type { Issue } from "../../lib/_shared/schema/types.ts";
import { inputAttributes, validateForm } from "../../web/_shared/form.ts";
import { formSlot } from "../../web/form.ts";
import { i18nSlot } from "../../web/i18n.ts";
import { Page, page } from "../../web/html-document.tsx";
import { changePassword, type ChangePasswordResult } from "../auth/accounts.ts";
import { loginAccountSlot } from "../auth/login-account.ts";
import { deleteOtherSessions, sessionSlot } from "../auth/session.ts";
import { passwordChangeSchema } from "./_shared/password-change.ts";

const PATH = "/user/password";
const DONE_PARAM_NAME = "done";

function failureIssue(result: Exclude<ChangePasswordResult, { status: "ok" }>): Issue {
  if (result.status === "wrong_password") {
    const code = result.locksAccount ? "wrong_locked" : "wrong";
    return { path: ["currentPassword"], type: "error", code, key: `user.password.${code}`, params: {} };
  }
  if (result.status === "locked") {
    return { path: [], type: "error", code: "locked", key: "user.password.locked", params: {} };
  }
  return { path: ["newPassword"], type: "error", code: "same", key: "user.password.same", params: {} };
}

type PasswordPageOptions = {
  readonly message?: string;
  readonly issues?: readonly Issue[];
  readonly status?: number;
};

function passwordPage(req: Request, options: PasswordPageOptions = {}): Page {
  const { t } = i18nSlot.get(req);
  const pageTitle = t("user.password.title");

  return page({
    status: options.status,
    title: (outer) => `${outer} | ${pageTitle}`,
    slots: {
      main: (
        <>
          <h1>{pageTitle}</h1>
          {options.message != null && <p>{options.message}</p>}
          <FormMessages req={req} issues={options.issues} />
          <Form req={req} method="post" action={PATH}>
            <p>
              <label>
                {t("user.password.current")}{" "}
                <PasswordInput
                  {...inputAttributes(passwordChangeSchema, "currentPassword")}
                  name="currentPassword"
                  autocomplete="current-password"
                />
              </label>
              <FormMessages req={req} issues={options.issues} name="currentPassword" />
            </p>
            <p>
              <label>
                {t("auth.newPassword")}{" "}
                <PasswordInput
                  {...inputAttributes(passwordChangeSchema, "newPassword")}
                  name="newPassword"
                  autocomplete="new-password"
                />
              </label>
              <FormMessages req={req} issues={options.issues} name="newPassword" />
            </p>
            <p>
              <label>
                {t("user.password.confirm")}{" "}
                <PasswordInput
                  {...inputAttributes(passwordChangeSchema, "confirmPassword")}
                  name="confirmPassword"
                  autocomplete="new-password"
                />
              </label>
              <FormMessages req={req} issues={options.issues} name="confirmPassword" />
            </p>
            <p>
              <button type="submit">{t("user.password.submit")}</button>
            </p>
          </Form>
        </>
      ),
    },
  });
}

function get(req: Request): Page {
  const done = new URL(req.url).searchParams.has(DONE_PARAM_NAME);
  return passwordPage(req, done ? { message: i18nSlot.get(req).t("user.password.done") } : {});
}

async function post(req: Request): Promise<Response | Page> {
  const { db, logger, login } = appSlot.get(req);
  const account = loginAccountSlot.get(req);
  const form = validateForm(passwordChangeSchema, formSlot.get(req));
  if (!form.ok) {
    return passwordPage(req, { status: 400, issues: form.issues });
  }

  const result = await changePassword(db, login, account.id, form.data.currentPassword, form.data.newPassword);
  if (result.status !== "ok") {
    logger.info("パスワードの変更に失敗しました。", { reason: result.status, accountId: account.id });
    if (result.status === "wrong_password" && result.locksAccount) {
      logger.warn("アカウントをロックしました。", { accountId: account.id });
    }
    return passwordPage(req, { status: 400, issues: [failureIssue(result)] });
  }

  // 他の端末でログインしたままのセッションは、パスワードを知らない第三者が操作している可能性があるため失効させる。
  await deleteOtherSessions(db, account.id, sessionSlot.get(req).token);
  logger.info("パスワードを変更しました。", { accountId: account.id });
  return new Response(null, { status: 303, headers: { Location: `${PATH}?${DONE_PARAM_NAME}` } });
}

export { get, post };
