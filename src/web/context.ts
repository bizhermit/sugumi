import type { DataBase } from "../lib/db.ts";
import type { Logger } from "../lib/logger.ts";
import { slot } from "./slot.ts";

export type AppContext = {
  readonly logger: Logger;
  readonly db: DataBase;
};

export const appSlot = slot<AppContext>("app");
