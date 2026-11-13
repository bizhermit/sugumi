import type { LoginLimits, SessionLimits } from "../lib/config.ts";
import type { DataBase } from "../lib/db.ts";
import type { Logger } from "../lib/logger.ts";
import { slot } from "./slot.ts";

export type AppContext = {
  readonly logger: Logger;
  readonly db: DataBase;
  readonly trustProxy: boolean;
  readonly login: LoginLimits;
  readonly session: SessionLimits;
};

export const appSlot = slot<AppContext>("app");
