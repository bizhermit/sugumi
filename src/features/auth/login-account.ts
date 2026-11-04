import { slot } from "../../web/slot.ts";

export type LoginAccount = {
  readonly id: string;
  readonly name: string;
};

export const loginAccountSlot = slot<LoginAccount>("loginAccount");
