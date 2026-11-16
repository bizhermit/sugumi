import { page } from "../../web/html-document.tsx";

function get() {
  return page({
    title: (outer) => `${outer} | 設定`,
    slots: {
      main: (
        <>
          <h1>ユーザー設定</h1>
        </>
      ),
    },
  });
}

export { get };
