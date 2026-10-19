/**
 * The approval card's sheet (Component Story Format 3, live components):
 * the permission card over the composer in every state an ask goes
 * through, mounted by CawCo's stage from this file and the real
 * Prompt.svelte. Every story's ask is a fixture tool call
 * (prompt-fixtures.ts) read by core's own `presentPermission`, so every
 * frame says what the hub's surfaces say.
 */
import { presentPermission } from "@cawco/core/permission-presentation";
import Prompt from "./Prompt.svelte";
import { ASKS, type AskFixture, requestOf } from "./prompt-fixtures";

const ask = (fixture: AskFixture) => requestOf(fixture, presentPermission);

/** When the answers below were given: one clock for every decided frame. */
const AT = "2026-10-19T12:41:00Z";
/** The hub keeps a removed setting for a minute (hub db/trash.ts `UNDO_MS`). */
const UNDO_MS = 60_000;
/** An undo the hub honours, after the round trip a restore takes. */
const restore = () =>
  new Promise<string | null>((done) => setTimeout(() => done(null), 400));

export default {
  title: "Transcript/Approval card",
  component: Prompt,
  // The composer's column on a phone, the card's first place; without a
  // form a frame shrinks to the card's narrowest and every line wraps a word
  // a line.
  parameters: { viewport: 390 },
  args: {
    request: ask(ASKS.mcpEdit),
    asker: "the agent",
    askerHref: "/session/s-mobbin",
    place: { at: 2, of: 3 },
    shown: true,
    onanswer: () => null,
  },
};

/** An MCP server edit waiting on the answer: who asks, what changes and why, before and after. */
export const McpWaiting = { args: {} };

/** Approve pressed: the answer is out, Deny dims while it goes. */
export const McpPending = { args: { answering: "allow" } };

/** The hub refused the answer: both answers are live again, its reason under them. */
export const McpRefused = {
  args: {
    answering: "allow",
    refusalOf: () => "The session ended before the answer reached it.",
  },
};

/** The session's machine is offline: the ask stands and its answer waits. */
export const McpOffline = { args: { offline: true, reachable: false } };

/** Approved: the answer stands in the row's place, the card kept as its record. */
export const McpApproved = {
  args: { decided: { outcome: "approved", at: AT } },
  from: "McpWaiting",
  play: async ({ update }: { update: (next: object) => Promise<void> }) => {
    await update({ decided: { outcome: "approved", at: AT } });
  },
};

/** Denied: the refusal stands in the row's place. */
export const McpDenied = { args: { decided: { outcome: "denied", at: AT } } };

/** Withdrawn: the turn moved on before an answer. */
export const McpWithdrawn = {
  args: { decided: { outcome: "withdrawn", at: AT } },
};

/** A curator's change to the fleet's CLAUDE.md: the diff, open, and the notes it comes from. */
export const MemoryWaiting = {
  args: { request: ask(ASKS.memory), askerHref: undefined, place: null },
};

/** The memory change approved. */
export const MemoryApproved = {
  args: {
    request: ask(ASKS.memory),
    askerHref: undefined,
    place: null,
    decided: { outcome: "approved", at: AT },
  },
};

/** Caw runs a command in his own pane: the reason, then the command. */
export const ShellWaiting = {
  args: { request: ask(ASKS.shell), askerHref: undefined, place: null },
};

/** A command with the wider standing grant offered apart, under the answer. */
export const ShellWiden = {
  args: { request: ask(ASKS.shellWiden), askerHref: undefined, place: null },
};

/** A delegate type's put that moves all nine of its settings. */
export const ManyFields = {
  args: { request: ask(ASKS.manyFields), askerHref: "/session/s-caw" },
};

/** A memory document whose path runs to 70 characters: the chip keeps its last segments. */
export const LongTarget = {
  args: { request: ask(ASKS.longTarget), askerHref: "/session/s-caw" },
};

/** A session in no project edits a file: no project in the head, the file as words. */
export const NoProject = {
  args: { request: ask(ASKS.noProject), askerHref: undefined, place: null },
};

/** The design system proposes a change in its project: the proposer as words. */
export const Proposer = {
  args: { request: ask(ASKS.proposer), askerHref: undefined, place: null },
};

/** A removal waiting: what it does after, and how long it can be undone. */
export const RemoveWaiting = {
  args: { request: ask(ASKS.remove), askerHref: undefined, place: null },
};

/** The removal approved: Removed, with Undo while the hub keeps it. */
export const RemoveApproved = {
  args: {
    request: ask(ASKS.remove),
    askerHref: undefined,
    place: null,
    decided: { outcome: "approved", at: AT, undoUntil: Date.now() + UNDO_MS },
    onundo: restore,
  },
};

/** Undo pressed: the hub put it back. */
export const RemoveRestored = {
  args: {
    request: ask(ASKS.remove),
    askerHref: undefined,
    place: null,
    decided: { outcome: "approved", at: AT, restored: true },
  },
};

/** A skill install: its source's age and stars as badges on the count line. */
export const InstallWaiting = {
  args: { request: ask(ASKS.install), askerHref: undefined, place: null },
};
