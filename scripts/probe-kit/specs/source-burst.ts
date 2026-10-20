/**
 * The two legs of link-under-load that need no workspace to start, on a
 * scratch fleet (real hub, two machines' agents and sessionds on this
 * computer, the second reaching the hub through the kit's relay; Claude
 * Code against the mock model). Where this runs inside a workspace, each
 * delegate's create stops at its boundary (kit.ts `BOUNDARY_INSIDE`), after
 * the source repository was readied, which is what leg 1 reads.
 *
 * 1. Many workspaces at once from one repository, on both machines, whose
 *    places are the same checkout (agent workspace.ts `inSource`,
 *    `holdingSource`; git-credential.ts `useHubCredentialHelper`). No create
 *    is refused for the source's readying: on 2026-10-20 link-under-load
 *    lane 2 was, "git config in …/src failed: error: could not lock config
 *    file .git/config: File exists", the two agents rewriting the source's
 *    config side by side. The source then names the hub's credential helper
 *    once.
 * 2. A session on the second machine calls a CawCo tool while that
 *    machine's link to the hub is cut (agent mcp-oauth.ts `relayMcp`,
 *    hub-away.ts `throughHubAway`): the call is answered by the hub once the
 *    link is back, not refused at once. On 2026-10-20 link-under-load lane 1's
 *    `finish_item` came back "The CawCo hub could not be reached." 0.34 s
 *    into the cut, and its item failed three quiet turns later.
 * 3. A session on the second machine hands its parent a message, and the
 *    connection drops after the hub took the call, half its answer passed
 *    on (relay.ts `breakAnswer`): the call goes again under its key (agent
 *    mcp-oauth.ts `throughDrops`), the hub answers it its first answer
 *    (hub tool-call-keys.ts), and the message is delivered once.
 * 4. A person's message to a session on the second machine is lost with the
 *    link it was handed on: the relay drops the frame and cuts the link
 *    (link-under-load lane 11 on 2026-10-20, whose brief went 143 ms before
 *    the cut and was never read). Once the machine is back, the hub hands it
 *    again (hub server.ts `handAgain`), and the session reads it once.
 * 5. A person starts a session on the second machine 1 s into a 3 s cut of
 *    its link: the hub keeps the start for the machine's register (hub
 *    server.ts `startHold`, `flushOwedStarts`), and once the machine is back
 *    there is one row for it and one session. On 2026-10-20 such a start was
 *    answered "offline" and made no row (leg 3's, sent as leg 2's cut ended;
 *    leg 3 starts there still).
 *
 *   bun scripts/probe-kit/run.ts source-burst
 */
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";
import { type Relay, relay } from "../relay";

/** The second machine, which reaches the hub through the relay. */
const OTHER = "source-burst-other";
/** Delegates at once, half on each machine. Ours: link-under-load's burst. */
const DELEGATES = 16;
/** What a create refused for its source's readying says (git's lock, a second `remote add`, a push raced). */
const READYING = ["could not lock config file", "already exists", "git config"];
/** How the leg-2 session's prompt names it, and nothing else does. */
const AWAY_TAG = "PROBE-SOURCE-BURST-AWAY";
const SET_TITLE = "mcp__cawco__set_title";
const TITLE = "Titled through the cut";
/** How long the second machine's link stays cut: link-under-load's. */
const CUT_MS = 3000;
/** What set_title answers once the hub has the title. */
const NAMED = `Named this session "${TITLE}"`;
/** How far into leg 5's cut its start is posted. */
const START_INTO_CUT_MS = 1000;
/** Leg 5's session: its rows are counted by it. */
const STARTED_TITLE = "Started through the cut";
/** How the leg-3 session's prompt names it, and nothing else does. */
const ONCE_TAG = "PROBE-SOURCE-BURST-ONCE";
const HANDOFF = "mcp__cawco__handoff";
/** The message leg 3 hands the parent: the parent's transcript is counted for it. */
const DELIVERED = "PROBE-SOURCE-BURST-DELIVERED: one message, sent once.";

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });

/** The relay, once up: the mock cuts it as it hands the leg-2 session its call. */
let between: ReturnType<typeof relay> | undefined;
/** When the cut began and ended, and what the call came back with. */
const leg2: { cutAt?: number; releasedAt?: number; answer?: Seen } = {};
/** The message leg 4 loses with its link: its frame names it, and nothing else does. */
const LOST_TAG = "PROBE-SOURCE-BURST-LOST";
/** When leg 4's frame was lost and the link let back, and each turn its session took on it. */
const leg4: { lostAt?: number; releasedAt?: number; turns: Seen[] } = {
  turns: [],
};

