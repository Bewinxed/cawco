/**
 * The person's changes to a session's plan reach it by the plan model
 * (Projects spec §5.2 "The plan model"; hub plan-changes.ts), on a scratch
 * fleet (real hub, agent and sessiond against the mock model), for Claude
 * Code, OpenCode and pi alike. Each session writes three steps through
 * `todo_write`, the third waiting on a card of a decision page it has; then:
 *
 * (2) mid-turn: a reword reaches the working session at its next step (the
 *     request after its tool's answer carries the person's words), told the
 *     moment it was made;
 * (3) idle: two quick changes to the work (a reword, a comment a second
 *     later) start it once, about 3 s after the last, both in the person's
 *     words; a tick a moment later starts nothing, and the session's next
 *     turn, started by a message of the person's, carries it;
 * (7) the page's Send with a pick for the card clears the step's wait;
 * (4a) stopped, a reword reopens the same session with the change;
 * (4b) Claude Code only, whose conversation can be gone: its transcript
 *     removed while it is stopped, a reword's wake finds the conversation
 *     gone, and a new session in the same folder goes on from it, opening on
 *     the change and the old session's records, its plan copied.
 *
 * On main there is no `POST /api/instances/:id/plan/edits`: every leg fails.
 * Runs inside a workspace or on the host alike: it delegates nothing.
 *
 *   bun scripts/probe-kit/run.ts plan-changes
 */
import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  type Harness,
  type Reply,
  type Seen,
  until,
} from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";

const HARNESSES: Harness[] = ["claude", "opencode", "pi"];
const TODO = "mcp__cawco__todo_write";
/** OpenCode's Code Mode tool, which runs MCP tools from a script. */
const CODE_MODE = "execute";
const MARK = /PROBE-PLAN-(claude|opencode|pi)-[a-z]+/g;
/** A follower's opening, which carries no mark: it names the session it goes on from. */
const GOES_ON_FROM = /“Plan (claude|opencode|pi)” \([0-9a-f]{8}\) cannot go on/;
const PERSON_CHANGED = "The person changed your plan";
const CARD = "color";

interface Act {
  called?: boolean;
  /** Held before the first call: the turn stays open until it settles. */
  hold?: Promise<void>;
  input: object;
  searched?: boolean;
}

interface Heard {
  afterTool: boolean;
  all: string;
  at: number;
  last: string;
}

const acts = new Map<Harness, Act>();
const heard = new Map<Harness, Heard[]>();

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const call = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});

/** `todo_write` as the harness offers it: declared (pi under its own name), in Code Mode's catalog, or behind a search. */
const todoCall = (request: Seen, act: Act): Reply => {
  const declared = request.toolNames.find((name) =>
    [TODO, "todo_write", "cawco_todo_write"].includes(name)
  );
  if (declared) {
    act.called = true;
    return call(declared, act.input);
  }
  if (request.toolNames.includes(CODE_MODE)) {
    act.called = true;
    return call(CODE_MODE, {
      code: `return await tools.cawco.todo_write(${JSON.stringify(act.input)});`,
    });
  }
  if (!act.searched && request.toolNames.includes("ToolSearch")) {
    act.searched = true;
    return call("ToolSearch", { query: `select:${TODO}`, max_results: 1 });
  }
  if (!act.searched && request.toolNames.includes("tool_search")) {
    act.searched = true;
    return call("tool_search", { query: "cawco todo_write" });
  }
  act.called = true;
  return text(`${TODO} is not offered`);
};

const respond = async (request: Seen): Promise<Reply> => {
  if (!request.tools) {
    return text("Probe title");
  }
  const harness = ([...request.all.matchAll(MARK)].at(-1)?.[1] ??
    GOES_ON_FROM.exec(request.all)?.[1]) as Harness | undefined;
  if (!harness) {
    return text("ok");
  }
  heard.set(harness, [
    ...(heard.get(harness) ?? []),
    {
      at: Date.now(),
      last: request.last,
      all: request.all,
      afterTool: request.afterTool,
    },
  ]);
  const act = acts.get(harness);
  if (act && !act.called) {
    if (act.hold) {
      await act.hold;
      act.hold = undefined;
    }
    return todoCall(request, act);
  }
  if (act?.called && request.afterTool) {
    acts.delete(harness);
    return text("done");
  }
  return text("ok");
};

interface Plan {
  changes?: { kind: string; toldAt?: string; undelivered?: string }[];
  steps: {
    content: string;
    id: string;
    status: string;
    waitsOn?: { artifactId: string; card: string };
  }[];
}

