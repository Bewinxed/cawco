/**
 * THE MACHINE HANDOVER PROTOCOL: what a restart or an update hands from one
 * process to the next, as one pure reducer, `step(state, event) → { state,
 * commands }`, with time an event of its own (`tick`). The hub, the agent and
 * its keepers only translate sockets, timers and processes into events, and
 * run the commands that come back, in order (sans-I/O: "the protocol logic …
 * is driven through an in-memory loopback … under a controlled, repeatable
 * schedule", github.com/openmoq/moq-playa/blob/main/docs/simulation.md). So
 * `scripts/protocol-sweep.ts` runs this same `step` over every schedule of a
 * few events and asserts its laws after each one (apple.github.io/
 * foundationdb/testing.html: "Determinism is crucial in that it allows perfect
 * repeatability").
 *
 * Four parts, each driven by the process that owns it:
 * - presence (the hub): whether a machine is connected, reconnecting until one
 *   deadline, or offline, and what a send to it is told;
 * - the link and its asks: an agent registers before it probes anything, and
 *   the hub parks an ask before it shows it;
 * - custody (the agent): which keeper holds each session the hub hands back,
 *   read from each keeper's own word;
 * - arming (the agent): every workspace a session's process runs in has its
 *   hook and judge of this build, or says by name why it has not.
 */
import { UPDATE_TRIAL_MS } from "./binary-updates";

/**
 * THE RECONNECTING WINDOW: how long a machine whose agent is away reads as on
 * its way back, not offline, from its connection's end or the hub's start.
 * Inside it a send to one of its sessions is held for it, and a read says when
 * to ask again; past it the machine is offline. Our choice: two of the agent's
 * longest waits between tries (30 s, agent daemon.ts `reconnect`). An update
 * restarts the agent within its trial ({@link UPDATE_TRIAL_MS}), and the hub
 * with it on the hub's machine, so a connection that ended while its machine
 * installed an update, and every machine at the hub's start, gets the trial
 * before this.
 */
export const RECONNECTING_MS = 60_000;

/**
 * How long custody waits on its keepers before it says so in the agent's
 * log, and how long a launch waits for the hub's answer to its ask for its
 * credential before it is refused (agent daemon.ts): nearly four times the
 * 23 s obelisk's Claude reattach of 138 rows took (2026-10-01). Custody it
 * ends nothing: a session whose keeper has not answered is not known to be
 * held by nobody, so it is neither started afresh nor let go until that
 * keeper answers or ends.
 */
export const CUSTODY_BOUND_MS = 90_000;

/**
 * How soon a keeper that is there and could not be read (an error other than
 * its end) is asked again. Our choice: a keeper answers a `list` in
 * milliseconds; ten seconds keeps a keeper that refuses from filling the log
 * while what waits on it waits for its word.
 */
export const KEEPERS_ASK_AGAIN_MS = 10_000;

/**
 * How long an agent waits for its register's ack before the register has
 * lapsed: the custody waiting on it fails, and the register goes again after
 * a pause ({@link registerRetryMs}) with what the agent holds read fresh.
 */
export const REGISTER_ACK_MS = 120_000;

/** The pause before the `attempt`th re-send of a register: 1 s, doubling, at most 30 s. */
export const registerRetryMs = (attempt: number): number =>
  Math.min(30_000, 1000 * 2 ** Math.min(attempt - 1, 5));

// ── State ──────────────────────────────────────────────────────────────────

/**
 * The agent's hub connection: down; registering, its register sent and its
 * ack not yet heard (`attempt`: how many times the ack did not come in time;
 * `retrying`: a lapsed register waits for its pause and a fresh payload); or
 * registered. A register goes out only while it is registering.
 */
export type Link =
  | { kind: "down" }
  | { kind: "registering"; attempt: number; retrying: boolean }
  | { kind: "registered" };

/** Why a machine is away: its socket closed (`agent`) or the hub started and has not heard it (`hub`). */
export type AwayWhy = "agent" | "hub";

