import { FieldErrors } from "../../components/form/field-errors.tsx";
import { Form } from "../../components/form/form.tsx";
import { PasswordInput } from "../../components/form/password-input.tsx";
import { appSlot } from "../../web/context.ts";
import { formSlot, inputAttributes, validateForm, type FormErrors } from "../../web/form.ts";
import { Page, page } from "../../web/html-document.tsx";
import { changePassword, type ChangePasswordResult } from "../auth/accounts.ts";
import { loginAccountSlot } from "../auth/login-account.ts";
import { deleteOtherSessions, sessionSlot } from "../auth/session.ts";
import { passwordChangeMessages, passwordChangeSchema } from "./_shared/password-change.ts";

const PATH = "/user/password";
const DONE_PARAM_NAME = "done";

function failureErrors(result: Exclude<ChangePasswordResult, { status: "ok" }>): FormErrors {
  if (result.status === "wrong_password") {
    return {
      currentPassword: [
        result.locksAccount
          ? "現在のパスワードが違います。間違いが続いたため、アカウントをロックしました"
          : "現在のパスワードが違います",
      ],
    };
  }
  if (result.status === "locked") {
    return { "": ["アカウントがロックされています。しばらくしてからやり直してください"] };
  }
  return { newPassword: ["現在のパスワードと違うものを入力してください"] };
}

type PasswordPageOptions = {
  readonly message?: string;
  readonly errors?: FormErrors;
  readonly status?: number;
};

function passwordPage(req: Request, options: PasswordPageOptions = {}): Page {
  return page({
    status: options.status,
    title: "パスワード変更",
    slots: {
      main: (
        <>
          <h1>パスワード変更</h1>
          {options.message != null && <p>{options.message}</p>}
          <FieldErrors errors={options.errors} name="" />
          <Form req={req} method="post" action={PATH}>
            <p>
              <label>
                現在のパスワード{" "}
                <PasswordInput
                  {...inputAttributes(passwordChangeSchema, "currentPassword")}
                  name="currentPassword"
                  autocomplete="current-password"
                />
              </label>
              <FieldErrors errors={options.errors} name="currentPassword" />
            </p>
            <p>
              <label>
                新しいパスワード{" "}
                <PasswordInput
                  {...inputAttributes(passwordChangeSchema, "newPassword")}
                  name="newPassword"
                  autocomplete="new-password"
                />
              </label>
              <FieldErrors errors={options.errors} name="newPassword" />
            </p>
            <p>
              <label>
                新しいパスワード（確認）{" "}
                <PasswordInput
                  {...inputAttributes(passwordChangeSchema, "confirmPassword")}
                  name="confirmPassword"
                  autocomplete="new-password"
                />
              </label>
              <FieldErrors errors={options.errors} name="confirmPassword" />
            </p>
            <p>
              <button type="submit">変更</button>
            </p>
          </Form>
        </>
      ),
    },
  });
}

function get(req: Request): Page {
  const done = new URL(req.url).searchParams.has(DONE_PARAM_NAME);
  return passwordPage(req, done ? { message: "パスワードを変更しました。" } : {});
}

async function post(req: Request): Promise<Response | Page> {
  const { db, logger, login } = appSlot.get(req);
  const account = loginAccountSlot.get(req);
  const form = validateForm(passwordChangeSchema, formSlot.get(req), { messages: passwordChangeMessages });
  if (form.warnings.length > 0) {
    logger.warn("パスワード変更フォームに想定外の入力があります。", {
      count: form.warnings.length,
      paths: form.warnings.slice(0, 10).map((warning) => warning.path.join(".")),
    });
  }
  if (!form.ok) {
    return passwordPage(req, { status: 400, errors: form.errors });
  }

  const result = await changePassword(db, login, account.id, form.data.currentPassword, form.data.newPassword);
  if (result.status !== "ok") {
    logger.info("パスワードの変更に失敗しました。", { reason: result.status, accountId: account.id });
    if (result.status === "wrong_password" && result.locksAccount) {
      logger.warn("アカウントをロックしました。", { accountId: account.id });
    }
    return passwordPage(req, { status: 400, errors: failureErrors(result) });
  }

  // 他の端末でログインしたままのセッションは、パスワードを知らない第三者のものかもしれないので失効させる。
  await deleteOtherSessions(db, account.id, sessionSlot.get(req).token);
  logger.info("パスワードを変更しました。", { accountId: account.id });
  return new Response(null, { status: 303, headers: { Location: `${PATH}?${DONE_PARAM_NAME}` } });
}

export { get, post };