/** What every leg of one harness's session works with. */
interface Leg {
  edit: (body: object) => Promise<{ status: number; text: string }>;
  fleet: KitFleet;
  harness: Harness;
  heardSince: (since: number) => Heard[];
  kit: Kit;
  label: (leg: string) => string;
  page: string;
  plan: () => Promise<Plan | undefined>;
  session: string;
}

/** Until the mock has answered `harness`'s last tool call: its turn has ended. */
const turnEnds = (leg: Leg, what: string) =>
  until(
    leg.label(what),
    () => acts.has(leg.harness),
    (open) => !open,
    60_000
  ).catch(() => undefined);

/** Until the hub reads `id`'s pulse as `busy`. */
const pulseIs = (fleet: KitFleet, id: string, busy: boolean, what: string) =>
  until(
    what,
    async () =>
      (await fleet.api<Record<string, { busy?: boolean }>>("/api/pulses"))[id]
        ?.busy === true,
    (now) => now === busy,
    60_000
  ).catch(() => !busy);

/** The session writes its three steps, the third waiting on its page's card. */
const writes = async (leg: Leg): Promise<void> => {
  acts.set(leg.harness, {
    input: {
      steps: [
        { id: "s1", content: "Read the card", status: "pending" },
        { id: "s2", content: "Build the tone prop", status: "pending" },
        {
          id: "s3",
          content: "Pick the colour",
          status: "pending",
          waitsOn: `${leg.page}#${CARD}`,
        },
      ],
    },
  });
  await leg.fleet.send(leg.session, `PROBE-PLAN-${leg.harness}-write`);
  const written = await until(
    leg.label("the plan holds the three steps"),
    () => leg.plan(),
    (now) => now?.steps.length === 3,
    120_000
  ).catch(() => undefined);
  leg.kit.check(
    leg.label("(7) the third step waits on its card"),
    written?.steps[2]?.waitsOn?.card === CARD &&
      written.steps[2].waitsOn.artifactId === leg.page,
    JSON.stringify(written?.steps)
  );
  await turnEnds(leg, "its turn ends");
  await pulseIs(leg.fleet, leg.session, false, leg.label("it is idle"));
};

const MID_WORDS = "Read the card twice";

/** (2) A reword while it works reaches it at its next step. */
const midTurn = async (leg: Leg): Promise<void> => {
  const { promise: hold, resolve: release } = Promise.withResolvers<void>();
  acts.set(leg.harness, { input: { spec: "Probe spec." }, hold });
  const workAt = Date.now();
  await leg.fleet.send(leg.session, `PROBE-PLAN-${leg.harness}-work`);
  await until(
    leg.label("the working turn reaches the model"),
    () => leg.heardSince(workAt),
    (list) => list.length > 0,
    60_000
  ).catch(() => []);
  const busy = await pulseIs(
    leg.fleet,
    leg.session,
    true,
    leg.label("its pulse reads it working")
  );
  const mid = await leg.edit({
    kind: "reword",
    step: "s1",
    content: MID_WORDS,
  });
  const change = (await leg.plan())?.changes?.at(-1);
  leg.kit.check(
    leg.label("(2) a reword mid-turn is told at once"),
    busy && mid.status === 200 && !!change?.toldAt,
    `busy ${busy}; ${mid.status} ${mid.text.slice(0, 160)} ${JSON.stringify(change)}`
  );
  release();
  const step = await until(
    leg.label("the working turn's next step reaches the model"),
    () =>
      leg
        .heardSince(workAt)
        .find((one) => one.all.includes(`to: “${MID_WORDS}”`)),
    (found) => found !== undefined,
    60_000
  ).catch(() => undefined);
  leg.kit.check(
    leg.label(
      "(2) the working session reads it at its next step, in the person's words"
    ),
    step !== undefined,
    step
      ? `after its tool: ${step.afterTool}; ${step.last.slice(0, 200)}`
      : "never heard"
  );
  await turnEnds(leg, "the working turn ends");
  await pulseIs(leg.fleet, leg.session, false, leg.label("it is idle again"));
  await Bun.sleep(1500);
};