/** A machine as the hub reads it, at one moment: everything that reads presence reads this. */
export type Presence =
  | { kind: "connected" }
  | { kind: "reconnecting"; why: AwayWhy; until: number }
  | { kind: "offline" };

interface MachineState {
  away: { why: AwayWhy; until: number } | null;
  connected: boolean;
}

/** One keeper's word for a reading: what it holds alive, its end, or why it could not be read. */
export type KeeperWord =
  | { kind: "listed"; alive: readonly string[] }
  | { kind: "ended" }
  | { kind: "unanswered"; why: string };

interface CustodyUnit {
  /** The keepers there when custody began, the current one first. */
  keepers: readonly string[];
  /** Each session the hub handed back, whether it may start afresh, and whether its custody is decided. */
  rows: Record<string, { fresh: boolean; decided: boolean }>;
  /** The keepers already said to be unanswered in this custody. */
  said: readonly string[];
  /** Each keeper's word so far; an unanswered one carries when it is asked again. */
  words: Record<string, KeeperWord & { again?: number }>;
}

interface Custody {
  complete: boolean;
  epoch: number;
  /** Whether the wait past {@link CUSTODY_BOUND_MS} has been said. */
  saidWaiting: boolean;
  since: number;
  units: Record<string, CustodyUnit>;
}

/**
 * A workspace's arming: left until a session there needs it, being armed, or
 * armed. What fails in an arming is said by the arming itself (agent
 * boundary.ts `rearmOne`).
 */
export type WorkspaceArm =
  { kind: "later" } | { kind: "arming" } | { kind: "armed" };

/**
 * The agent's start-up reading of its workspaces: not begun, being read,
 * read, or blocked because it could not be made whole, a keeper unread
 * among them (with why, and when it is read again; null while it is).
 * Blocked is a named state: every workspace's gate refuses with it until a
 * reading is whole.
 */
export type ArmingPhase =
  | { kind: "idle" }
  | { kind: "listing" }
  | { kind: "listed" }
  | { kind: "blocked"; why: string; again: number | null };

export interface HandoverState {
  arming: ArmingPhase;
  custody: Custody | null;
  link: Link;
  machines: Record<string, MachineState>;
  workspaces: Record<string, WorkspaceArm>;
}

export const initialHandover = (): HandoverState => ({
  machines: {},
  link: { kind: "down" },
  custody: null,
  arming: { kind: "idle" },
  workspaces: {},
});

// ── Events and commands ────────────────────────────────────────────────────

/** One workspace as the start-up reading found it. */
export interface ListedWorkspace {
  /** A boundary of it runs on some keeper. */
  boundary: boolean;
  /** A session's process (Claude Code or pi) runs in its clone on some keeper. */
  cli: boolean;
  id: string;
  /** A session's process is attached in it or a command is on its way in. */
  inUse: boolean;
}

export type HandoverEvent =
  /** The clock: whatever falls due at `now` happens. */
  | { kind: "tick"; now: number }
  // The hub.
  | { kind: "hub-start"; machines: readonly string[]; now: number }
  | { kind: "agent-register"; machineId: string; now: number }
  | {
      kind: "agent-close";
      machineId: string;
      /** It closed while its machine was installing an update. */
      updating: boolean;
      now: number;
    }
  | { kind: "send"; machineId: string; now: number }
  | { kind: "ask"; requestId: string }
  // The agent's hub connection.
  | { kind: "link-open" }
  /** The hub's ack of this connection's register. */
  | { kind: "register-ack" }
  /** No ack came within {@link REGISTER_ACK_MS} of the last register. */
  | { kind: "register-expired" }
  /** A lapsed register's pause is over and what the agent holds is read fresh. */
  | { kind: "register-due" }
  | { kind: "link-lost" }
  // Custody.
  | {
      kind: "custody-begin";
      epoch: number;
      units: readonly {
        unit: string;
        keepers: readonly string[];
        rows: readonly { id: string; fresh: boolean }[];
      }[];
      now: number;
    }
  | {
      kind: "keeper-word";
      epoch: number;
      unit: string;
      keeper: string;
      word: KeeperWord;
      now: number;
    }
  // Arming.
  | { kind: "arm-start" }
  | { kind: "arm-listed"; workspaces: readonly ListedWorkspace[] }
  | { kind: "arm-unread"; why: string; now: number }
  | { kind: "arm-need"; id: string }
  | { kind: "armed"; id: string }
  | { kind: "judge-exit"; id: string; held: boolean };

