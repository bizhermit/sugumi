import { slot } from "../../web/slot.ts";

export type LoginAccount = {
  readonly id: number;
  readonly username: string;
  readonly displayName: string;
};

export const loginAccountSlot = slot<LoginAccount>("loginAccount");
