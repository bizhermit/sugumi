import { page } from "../../web/html-document.tsx";
import { i18nSlot } from "../../web/i18n.ts";

function get(req: Request) {
  const { t } = i18nSlot.get(req);
  const pageTitle = t("user.settings.title");

  return page({
    title: (outer) => `${outer} | ${pageTitle}`,
    slots: {
      main: (
        <>
          <h1>{pageTitle}</h1>
        </>
      ),
    },
  });
}

export { get };
