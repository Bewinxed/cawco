/**
 * Each harness's own words, which its descriptor carries (core
 * harness/descriptor.ts `words`): its name, what each permission mode does
 * on it, Full Send's words, and what CawCo's no-reply tool says there. One
 * set per harness, read through its descriptor, never by its name.
 */
import type { HarnessWords, Lacks, NoReplyWords } from "../harness/descriptor";

/** What still reaches the person in Full Send, on every harness. */
const STILL_ASKS = "Questions still reach you; denied tools never run.";

/** Said when switching into Full Send starts a running session again. */
const RESTARTS =
  "Switching restarts this session in place; its conversation carries over.";

/**
 * The no-reply tool on a harness that ends the turn at the call (core
 * no-reply.ts `END_TURN_META`).
 */
const ENDS_AT_THE_CALL: NoReplyWords = {
  description:
    "Ends this turn with no reply to the person: no push, and the turn is no news on any screen. Call it alone, as the turn's last call, when the turn has nothing for them.",
  result: "This turn ended here with no reply.",
};

/**
 * The no-reply tool on a harness whose loop takes one more step after a
 * step that called a tool (OpenCode's, Codex's), so the turn is no news
 * only when that step writes nothing (hub server.ts `endsOnNoReply`).
 */
const STEPS_ON_AFTER_THE_CALL: NoReplyWords = {
  description:
    "Ends this turn with no reply to the person: no push, and the turn is no news on any screen. Call it alone, as the turn's last call, when the turn has nothing for them.",
  result:
    "No reply this turn. End your step with no text: anything written now reaches the person as a reply.",
};

/** No permission modes, and so no Full Send: pi raises no permission prompt (agent pi-services.ts `capabilities`). */
const PI_NO_MODES: Lacks = {
  lacks: "pi has no permission modes: it raises no permission prompt.",
};

/**
 * Claude Code's. Its `default` runs reads and what your allow rules cover
 * without asking; its Bypass still stops for the CLI's own safety checks,
 * which Full Send approves too (the owner, 2026-10-22: "FULL SEND LITERALLY
 * MEANS FULL SEND"), CawCo's own admin writes included (hub asks.ts).
 */
export const CLAUDE_WORDS = {
  name: "Claude Code",
  modes: {
    default: "Reads and allow-listed tools run; others ask.",
    plan: "Read-only until you approve a plan.",
    acceptEdits: "File edits run without asking.",
    bypassPermissions: "Tools run unasked; safety checks still ask.",
    fullSend: "Everything is approved; only questions ask.",
  },
  fullSend: {
    confirm: [
      "Approves without asking: safety checks, plan approval, your ask rules, and fleet changes like memory, skills, hooks and MCP servers.",
      STILL_ASKS,
    ],
    restarts: RESTARTS,
    warning:
      "Safety checks, plan approval, your ask rules and fleet changes run without asking you. Pick Bypass to have them ask again.",
  },
  noReply: ENDS_AT_THE_CALL,
  usageName: "Claude",
} as const satisfies HarnessWords;

/**
 * OpenCode's. Its own permission settings decide what it asks about; its
 * Bypass already allows every one of them, and Bypass still asks you before
 * CawCo's fleet changes. Its loop takes one more step after any step that
 * called a tool, so the turn is no news only when that step writes nothing
 * (hub server.ts `endsOnNoReply`).
 */
export const OPENCODE_WORDS = {
  name: "OpenCode",
  modes: {
    default: "OpenCode's permission asks come to you.",
    plan: "Runs OpenCode's plan agent.",
    acceptEdits: "Edit asks are allowed; the rest come to you.",
    bypassPermissions: "Every permission ask is allowed.",
    fullSend: "Bypass, and fleet changes are approved too.",
  },
  fullSend: {
    confirm: [
      "Approves without asking, fleet changes like memory, skills, hooks and MCP servers included.",
      STILL_ASKS,
    ],
    restarts: RESTARTS,
    warning:
      "Fleet changes run without asking you. Pick Bypass to have them ask again.",
  },
  noReply: STEPS_ON_AFTER_THE_CALL,
  usageName: "opencode",
} as const satisfies HarnessWords;

/**
 * Why OpenCode can't start a session clean (core harness/descriptor.ts
 * `cleanStartRefused`): its server is an account's, shared by its
 * sessions, and reads the global and project `AGENTS.md` into every one.
 */
export const OPENCODE_NOT_CLEAN =
  "OpenCode can't start a session clean: the server every session of an account shares reads its global and project AGENTS.md into each of them. Start it on Claude Code or pi, or without clean. Nothing was started.";

/** pi's. */
export const PI_WORDS = {
  name: "pi",
  modes: PI_NO_MODES,
  fullSend: PI_NO_MODES,
  noReply: ENDS_AT_THE_CALL,
  usageName: "pi",
} as const satisfies HarnessWords;

/**
 * Codex's. CawCo answers each ask Codex raises for a command or an edit
 * (agent harnesses/codex.ts `CODEX_MODES`); Codex's own sandbox stays off
 * in a workspace, whose boundary holds every command.
 */
export const CODEX_WORDS = {
  name: "Codex",
  modes: {
    default: "Every command and edit asks.",
    plan: "Read-only: nothing is written.",
    acceptEdits: "File edits run without asking; commands ask.",
    bypassPermissions: "Commands and edits run unasked.",
    fullSend: "Bypass, and fleet changes are approved too.",
  },
  fullSend: {
    confirm: [
      "Approves without asking, fleet changes like memory, skills, hooks and MCP servers included.",
      STILL_ASKS,
    ],
    restarts: RESTARTS,
    warning:
      "Fleet changes run without asking you. Pick Bypass to have them ask again.",
  },
  noReply: STEPS_ON_AFTER_THE_CALL,
  usageName: "Codex",
} as const satisfies HarnessWords;
