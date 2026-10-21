import assert from "node:assert/strict";
import type { RouteContext } from "../../src/web/router.ts";
import { slot } from "../../src/web/slot.ts";

const newCtx = () => ({}) as RouteContext;

Deno.test("slot: set した値を、同じ ctx でだけ読める", () => {
  const account = slot<string>("account");
  const ctx = newCtx();
  account.set(ctx, "alice");
  assert.equal(account.get(ctx), "alice");
  assert.equal(account.find(ctx), "alice");
  // ほかのリクエストの ctx からは見えない
  assert.equal(account.find(newCtx()), undefined);
  // 同じ ctx でも、別の slot とは混ざらない
  assert.equal(slot<string>("account").find(ctx), undefined);
});

Deno.test("slot: set していなければ、get は例外、find は undefined", () => {
  const account = slot<string>("account");
  assert.throws(() => account.get(newCtx()), /slot "account" に値が設定されていません/);
  assert.equal(account.find(newCtx()), undefined);
});

Deno.test("slot: undefined を set した場合は、set していない場合と区別する", () => {
  const value = slot<string | undefined>("value");
  const ctx = newCtx();
  value.set(ctx, undefined);
  assert.equal(value.get(ctx), undefined);
});
