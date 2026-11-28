import { Form } from "../../components/form/form.tsx";
import type { Layout } from "../../web/html-document.tsx";
import { i18nSlot } from "../../web/i18n.ts";
import { loginAccountSlot } from "../auth/login-account.ts";

const userLayout: Layout = {
  title: (_outer, req) => i18nSlot.get(req).t("user.title"),
  i18n: ["auth", "user", "form"],
  render: ({ req, slots }) => {
    const { t } = i18nSlot.get(req);

    return (
      <>
        <nav>
          <ul>
            <li>
              <a href="/home">{t("user.nav.home")}</a>
            </li>
            <li>
              <a href="/user">{t("user.nav.user")}</a>
            </li>
            <li>
              <a href="/settings">{t("user.nav.settings")}</a>
            </li>
            <li>
              <a href="/user/password">{t("user.nav.password")}</a>
            </li>
          </ul>
          <Form req={req} method="post" action="/logout">
            <span>{loginAccountSlot.get(req).displayName}</span>{" "}
            <button type="submit">{t("auth.logout.submit")}</button>
          </Form>
        </nav>
        <main>{slots.main}</main>
      </>
    );
  },
};

export { userLayout };
