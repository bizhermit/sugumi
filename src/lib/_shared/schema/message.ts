import type { TranslateDynamic } from "../i18n.ts";
import type { Issue } from "./types.ts";

const DEFAULT_LABEL_KEY = "schema.label";

export function formatIssue(issue: Issue, t: TranslateDynamic): string {
  const label = typeof issue.params.label === "string" ? issue.params.label : DEFAULT_LABEL_KEY;
  return t(issue.key, { ...issue.params, label: t(label) });
}
