import { page } from "../../web/html-document.tsx";
import { loginAccountSlot } from "../auth/login-account.ts";

function get(req: Request) {
  const loginAccount = loginAccountSlot.get(req);

  return page({
    title: "ホーム",
    slots: {
      main: (
        <>
          <h1>ホーム</h1>
          <p>
            <span>
              {loginAccount.id} | {loginAccount.name}
            </span>
          </p>
        </>
      ),
    },
  });
}

export { get };
