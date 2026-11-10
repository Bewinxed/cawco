/**
 * `bun scripts/routine-report-check.ts`: a project routine's delegate run
 * reports its delivered result to the project's lead, Caw, and wakes him
 * (hub routines.ts `surfaceRun`), as every delegate reports to the session
 * that started it.
 *
 * - A delivered result: one `tell`, kind `routine-report`, and no note.
 * - `NO_REPLY` (outcome `silent`): no `tell`, no note, no push.
 * - A `tell` that answers a problem: a note naming why.
 * - A first failure retries; a second one notes, pushes and needs you.
 * - A routine in no project pushes its result; a conversation run's result
 *   and the memory curator's are notes.
 *
 * Run by `bun run check` (scripts/check.ts); it fails naming each case
 * whose answer differs.
 */
import type { Caw } from "../packages/hub/src/caw";
import type {
  RoutineRow,
  RoutineRunRow,
} from "../packages/hub/src/db/routines";
import {
  type RunEnd,
  type SurfaceDeps,
  surfaceRun,
} from "../packages/hub/src/routines";

type Told = Awaited<ReturnType<Caw["tell"]>>;
type TellEvent = Parameters<Caw["tell"]>[1];

const routine = (fields: Partial<RoutineRow> = {}): RoutineRow => ({
  id: "rtn-1",
  projectId: "prj-1",
  name: "Nightly scan",
  cron: "0 9 * * *",
  timeZone: "Europe/London",
  target: "delegate",
  prompt: "Scan the inbox for invoices past due.",
  delegateType: null,
  lands: "none",
  budget: null,
  dailyCapUsd: null,
  mode: null,
  enabled: true,
  disabledReason: null,
  createdBy: "owner",
  madeInInstance: null,
  madeWhy: null,
  madeBy: null,
  announcedAt: null,
  keep: true,
  expiresAt: null,
  lastSlot: null,
  nextSlot: new Date(0),
  createdAt: new Date(0),
  ...fields,
});

const run = (fields: Partial<RoutineRunRow> = {}): RoutineRunRow => ({
  id: "run-1",
  routineId: "rtn-1",
  slot: "test:1",
  attempt: 1,
  state: "ended",
  workItemId: "wi-1",
  instanceId: "inst-1",
  outcome: null,
  output: null,
  reason: null,
  usd: null,
  startedAt: new Date(0),
  endedAt: new Date(0),
  ...fields,
});

const DELIVERED: RunEnd = {
  outcome: "delivered",
  output: "Three invoices are past due: Acme, Birch & Co, Calder Ltd.",
  reason: null,
};

/** What one `surfaceRun` call did, each stub's calls recorded. */
const drive = async (
  end: RunEnd,
  told: Told,
  rows: { routine?: RoutineRow; run?: RoutineRunRow } = {}
) => {
  const did = {
    tells: [] as TellEvent[],
    notes: [] as { phase: string; body?: string }[],
    pushes: [] as { failed: boolean }[],
    retries: 0,
    needsYou: false,
  };
  const deps: SurfaceDeps = {
    caw: {
      tell: (_projectId, event) => {
        did.tells.push(event);
        return Promise.resolve(told);
      },
    },
    note: (_routine, _run, phase, body) => {
      did.notes.push({ phase, ...(body === undefined ? {} : { body }) });
    },
    push: {
      routine: (pushed) => {
        did.pushes.push({ failed: pushed.failed });
      },
    },
    reportOf: () => ({
      session: "[Nightly scan](cawco:session/inst-1)",
      summary: "Read 42 invoices; three are past due.",
    }),
    retry: () => {
      did.retries += 1;
    },
  };
  did.needsYou = surfaceRun(
    deps,
    rows.routine ?? routine(),
    rows.run ?? run(),
    end,
    "inst-1"
  );
  // A `tell` answers on a later tick.
  await Promise.resolve();
  await Promise.resolve();
  return did;
};

