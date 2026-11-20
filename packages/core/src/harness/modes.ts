/**
 * The permission modes a session answers tool permissions in: the wire's,
 * and the ones CawCo offers. A leaf, which the harness descriptors read
 * (core harness/descriptor.ts), so it imports nothing.
 */

/** Every permission mode the wire may name ({@link PermissionMode}). */
export const WIRE_PERMISSION_MODES = [
  "default",
  "acceptEdits",
  "bypassPermissions",
  "plan",
  "dontAsk",
  "auto",
  "fullSend",
] as const;

/**
 * How a session answers tool permissions. The union is Claude Code's, plus
 * `fullSend`, CawCo's own: bypass, with every approval approved for the
 * session (the owner, 2026-10-22: "FULL SEND LITERALLY MEANS FULL SEND"):
 * on Claude Code the host answers the checks and ask rules the CLI still
 * raises in bypass, and on every harness the hub approves CawCo's admin
 * writes (hub asks.ts). A question to the person still asks; a
 * fleet-denied tool still never runs. Each adapter maps `fullSend` onto its
 * harness; none hands it to an SDK as is.
 */
export type PermissionMode = (typeof WIRE_PERMISSION_MODES)[number];

/**
 * The permission modes CawCo offers: the one list every machine reports for
 * each harness that has modes (agent claude.ts `CLAUDE_CAPABILITIES`,
 * opencode.ts `OPENCODE_CAPABILITIES`; pi has none), and so the one list
 * every tool schema and picker takes its modes from. Claude Code's
 * `dontAsk` and `auto` are not among them: no harness here is offered either.
 *
 * {@link PermissionMode} stays wider, as the wire names a mode: a CLI may
 * report `dontAsk` or `auto` as its mode, and the TestFlight builds still
 * installable (20261015 to 20261018) were built to send either (hub
 * scripts/wire-compat.ts). The hub refuses a start in one with the
 * machine's own list (hub launches.ts `modeRefusal`), and an agent refuses one
 * that reaches it ({@link offeredMode}).
 */
export const PERMISSION_MODES = [
  "default",
  "acceptEdits",
  "plan",
  "bypassPermissions",
  "fullSend",
] as const satisfies readonly PermissionMode[];

export type OfferedMode = (typeof PERMISSION_MODES)[number];

/**
 * The modes one session may start or continue another in: every
 * {@link PERMISSION_MODES} but `fullSend`, which only the owner chooses. A
 * session in Full Send passes it on by naming none.
 */
export const SESSION_CHOSEN_MODES = [
  "default",
  "acceptEdits",
  "plan",
  "bypassPermissions",
] as const satisfies readonly OfferedMode[];

export type SessionChosenMode = (typeof SESSION_CHOSEN_MODES)[number];

/** `value` as an {@link OfferedMode}, when it is one CawCo offers. */
export const permissionModeNamed = (value: unknown): OfferedMode | undefined =>
  PERMISSION_MODES.find((mode) => mode === value);

/**
 * The modes in which a session runs a shell command without asking anyone:
 * Claude Code's bypass and Full Send; OpenCode's adapter answers every tool
 * ask in them (agent opencode-session.ts `autoAllows`), and Codex's asks for
 * no approval in them (agent codex-session.ts `CODEX_MODES`, `never`). Every
 * other mode asks the person before a command, or refuses it (plan). A
 * harness with no modes (pi) asks nothing; hub routines.ts reads both
 * through traits.ts `runsCommandsUnasked`.
 */
export const COMMANDS_UNASKED_MODES: readonly PermissionMode[] = [
  "bypassPermissions",
  "fullSend",
];
