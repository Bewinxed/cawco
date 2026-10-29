/**
 * `bun scripts/turn-provenance-check.ts`: a sweep of turn provenance's own
 * state machine and decision (core turn-provenance.ts `turnStep`,
 * `turnCall`, the ones the hub and every harness run). Breadth-first over
 * every schedule of up to {@link MAX_EVENTS} events of one session's turns:
 * a send from its principal, from CawCo, from two outside senders; two web
 * calls and their results, and a result of a call that read nothing; the
 * turn's end; and a hub restart, which forgets every turn but the hub's
 * durable word on whether one is under way (`restartedTurn`). After every
 * step, for every permission mode and every kind of call, the laws:
 *
 * - Law A: a turn is its principal's exactly while, since its last end, it
 *   has read no outside send and no result of a web call it made.
 * - Law B: in its principal's turn every call is its mode's; in an outside
 *   turn every shell and edit call asks, in every mode but plan, and any
 *   other call is its mode's.
 * - Law C: an ask's reason is one clause naming the first outside thing the
 *   turn read: "started by" when it began the turn, "read" when it came
 *   into one, "went on after reading" for a web result.
 * - Law D: a hub restart never turns an outside turn back into its
 *   principal's: a turn under way across one is outside, saying so, until
 *   it ends; one between turns starts its principal's.
 *
 * Then every named mutant (a break the rule could have, as a change to
 * `turnStep`, `turnCall` or `restartedTurn`) must fail it, as scripts/protocol-sweep.ts
 * holds the handover reducer.
 *
 * Run by `bun run check` (scripts/check.ts); it fails on any law broken or
 * any mutant the laws let through.
 */
import { WIRE_PERMISSION_MODES } from "../packages/core/src/harness";
import {
  PRINCIPALS_TURN,
  type ProvenanceKind,
  restartedTurn,
  type Turn,
  type TurnCall,
  type TurnEvent,
  turnCall,
  turnStep,
} from "../packages/core/src/turn-provenance";
import { turnProvenanceWords } from "../packages/core/src/words/turn-provenance";

/** The longest schedule swept. */
const MAX_EVENTS = 10;
const KINDS: readonly ProvenanceKind[] = ["shell", "edit", "other"];
const RETRO = turnProvenanceWords.report("Retro");
const ROUTINE = turnProvenanceWords.routine;
const PAGE = "https://example.com/page";

/** What a schedule sweeps: the turn's own events, and a hub restart. */
type SweptEvent = TurnEvent | { kind: "restart" };

/** Every event a schedule may take next. */
const EVENTS: readonly SweptEvent[] = [
  { kind: "send", from: { kind: "principal" } },
  { kind: "send", from: { kind: "cawco" } },
  { kind: "send", from: { kind: "outside", what: RETRO } },
  { kind: "send", from: { kind: "outside", what: ROUTINE } },
  { kind: "web-call", id: "w1", what: PAGE },
  { kind: "web-call", id: "w2", what: turnProvenanceWords.search("cawco") },
  { kind: "result", id: "w1" },
  { kind: "result", id: "w2" },
  { kind: "result", id: "read-only" },
  { kind: "ended" },
  { kind: "restart" },
];

type Step = (turn: Turn, event: TurnEvent) => Turn;
type Call = typeof turnCall;
type Restart = typeof restartedTurn;

/**
 * The reference the laws read: what the events since the turn's last end
 * say it should be (its first outside clause, whether a send began it, its
 * web calls still out), kept beside the turn under test.
 */
interface Reference {
  begun: boolean;
  calls: Record<string, string>;
  clause: string | null;
  /** The hub's durable word that the turn is under way (db `turnOpenAt`): it began, and has not ended. */
  underWay: boolean;
}

const FRESH: Reference = {
  begun: false,
  calls: {},
  clause: null,
  underWay: false,
};

/** The reference after `event`, by the laws' own reading. */
const expect = (ref: Reference, event: SweptEvent): Reference => {
  switch (event.kind) {
    case "restart":
      // All the hub kept is whether the turn is under way.
      return ref.underWay
        ? {
            begun: true,
            calls: {},
            clause: turnProvenanceWords.restarted,
            underWay: true,
          }
        : FRESH;
    case "send":
      return {
        ...ref,
        underWay: true,
        begun: true,
        clause:
          ref.clause ??
          (event.from.kind === "outside"
            ? (ref.begun
                ? turnProvenanceWords.read
                : turnProvenanceWords.startedBy)(event.from.what)
            : null),
      };
    case "web-call":
      return {
        ...ref,
        underWay: true,
        calls: { ...ref.calls, [event.id]: event.what },
      };
    case "result": {
      const what = ref.calls[event.id];
      return what === undefined
        ? { ...ref, underWay: true }
        : {
            ...ref,
            underWay: true,
            clause: ref.clause ?? turnProvenanceWords.readWeb(what),
          };
    }
    case "ended":
      return FRESH;
  }
};

/** What Law B says one call should be. */
const expectedCall = (
  clause: string | null,
  mode: (typeof WIRE_PERMISSION_MODES)[number],
  kind: ProvenanceKind
): TurnCall =>
  clause === null || kind === "other" || mode === "plan"
    ? { kind: "mode" }
    : { kind: "ask", why: turnProvenanceWords.askedBecause(clause) };