export type HandoverCommand =
  /** Step again with `{ kind: "tick" }` at `at`. */
  | { kind: "wake"; at: number }
  | { kind: "say"; level: "info" | "warn"; words: string }
  // The hub.
  | { kind: "send-verdict"; machineId: string; verdict: SendVerdict }
  | { kind: "release-owed"; machineId: string }
  | { kind: "fail-owed"; machineId: string }
  | { kind: "park"; requestId: string }
  | { kind: "publish"; requestId: string }
  // The agent.
  /** Send this connection's register. */
  | { kind: "register" }
  /** The register lapsed: the custody waiting on it fails, and the register is read fresh after `retryIn` ms. */
  | { kind: "register-lapsed"; retryIn: number }
  | { kind: "announce" }
  | { kind: "read-keeper"; epoch: number; unit: string; keeper: string }
  | { kind: "hold"; unit: string; id: string; keeper: string }
  | { kind: "start"; unit: string; id: string }
  | { kind: "settle"; unit: string; id: string }
  | { kind: "custody-complete"; epoch: number }
  | { kind: "arm-read" }
  /** Arm `id`: its hook in this build's form, its boundary started again, or its judge started again. */
  | { kind: "arm"; id: string; how: "hook" | "revive" | "judge" }
  | { kind: "arm-listed" };

/** What a send to a machine is told: handed to it, held for its return, or failed for its absence. */
export type SendVerdict = "deliver" | "hold" | "fail";

export interface Stepped {
  commands: HandoverCommand[];
  state: HandoverState;
}

// ── Reads ──────────────────────────────────────────────────────────────────

/** A machine at `now`, read from its one deadline. */
export const presenceOf = (
  state: HandoverState,
  machineId: string,
  now: number
): Presence => {
  const machine = state.machines[machineId];
  if (machine?.connected) {
    return { kind: "connected" };
  }
  if (machine?.away && machine.away.until > now) {
    return { kind: "reconnecting", ...machine.away };
  }
  return { kind: "offline" };
};

/**
 * Who holds a live child under `id`, from the keepers' words in order, the
 * current one first. Held by the first that lists it, once every keeper before
 * it has spoken: an id two keepers hold alive (a relaunch caught half-way) is
 * the current keeper's. Absent only once every keeper has listed or ended.
 * Unknown while any keeper it depends on has not answered: an unanswered
 * keeper never yields "no keeper holds it".
 */
export type Holder =
  | { kind: "held"; keeper: string }
  | { kind: "absent" }
  | { kind: "unknown"; waiting: string[] };

export const holderOf = (
  id: string,
  keepers: readonly string[],
  words: Readonly<Record<string, KeeperWord | undefined>>
): Holder => {
  const waiting: string[] = [];
  for (const keeper of keepers) {
    const word = words[keeper];
    if (word?.kind === "listed" && word.alive.includes(id)) {
      return waiting.length === 0
        ? { kind: "held", keeper }
        : { kind: "unknown", waiting };
    }
    if (!word || word.kind === "unanswered") {
      waiting.push(keeper);
    }
  }
  return waiting.length === 0
    ? { kind: "absent" }
    : { kind: "unknown", waiting };
};

// ── The reducer ────────────────────────────────────────────────────────────

/** What a send is told, by the machine's presence as it stands. */
const VERDICTS: Record<Presence["kind"], SendVerdict> = {
  connected: "deliver",
  reconnecting: "hold",
  offline: "fail",
};

