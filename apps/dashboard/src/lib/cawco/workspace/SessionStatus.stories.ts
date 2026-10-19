/**
 * The session status (Component Story Format 3, live components): a 16px
 * solid Solar bold glyph, then the word, one story per state a workflow
 * step reads on the session's scale (session-status.ts `STEP`): Working,
 * Needs you, Failed, Passed, Pending (the quiet pause glyph) and Unknown
 * (Unreachable's glyph). DESIGN.md, Session status.
 */
import SessionStatus from "./SessionStatus.svelte";

export default {
  title: "Session/Status",
  component: SessionStatus,
  args: {},
  parameters: { viewport: 320 },
};

export const Working = { args: { step: "running" } };
export const NeedsYou = { args: { step: "waiting" } };
export const Failed = { args: { step: "failed" } };
export const Passed = { args: { step: "passed" } };
export const Pending = { args: { step: "pending" } };
export const Unknown = { args: { step: "unknown" } };
