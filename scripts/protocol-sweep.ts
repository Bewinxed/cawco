/**
 * `bun scripts/protocol-sweep.ts`: a model checker over the machine handover
 * protocol's own reducer (core handover.ts `step`, the one the hub and the
 * agent run). Breadth-first over every schedule of up to {@link MAX_EVENTS}
 * events of a small world — one machine, its hub, its agent, the current
 * keeper and the keeper of the build before it, two sessions and one
 * workspace — from the moment an update restarted the agent, with the laws
 * asserted after every step:
 *
 * - Law A: an unanswered keeper never yields "no keeper holds it", and never
 *   leads to a fresh spawn of a held session.
 * - Law B: a send while the machine is reconnecting is held, never failed;
 *   presence is read from one deadline.
 * - Law C: a register never follows a probe; a published ask was parked
 *   first; once quiescent, every workspace a session's process runs in has a
 *   judge of the current build, or says by name why it cannot.
 *
 * Then every named mutant (one break the product had, as a change to `step`)
 * must fail it: mutation testing at the reducer's grain (cacm.acm.org/practice/
 * systems-correctness-practices-at-amazon-web-services: "Tests are then written
 * for particular failure or success scenarios, such as the failure of a
 * participant at a particular stage in a distributed protocol").
 *
 * A state reached twice is expanded once: every law reads the world as it
 * stands, and what a law needs of the past (a probe on this link, an ask
 * parked, a keeper's answer this custody) is in the world.
 *
 * Run by `bun run typecheck` (scripts/typecheck.ts); it fails on any law
 * broken by `step` or any mutant the laws let through.
 */
import { UPDATE_TRIAL_MS } from "../packages/core/src/binary-updates";
import {
  CUSTODY_BOUND_MS,
  type HandoverCommand,
  type HandoverEvent,
  type HandoverState,
  initialHandover,
  presenceOf,
  RECONNECTING_MS,
  type Stepped,
  step,
} from "../packages/core/src/handover";

/** The longest schedule swept, past the start-up the world begins in. */
const MAX_EVENTS = 8;
const MACHINE = "m";
const UNIT = "claude";
/** The current keeper, and the keeper of the build before, which holds what that build started. */
const CURRENT = "k1";
const RETIRING = "k0";
/** A session whose process the retiring keeper holds, and one with no process anywhere. */
const HELD = "r1";
const AT_REST = "r2";
const WORKSPACE = "w";
/** A keeper that cannot be read answers every reading before this as unanswered: the first, and none asked again after it. */
const UNREADABLE_UNTIL = 5000;
/** How slow the retiring keeper is to answer, in s, or that it cannot be read at first. */
const SLOWNESS = [0, 1, 3, 10, 120, "unreadable"] as const;

type Slow = (typeof SLOWNESS)[number];
type Side = "hub" | "agent";

interface Pending {
  due: number;
  side: Side;
  what:
    | { kind: "tick" }
    | { kind: "keeper"; epoch: number; keeper: string }
    | { kind: "arm-read" };
}

interface Keeper {
  alive: boolean;
  holds: string[];
}

interface World {
  agent: HandoverState;
  /** Keepers that gave custody their listing or their end, this custody. */
  answered: string[];
  attached: string[];
  build: number;
  /** The keepers this custody began with. */
  custodyKeepers: string[];
  epoch: number;
  hub: HandoverState;
  keepers: Record<string, Keeper>;
  linked: boolean;
  now: number;
  parked: string[];
  pending: Pending[];
  /** An announce went out on this link. */
  probed: boolean;
  // What the laws read: the hub's machine as the world knows it.
  registered: boolean;
  slow: Slow;
  until: number;
  /** The workspace: a session's process in it, its boundary and judge (the build that started it), and the keeper each runs on. */
  ws: {
    cli: boolean;
    boundary: string | null;
    judge: { build: number; on: string } | null;
  };
}

/** The reducer the sweep runs: the product's, or a mutant of it. */
interface Protocol {
  step: (state: HandoverState, event: HandoverEvent) => Stepped;
}

class Broken extends Error {}