const WOKE: Told = { instanceId: "caw-1", send: "send-1" };
// Elysia as the hub loads it (the root declares none): a problem is told
// from a status by the class the hub's own modules hold.
const { problem } = await import(
  import.meta.resolveSync(
    "elysia",
    new URL("../packages/hub/src/", import.meta.url).pathname
  )
);
const OFF: Told = problem(409, {
  code: "caw-spend-capped",
  detail: "the project's Caw is off",
});

const wrong: string[] = [];
const expect = (name: string, ok: boolean, got: unknown) => {
  if (!ok) {
    wrong.push(`${name}: got ${JSON.stringify(got)}`);
  }
};

{
  const did = await drive(DELIVERED, WOKE);
  const [event] = did.tells;
  expect(
    "a delivered result tells Caw once, kind routine-report, carrying the result and report",
    did.tells.length === 1 &&
      event?.kind === "routine-report" &&
      event.by === "event" &&
      event.text.includes(DELIVERED.output ?? "") &&
      event.text.includes("three are past due") &&
      event.trigger.includes("cawco:routine/rtn-1") &&
      did.notes.length === 0 &&
      did.pushes.length === 0 &&
      !did.needsYou,
    did
  );
}
{
  const did = await drive(
    { outcome: "silent", output: null, reason: null },
    WOKE
  );
  expect(
    "NO_REPLY tells no one and notes nothing",
    did.tells.length === 0 &&
      did.notes.length === 0 &&
      did.pushes.length === 0 &&
      !did.needsYou,
    did
  );
}
{
  const did = await drive(DELIVERED, OFF);
  const [noted] = did.notes;
  expect(
    "a tell that does not wake Caw notes the result and why",
    did.tells.length === 1 &&
      did.notes.length === 1 &&
      noted?.phase === "delivered" &&
      !!noted.body?.includes(DELIVERED.output ?? "") &&
      !!noted.body?.includes("the project's Caw is off"),
    did
  );
}
{
  const failed: RunEnd = {
    outcome: "failed",
    output: null,
    reason: "the inbox refused the sign-in",
  };
  const first = await drive(failed, WOKE);
  expect(
    "a first failure retries, telling no one",
    first.retries === 1 &&
      first.tells.length === 0 &&
      first.notes.length === 0 &&
      first.pushes.length === 0 &&
      !first.needsYou,
    first
  );
  const second = await drive(failed, WOKE, { run: run({ attempt: 2 }) });
  expect(
    "a second failure notes, pushes and needs you, telling Caw nothing",
    second.retries === 0 &&
      second.tells.length === 0 &&
      second.notes.length === 1 &&
      second.notes[0]?.phase === "failed" &&
      second.pushes.length === 1 &&
      second.pushes[0]?.failed === true &&
      second.needsYou,
    second
  );
}
{
  const did = await drive(DELIVERED, WOKE, {
    routine: routine({ projectId: null }),
  });
  expect(
    "a routine in no project pushes its result",
    did.tells.length === 0 &&
      did.notes.length === 0 &&
      did.pushes.length === 1 &&
      did.pushes[0]?.failed === false,
    did
  );
}
{
  const did = await drive(DELIVERED, WOKE, {
    routine: routine({ target: "conversation" }),
  });
  expect(
    "a conversation run's result, Caw's own answer, is a note",
    did.tells.length === 0 &&
      did.notes.length === 1 &&
      did.notes[0]?.phase === "delivered",
    did
  );
}
{
  const did = await drive(DELIVERED, WOKE, {
    routine: routine({ target: "curator" }),
  });
  expect(
    "the memory curator's result, a proposal the person approves, is a note",
    did.tells.length === 0 &&
      did.notes.length === 1 &&
      did.notes[0]?.phase === "delivered" &&
      did.pushes.length === 0,
    did
  );
}

if (wrong.length > 0) {
  console.error(`routine-report-check: ${wrong.join("\n  ")}`);
  process.exit(1);
}
console.log(
  "routine-report-check: 8 cases: delivered tells Caw, NO_REPLY silent, unheard noted with why, failures unchanged, no-project pushed, conversation and curator noted"
);
