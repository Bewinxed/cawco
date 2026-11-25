/**
 * THE PERSON'S OWN ACTS: the one list of what only the person does, refused
 * to every caller that is not the person (hub-auth.ts `allows`), an agent's
 * browser above all (the owner, 2026-11-25: an agent's browser "acts as
 * that agent, with the same powers its tools already have"; what stays his
 * is the permission stop and his recorded picks). Each entry names the act
 * in the words its refusal says.
 *
 * - approving a harness's permission prompt or answering the person's asks:
 *   the dashboard's socket (relay-control.ts `relayPermissionAnswer`, which
 *   answers only on a person's dashboard) and an approved action's approval;
 * - picks on decision cards and pages: their Send, and a write of a page's
 *   picks into its doc (artifacts/gate.ts, `agent` writers);
 * - pairing and the person's devices;
 * - sign-ins: accounts, connections, MCP servers, tools, OpenRouter,
 *   GitHub's CLI, and the keys they keep;
 * - passkeys, and a browser's take-over, hand-back and forgotten sign-ins;
 * - install codes, and the person's preview pass (an agent's is its own,
 *   from `artifact_browse`).
 *
 * Besides it, an agent's browser writes no fleet setting
 * ({@link fleetSettingWrite}): its agent's admin tool does, as the person's
 * ask outside Full Send.
 */

import { RESOLVE_PERMISSION } from "@cawco/core/ask-tools";
import { CONTROL_SET_PERMISSION_MODE } from "@cawco/core/session/controls";

/** One of the person's own acts: the requests that make it, and its words. */
interface PersonAct {
  /** `*` any method. */
  readonly method: string;
  readonly path: RegExp;
  readonly words: string;
}

const PERMISSION =
  "Approving a permission prompt or answering the person's ask is the person's alone.";
export const PICK_WORDS = "A pick on a decision card is the person's alone.";
const PAIRING = "Pairing and the person's devices are the person's alone.";
const SIGN_IN = "A sign-in, and the keys it keeps, is the person's alone.";
const PASSKEY = "Passkeys are the person's alone.";
const TAKEOVER = "Only the person takes over a browser.";
const FORGET = "Only the person forgets a browser's sign-ins.";
const INSTALL = "An install and its one-time code are the person's alone.";
const PREVIEW_PASS =
  "The person's preview pass is theirs alone: an agent opens a preview at the address artifact_browse answers.";

