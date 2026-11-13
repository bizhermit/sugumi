import type { Issue } from "./types.ts";
import { formatIssues } from "./message.ts";

export class SchemaError extends Error {
  readonly issues: Issue[];

  constructor(issues: Issue[]) {
    super(formatIssues(issues));
    this.name = "SchemaError";
    this.issues = issues;
  }
}

export type SuccessResult<T> = { readonly success: true; readonly data: T; readonly issues?: Issue[] };
export type FailureResult = { readonly success: false; readonly error: SchemaError };
export type ParseResult<T> = SuccessResult<T> | FailureResult;

export type FailureIssues = { readonly success: false; readonly issues: Issue[] };
export type InternalResult<T> = SuccessResult<T> | FailureIssues;

export function ok<T>(data: T, issues?: Issue[]): SuccessResult<T> {
  return issues != null && issues.length > 0 ? { success: true, data, issues } : { success: true, data };
}

export function fail(issues: Issue[]): FailureIssues {
  return { success: false, issues };
}

export function hasErrorSeverity(issues: Issue[]): boolean {
  return issues.some((issue) => issue.type === "error");
}
