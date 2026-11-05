/**
 * The fleet as Models CawCo uses › Images reads it, for its stories and its
 * bench (`/dev/models`): the owner's four machines (obelisk-of-light,
 * Omars-MacBook-Pro, niftybot.art, uwucloud) with the accounts and the
 * Antigravity CLI each holds. Shaped as the hub answers them (core
 * protocol `AgentRow`, `/api/accounts`); every value is made up here.
 */
import type { ImageAccounts, ImageMachine } from "@cawco/core/image-readiness";
import type { ToolStatus } from "@cawco/core/tools";

const AT = Date.parse("2026-11-05T09:00:00Z");

const agy = (
  state: ToolStatus["state"],
  signedIn?: "signed-in" | "signed-out",
  detail?: string
): ToolStatus => ({
  id: "antigravity",
  at: AT,
  state,
  ...(state === "installed" ? { version: "1.5.0" } : {}),
  ...(signedIn ? { signin: { at: AT, state: signedIn } } : {}),
  ...(detail ? { detail } : {}),
});

const machine = (
  machineId: string,
  hostname: string,
  os: string,
  tools: ToolStatus | null,
  status = "online"
): ImageMachine => ({
  machineId,
  hostname,
  os,
  status,
  tools: tools ? { antigravity: tools } : {},
});

/**
 * As it stands today: ChatGPT on three of four (uwucloud holds no login),
 * Antigravity on one (the Mac hasn't it, niftybot.art's is signed out,
 * uwucloud's is installing), the Gemini API on one (obelisk-of-light's key).
 */
export const MACHINES: ImageMachine[] = [
  machine(
    "d04ca118428001f1",
    "obelisk-of-light",
    "linux-x64",
    agy("installed", "signed-in")
  ),
  machine(
    "271a214a5d568e4c",
    "Omars-MacBook-Pro.local",
    "darwin-arm64",
    agy("missing")
  ),
  machine(
    "b106e1516d863601",
    "niftybot.art",
    "linux-x64",
    agy("installed", "signed-out")
  ),
  machine(
    "50b2e0c25123cc41",
    "uwucloud",
    "linux-arm64",
    agy("installing"),
    "offline"
  ),
];

const PERSONAL = "acct-chatgpt-personal";
const BOT = "acct-chatgpt-bot";
const KEY = "acct-gemini-key";

const signin = (accountId: string, machineId: string, signedIn = true) => ({
  accountId,
  machineId,
  state: signedIn ? ("signed-in" as const) : ("signed-out" as const),
});

export const ACCOUNTS: ImageAccounts = {
  accounts: [
    {
      id: PERSONAL,
      provider: "openai-codex",
      kind: "oauth",
      label: "Personal",
      email: "omar@petralab.dev",
    },
    {
      id: BOT,
      provider: "openai-codex",
      kind: "oauth",
      label: null,
      email: "bots@niftybot.art",
    },
    {
      id: KEY,
      provider: "google",
      kind: "api_key",
      label: "Studio key",
      email: null,
    },
  ],
  readings: [
    { accountId: PERSONAL, subscription: "pro" },
    { accountId: BOT, subscription: "free" },
  ],
  signins: [
    signin(PERSONAL, "d04ca118428001f1"),
    signin(PERSONAL, "271a214a5d568e4c"),
    signin(BOT, "b106e1516d863601"),
    signin(PERSONAL, "b106e1516d863601", false),
    signin(KEY, "d04ca118428001f1"),
  ],
};

/** Every machine holds every provider's sign-in, the CLI included. */
export const READY_MACHINES: ImageMachine[] = MACHINES.map((one) => ({
  ...one,
  status: "online",
  tools: { antigravity: agy("installed", "signed-in") },
}));

export const READY_ACCOUNTS: ImageAccounts = {
  ...ACCOUNTS,
  readings: [{ accountId: PERSONAL, subscription: "pro" }],
  signins: MACHINES.flatMap((one) => [
    signin(PERSONAL, one.machineId),
    signin(KEY, one.machineId),
  ]),
};

/** A hub that has heard from no machine yet. */
export const NO_MACHINES: ImageMachine[] = [];
