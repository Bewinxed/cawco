/**
 * A fleet as Configure › Command-line tools draws it, for the tool sign-in
 * bench (`/motion/tool-signin`) and ToolMatrix's stories: every catalog
 * tool installed, and the Antigravity CLI in the state each machine gives
 * it, its sign-in read as the agent reports it (agent tools.ts
 * `toolSignin`), four minutes ago.
 */
import { MINUTE_MS } from "@cawco/core/time";
import {
  TOOL_CATALOG,
  type ToolSignin,
  type ToolStatus,
} from "@cawco/core/tools";
import { toolWords } from "@cawco/core/words/tools";
import type { Machine } from "./stores/board.svelte";

export const AGY = "antigravity";

const VERSIONS: Record<string, string> = {
  claude: "2.1.321",
  opencode: "2.0.29",
  pi: "1.4.0",
  [AGY]: "1.5.0",
};

const installed = (id: string): ToolStatus => ({
  id,
  state: "installed",
  version: VERSIONS[id] ?? "1.0.0",
  method: "script",
  at: Date.now() - 4 * MINUTE_MS,
});

/** The CLI installed, its sign-in read as `state` (with agy's words for `unknown`). */
export const agyStatus = (
  state?: ToolSignin["state"],
  detail?: string
): ToolStatus => ({
  ...installed(AGY),
  ...(state
    ? {
        signin: {
          state,
          at: Date.now() - 4 * MINUTE_MS,
          ...(detail ? { detail } : {}),
        },
      }
    : {}),
});

/** No copy of the CLI on the machine. */
export const agyMissing: ToolStatus = {
  id: AGY,
  state: "missing",
  at: Date.now() - 4 * MINUTE_MS,
};

/** agy's own words when its read said neither: a keyring it can't open headless. */
export const AGY_UNREAD = toolWords.signinUnread(
  "Antigravity CLI",
  2,
  [
    "Error: keyring: org.freedesktop.secrets was not provided by any .service files",
    'failed to read stored credentials for "antigravity-cli"',
    "run `agy` once with a desktop session to unlock the keyring",
  ].join("\n")
);

/** agy's screen when Google's code didn't take, one line per line as the agent sends it. */
export const AGY_REFUSED_SCREEN = [
  "Paste the authorization code:",
  "Error: invalid_grant: Malformed auth code.",
  "Login failed.",
].join("\n");

export const fleetMachine = (
  machineId: string,
  hostname: string,
  os: string,
  agy: ToolStatus,
  online = true
): Machine => ({
  machineId,
  hostname,
  os,
  status: online ? ("online" as const) : ("offline" as const),
  auth: "unknown",
  lastSeenAt: new Date(
    Date.now() - (online ? 0 : 180 * MINUTE_MS)
  ).toISOString(),
  pausedUntil: null,
  pauseStopped: null,
  tools: {
    ...Object.fromEntries(
      TOOL_CATALOG.filter((spec) => spec.id !== AGY).map((spec) => [
        spec.id,
        installed(spec.id),
      ])
    ),
    [AGY]: agy,
  },
});

/** Eight machines, one in each sign-in state a status reaches. */
export const signinFleet = (): Machine[] => [
  fleetMachine("m-nifty", "niftybot.art", "linux", agyMissing),
  fleetMachine(
    "m-obelisk",
    "obelisk-of-light",
    "linux",
    agyStatus("signed-out")
  ),
  fleetMachine("m-omar", "Omars-MacBook-Pro", "darwin", agyStatus("signed-in")),
  fleetMachine("m-uwu", "uwucloud", "linux", agyStatus("unknown", AGY_UNREAD)),
  fleetMachine("m-hangar", "hangar", "linux", agyStatus("signed-out"), false),
  fleetMachine("m-roost", "roost", "darwin", agyStatus("signed-out")),
  fleetMachine("m-crow", "crowsnest", "linux", agyStatus("signed-out")),
  fleetMachine(
    "m-ledger",
    "ledger-build-runner-eu-west-3.internal",
    "linux",
    agyStatus("signed-out")
  ),
];
