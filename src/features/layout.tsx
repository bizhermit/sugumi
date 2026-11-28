import { asset } from "../web/assets.ts";
import type { Layout } from "../web/html-document.tsx";

const rootLayout: Layout = {
  title: "WebAPP",
  styles: [asset(import.meta.resolve("./_client/global.css"))],
  scripts: [asset(import.meta.resolve("./_client/index.ts"))],
};

export { rootLayout };