const clone = (world: World): World => ({
  ...world,
  keepers: Object.fromEntries(
    Object.entries(world.keepers).map(([name, keeper]) => [
      name,
      { alive: keeper.alive, holds: [...keeper.holds] },
    ])
  ),
  ws: { ...world.ws },
  attached: [...world.attached],
  pending: [...world.pending],
  parked: [...world.parked],
  answered: [...world.answered],
  custodyKeepers: [...world.custodyKeepers],
});

const aliveOn = (world: World, id: string): boolean =>
  Object.values(world.keepers).some(
    (keeper) => keeper.alive && keeper.holds.includes(id)
  );

const unreadableNow = (world: World): boolean =>
  world.slow === "unreadable" &&
  world.keepers[RETIRING].alive &&
  world.now < UNREADABLE_UNTIL;

const slowMs = (world: World, keeper: string): number =>
  keeper === RETIRING && typeof world.slow === "number" ? world.slow * 1000 : 0;

const enqueue = (world: World, pending: Pending): void => {
  const same = world.pending.some(
    (one) =>
      one.due === pending.due &&
      one.side === pending.side &&
      JSON.stringify(one.what) === JSON.stringify(pending.what)
  );
  if (!same) {
    world.pending.push(pending);
  }
};

/** The world's own word on the machine: connected, or reconnecting until its one deadline, or offline. */
const expectedPresence = (world: World): string => {
  if (world.registered) {
    return "connected";
  }
  return world.now < world.until ? `reconnecting:${world.until}` : "offline";
};

/** One step of `side`'s reducer: the laws read its commands, then the world takes them in order. */
const run = (
  protocol: Protocol,
  world: World,
  side: Side,
  event: HandoverEvent
): void => {
  const before = world[side];
  const { state, commands } = protocol.step(before, event);
  world[side] = state;
  const held = new Set<string>();
  for (const command of commands) {
    obeyHub(world, side, command);
    obeyAgent(protocol, world, command, held);
  }
  if (side === "hub") {
    const presence = presenceOf(world.hub, MACHINE, world.now);
    const read =
      presence.kind === "reconnecting"
        ? `reconnecting:${presence.until}`
        : presence.kind;
    if (read !== expectedPresence(world)) {
      throw new Broken(
        `Law B: presence reads ${read} where its one deadline says ${expectedPresence(world)}`
      );
    }
  }
  if (
    side === "agent" &&
    state.arming.kind === "blocked" &&
    before.arming.kind !== "blocked" &&
    !commands.some((command) => command.kind === "say")
  ) {
    throw new Broken(
      "Law C: the arming blocked on a reading that was not whole and nobody said so"
    );
  }
};

/** A command of the hub's, or a wake of either side's: the law it answers to, then the world's own effect. */
const obeyHub = (world: World, side: Side, command: HandoverCommand): void => {
  switch (command.kind) {
    case "wake":
      enqueue(world, { due: command.at, side, what: { kind: "tick" } });
      return;
    case "send-verdict": {
      const expected = expectedPresence(world);
      if (command.verdict === "fail" && expected !== "offline") {
        throw new Broken(
          `Law B: a send to a machine that is ${expected.split(":")[0]} was failed`
        );
      }
      if (command.verdict === "hold" && expected === "offline") {
        throw new Broken("Law B: a send to a machine past its window was held");
      }
      if (command.verdict === "deliver" && expected !== "connected") {
        throw new Broken(
          "Law B: a send was handed to a machine that is not connected"
        );
      }
      return;
    }
    case "fail-owed":
      if (expectedPresence(world) !== "offline") {
        throw new Broken(
          "Law B: what was held for a machine failed inside its window"
        );
      }
      return;
    case "park":
      world.parked.push(command.requestId);
      return;
    case "publish":
      if (!world.parked.includes(command.requestId)) {
        throw new Broken("Law C: an ask was published before it was parked");
      }
      return;
    default:
      return;
  }
};

/** Whether `id` was read as held by no keeper while one had not answered (Law A). */
const absentTooSoon = (world: World, id: string): void => {
  const unanswered = world.custodyKeepers.filter(
    (keeper) => !world.answered.includes(keeper)
  );
  if (unanswered.length > 0) {
    throw new Broken(
      `Law A: ${id} was read as held by no keeper while ${unanswered.join(", ")} had not answered`
    );
  }
};

