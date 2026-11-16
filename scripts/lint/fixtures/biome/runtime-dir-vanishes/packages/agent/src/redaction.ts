import { join } from "node:path";

const sessionIdentityDir = (): string =>
  "/run/user/1000/cawco/session-identity";
export const storeFile = (): string =>
  join(sessionIdentityDir(), "redact-hub.json");