/**
 * What the hub says to the second machine: leg 4's message is lost there,
 * the link cut with it, and let back {@link CUT_MS} later.
 */
const toApp = (said: string): string | undefined => {
  if (leg4.lostAt !== undefined || !said.includes(LOST_TAG)) {
    return said;
  }
  leg4.lostAt = Date.now();
  between?.cut();
  setTimeout(() => {
    between?.release();
    leg4.releasedAt = Date.now();
  }, CUT_MS);
  return undefined;
};

/** Whom leg 3 hands its message, when it called, and what the call came back with. */
const leg3: { parent?: string; calledAt?: number; answer?: Seen } = {};

/** Leg 3's session: hands the parent one message, its answer broken on the way back. */
const once = (request: Seen): Reply => {
  if (request.afterTool && leg3.calledAt !== undefined) {
    leg3.answer ??= request;
    return text("ok");
  }
  if (leg3.calledAt !== undefined) {
    return text("ok");
  }
  if (!request.toolNames.includes(HANDOFF)) {
    return request.toolNames.includes("ToolSearch")
      ? {
          everyMs: 5,
          words: [],
          tool: {
            name: "ToolSearch",
            input: { query: `select:${HANDOFF}`, max_results: 1 },
          },
        }
      : text(`${HANDOFF} is not offered`);
  }
  leg3.calledAt = Date.now();
  between?.breakAnswer(
    ({ method, path, body }) =>
      method === "POST" &&
      path === "/mcp/cawco" &&
      body.includes('"tools/call"') &&
      body.includes('"handoff"')
  );
  return {
    everyMs: 5,
    words: [],
    tool: {
      name: HANDOFF,
      input: { target: leg3.parent, message: DELIVERED },
    },
  };
};

const respond = (request: Seen): Reply => {
  if (request.tools && request.last.includes(LOST_TAG)) {
    leg4.turns.push(request);
    return text("ok");
  }
  if (request.tools && request.all.includes(ONCE_TAG)) {
    return once(request);
  }
  if (!(request.tools && request.all.includes(AWAY_TAG))) {
    return text("ok");
  }
  if (request.afterTool) {
    leg2.answer ??= request;
    return text("ok");
  }
  if (leg2.cutAt !== undefined) {
    return text("ok");
  }
  if (!request.toolNames.includes(SET_TITLE)) {
    return text(`${SET_TITLE} is not offered`);
  }
  leg2.cutAt = Date.now();
  between?.cut();
  setTimeout(() => {
    between?.release();
    leg2.releasedAt = Date.now();
  }, CUT_MS);
  return {
    everyMs: 5,
    words: [],
    tool: { name: SET_TITLE, input: { title: TITLE } },
  };
};

type Fleet = Awaited<ReturnType<Kit["fleet"]>>;

/** What legs 3 to 5 run on: the fleet, the checkout, its project, the second machine's relay. */
interface Legs {
  check: Kit["check"];
  fleet: Fleet;
  link: Relay;
  projectId: string;
  src: string;
}

