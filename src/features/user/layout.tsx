import { Form } from "../../components/form/form.tsx";
import type { Layout } from "../../web/html-document.tsx";
import { loginAccountSlot } from "../auth/login-account.ts";

const userLayout: Layout = {
  title: "ユーザー",
  render: (req, slots) => (
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
        <Form req={req} method="post" action="/logout">
          <span>{loginAccountSlot.get(req).displayName}</span> <button type="submit">ログアウト</button>
        </Form>
      </nav>
      <main>{slots.main}</main>
    </>
  ),
};

export { userLayout };
