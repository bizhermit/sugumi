import { page } from "../../web/html-document.tsx";

function get() {
  return page({
    title: "設定",
    slots: {
      main: (
        <>
          <h1>設定</h1>
        </>
      ),
    },
  });
}

export { get };