/** Leg 3: the session hands `parent` its message. */
const handOnce = async (at: Legs, parent: string): Promise<void> => {
  leg3.parent = parent;
  // 3. A handoff whose answer the link drops after the hub took it. Its
  // session starts as leg 2's cut ends, while the second machine may still
  // be reconnecting: a start then is kept for its register (leg 5).
  const sender = await at.fleet
    .spawn("claude", "Once call", at.src, { projectId: at.projectId }, OTHER)
    .catch((error: unknown) => {
      at.check(
        "the leg-3 session, started as leg 2's cut ends, runs",
        false,
        error instanceof Error ? error.message : String(error)
      );
    });
  if (sender) {
    await at.fleet.send(
      sender,
      `${ONCE_TAG}: hand your parent a message.`,
      OTHER
    );
    const handed = await until(
      "the handoff whose answer was broken is answered",
      () => leg3.answer,
      Boolean,
      120_000
    ).catch(() => undefined);
    const deliveries = () =>
      at.fleet.query<{ count: number }>(
        "SELECT count(*) AS count FROM sent_messages WHERE instance_id = ? AND body LIKE ?",
        parent,
        `%${DELIVERED}%`
      )[0]?.count ?? 0;
    await until(
      "the message reaches the parent",
      deliveries,
      (n) => n > 0,
      30_000
    ).catch(() => undefined);
    // Long enough for a second run's send to land beside the first.
    await Bun.sleep(5000);
    const delivered = deliveries();
    const { broke } = at.link.fault;
    at.check(
      "a handoff whose connection drops after the hub took it, half its answer through, is answered its first answer when it goes again, and its message is delivered once",
      !!handed &&
        !!broke &&
        !handed.toolFailed &&
        handed.at >= broke.at &&
        delivered === 1,
      `broken ${broke ? `after ${broke.passed} of ${broke.bytes} bytes` : "never"}; answer ${handed ? `${handed.toolFailed ? "an error" : "a result"} ${handed.at - (broke?.at ?? handed.at)} ms after the break: ${handed.last.slice(0, 300)}` : "none"}; delivered ${delivered} time(s)`
    );
  }
};

/** Leg 4. */
const loseSend = async (at: Legs): Promise<void> => {
  // 4. A message lost with the link it was handed on.
  const reader = await at.fleet.spawn(
    "claude",
    "Lost send",
    at.src,
    { projectId: at.projectId },
    OTHER
  );
  const lost = await at.fleet.send(reader, `${LOST_TAG}: say ok.`, OTHER);
  await until(
    "the session reads the message lost with its link",
    () => leg4.turns.length,
    (turns) => turns > 0,
    120_000
  ).catch(() => undefined);
  // Long enough for a second hand-off's turn to come beside the first.
  await Bun.sleep(5000);
  const record = at.fleet.query<{ state: string }>(
    "SELECT state FROM sent_messages WHERE uuid = ?",
    lost
  )[0]?.state;
  const [read] = leg4.turns;
  at.check(
    "a message whose frame is lost with the link it was handed on is handed again once the machine is back, and its session reads it once",
    leg4.lostAt !== undefined &&
      leg4.releasedAt !== undefined &&
      leg4.turns.length === 1 &&
      !!read &&
      read.at >= leg4.releasedAt &&
      record === "read",
    `lost ${leg4.lostAt === undefined ? "never" : `and the link cut for ${CUT_MS} ms`}; ${leg4.turns.length} turn(s) on it${read && leg4.releasedAt !== undefined ? `, the first ${read.at - leg4.releasedAt} ms after the link was back` : ""}; its record: ${record ?? "none"}`
  );
};

/** Leg 5. */
const startThroughCut = async (at: Legs): Promise<void> => {
  // 5. A start posted 1 s into a 3 s cut of the second machine's link.
  const { link } = at;
  link.cut();
  setTimeout(() => link.release(), CUT_MS);
  await Bun.sleep(START_INTO_CUT_MS);
  const started = await at.fleet
    .spawn("claude", STARTED_TITLE, at.src, { projectId: at.projectId }, OTHER)
    .catch((error: unknown) =>
      error instanceof Error ? error.message : String(error)
    );
  // Long enough for a second start's session to come beside the first.
  await Bun.sleep(5000);
  const rows = at.fleet.query<{ id: string; status: string }>(
    "SELECT id, status FROM instances WHERE title = ?",
    STARTED_TITLE
  );
  const launched = rows.map(
    ({ id }) =>
      readFileSync(join(at.fleet.sandbox, `${OTHER}-agent.log`), "utf8")
        .split("\n")
        .filter((line) => line.includes(`launch credential installed ${id}`))
        .length
  );
  at.check(
    "a session started 1 s into a 3 s cut of its machine's link is kept for the machine's register, and makes one row and one session once it is back",
    rows.length === 1 &&
      rows[0]?.status === "running" &&
      launched[0] === 1 &&
      rows[0]?.id === started,
    `${rows.length} row(s): ${rows.map((row, index) => `${row.id.slice(0, 8)} ${row.status}, ${launched[index]} launch(es) on ${OTHER}`).join("; ") || "none"}; the start: ${started.length === 36 ? "running" : started.slice(0, 300)}`
  );
};