const withMachine = (
  state: HandoverState,
  machineId: string,
  next: MachineState
): HandoverState => ({
  ...state,
  machines: { ...state.machines, [machineId]: next },
});

const presenceStep = (
  state: HandoverState,
  event: Extract<
    HandoverEvent,
    { kind: "hub-start" | "agent-register" | "agent-close" | "send" | "ask" }
  >
): Stepped => {
  switch (event.kind) {
    case "hub-start": {
      const until = event.now + UPDATE_TRIAL_MS + RECONNECTING_MS;
      let next = state;
      for (const machineId of event.machines) {
        next = withMachine(next, machineId, {
          connected: false,
          away: { why: "hub", until },
        });
      }
      return {
        state: next,
        commands:
          event.machines.length > 0 ? [{ kind: "wake", at: until }] : [],
      };
    }
    case "agent-register":
      return {
        state: withMachine(state, event.machineId, {
          connected: true,
          away: null,
        }),
        commands: [{ kind: "release-owed", machineId: event.machineId }],
      };
    case "agent-close": {
      const until =
        event.now + (event.updating ? UPDATE_TRIAL_MS : 0) + RECONNECTING_MS;
      return {
        state: withMachine(state, event.machineId, {
          connected: false,
          away: { why: "agent", until },
        }),
        commands: [{ kind: "wake", at: until }],
      };
    }
    case "send":
      return {
        state,
        commands: [
          {
            kind: "send-verdict",
            machineId: event.machineId,
            verdict:
              VERDICTS[presenceOf(state, event.machineId, event.now).kind],
          },
        ],
      };
    case "ask":
      // Parked first, so what any screen is shown survives the hub's restart.
      return {
        state,
        commands: [
          { kind: "park", requestId: event.requestId },
          { kind: "publish", requestId: event.requestId },
        ],
      };
    default:
      return { state, commands: [] };
  }
};

/** Every row the keepers' words now decide, with what deciding it does; and custody complete once none is left. */
const decideCustody = (
  custody: Custody
): { custody: Custody; commands: HandoverCommand[] } => {
  const commands: HandoverCommand[] = [];
  const units: Record<string, CustodyUnit> = {};
  let open = false;
  for (const [name, unit] of Object.entries(custody.units)) {
    const rows: CustodyUnit["rows"] = {};
    for (const [id, row] of Object.entries(unit.rows)) {
      if (row.decided) {
        rows[id] = row;
        continue;
      }
      const holder = holderOf(id, unit.keepers, unit.words);
      if (holder.kind === "unknown") {
        rows[id] = row;
        open = true;
        continue;
      }
      if (holder.kind === "held") {
        commands.push({ kind: "hold", unit: name, id, keeper: holder.keeper });
      } else if (row.fresh) {
        commands.push({ kind: "start", unit: name, id });
      }
      commands.push({ kind: "settle", unit: name, id });
      rows[id] = { ...row, decided: true };
    }
    units[name] = { ...unit, rows };
  }
  const complete = !(open || custody.complete);
  if (complete) {
    commands.push({ kind: "custody-complete", epoch: custody.epoch });
  }
  return {
    custody: { ...custody, units, complete: custody.complete || complete },
    commands,
  };
};

/** Custody begun: every keeper asked for its word, the rows none could hold decided now, and the wait's bound set. */
const beginCustody = (
  state: HandoverState,
  event: Extract<HandoverEvent, { kind: "custody-begin" }>
): Stepped => {
  const custody: Custody = {
    epoch: event.epoch,
    since: event.now,
    saidWaiting: false,
    complete: false,
    units: Object.fromEntries(
      event.units.map((one) => [
        one.unit,
        {
          keepers: one.keepers,
          words: {},
          said: [],
          rows: Object.fromEntries(
            one.rows.map((row) => [
              row.id,
              { fresh: row.fresh, decided: false },
            ])
          ),
        },
      ])
    ),
  };
  const reads: HandoverCommand[] = event.units.flatMap((one) =>
    one.keepers.map((keeper) => ({
      kind: "read-keeper" as const,
      epoch: event.epoch,
      unit: one.unit,
      keeper,
    }))
  );
  const decided = decideCustody(custody);
  return {
    state: { ...state, custody: decided.custody },
    commands: [
      ...reads,
      ...decided.commands,
      ...(decided.custody.complete
        ? []
        : [{ kind: "wake" as const, at: event.now + CUSTODY_BOUND_MS }]),
    ],
  };
};

