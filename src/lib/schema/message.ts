import type { Issue, MessageDictionary } from "./types.ts";
import { enMessages } from "./messages/en.ts";
import { jaMessages } from "./messages/ja.ts";
import { jaFormMessages } from "./messages/ja-form.ts";

export type { MessageDictionary };
export { enMessages, jaMessages, jaFormMessages };

let currentDefault: MessageDictionary = enMessages;

export function setDefaultMessages(dictionary: MessageDictionary): void {
  // モジュール全体で一意の状態。起動時に1回だけ呼ぶ。リクエストごとに言語を変えるならformatIssuesに辞書を渡す。
  currentDefault = dictionary;
}

export function getDefaultMessages(): MessageDictionary {
  return currentDefault;
}

export function formatIssue(issue: Issue, dictionary: MessageDictionary = currentDefault): string {
  const template = dictionary[issue.key];
  if (template != null) return template(issue.params);
  return `${issue.key}${Object.keys(issue.params).length > 0 ? ` ${JSON.stringify(issue.params)}` : ""}`;
}

export function formatIssues(issues: Issue[], dictionary: MessageDictionary = currentDefault): string {
  return issues
    .map((issue) => `${issue.path.length > 0 ? issue.path.join(".") : "(root)"}: ${formatIssue(issue, dictionary)}`)
    .join("; ");
}

export function resolveLabel(issue: Issue, translate: (label: string) => string): Issue {
  if (typeof issue.params.label !== "string") return issue;
  return { ...issue, params: { ...issue.params, label: translate(issue.params.label) } };
}

export function resolveLabels(issues: Issue[], translate: (label: string) => string): Issue[] {
  return issues.map((issue) => resolveLabel(issue, translate));
}
