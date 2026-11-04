import type { Layout } from "../../web/html-document.tsx";

const wrapper: Layout = {
  title: "ユーザー",
  render: (slots) => (
    <>
      <nav>
        <ul>
          <li>
            <a href="/home">ホーム</a>
          </li>
          <li>
            <a href="/user">ユーザー</a>
          </li>
          <li>
            <a href="/settings">設定</a>
          </li>
        </ul>
      </nav>
      <main>{slots.main}</main>
    </>
  ),
};

export { wrapper as userLayout };