/** (3) Two quick changes to the work start it once; a tick starts nothing and rides its next turn. */
const idle = async (leg: Leg): Promise<void> => {
  const idleAt = Date.now();
  await leg.edit({
    kind: "reword",
    step: "s2",
    content: "Build the tone prop, then test it",
  });
  await Bun.sleep(1000);
  const lastAt = Date.now();
  await leg.edit({ kind: "comment", step: "s2", text: "Use the tokens file" });
  await Bun.sleep(9000);
  const wakes = leg
    .heardSince(idleAt)
    .filter((one) => one.last.includes(PERSON_CHANGED) && !one.afterTool);
  const [wake] = wakes;
  const after = wake ? wake.at - lastAt : -1;
  leg.kit.check(
    leg.label(
      "(3) two quick changes start the idle session once, about 3 s after the last"
    ),
    wakes.length === 1 && after >= 2800 && after <= 6500,
    `${wakes.length} wake(s), ${after} ms after the last change`
  );
  leg.kit.check(
    leg.label("(3) the wake carries both changes in the person's words"),
    !!wake &&
      wake.last.includes(
        "Reworded “Build the tone prop” to: “Build the tone prop, then test it”"
      ) &&
      wake.last.includes(
        "Commented on “Build the tone prop, then test it”: “Use the tokens file”"
      ),
    wake?.last.slice(0, 500) ?? "no wake"
  );
  await pulseIs(
    leg.fleet,
    leg.session,
    false,
    leg.label("idle after the wake")
  );
  await Bun.sleep(1500);
  const tickAt = Date.now();
  await leg.edit({ kind: "tick", step: "s1", done: true });
  await Bun.sleep(6000);
  leg.kit.check(
    leg.label("(3) a tick starts nothing"),
    leg.heardSince(tickAt).length === 0,
    `${leg.heardSince(tickAt).length} request(s) after the tick`
  );
  await leg.fleet.send(leg.session, `PROBE-PLAN-${leg.harness}-next`);
  const next = await until(
    leg.label("the next turn reaches the model"),
    () =>
      leg
        .heardSince(tickAt)
        .find((one) => one.all.includes(`PROBE-PLAN-${leg.harness}-next`)),
    (found) => found !== undefined,
    60_000
  ).catch(() => undefined);
  leg.kit.check(
    leg.label("(3) the next turn carries the tick"),
    !!next?.all.includes(`Ticked “${MID_WORDS}” done`),
    next?.all.slice(-600) ?? "no next turn"
  );
  await pulseIs(leg.fleet, leg.session, false, leg.label("idle after it"));
  await Bun.sleep(1500);
};

/** (7) The page's Send with a pick for the card clears the step's wait. */
const picks = async (leg: Leg): Promise<void> => {
  const at = `${leg.fleet.base}/api/instances/${leg.session}/artifacts/${leg.page}`;
  const picked = await fetch(at, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      patch: [{ op: "add", path: `/${CARD}`, value: { options: ["b"] } }],
    }),
  });
  const pickedSaid = await picked.text();
  const sent = await fetch(`${at}/send`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  const sentSaid = await sent.text();
  const cleared = await until(
    leg.label("the step stops waiting"),
    () => leg.plan(),
    (now) => !!now && !now.steps.some((one) => one.waitsOn),
    30_000
  ).catch(() => undefined);
  leg.kit.check(
    leg.label(
      "(7) the page's Send with its card picked clears the step's wait"
    ),
    picked.ok && sent.ok && cleared !== undefined,
    `pick ${picked.status} ${pickedSaid.slice(0, 120)}; send ${sent.status} ${sentSaid.slice(0, 120)}`
  );
  await pulseIs(
    leg.fleet,
    leg.session,
    false,
    leg.label("idle after the send")
  );
  await Bun.sleep(1500);
};

/** Until `id` stands stopped. */
const stopped = async (leg: Leg, what: string): Promise<void> => {
  await leg.fleet.stopSession(leg.session);
  await until(
    leg.label(what),
    () => leg.fleet.instance(leg.session),
    (row) => row?.status === "stopped",
    60_000
  ).catch(() => undefined);
};

/** (4a) Stopped, it is reopened by the change: the same session. */
const reopens = async (leg: Leg): Promise<void> => {
  await stopped(leg, "the session stops");
  const stoppedAt = Date.now();
  const words = "Build it with the tokens";
  await leg.edit({ kind: "reword", step: "s2", content: words });
  const reopened = await until(
    leg.label("the stopped session hears the change"),
    () =>
      leg
        .heardSince(stoppedAt)
        .find((one) => one.last.includes(`to: “${words}”`)),
    (found) => found !== undefined,
    90_000
  ).catch(() => undefined);
  leg.kit.check(
    leg.label(
      "(4a) a stopped session is reopened, the same one, with the change"
    ),
    reopened !== undefined &&
      leg.fleet.instance(leg.session)?.status === "running",
    `${leg.fleet.instance(leg.session)?.status}; ${reopened?.last.slice(0, 200) ?? "never heard"}`
  );
};

