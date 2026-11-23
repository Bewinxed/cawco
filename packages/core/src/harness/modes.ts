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
 * The permission modes CawCo offers: every one a picker, a tool schema or a
 * stored setting may name. Each harness with modes has the ones its
 * descriptor lists (core harness/descriptor.ts `permissionModes`), which its
 * machines report (agent claude.ts `CLAUDE_CAPABILITIES`, opencode.ts
 * `OPENCODE_CAPABILITIES`, codex.ts `CODEX_CAPABILITIES`; pi has none):
 * Claude Code has them all, every other harness {@link SHARED_MODES}.
 *
 * `auto` is Claude Code's own: a classifier model reviews each action
 * before it runs, in place of a permission prompt
 * (https://code.claude.com/docs/en/permission-modes.md, "Eliminate
 * permission prompts with auto mode"). On a harness without it, a stored
 * `auto` runs in Bypass ({@link modeOn}). Claude Code's `dontAsk` is not offered.
 *
 * {@link PermissionMode} stays wider, as the wire names a mode: a CLI may
 * report `dontAsk` as its mode, and the TestFlight builds still installable
 * (20261015 to 20261018) were built to send it (hub scripts/wire-compat.ts).
 * The hub refuses a start in one with the machine's own list (hub
 * launches.ts `modeRefusal`), and an agent refuses one that reaches it
 * (core harness.ts `offeredMode`).
 */
export const PERMISSION_MODES = [
  "default",
  "acceptEdits",
  "plan",
  "auto",
  "bypassPermissions",
  "fullSend",
] as const satisfies readonly PermissionMode[];

export type OfferedMode = (typeof PERMISSION_MODES)[number];

/** The modes every harness with modes has: all of {@link PERMISSION_MODES} but Claude Code's own `auto`. */
export const SHARED_MODES = [
  "default",
  "acceptEdits",
  "plan",
  "bypassPermissions",
  "fullSend",
] as const satisfies readonly OfferedMode[];

export type SharedMode = (typeof SHARED_MODES)[number];

/**
 * What a session on a harness without `auto` runs in when `auto` was asked
 * of it: Bypass, which also runs every tool unasked, without the classifier
 * (the owner, 2026-11-23: "for harnesses that don't offer it, show bypass").
 */
export const AUTO_ELSEWHERE = "bypassPermissions" satisfies SharedMode;

/**
 * The mode a session runs in when `mode` is asked of a harness that has
 * the modes `has` (as its machine reports them, else its descriptor's):
 * `mode` itself, unless it is Claude Code's `auto` and `has` lacks it,
 * where it runs in Bypass ({@link AUTO_ELSEWHERE}). A stored setting (a
 * trigger kind's, Caw's, a routine's) names one mode whatever harness it
 * starts; this is where it meets the harness. Every other mode is the
 * harness's to take or refuse (hub launches.ts `modeOf`).
 */
export const modeOn = <M extends string>(
  mode: M,
  has: readonly string[]
): M | typeof AUTO_ELSEWHERE =>
  mode === "auto" && !has.includes(mode) ? AUTO_ELSEWHERE : mode;

/**
 * The modes one session may start or continue another in: every
 * {@link PERMISSION_MODES} but `fullSend`, which only the owner chooses. A
 * session in Full Send passes it on by naming none.
 */
export const SESSION_CHOSEN_MODES = [
  "default",
  "acceptEdits",
  "plan",
  "auto",
  "bypassPermissions",
] as const satisfies readonly OfferedMode[];

export type SessionChosenMode = (typeof SESSION_CHOSEN_MODES)[number];

/** `value` as an {@link OfferedMode}, when it is one CawCo offers. */
export const permissionModeNamed = (value: unknown): OfferedMode | undefined =>
  PERMISSION_MODES.find((mode) => mode === value);

/** `value` as a {@link SharedMode}, when it is one every harness with modes has. */
export const sharedModeNamed = (value: unknown): SharedMode | undefined =>
  SHARED_MODES.find((mode) => mode === value);

/**
 * The modes in which a session runs a shell command without asking anyone:
 * Claude Code's bypass and Full Send; OpenCode's adapter answers every tool
 * ask in them (agent opencode-session.ts `autoAllows`), and Codex's asks for
 * no approval in them (agent codex-session.ts `CODEX_MODES`, `never`). Every
 * other mode asks the person before a command, or refuses it (plan); Auto
 * has Claude Code's classifier review each command, which a command set up
 * to run later would never meet, so it is not among them. A
 * harness with no modes (pi) asks nothing; hub routines.ts reads both
 * through traits.ts `runsCommandsUnasked`.
 */
export const COMMANDS_UNASKED_MODES: readonly PermissionMode[] = [
  "bypassPermissions",
  "fullSend",
];
