/**
 * Today's approval card's sheet, kept for the owner's pick: main's card
 * (today/Prompt.svelte) with main's words (today/present.ts), drawn from the
 * same asks as the new card's sheet (../prompt-fixtures.ts) under the same
 * story names. Today's card has no answered form, so its sheet stops at the
 * states an ask waits in. Deleted with whichever card loses the pick.
 */
import { ASKS, type AskFixture, requestOf } from "../prompt-fixtures";
import Prompt from "./Prompt.svelte";
import { presentPermission } from "./present";

const ask = (fixture: AskFixture) => requestOf(fixture, presentPermission);

export default {
  title: "Transcript/Approval card today",
  component: Prompt,
  parameters: { viewport: 390 },
  args: {
    request: ask(ASKS.mcpEdit),
    asker: "the agent",
    place: { at: 2, of: 3 },
    shown: true,
    onanswer: () => null,
  },
};

/** An MCP server edit waiting on the answer, as today's card draws it. */
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

/** A curator's change to the fleet's CLAUDE.md. */
export const MemoryWaiting = {
  args: { request: ask(ASKS.memory), place: null },
};

/** Caw runs a command in his own pane. */
export const ShellWaiting = { args: { request: ask(ASKS.shell), place: null } };

/** A command with the wider standing grant offered apart. */
export const ShellWiden = {
  args: { request: ask(ASKS.shellWiden), place: null },
};

/** A delegate type's put that moves all nine of its settings. */
export const ManyFields = { args: { request: ask(ASKS.manyFields) } };

/** A memory document whose path runs to 70 characters. */
export const LongTarget = { args: { request: ask(ASKS.longTarget) } };

/** A session in no project edits a file. */
export const NoProject = {
  args: { request: ask(ASKS.noProject), place: null },
};

/** The design system proposes a change in its project. */
export const Proposer = { args: { request: ask(ASKS.proposer), place: null } };

/** A removal waiting. */
export const RemoveWaiting = {
  args: { request: ask(ASKS.remove), place: null },
};

/** A skill install with its source's age and stars. */
export const InstallWaiting = {
  args: { request: ask(ASKS.install), place: null },
};