const spec: Spec = {
  name: "source-burst",
  run: async (kit: Kit) => {
    const { check } = kit;
    const fleet = await kit.fleet(respond);
    const home = fleet.env.HOME as string;
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    between = relay(fleet.base, { toApp });
    await fleet.launchMachine(OTHER, {
      CAWCO_HUB_URL: `${between.url.replace("http", "ws")}/ws`,
    });
    const src = join(fleet.sandbox, "src");
    await mkdir(src, { recursive: true });
    await writeFile(
      join(home, ".gitconfig"),
      "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
    );
    await Bun.$`sh -c ${"git init -q -b main && echo burst > README.md && git add -A && git commit -qm 'First commit'"}`
      .cwd(src)
      .env({ ...process.env, HOME: home })
      .quiet();
    const project = await fleet.api<{ id: string }>("/api/projects", {
      name: "Source burst",
      machineId: MACHINE,
      cwd: src,
    });
    await fleet.api(`/api/projects/${project.id}/places`, {
      machineId: OTHER,
      path: src,
    });
    const parent = await fleet.spawn("claude", "Parent", src, {
      projectId: project.id,
    });

    // 1. Every create at once, half on each machine.
    const calls = await Promise.allSettled(
      Array.from({ length: DELEGATES }, (_, lane) =>
        fleet.api("/api/work-items", {
          parentInstanceId: parent,
          title: `Source burst ${lane}`,
          prompt: "Say ok.",
          harness: "claude",
          model: "claude-haiku-4-5",
          cwd: src,
          lands: "none",
          ...(lane % 2 === 1 ? { machineId: OTHER } : {}),
        })
      )
    );
    const refusals = calls.flatMap((call, lane) =>
      call.status === "rejected" ? [`lane ${lane}: ${String(call.reason)}`] : []
    );
    const readying = refusals.filter((one) =>
      READYING.some((words) => one.includes(words))
    );
    check(
      `none of ${DELEGATES} creates at once from one checkout, on two machines, is refused for the source's readying`,
      readying.length === 0,
      `${DELEGATES - refusals.length} started, ${refusals.length} refused, ${readying.length} for the source's readying; ${(readying.length > 0 ? readying : refusals).join(" | ").slice(0, 1500)}`
    );
    const origin = (
      await Bun.$`git -C ${src} remote get-url origin`.quiet().nothrow()
    )
      .text()
      .trim();
    const helpers = (
      await Bun.$`git -C ${src} config --local --get-regexp ${"^credential\\..*\\.helper$"}`
        .quiet()
        .nothrow()
    )
      .text()
      .trim()
      .split("\n")
      .filter(Boolean);
    check(
      "the source's origin is the hub's remote, as one of the machines reaches it, and its config names the hub's credential helper once (the reset, then the helper)",
      [fleet.base, between.url].some((hub) =>
        origin.startsWith(`${hub}/git/`)
      ) && helpers.length === 2,
      `origin ${origin || "none"}; ${helpers.length} helper line(s): ${helpers.join(" | ").slice(0, 600)}`
    );

    // 2. A CawCo tool call while the second machine's link is cut.
    const away = await fleet.spawn(
      "claude",
      "Away call",
      src,
      { projectId: project.id },
      OTHER
    );
    await fleet.send(away, `${AWAY_TAG}: set your title.`, OTHER);
    const answered = await until(
      "the call made through the cut is answered",
      () => leg2.answer,
      Boolean,
      120_000
    ).catch(() => undefined);
    const named = fleet.query<{ title: string | null }>(
      "SELECT title FROM instances WHERE id = ?",
      away
    )[0]?.title;
    check(
      "a session's CawCo tool call made while its machine's link is cut is answered by the hub once the link is back",
      !!answered &&
        leg2.cutAt !== undefined &&
        answered.last.includes(NAMED) &&
        answered.at >= leg2.cutAt + CUT_MS &&
        named === TITLE,
      `cut ${leg2.cutAt === undefined ? "never" : `for ${CUT_MS} ms`}; answer ${answered ? `${answered.at - (leg2.cutAt ?? answered.at)} ms after the cut began: ${answered.last.slice(0, 300)}` : "none"}; the session's title: ${named ?? "none"}`
    );

    const legs: Legs = {
      check,
      fleet,
      link: between,
      projectId: project.id,
      src,
    };
    await handOnce(legs, parent);
    await loseSend(legs);
    await startThroughCut(legs);
    between.stop();
  },
};

export default spec;