/** The law `turn` breaks against `ref` under `call`, or none. */
const broken = (turn: Turn, ref: Reference, call: Call): string | undefined => {
  if ((turn.outside === null) !== (ref.clause === null)) {
    return `Law A: the turn reads ${turn.outside === null ? "its principal's" : "outside"}`;
  }
  if (turn.outside !== ref.clause) {
    return `Law C: the turn says "${turn.outside}", not "${ref.clause}"`;
  }
  for (const mode of WIRE_PERMISSION_MODES) {
    for (const kind of KINDS) {
      const got = call(turn.outside, mode, kind);
      const want = expectedCall(ref.clause, mode, kind);
      if (JSON.stringify(got) !== JSON.stringify(want)) {
        return `Law B: a ${kind} call in ${mode} is ${JSON.stringify(got)}, not ${JSON.stringify(want)}`;
      }
    }
  }
  return undefined;
};

/** Law D, read across one step: a restart never turns an outside turn into its principal's. */
const restartLaw = (
  before: Turn,
  after: Turn,
  event: SweptEvent
): string | undefined =>
  event.kind === "restart" && before.outside !== null && after.outside === null
    ? "Law D: a hub restart turned an outside turn back into its principal's"
    : undefined;

/**
 * Every schedule of up to {@link MAX_EVENTS} events, breadth-first, a state
 * reached twice expanded once (the laws read the state as it stands): the
 * first broken law with its schedule, and how many states it saw.
 */
const sweep = (
  step: Step,
  call: Call,
  restart: Restart
): { law?: string; states: number } => {
  const seen = new Set<string>();
  let frontier = [
    { turn: PRINCIPALS_TURN, ref: FRESH, schedule: [] as SweptEvent[] },
  ];
  for (let depth = 0; depth < MAX_EVENTS; depth += 1) {
    const next: typeof frontier = [];
    for (const { turn, ref, schedule } of frontier) {
      for (const event of EVENTS) {
        const node = {
          turn:
            event.kind === "restart"
              ? restart(ref.underWay)
              : step(turn, event),
          ref: expect(ref, event),
          schedule: [...schedule, event],
        };
        const law =
          restartLaw(turn, node.turn, event) ??
          broken(node.turn, node.ref, call);
        if (law) {
          return {
            law: `${law}\n    schedule: ${node.schedule.map((each) => JSON.stringify(each)).join(" → ")}`,
            states: seen.size,
          };
        }
        const key = JSON.stringify([node.turn, node.ref]);
        if (!seen.has(key)) {
          seen.add(key);
          next.push(node);
        }
      }
    }
    frontier = next;
  }
  return { states: seen.size };
};

/** Breaks the rule could have, each as a change to the step, the call or the restart. */
const MUTANTS: {
  name: string;
  step?: Step;
  call?: Call;
  restart?: Restart;
}[] = [
  {
    name: "ignore a web read's result",
    step: (turn, event) =>
      event.kind === "result" ? turn : turnStep(turn, event),
  },
  {
    name: "judge only the send that began the turn",
    step: (turn, event) =>
      event.kind === "send" && turn.begun ? { ...turn } : turnStep(turn, event),
  },
  {
    name: "keep a turn outside past its end",
    step: (turn, event) =>
      event.kind === "ended"
        ? { ...PRINCIPALS_TURN, outside: turn.outside }
        : turnStep(turn, event),
  },
  {
    name: "let a later outside read rename the first",
    step: (turn, event) => {
      const next = turnStep({ ...turn, outside: null }, event);
      return next.outside === null ? { ...next, outside: turn.outside } : next;
    },
  },
  {
    name: "count CawCo's own word as outside",
    step: (turn, event) =>
      event.kind === "send" && event.from.kind === "cawco"
        ? turnStep(turn, {
            kind: "send",
            from: { kind: "outside", what: turnProvenanceWords.notice },
          })
        : turnStep(turn, event),
  },
  {
    name: "ask a shell call in its principal's turn",
    call: (outside, mode, kind) =>
      outside === null && kind === "shell"
        ? { kind: "ask", why: "" }
        : turnCall(outside, mode, kind),
  },
  {
    name: "let Full Send run an outside turn's edit",
    call: (outside, mode, kind) =>
      mode === "fullSend" ? { kind: "mode" } : turnCall(outside, mode, kind),
  },
  {
    name: "forget a turn's provenance on a hub restart",
    restart: () => PRINCIPALS_TURN,
  },
  {
    name: "ask in plan mode",
    call: (outside, mode, kind) =>
      mode === "plan" && outside !== null && kind !== "other"
        ? { kind: "ask", why: turnProvenanceWords.askedBecause(outside) }
        : turnCall(outside, mode, kind),
  },
];

const started = performance.now();
const real = sweep(turnStep, turnCall, restartedTurn);
if (real.law) {
  console.error(`turn-provenance: ${real.law}`);
  process.exit(1);
}
const survived: string[] = [];
for (const mutant of MUTANTS) {
  const { law } = sweep(
    mutant.step ?? turnStep,
    mutant.call ?? turnCall,
    mutant.restart ?? restartedTurn
  );
  if (law) {
    console.log(`  mutant "${mutant.name}": caught: ${law.split("\n")[0]}`);
  } else {
    survived.push(mutant.name);
  }
}
if (survived.length > 0) {
  console.error(
    `turn-provenance: the laws let through ${survived.map((name) => `"${name}"`).join(", ")}`
  );
  process.exit(1);
}
console.log(
  `turn-provenance: every schedule of up to ${MAX_EVENTS} events (${real.states} states) holds laws A–D in ${WIRE_PERMISSION_MODES.length} modes; ${MUTANTS.length} of ${MUTANTS.length} mutants caught (${Math.round(performance.now() - started)} ms)`
);