/** One keeper's word: kept, said once when it could not be read, and every row it now decides decided. */
const keeperWordStep = (
  state: HandoverState,
  event: Extract<HandoverEvent, { kind: "keeper-word" }>
): Stepped => {
  const { custody } = state;
  const unit = custody?.units[event.unit];
  if (!(custody && unit) || custody.epoch !== event.epoch) {
    return { state, commands: [] };
  }
  const commands: HandoverCommand[] = [];
  let { said } = unit;
  let word: CustodyUnit["words"][string] = event.word;
  if (event.word.kind === "unanswered") {
    const again = event.now + KEEPERS_ASK_AGAIN_MS;
    word = { ...event.word, again };
    commands.push({ kind: "wake", at: again });
    if (!said.includes(event.keeper)) {
      said = [...said, event.keeper];
      commands.push({
        kind: "say",
        level: "warn",
        words: `custody: the ${event.unit} keeper at ${event.keeper} could not be read (${event.word.why}); what it may hold waits for its word, asked again every ${KEEPERS_ASK_AGAIN_MS / 1000} s`,
      });
    }
  }
  const next: Custody = {
    ...custody,
    units: {
      ...custody.units,
      [event.unit]: {
        ...unit,
        said,
        words: { ...unit.words, [event.keeper]: word },
      },
    },
  };
  const decided = decideCustody(next);
  return {
    state: { ...state, custody: decided.custody },
    commands: [...commands, ...decided.commands],
  };
};

const armingStep = (
  state: HandoverState,
  event: Extract<
    HandoverEvent,
    {
      kind:
        | "arm-start"
        | "arm-listed"
        | "arm-unread"
        | "arm-need"
        | "armed"
        | "judge-exit";
    }
  >
): Stepped => {
  const set = (id: string, arm: WorkspaceArm): HandoverState => ({
    ...state,
    workspaces: { ...state.workspaces, [id]: arm },
  });
  switch (event.kind) {
    case "arm-start":
      return {
        state: { ...state, arming: { kind: "listing" }, workspaces: {} },
        commands: [{ kind: "arm-read" }],
      };
    case "arm-listed": {
      const workspaces: Record<string, WorkspaceArm> = {};
      const commands: HandoverCommand[] = [];
      for (const one of event.workspaces) {
        if (one.boundary && one.inUse) {
          workspaces[one.id] = { kind: "arming" };
          commands.push({ kind: "arm", id: one.id, how: "hook" });
        } else if (!one.boundary && one.cli) {
          // A session's process runs there with no boundary: its hook names a
          // judge that is gone, so the boundary is started again.
          workspaces[one.id] = { kind: "arming" };
          commands.push({ kind: "arm", id: one.id, how: "revive" });
        } else {
          workspaces[one.id] = { kind: "later" };
        }
      }
      return {
        state: { ...state, arming: { kind: "listed" }, workspaces },
        commands: [...commands, { kind: "arm-listed" }],
      };
    }
    case "arm-unread": {
      const again = event.now + KEEPERS_ASK_AGAIN_MS;
      const said =
        state.arming.kind === "blocked" && state.arming.why === event.why;
      return {
        state: {
          ...state,
          arming: { kind: "blocked", why: event.why, again },
        },
        commands: [
          ...(said
            ? []
            : [
                {
                  kind: "say" as const,
                  level: "warn" as const,
                  words: `[workspace] no workspace is armed: the start-up reading could not be made whole (${event.why}); every session start in a workspace is refused with this until it is, read again every ${KEEPERS_ASK_AGAIN_MS / 1000} s`,
                },
              ]),
          { kind: "wake", at: again },
        ],
      };
    }
    case "arm-need": {
      if (
        state.arming.kind !== "listed" ||
        state.workspaces[event.id]?.kind !== "later"
      ) {
        return { state, commands: [] };
      }
      return {
        state: set(event.id, { kind: "arming" }),
        commands: [{ kind: "arm", id: event.id, how: "hook" }],
      };
    }
    case "armed":
      return { state: set(event.id, { kind: "armed" }), commands: [] };
    case "judge-exit":
      // A crashed judge would refuse every call: started again while its
      // workspace is held.
      return event.held
        ? {
            state: set(event.id, { kind: "arming" }),
            commands: [{ kind: "arm", id: event.id, how: "judge" }],
          }
        : { state, commands: [] };
    default:
      return { state, commands: [] };
  }
};

