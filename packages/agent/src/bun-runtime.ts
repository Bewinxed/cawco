import { join } from "node:path";
import { binaryRoot } from "@cawco/core/binary-installation";
import { standalone } from "@cawco/core/runtime";

/**
 * The bun CawCo's own plain Bun scripts run on, which load nothing of a
 * person's project: the boundary's host, judge and log client, and the login
 * keychain's lock probe (login-keychain.ts). The runtime CawCo itself runs
 * on: `<binary root>/run` with {@link BUN_SCRIPT_ENV} in a binary install,
 * the bun running the agent in a checkout, never whichever is on PATH (a
 * checkout's agent on a machine whose PATH has no bun refused every
 * workspace: "bun is not there, so its boundary scripts could not run",
 * probe-kit user-bun, r208). Anything run against a project or workspace
 * runs on the machine's own bun instead (user-bun.ts).
 */
export const bunScriptRuntime = (): string =>
  standalone ? join(binaryRoot(), "run") : process.execPath;

/** What {@link bunScriptRuntime} needs in its environment: a binary install's runs as bun only with `BUN_BE_BUN=1`. */
export const BUN_SCRIPT_ENV: Readonly<Record<string, string>> = standalone
  ? { BUN_BE_BUN: "1" }
  : {};