/** A command of the agent's: the law it answers to, then the world's own effect. */
const obeyAgent = (
  protocol: Protocol,
  world: World,
  command: HandoverCommand,
  held: Set<string>
): void => {
  switch (command.kind) {
    case "register":
      if (world.probed) {
        throw new Broken("Law C: a register followed a probe on its link");
      }
      return;
    case "announce":
      world.probed = true;
      return;
    case "read-keeper": {
      const alive = world.keepers[command.keeper]?.alive === true;
      enqueue(world, {
        due: world.now + (alive ? slowMs(world, command.keeper) : 0),
        side: "agent",
        what: {
          kind: "keeper",
          epoch: command.epoch,
          keeper: command.keeper,
        },
      });
      return;
    }
    case "hold":
      held.add(command.id);
      if (!world.attached.includes(command.id)) {
        world.attached.push(command.id);
      }
      return;
    case "start":
      if (aliveOn(world, command.id)) {
        throw new Broken(
          `Law A: ${command.id}, whose process a keeper holds, was started afresh`
        );
      }
      world.keepers[CURRENT].holds.push(command.id);
      world.attached.push(command.id);
      return;
    case "settle":
      if (!held.has(command.id)) {
        absentTooSoon(world, command.id);
      }
      return;
    case "arm-read": {
      const waits = Object.entries(world.keepers)
        .filter(([, keeper]) => keeper.alive)
        .map(([name]) => slowMs(world, name));
      enqueue(world, {
        due: world.now + Math.max(0, ...waits),
        side: "agent",
        what: { kind: "arm-read" },
      });
      return;
    }
    case "arm":
      world.ws.judge = { build: world.build, on: CURRENT };
      if (command.how === "revive") {
        world.ws.boundary = CURRENT;
      }
      run(protocol, world, "agent", { kind: "armed", id: command.id });
      return;
    default:
      // say, release-owed, custody-complete, arm-listed: nothing the world keeps.
      return;
  }
};

/** What falls due next, one item at a time: every one of the earliest is its own branch. */
const deliver = (protocol: Protocol, world: World, index: number): void => {
  const [pending] = world.pending.splice(index, 1);
  if (!pending) {
    return;
  }
  world.now = Math.max(world.now, pending.due);
  const { what } = pending;
  if (what.kind === "tick") {
    run(protocol, world, pending.side, { kind: "tick", now: world.now });
    return;
  }
  if (what.kind === "arm-read") {
    run(
      protocol,
      world,
      "agent",
      unreadableNow(world)
        ? {
            kind: "arm-unread",
            why: `${RETIRING}: EACCES`,
            now: world.now,
          }
        : {
            kind: "arm-listed",
            workspaces: [
              {
                id: WORKSPACE,
                boundary: world.ws.boundary !== null,
                inUse: world.ws.cli,
                cli: world.ws.cli,
              },
            ],
          }
    );
    return;
  }
  const keeper = world.keepers[what.keeper];
  let word: Extract<HandoverEvent, { kind: "keeper-word" }>["word"];
  if (!keeper?.alive) {
    word = { kind: "ended" };
  } else if (what.keeper === RETIRING && unreadableNow(world)) {
    word = { kind: "unanswered", why: "EACCES" };
  } else {
    word = { kind: "listed", alive: [...keeper.holds] };
  }
  if (word.kind !== "unanswered" && what.epoch === world.epoch) {
    world.answered.push(what.keeper);
  }
  run(protocol, world, "agent", {
    kind: "keeper-word",
    epoch: what.epoch,
    unit: UNIT,
    keeper: what.keeper,
    word,
    now: world.now,
  });
};

interface Act {
  act: (protocol: Protocol, world: World) => void;
  name: string;
}