/** Each machine whose window ends at `now`: offline, and what was held for it fails unless it came back. */
const windowsTick = (state: HandoverState, now: number): Stepped => {
  const commands: HandoverCommand[] = [];
  let next = state;
  for (const [machineId, one] of Object.entries(state.machines)) {
    if (one.away && one.away.until <= now) {
      next = withMachine(next, machineId, { ...one, away: null });
      if (!one.connected) {
        commands.push({ kind: "fail-owed", machineId });
      }
    }
  }
  return { state: next, commands };
};

/** A unit at `now`: each unanswered keeper due is asked again, its word cleared until it speaks. */
const askAgain = (
  epoch: number,
  name: string,
  unit: CustodyUnit,
  now: number
): { unit: CustodyUnit; commands: HandoverCommand[] } => {
  const words = { ...unit.words };
  const commands: HandoverCommand[] = [];
  for (const [keeper, word] of Object.entries(unit.words)) {
    if (word.kind === "unanswered" && (word.again ?? 0) <= now) {
      delete words[keeper];
      commands.push({ kind: "read-keeper", epoch, unit: name, keeper });
    }
  }
  return { unit: { ...unit, words }, commands };
};

/** The rows of `unit` still undecided, and the keepers they wait on. */
const undecided = (
  unit: CustodyUnit
): { rows: string[]; waiting: string[] } => {
  const rows: string[] = [];
  const waiting = new Set<string>();
  for (const [id, row] of Object.entries(unit.rows)) {
    const holder = holderOf(id, unit.keepers, unit.words);
    if (!row.decided && holder.kind === "unknown") {
      rows.push(id);
      for (const keeper of holder.waiting) {
        waiting.add(keeper);
      }
    }
  }
  return { rows, waiting: [...waiting] };
};

/** Custody at `now`: each unanswered keeper due is asked again, and a wait past the bound is said, once. */
const custodyTick = (state: HandoverState, now: number): Stepped => {
  const { custody } = state;
  if (!custody || custody.complete) {
    return { state, commands: [] };
  }
  const commands: HandoverCommand[] = [];
  const units: Record<string, CustodyUnit> = {};
  const waiting = new Set<string>();
  const rows: string[] = [];
  for (const [name, unit] of Object.entries(custody.units)) {
    const asked = askAgain(custody.epoch, name, unit, now);
    commands.push(...asked.commands);
    units[name] = asked.unit;
    const open = undecided(unit);
    rows.push(...open.rows);
    for (const keeper of open.waiting) {
      waiting.add(keeper);
    }
  }
  const sayWaiting =
    !custody.saidWaiting &&
    rows.length > 0 &&
    now >= custody.since + CUSTODY_BOUND_MS;
  if (sayWaiting) {
    commands.push({
      kind: "say",
      level: "warn",
      words: `custody: ${rows.length} session(s) still wait on their keepers' word past ${CUSTODY_BOUND_MS / 1000} s, neither started afresh nor let go until each keeper answers or ends: ${rows.join(", ")}; waiting on ${[...waiting].join(", ")}`,
    });
  }
  return {
    state: {
      ...state,
      custody: {
        ...custody,
        units,
        saidWaiting: custody.saidWaiting || sayWaiting,
      },
    },
    commands,
  };
};

