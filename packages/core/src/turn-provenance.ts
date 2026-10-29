/**
 * Turn provenance: the one protection rule every session runs under
 * (one-session design §6). A turn is its principal's until it reads
 * anything else: the person's for a session they started, the parent's
 * for one another session started (its brief and hand-offs are the
 * parent's word, as the person's words are theirs).
 *
 * - It **becomes outside** the moment the session reads a send that is
 *   neither its principal's nor CawCo's own word about its own work (a
 *   report, another session's message, a routine's run, an event, GitHub's
 *   answer), or the result of a call that read the web (hub web-reads.ts).
 * - **While the turn is its principal's**, the session's own permission
 *   mode decides every call, exactly as it would with no CawCo.
 * - **While the turn is outside**, every shell or file-edit call asks the
 *   person, whatever the mode would have done, with one clause saying why.
 *   Plan mode keeps its own word: it writes nothing anyway.
 * - It returns to its principal's when the turn ends.
 * - A hub restart forgets what a turn read, so a turn under way across one
 *   is outside until it ends ({@link restartedTurn}): the rule fails closed.
 *
 * {@link turnStep} is the state machine and {@link turnCall} the decision,
 * both pure; the hub keeps one {@link Turn} per session (hub
 * turn-provenance.ts) and each harness's per-call permission point reads it
 * (agent claude.ts `PreToolUse`, opencode-session.ts `#asked`, pi-runtime.ts
 * `tool_call`). `scripts/turn-provenance-check.ts` sweeps both against
 * their laws.
 */
import { EDIT_TOOLS, SHELL_TOOLS } from "./delegate-types";
import type { PermissionMode } from "./harness";
import { turnProvenanceWords } from "./words/turn-provenance";

/** What a call is, as provenance judges it: a shell line, a file edit, or any other tool. */
export type ProvenanceKind = "shell" | "edit" | "other";

/** What `tool` (any harness's name, as it asks permission) is to provenance. */
export const provenanceKindOf = (tool: string): ProvenanceKind => {
  if (SHELL_TOOLS.has(tool)) {
    return "shell";
  }
  return EDIT_TOOLS.has(tool) ? "edit" : "other";
};

/** Who a send a session read is from, as its turn's provenance reads it (hub turn-provenance.ts `sendFrom`). */
export type SendFrom =
  /** The session's principal: the person, or the parent that started it. */
  | { kind: "principal" }
  /** CawCo's own word about the session's own work (a compaction, a restore, a wait's end): no outside text. */
  | { kind: "cawco" }
  /** Anything else, named as the card's clause names it ("a report from Retro"). */
  | { kind: "outside"; what: string };

/** One session's turn, as its provenance stands. */
export interface Turn {
  /** Whether a send has begun it: an outside send then "came into" it rather than "started" it. */
  readonly begun: boolean;
  /** Why it is not its principal's, as a card's clause says it; null while it is. */
  readonly outside: string | null;
  /** Its calls that read the web and wait on their result, by call id, each with what it reads. */
  readonly reading: Readonly<Record<string, string>>;
}

/** What moves a turn's provenance. */
export type TurnEvent =
  /** The session read a send. */
  | { kind: "send"; from: SendFrom }
  /** The session called a tool that reads the web (`what`: its address, or its search). */
  | { kind: "web-call"; id: string; what: string }
  /** A call's result came back into the turn. */
  | { kind: "result"; id: string }
  /** The turn ended. */
  | { kind: "ended" };

/** A turn nothing has moved: its principal's. */
export const PRINCIPALS_TURN: Turn = {
  begun: false,
  outside: null,
  reading: {},
};

/** The turn after `event`. */
export const turnStep = (turn: Turn, event: TurnEvent): Turn => {
  switch (event.kind) {
    case "send":
      return {
        ...turn,
        begun: true,
        outside:
          turn.outside ??
          (event.from.kind === "outside"
            ? (turn.begun
                ? turnProvenanceWords.read
                : turnProvenanceWords.startedBy)(event.from.what)
            : null),
      };
    case "web-call":
      return {
        ...turn,
        reading: { ...turn.reading, [event.id]: event.what },
      };
    case "result": {
      const what = turn.reading[event.id];
      if (what === undefined) {
        return turn;
      }
      const { [event.id]: _read, ...reading } = turn.reading;
      return {
        ...turn,
        outside: turn.outside ?? turnProvenanceWords.readWeb(what),
        reading,
      };
    }
    case "ended":
      return PRINCIPALS_TURN;
  }
};

/**
 * A turn as a hub that has just restarted finds it. What a turn read lives
 * in the hub's memory and goes with a restart, so one that was under way
 * across it (its row's open turn, hub db `turnOpenAt`, which outlives the
 * hub) is outside until it ends: not knowing what it read never makes it
 * its principal's. Any other is its principal's.
 */
export const restartedTurn = (underWay: boolean): Turn =>
  underWay
    ? { begun: true, outside: turnProvenanceWords.restarted, reading: {} }
    : PRINCIPALS_TURN;

/** What provenance makes of one call: its mode decides, or it asks the person, saying why. */
export type TurnCall = { kind: "mode" } | { kind: "ask"; why: string };

/**
 * The one decision: a call in a turn whose provenance is `outside` (null:
 * its principal's), in permission `mode`, of `kind`. Only a shell or edit
 * call in an outside turn asks, and not in plan mode, which writes nothing.
 */
export const turnCall = (
  outside: string | null,
  mode: PermissionMode | undefined,
  kind: ProvenanceKind
): TurnCall =>
  outside === null || kind === "other" || mode === "plan"
    ? { kind: "mode" }
    : { kind: "ask", why: turnProvenanceWords.askedBecause(outside) };