const ACTS: Act[] = [
  {
    // An update restarts the agent: its socket closes mid-install, and the
    // new build reads its workspaces at its start.
    name: "agent restart",
    act: (protocol, world) => {
      if (world.registered) {
        world.registered = false;
        world.until = world.now + UPDATE_TRIAL_MS + RECONNECTING_MS;
        run(protocol, world, "hub", {
          kind: "agent-close",
          machineId: MACHINE,
          updating: true,
          now: world.now,
        });
      }
      world.agent = initialHandover();
      world.linked = false;
      world.probed = false;
      world.build += 1;
      world.attached = [];
      world.pending = world.pending.filter((one) => one.side === "hub");
      run(protocol, world, "agent", { kind: "arm-start" });
    },
  },
  {
    name: "register",
    act: (protocol, world) => {
      if (world.linked) {
        return;
      }
      run(protocol, world, "agent", { kind: "link-open" });
      world.linked = true;
      world.registered = true;
      run(protocol, world, "hub", {
        kind: "agent-register",
        machineId: MACHINE,
        now: world.now,
      });
      world.epoch += 1;
      world.answered = [];
      world.custodyKeepers = [CURRENT, RETIRING].filter(
        (name) => world.keepers[name]?.alive
      );
      run(protocol, world, "agent", {
        kind: "custody-begin",
        epoch: world.epoch,
        units: [
          {
            unit: UNIT,
            keepers: world.custodyKeepers,
            rows: [HELD, AT_REST].map((id) => ({
              id,
              fresh: !world.attached.includes(id),
            })),
          },
        ],
        now: world.now,
      });
    },
  },
  {
    name: "hub restart",
    act: (protocol, world) => {
      world.hub = initialHandover();
      world.pending = world.pending.filter((one) => one.side === "agent");
      world.registered = false;
      world.until = world.now + UPDATE_TRIAL_MS + RECONNECTING_MS;
      run(protocol, world, "hub", {
        kind: "hub-start",
        machines: [MACHINE],
        now: world.now,
      });
      if (world.linked) {
        run(protocol, world, "agent", { kind: "link-lost" });
        world.linked = false;
        world.probed = false;
      }
    },
  },
  {
    name: "send",
    act: (protocol, world) =>
      run(protocol, world, "hub", {
        kind: "send",
        machineId: MACHINE,
        now: world.now,
      }),
  },
  {
    name: "keeper ends",
    act: (_protocol, world) => {
      const keeper = world.keepers[RETIRING];
      if (!keeper?.alive) {
        return;
      }
      keeper.alive = false;
      keeper.holds = [];
      world.ws.cli = false;
      if (world.ws.boundary === RETIRING) {
        world.ws.boundary = null;
      }
      if (world.ws.judge?.on === RETIRING) {
        world.ws.judge = null;
      }
    },
  },
  {
    name: "judge exit",
    act: (protocol, world) => {
      if (!world.ws.judge) {
        return;
      }
      world.ws.judge = null;
      run(protocol, world, "agent", {
        kind: "judge-exit",
        id: WORKSPACE,
        held: world.ws.boundary !== null,
      });
    },
  },
  {
    name: "ask publish",
    act: (protocol, world) =>
      run(protocol, world, "hub", { kind: "ask", requestId: "ask" }),
  },
];

/** Law C's quiescent half: nothing of the agent's is in flight, and it is registered. */
const checkQuiet = (world: World): void => {
  const quiet =
    world.linked && !world.pending.some((one) => one.side === "agent");
  if (!(quiet && world.ws.cli) || world.ws.judge?.build === world.build) {
    return;
  }
  if (world.agent.arming.kind === "blocked" && unreadableNow(world)) {
    return;
  }
  throw new Broken(
    `Law C: quiescent, and the workspace a session's process runs in has ${world.ws.judge ? `a judge of build ${world.ws.judge.build}, not ${world.build}` : "no judge"}`
  );
};

/** The world an update leaves: the agent restarted mid-install, its sessions' processes on the keeper of the build before. */
const startWorld = (
  protocol: Protocol,
  slow: Slow,
  boundary: boolean
): World => {
  const world: World = {
    now: 0,
    hub: initialHandover(),
    agent: initialHandover(),
    linked: false,
    build: 2,
    epoch: 0,
    slow,
    keepers: {
      [CURRENT]: { alive: true, holds: [] },
      [RETIRING]: { alive: true, holds: [HELD] },
    },
    ws: {
      cli: true,
      boundary: boundary ? RETIRING : null,
      judge: boundary ? { build: 1, on: RETIRING } : null,
    },
    attached: [],
    pending: [],
    registered: true,
    until: 0,
    probed: false,
    parked: [],
    answered: [],
    custodyKeepers: [],
  };
  run(protocol, world, "hub", {
    kind: "agent-register",
    machineId: MACHINE,
    now: 0,
  });
  world.registered = false;
  world.until = UPDATE_TRIAL_MS + RECONNECTING_MS;
  run(protocol, world, "hub", {
    kind: "agent-close",
    machineId: MACHINE,
    updating: true,
    now: 0,
  });
  run(protocol, world, "agent", { kind: "arm-start" });
  return world;
};