/**
 * A blocked reading due at `now` is read again. Still blocked while it is:
 * the gate keeps its refusal until a reading is whole.
 */
const armingTick = (state: HandoverState, now: number): Stepped => {
  const { arming } = state;
  if (
    arming.kind !== "blocked" ||
    arming.again === null ||
    arming.again > now
  ) {
    return { state, commands: [] };
  }
  return {
    state: { ...state, arming: { ...arming, again: null } },
    commands: [{ kind: "arm-read" }],
  };
};

/** What falls due at `now`: windows that end, keepers asked again, the custody wait said, a blocked reading read again. */
const tick = (state: HandoverState, now: number): Stepped =>
  [windowsTick, custodyTick, armingTick].reduce<Stepped>(
    (stepped, part) => {
      const next = part(stepped.state, now);
      return {
        state: next.state,
        commands: [...stepped.commands, ...next.commands],
      };
    },
    { state, commands: [] }
  );

/**
 * EVERY REGISTER THE AGENT SENDS IS ONE THIS STEP DECIDES. The first goes as
 * the link opens, ahead of any probe: what the machine can do follows it on
 * beats of its own (ea944761a). One whose ack does not come in time lapses,
 * and goes again after its pause, once what the agent holds is read fresh,
 * only while the link still waits for its ack: never after the ack, never on
 * a link that is down.
 */
const linkStep = (
  state: HandoverState,
  event: Extract<
    HandoverEvent,
    {
      kind:
        | "link-open"
        | "register-ack"
        | "register-expired"
        | "register-due"
        | "link-lost";
    }
  >
): Stepped => {
  const { link } = state;
  const at = (next: Link, commands: HandoverCommand[] = []): Stepped => ({
    state: { ...state, link: next },
    commands,
  });
  switch (event.kind) {
    case "link-open":
      return at({ kind: "registering", attempt: 0, retrying: false }, [
        { kind: "register" },
        { kind: "announce" },
      ]);
    case "register-ack":
      return link.kind === "registering"
        ? at({ kind: "registered" })
        : { state, commands: [] };
    case "register-expired": {
      if (link.kind !== "registering" || link.retrying) {
        return { state, commands: [] };
      }
      const attempt = link.attempt + 1;
      return at({ kind: "registering", attempt, retrying: true }, [
        { kind: "register-lapsed", retryIn: registerRetryMs(attempt) },
      ]);
    }
    case "register-due":
      return link.kind === "registering" && link.retrying
        ? at({ ...link, retrying: false }, [{ kind: "register" }])
        : { state, commands: [] };
    case "link-lost":
      // What the next register hands back, its custody decides.
      return {
        state: { ...state, link: { kind: "down" }, custody: null },
        commands: [],
      };
  }
};

/** The one step every part of the handover runs: the hub's presence and asks, the agent's link, custody and arming. */
export const step = (state: HandoverState, event: HandoverEvent): Stepped => {
  switch (event.kind) {
    case "tick":
      return tick(state, event.now);
    case "hub-start":
    case "agent-register":
    case "agent-close":
    case "send":
    case "ask":
      return presenceStep(state, event);
    case "link-open":
    case "register-ack":
    case "register-expired":
    case "register-due":
    case "link-lost":
      return linkStep(state, event);
    case "custody-begin":
      return beginCustody(state, event);
    case "keeper-word":
      return keeperWordStep(state, event);
    case "arm-listed":
    case "arm-need":
    case "arm-start":
    case "arm-unread":
    case "armed":
    case "judge-exit":
      return armingStep(state, event);
  }
};
