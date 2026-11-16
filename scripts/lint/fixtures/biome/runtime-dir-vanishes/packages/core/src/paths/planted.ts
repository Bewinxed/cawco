import { join } from "node:path";

const sessionIdentityDir = (): string =>
  "/run/user/1000/cawco/session-identity";
export const accountHome = (id: string): string =>
  join(sessionIdentityDir(), "opencode-accounts", id);
export const store = (): string =>
  join(process.env.XDG_RUNTIME_DIR ?? "", "cawco", "store.db");
