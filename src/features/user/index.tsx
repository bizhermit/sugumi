import { page } from "../../web/html-document.tsx";
import { i18nSlot } from "../../web/i18n.ts";

function get(req: Request) {
  const { t } = i18nSlot.get(req);

  return page({
    title: (outer) => `${outer} | ${t("user.index.title")}`,
    slots: {
      main: (
        <>
          <h1>{t("user.index.heading")}</h1>
        </>
      ),
    },
  });
}

export { get };
