import { page } from "../../web/html-document.tsx";

function get() {
  return page({
    title: "ホーム",
    slots: {
      main: (
        <>
          <h1>ホーム</h1>
        </>
      ),
    },
  });
}

export { get };
