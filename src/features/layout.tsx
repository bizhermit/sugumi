import { asset } from "../web/assets.ts";
import type { Layout } from "../web/html-document.tsx";

const rootLayout: Layout = {
  title: "WebAPP",
  styles: [asset(import.meta.resolve("./_assets/global.css"))],
  scripts: [asset(import.meta.resolve("./_assets/index.ts"))],
};

export { rootLayout };