interface Outcome {
  broken?: { law: string; schedule: string[] };
  states: number;
  steps: number;
}

const key = (world: World): number | bigint => Bun.hash(JSON.stringify(world));

interface Reached {
  trail: string[];
  world: World;
}

interface Move {
  apply: (world: World) => void;
  name: string;
}

/** The law `attempt` broke, or nothing. */
const brokenBy = (attempt: () => void): string | undefined => {
  try {
    attempt();
  } catch (error) {
    if (error instanceof Broken) {
      return error.message;
    }
    throw error;
  }
};

/** A pending item as a schedule names it. */
const dueName = (pending: Pending): string => {
  const at = `at ${pending.due / 1000} s`;
  if (pending.what.kind === "tick") {
    return `${pending.side} clock ${at}`;
  }
  return pending.what.kind === "keeper"
    ? `${pending.what.keeper} answers ${at}`
    : `arming read ${at}`;
};

/** Every move from `world`: each act, and each of the earliest items due. */
const movesFrom = (protocol: Protocol, world: World): Move[] => {
  const due = Math.min(...world.pending.map((one) => one.due));
  return [
    ...ACTS.map(({ name, act }) => ({
      name,
      apply: (copy: World) => act(protocol, copy),
    })),
    ...world.pending.flatMap((one, index) =>
      one.due === due
        ? [
            {
              name: dueName(one),
              apply: (copy: World) => deliver(protocol, copy, index),
            },
          ]
        : []
    ),
  ];
};

/** Every start: the retiring keeper at each slowness, the workspace's boundary running or closed. */
const starts = (protocol: Protocol): Reached[] | Outcome => {
  const reached: Reached[] = [];
  for (const slow of SLOWNESS) {
    for (const boundary of [true, false]) {
      const trail = [
        `start: keeper ${slow}${typeof slow === "number" ? " s" : ""}, boundary ${boundary ? "running" : "closed"}`,
      ];
      let world: World | undefined;
      const law = brokenBy(() => {
        world = startWorld(protocol, slow, boundary);
      });
      if (law || !world) {
        return {
          states: 0,
          steps: 0,
          broken: { law: law ?? "", schedule: trail },
        };
      }
      reached.push({ world, trail });
    }
  }
  return reached;
};

/** Every schedule of up to {@link MAX_EVENTS} events from every start, breadth-first; the first broken law ends it. */
const sweep = (protocol: Protocol): Outcome => {
  const begun = starts(protocol);
  if (!Array.isArray(begun)) {
    return begun;
  }
  const seen = new Set(begun.map(({ world }) => key(world)));
  let frontier = begun;
  let steps = 0;
  for (let depth = 0; depth < MAX_EVENTS; depth += 1) {
    const next: Reached[] = [];
    for (const { world, trail } of frontier) {
      for (const move of movesFrom(protocol, world)) {
        const copy = clone(world);
        const schedule = [...trail, move.name];
        steps += 1;
        const law = brokenBy(() => {
          move.apply(copy);
          checkQuiet(copy);
        });
        if (law) {
          return { states: seen.size, steps, broken: { law, schedule } };
        }
        const id = key(copy);
        if (!seen.has(id)) {
          seen.add(id);
          next.push({ world: copy, trail: schedule });
        }
      }
    }
    frontier = next;
  }
  return { states: seen.size, steps };
};

// ── Mutants: each a break the product had, as a change to `step` ───────────

interface Mutant {
  name: string;
  protocol: Protocol;
}

/** The reducer with each event passed through `event` first and each step's result through `after`. */
const mutate = (
  before: (state: HandoverState, event: HandoverEvent) => HandoverEvent,
  after: (
    state: HandoverState,
    event: HandoverEvent,
    stepped: Stepped
  ) => Stepped = (_state, _event, stepped) => stepped
): Protocol => ({
  step: (state, event) => {
    const changed = before(state, event);
    return after(state, changed, step(state, changed));
  },
});

