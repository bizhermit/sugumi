import type { Logger } from "../lib/logger.ts";
import { slot } from "./slot.ts";

export type AppContext = {
  readonly logger: Logger;
};

export const appSlot = slot<AppContext>("app");