const PERSON_ACTS: readonly PersonAct[] = [
  {
    method: "*",
    path: /^\/api\/actions\/[^/]+\/(?:approve|deny)$/u,
    words: PERMISSION,
  },
  {
    method: "POST",
    path: /^\/api\/instances\/[^/]+\/artifacts\/[^/]+\/send$/u,
    words: PICK_WORDS,
  },
  {
    method: "POST",
    path: /^\/api\/projects\/[^/]+\/decisions\/[^/]+\/send$/u,
    words: PICK_WORDS,
  },
  { method: "PUT", path: /^\/api\/auth\/pairing$/u, words: PAIRING },
  { method: "*", path: /^\/api\/pair\/requests(?:\/.*)?$/u, words: PAIRING },
  { method: "*", path: /^\/api\/devices(?:\/.*)?$/u, words: PAIRING },
  { method: "*", path: /^\/api\/push\/devices(?:\/.*)?$/u, words: PAIRING },
  { method: "*", path: /^\/api\/person\/devices(?:\/.*)?$/u, words: PAIRING },
  {
    method: "*",
    path: /^\/api\/machines\/waiting\/[^/]+\/(?:admit|refuse)$/u,
    words: PAIRING,
  },
  { method: "POST", path: /^\/api\/accounts$/u, words: SIGN_IN },
  { method: "*", path: /^\/api\/accounts\/move-login$/u, words: SIGN_IN },
  { method: "*", path: /^\/api\/accounts\/home-credentials$/u, words: SIGN_IN },
  { method: "*", path: /^\/api\/accounts\/[^/]+\/key$/u, words: SIGN_IN },
  {
    method: "*",
    path: /^\/api\/accounts\/[^/]+\/machines\/[^/]+\/(?:codex-)?signin(?:\/.*)?$/u,
    words: SIGN_IN,
  },
  {
    method: "*",
    path: /^\/api\/connections\/oauth(?:\/.*)?$/u,
    words: SIGN_IN,
  },
  {
    method: "*",
    path: /^\/api\/connections\/[^/]+\/(?:sign-in|key|app)$/u,
    words: SIGN_IN,
  },
  { method: "*", path: /^\/api\/fleet\/mcp\/oauth(?:\/.*)?$/u, words: SIGN_IN },
  { method: "*", path: /^\/api\/fleet\/mcp\/[^/]+\/sign-in$/u, words: SIGN_IN },
  {
    method: "*",
    path: /^\/api\/machines\/[^/]+\/tools\/[^/]+\/signin(?:\/.*)?$/u,
    words: SIGN_IN,
  },
  { method: "*", path: /^\/api\/github-sign-in(?:\/.*)?$/u, words: SIGN_IN },
  { method: "*", path: /^\/api\/openrouter(?:\/.*)?$/u, words: SIGN_IN },
  { method: "*", path: /^\/api\/jev\/typesafe-key$/u, words: SIGN_IN },
  { method: "*", path: /^\/api\/relays\/[^/]+\/secret$/u, words: SIGN_IN },
  {
    method: "*",
    path: /^\/api\/browsers\/[^/]+\/(?:takeover|handback)$/u,
    words: TAKEOVER,
  },
  { method: "*", path: /^\/ws\/browser\//u, words: TAKEOVER },
  { method: "*", path: /^\/api\/browsers\/[^/]+\/remove$/u, words: FORGET },
  {
    method: "*",
    path: /^\/api\/browsers\/[^/]+\/passkey-advert$/u,
    words: PASSKEY,
  },
  // The installer's own report of how it ended (an open route its code
  // authenticates) is the installer's, not the person's act.
  {
    method: "*",
    path: /^\/api\/installs(?!\/code\/)(?:\/.*)?$/u,
    words: INSTALL,
  },
  {
    method: "*",
    path: /^\/api\/preview-(?:ticket|pass)$/u,
    words: PREVIEW_PASS,
  },
];

/** The words that refuse `method path` to anyone but the person, or undefined when it is no act of theirs alone ({@link PERSON_ACTS}). */
export const personActOf = (
  method: string,
  path: string
): string | undefined => {
  const verb = method === "HEAD" ? "GET" : method;
  return PERSON_ACTS.find(
    (act) => (act.method === "*" || act.method === verb) && act.path.test(path)
  )?.words;
};

/** The fleet's settings, which the admin tools write (admin-calls.ts). */
const FLEET_SETTINGS: readonly RegExp[] = [
  /^\/api\/fleet(?:\/.*)?$/u,
  /^\/api\/delegate-types(?:\/.*)?$/u,
  /^\/api\/rules(?:\/.*)?$/u,
  /^\/api\/connections(?:\/.*)?$/u,
  /^\/api\/preview-settings$/u,
];

/** Why an agent's browser writes no fleet setting: its agent's admin tool does, as the person's ask outside Full Send. */
export const FLEET_SETTING_WORDS =
  "An agent changes the fleet's settings with its admin tools (admin_*_write), which ask the person outside Full Send, never from its browser.";

/** Whether `method path` writes a fleet setting ({@link FLEET_SETTINGS}). */
export const fleetSettingWrite = (method: string, path: string): boolean =>
  method !== "GET" &&
  method !== "HEAD" &&
  FLEET_SETTINGS.some((pattern) => pattern.test(path));

/**
 * The dashboard frames that carry the person's own material, which no
 * socket but the person's is sent (wire-socket.ts `limitLine`): the
 * installs and their one-time codes, the pairings and waiting machines,
 * and the passkeys.
 */
const PERSON_FRAMES: ReadonlySet<string> = new Set([
  "installs",
  "hub_auth",
  "passkey_qr",
  "passkey_status",
  "passkey_advert",
]);

/** Whether a socket that is not the person's is sent `message` ({@link PERSON_FRAMES}). */
export const notPersonsOwn = (message: object): boolean => {
  const payload = "payload" in message ? message.payload : undefined;
  return !(
    typeof payload === "object" &&
    payload !== null &&
    "kind" in payload &&
    typeof payload.kind === "string" &&
    PERSON_FRAMES.has(payload.kind)
  );
};

/**
 * The controls of a dashboard's socket that are the person's alone, by
 * method, and their words: answering a permission prompt or an ask, and a
 * session's permission mode, which is where its prompts stop. Refused on a
 * socket that is not the person's dashboard (relay-control.ts
 * `relayControl`, which every control and Ledger command goes through).
 */
export const PERSON_CONTROLS: ReadonlyMap<string, string> = new Map([
  [RESOLVE_PERMISSION, PERMISSION],
  [
    CONTROL_SET_PERMISSION_MODE,
    "A session's permission mode, where its prompts stop, is the person's alone.",
  ],
]);

/**
 * What a socket of an agent's browser may not send because the hub would
 * record it as the person's (server.ts `dashboardMessage`): a message to a
 * session and its withdrawal (Ledger `send`, `send.withdraw`), a session
 * started from the dashboard (`spawn`, its row the person's start), and
 * the extension's passkey advert (`frames`). The agent sends with
 * `handoff`, starts with `delegate` or `start_session`, and names itself.
 * Beside them, the place picker's listing of a machine's folders (`fs`),
 * which reaches past any agent's own boundary, and no tool of an agent's
 * does.
 */
export const PERSON_SOCKET_WORDS: ReadonlyMap<string, string> = new Map([
  [
    "send",
    "A message from the dashboard is the person's: an agent messages a session with handoff, which names it.",
  ],
  [
    "send.withdraw",
    "A message from the dashboard is the person's: an agent messages a session with handoff, which names it.",
  ],
  [
    "spawn",
    "A session started from the dashboard is the person's: an agent starts one with delegate or start_session, which names it.",
  ],
  ["frames", PASSKEY],
  // Not the person's words but the person's own reach: the place picker
  // lists any folder of a machine, and no agent tool does; an agent reads
  // its own workspace with its tools.
  [
    "fs",
    "Listing a machine's folders is the person's place picker: an agent reads its own workspace with its own tools.",
  ],
]);