/** (4b) Its conversation gone, a new session goes on from it. */
const goesOn = async (leg: Leg): Promise<void> => {
  await pulseIs(
    leg.fleet,
    leg.session,
    false,
    leg.label("idle before it stops")
  );
  await stopped(leg, "the session stops again");
  const [row] = leg.fleet.query<{ session_id: string }>(
    "SELECT session_id FROM instances WHERE id = ?",
    leg.session
  );
  const gone = await removeTranscript(leg.fleet.home, row?.session_id ?? "");
  leg.kit.check(
    leg.label("(4b) staged: its transcript removed"),
    gone > 0,
    `${gone} transcript file(s) removed`
  );
  const goneAt = Date.now();
  const words = "Ship it behind a flag";
  await leg.edit({ kind: "reword", step: "s2", content: words });
  const opened = await until(
    leg.label("a new session opens on the change"),
    () =>
      leg
        .heardSince(goneAt)
        .find(
          (one) =>
            one.last.includes("cannot go on") &&
            one.last.includes(`to: “${words}”`)
        ),
    (found) => found !== undefined,
    120_000
  ).catch(() => undefined);
  const [follower] = leg.fleet.query<{ id: string }>(
    "SELECT id FROM instances WHERE id != ? AND title LIKE ? ORDER BY rowid DESC",
    leg.session,
    "% (continued)"
  );
  const followerPlan = follower
    ? await leg.fleet.api<Plan>(`/api/instances/${follower.id}/plan`)
    : undefined;
  leg.kit.check(
    leg.label(
      "(4b) a session that cannot go on is followed by a new one, opening on the change and its records"
    ),
    opened?.last.includes("Open items") === true &&
      !!follower &&
      followerPlan?.steps.some((one) => one.content === words) === true,
    JSON.stringify({
      follower: follower?.id,
      steps: followerPlan?.steps.map((one) => one.content),
      opening: opened?.last.slice(0, 300),
    })
  );
};

/** One harness's session through every leg. */
const legs = async (kit: Kit, fleet: KitFleet, harness: Harness) => {
  const session = await fleet.spawn(harness, `Plan ${harness}`, fleet.repo);
  // Its decision page, with the card a step waits on.
  const made = await fetch(`${fleet.base}/api/instances/${session}/artifacts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      kind: "page",
      name: `pick-${harness}`,
      does: "pick",
      ask: "Pick the colour",
      html: `<main><section data-cawco-choice="${CARD}"><h2>Colour</h2><button data-option="a">Teal</button><button data-option="b">Amber</button></section></main>`,
    }),
  });
  const page = (await made.json().catch(() => ({}))) as { id?: string };
  const label = (what: string) => `${harness}: ${what}`;
  kit.check(
    label("its decision page is made"),
    made.ok && !!page.id,
    `${made.status} ${JSON.stringify(page)}`
  );
  const leg: Leg = {
    kit,
    fleet,
    harness,
    session,
    label,
    page: page.id ?? "none",
    plan: () => fleet.api<Plan>(`/api/instances/${session}/plan`),
    edit: async (body) => {
      const answer = await fetch(
        `${fleet.base}/api/instances/${session}/plan/edits`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      return { status: answer.status, text: await answer.text() };
    },
    heardSince: (since) =>
      (heard.get(harness) ?? []).filter((one) => one.at >= since),
  };
  await writes(leg);
  await midTurn(leg);
  await idle(leg);
  await picks(leg);
  await reopens(leg);
  if (harness === "claude") {
    await goesOn(leg);
  }
};

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  for (const harness of HARNESSES) {
    // biome-ignore lint/performance/noAwaitInLoops: one harness's session at a time, so each leg's timing is its own
    await legs(kit, fleet, harness);
  }
};

/** Removes every transcript file of `conversation` under `home`; how many it removed. */
const removeTranscript = async (
  home: string,
  conversation: string
): Promise<number> => {
  if (!conversation) {
    return 0;
  }
  let removed = 0;
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(
      () => []
    )) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        // biome-ignore lint/performance/noAwaitInLoops: a walk, one folder at a time
        await walk(path);
      } else if (entry.name === `${conversation}.jsonl`) {
        await rm(path);
        removed += 1;
      }
    }
  };
  await walk(home);
  return removed;
};

const spec: Spec = { name: "plan-changes", run };
export default spec;