const same = (_state: HandoverState, event: HandoverEvent): HandoverEvent =>
  event;

const unansweredAsAbsent = (
  _state: HandoverState,
  event: HandoverEvent
): HandoverEvent =>
  event.kind === "keeper-word" && event.word.kind === "unanswered"
    ? { ...event, word: { kind: "ended" } }
    : event;

/** The 2 s listing race before dad89261b: a keeper that had not answered within 2 s was read as holding nothing. */
const RACE_MS = 2000;
const raceSlowKeepers = (
  _state: HandoverState,
  event: HandoverEvent,
  stepped: Stepped
): Stepped => {
  if (event.kind === "custody-begin") {
    return {
      ...stepped,
      commands: [
        ...stepped.commands,
        { kind: "wake", at: event.now + RACE_MS },
      ],
    };
  }
  const { custody } = stepped.state;
  if (
    event.kind !== "tick" ||
    !custody ||
    custody.complete ||
    event.now < custody.since + RACE_MS
  ) {
    return stepped;
  }
  let result = stepped;
  for (const [unit, one] of Object.entries(custody.units)) {
    for (const keeper of one.keepers) {
      if (!result.state.custody?.units[unit]?.words[keeper]) {
        const next = step(result.state, {
          kind: "keeper-word",
          epoch: custody.epoch,
          unit,
          keeper,
          word: { kind: "ended" },
          now: event.now,
        });
        result = {
          state: next.state,
          commands: [...result.commands, ...next.commands],
        };
      }
    }
  }
  return result;
};

/** main before this change (daemon.ts `sessiondUnit`): at the custody bound, every row not yet decided went to `startUnheld`. */
const spawnUndecided = (
  _state: HandoverState,
  event: HandoverEvent,
  stepped: Stepped
): Stepped => {
  const { custody } = stepped.state;
  if (
    event.kind !== "tick" ||
    !custody ||
    custody.complete ||
    event.now < custody.since + CUSTODY_BOUND_MS
  ) {
    return stepped;
  }
  const commands: HandoverCommand[] = [...stepped.commands];
  const units = { ...custody.units };
  for (const [unit, one] of Object.entries(custody.units)) {
    const rows = { ...one.rows };
    for (const [id, row] of Object.entries(one.rows)) {
      if (!row.decided) {
        if (row.fresh) {
          commands.push({ kind: "start", unit, id });
        }
        commands.push({ kind: "settle", unit, id });
        rows[id] = { ...row, decided: true };
      }
    }
    units[unit] = { ...one, rows };
  }
  return {
    state: { ...stepped.state, custody: { ...custody, units, complete: true } },
    commands,
  };
};

const presenceFromSocket = (
  state: HandoverState,
  event: HandoverEvent,
  stepped: Stepped
): Stepped =>
  event.kind === "send"
    ? {
        ...stepped,
        commands: [
          {
            kind: "send-verdict",
            machineId: event.machineId,
            verdict: state.machines[event.machineId]?.connected
              ? "deliver"
              : "fail",
          },
        ],
      }
    : stepped;

/** Before dad89261b: a machine's window was the 60 s grace, an update or a hub start or not. */
const windowWithoutTrial = (
  _state: HandoverState,
  event: HandoverEvent,
  stepped: Stepped
): Stepped => {
  if (event.kind !== "agent-close" && event.kind !== "hub-start") {
    return stepped;
  }
  const until = event.now + RECONNECTING_MS;
  return {
    state: {
      ...stepped.state,
      machines: Object.fromEntries(
        Object.entries(stepped.state.machines).map(([id, one]) => [
          id,
          one.away ? { ...one, away: { ...one.away, until } } : one,
        ])
      ),
    },
    commands: stepped.commands.map((command) =>
      command.kind === "wake" ? { kind: "wake", at: until } : command
    ),
  };
};

const reversedFor =
  (kind: HandoverEvent["kind"]) =>
  (_state: HandoverState, event: HandoverEvent, stepped: Stepped): Stepped =>
    event.kind === kind
      ? { ...stepped, commands: [...stepped.commands].reverse() }
      : stepped;

