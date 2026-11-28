import { page } from "../../web/html-document.tsx";
import { i18nSlot } from "../../web/i18n.ts";
import { loginAccountSlot } from "../auth/login-account.ts";

function get(req: Request) {
  const loginAccount = loginAccountSlot.get(req);
  const { t } = i18nSlot.get(req);
  const pageTitle = t("user.home.title");

  return page({
    title: (outer) => `${outer} | ${pageTitle}`,
    slots: {
      main: (
        <>
          <h1>{pageTitle}</h1>
          <p>
            <span>{loginAccount.displayName}</span>
          </p>
        </>
      ),
    },
  });
}

export { get };
