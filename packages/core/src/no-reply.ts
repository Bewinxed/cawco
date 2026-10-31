/**
 * The CawCo tool a turn with nothing for the person ends on, its name Claude
 * Code's own for the same act (its Remote Control bridge's `no_reply_needed`).
 * Its success is what lets Claude Code end a turn with no text (agent
 * claude-env.ts `CLAUDE_QUIET_ENV`). Only a session that talks with the person
 * has it (hub roles.ts `talksWithPerson`); it does nothing on the hub, and it
 * counts as no work and no repeat (hub work-items.ts `restsInWait`,
 * fleet-watch.ts `neverRepeats`).
 *
 * A module of its own: injected.ts, whose presence line names it, loads while
 * harness.ts does, so importing delegate-types.ts there runs that module's top
 * level before `HARNESSES` exists.
 */
export const NO_REPLY_TOOL = "no_reply_needed";