/** Before dad89261b: a workspace a session's process ran in with no boundary was left for later. */
const noRevive = (
  _state: HandoverState,
  event: HandoverEvent
): HandoverEvent =>
  event.kind === "arm-listed"
    ? {
        ...event,
        workspaces: event.workspaces.map((one) => ({ ...one, cli: false })),
      }
    : event;

/** main before this change (boundary.ts `rearmListed`): the listing's error was never said where a session's start reads it. */
const armingUnsaid = (
  _state: HandoverState,
  event: HandoverEvent,
  stepped: Stepped
): Stepped =>
  event.kind === "arm-unread"
    ? {
        ...stepped,
        commands: stepped.commands.filter((command) => command.kind !== "say"),
      }
    : stepped;

/** main before this change: a start-up listing that failed stayed failed for the agent's lifetime. */
const armingNeverReadAgain = (
  _state: HandoverState,
  event: HandoverEvent,
  stepped: Stepped
): Stepped =>
  event.kind === "arm-unread" && stepped.state.arming.kind === "blocked"
    ? {
        state: {
          ...stepped.state,
          arming: { ...stepped.state.arming, again: null },
        },
        commands: stepped.commands.filter((command) => command.kind !== "wake"),
      }
    : stepped;

const chain =
  (
    ...afters: ((
      state: HandoverState,
      event: HandoverEvent,
      stepped: Stepped
    ) => Stepped)[]
  ) =>
  (state: HandoverState, event: HandoverEvent, stepped: Stepped): Stepped =>
    afters.reduce((result, after) => after(state, event, result), stepped);

const MUTANTS: Mutant[] = [
  {
    name: "treat an unanswered keeper as absent",
    protocol: mutate(unansweredAsAbsent),
  },
  {
    name: "read a keeper slower than 2 s as holding nothing",
    protocol: mutate(same, raceSlowKeepers),
  },
  {
    name: "spawn fresh when custody is undecided at its bound",
    protocol: mutate(same, spawnUndecided),
  },
  {
    name: "read presence from the socket, not the deadline",
    protocol: mutate(same, presenceFromSocket),
  },
  {
    name: "give an update's restart no more than the 60 s grace",
    protocol: mutate(same, windowWithoutTrial),
  },
  {
    name: "send the ask before storing it",
    protocol: mutate(same, reversedFor("ask")),
  },
  {
    name: "probe before register",
    protocol: mutate(same, reversedFor("link-open")),
  },
  {
    name: "leave a workspace whose session runs with no boundary for later",
    protocol: mutate(noRevive),
  },
  {
    name: "block every workspace's arming without a word",
    protocol: mutate(same, armingUnsaid),
  },
  {
    name: "never read the keepers again once the start-up listing failed",
    protocol: mutate(same, armingNeverReadAgain),
  },
  {
    // Born red: the logic as it stood at a16e93238, before dad89261b.
    name: "the logic before dad89261b (a16e93238)",
    protocol: mutate(
      (state, event) => noRevive(state, unansweredAsAbsent(state, event)),
      chain(raceSlowKeepers, windowWithoutTrial, spawnUndecided)
    ),
  },
];

const started = performance.now();
const product = sweep({ step });
let failed = false;
if (product.broken) {
  failed = true;
  console.error(
    `protocol-sweep: step breaks ${product.broken.law}\n  schedule: ${product.broken.schedule.join(" → ")}`
  );
}
for (const mutant of MUTANTS) {
  const outcome = sweep(mutant.protocol);
  if (outcome.broken) {
    console.log(
      `  mutant "${mutant.name}": caught after ${outcome.steps} steps: ${outcome.broken.law}\n    schedule: ${outcome.broken.schedule.join(" → ")}`
    );
  } else {
    failed = true;
    console.error(
      `protocol-sweep: mutant "${mutant.name}" passed every law over ${outcome.states} states`
    );
  }
}
const seconds = ((performance.now() - started) / 1000).toFixed(2);
if (failed) {
  process.exit(1);
}
console.log(
  `protocol-sweep: step keeps laws A, B and C over every schedule of up to ${MAX_EVENTS} events from ${SLOWNESS.length * 2} starts: ${product.states} states, ${product.steps} steps; all ${MUTANTS.length} mutants caught; ${seconds} s`
);
