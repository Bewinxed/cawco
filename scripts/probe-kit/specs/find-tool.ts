/**
 * `find` (hub find-tool.ts): the dashboard's Find as every session's tool, on
 * a scratch fleet (real hub, agent and sessiond; Claude Code against the mock
 * model). Nothing here delegates: each role is a session's row as the hub
 * reads it (roles.ts `roleOf`): a session you started is the orchestrator,
 * one marked a leaf (`can_delegate` 0, as every delegate's row is) is a
 * delegate, one marked `lead` is a project's Caw. Each calls `find` through
 * the hub's REST door with its own credential, the door `cawco tool` and
 * pi's host use, which runs the same call its harness's MCP call does.
 *
 * Seeded: two projects; in the first, a session that talks about the
 * zebrafish build over three turns, a task, a Caw thread and an artifact,
 * each holding "zebrafish"; in the second, a session that says it too.
 *
 * a. The hits match what `GET /api/find` answers for the same words.
 * b. `around` a hit's ref answers the turns before and after it.
 * c. Paging: a page of one says has_more, and its cursor gives the next.
 * d. A delegate in a project searches its project unless asked for all;
 *    Caw finds his project's thread.
 * e. An empty query is refused, with an example call.
 * f. Every answer stays under the bound (find-tool.ts `ANSWER_MAX_CHARS`).
 * g. Every role is listed `find`; it loads upfront for the orchestrator and
 *    Caw, and a delegate's instructions point to it first; nobody is listed
 *    `memory_recall`.
 * h. A made-up password the person typed into a session comes back
 *    `[redacted]` in find's concise and detailed answers and in `around`
 *    (secret-filter.ts).
 * i. A session the person purges (its transcript deleted from the
 *    dashboard) is no hit of an agent's find, nor of the dashboard's
 *    `GET /api/find`: its machine's index forgot its words.
 * k. A made-up password typed more than 16 words after "password" in one
 *    sentence (past the index's snippet window) comes back `[redacted]` in
 *    a concise hit: the excerpt is cut from the whole turn, filtered.
 * j. `before` keeps the evidence at or before its day: a thread's message
 *    of September comes back, October's does not.
 *
 *   bun scripts/probe-kit/run.ts find-tool
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { ANSWER_MAX_CHARS } from "../../../packages/hub/src/find-tool";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const WORD = "zebrafish";
/** A made-up password, password-shaped (secret-filter.ts `passwordShaped`): never a real one. */
const PASSWORD = "Zq7!vRt9Lm";
/** Another, typed far from the word "password"; its two halves as the index tokenises it. */
const FAR_PASSWORD = "Xk8#pLm2Qw";
const FAR_HALVES = ["Xk8", "pLm2Qw"];
const SAY = {
  one: "PROBE-FIND-ONE say hello",
  two: `PROBE-FIND-TWO did the ${WORD} marmalade build pass?`,
  three: "PROBE-FIND-THREE thanks, note it",
  other: `PROBE-FIND-OTHER the ${WORD} lives in the other project too`,
  secret: `PROBE-FIND-SECRET my sudo password is ${PASSWORD} on the narwhal box.`,
  purge: "PROBE-FIND-PURGE the axolotl plan is off.",
  far: `PROBE-FIND-FAR my password for the build box that we set up last spring on the shared rack beside the old printer near the window is ${FAR_PASSWORD} for the pangolin queue.`,
} as const;
const REPLY = {
  one: "Hello, ready when you are.",
  two: `The ${WORD} build passed after the quokka lattice fix.`,
  three: "Noted beside the walrus checklist.",
  other: `Other project ${WORD} noted.`,
  secret: "Understood, the narwhal box.",
  purge: "The axolotl plan is off, noted.",
  far: "Noted, the queue.",
} as const;
/** The deferred groups' first line, as delegation-tools.ts writes it for `find`. */
const POINTER =
  "find: anything said or made, as the dashboard's Find finds it; search it before reading transcripts, files or the database";
/** The server's instructions in an `initialize` answer, JSON-escaped. */
const INSTRUCTIONS = /"instructions":"((?:[^"\\]|\\.)*)"/;

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Find probe");
  }
  for (const key of [
    "one",
    "two",
    "three",
    "other",
    "secret",
    "purge",
    "far",
  ] as const) {
    if (request.last.includes(SAY[key])) {
      return text(REPLY[key]);
    }
  }
  return text("ok");
};

interface Hit {
  excerpt?: string;
  id: string;
  kind: string;
  ref?: string;
  title: string;
  when: string | null;
  where: string;
}
interface Answer {
  has_more?: boolean;
  hits?: Hit[];
  next_cursor?: string | null;
  note?: string;
  total?: number;
  turns?: { here?: true; text: string; who: string }[];
}
interface Called {
  answer: Answer;
  refused: boolean;
  text: string;
}
interface Session {
  credential: string;
  id: string;
}

const keyOf = (result: { id: string; kind: string }) =>
  `${result.kind}:${result.id}`;
const said = (called: Called | undefined) => {
  if (!called) {
    return "not called";
  }
  return called.refused
    ? called.text
    : JSON.stringify(called.answer).slice(0, 900);
};

/** The fleet, two projects, and the calls every leg makes. */
const standUp = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const project = async (name: string) => {
    const cwd = join(fleet.workdir, name.toLowerCase().replace(" ", "-"));
    await mkdir(cwd, { recursive: true });
    const made = await fleet.api<{ id: string }>("/api/projects", {
      name,
      machineId: MACHINE,
      cwd,
      caw: false,
    });
    return { id: made.id, cwd };
  };
  const mine = await project("Find probe");
  const other = await project("Other probe");
  /** A session in `where`, its credential read from its process. */
  const session = async (
    title: string,
    where: { cwd: string; id: string }
  ): Promise<Session> => {
    const id = await fleet.spawn("claude", title, where.cwd, {
      projectId: where.id,
    });
    const environ = await Bun.file(
      `/proc/${await fleet.sessionPid(id)}/environ`
    ).text();
    const credential =
      environ
        .split("\0")
        .find((line) => line.startsWith("CAWCO_SESSION_CREDENTIAL="))
        ?.slice("CAWCO_SESSION_CREDENTIAL=".length) ?? "";
    return { id, credential };
  };
  /** One tool call through the hub's REST door, as `as`: its words, refused or not. */
  const tool = async (as: Session, name: string, args: object) => {
    const response = await fetch(`${fleet.base}/api/delegation/call/${as.id}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${as.credential}`,
      },
      body: JSON.stringify({ name, arguments: args }),
    });
    const raw = await response.text();
    try {
      const result = JSON.parse(raw) as {
        content?: { text?: string }[];
        isError?: boolean;
      };
      return {
        refused: !response.ok || result.isError === true,
        text: (result.content ?? []).map((block) => block.text ?? "").join(""),
      };
    } catch {
      return { refused: true, text: `${response.status} ${raw}` };
    }
  };
  /** One `find` call, its answer read. */
  const find = async (as: Session, args: object): Promise<Called> => {
    const called = await tool(as, "find", args);
    try {
      return {
        ...called,
        answer: called.refused ? {} : (JSON.parse(called.text) as Answer),
      };
    } catch {
      return { refused: true, text: called.text, answer: {} };
    }
  };
  /** `GET /api/find`, as the dashboard's Find asks it once typing settles. */
  const engine = async (q: string) =>
    (await (
      await fetch(
        `${fleet.base}/api/find?${new URLSearchParams({ q, limit: "50" })}`
      )
    ).json()) as {
      results: { id: string; kind: string; moments?: unknown[] }[];
    };
  return { fleet, mine, other, session, tool, find, engine };
};

type Probe = Awaited<ReturnType<typeof standUp>>;

/** The sessions, task, thread and artifact the legs find, and a session of each role. */
const seed = async (probe: Probe) => {
  const { fleet, mine, other, session } = probe;
  const talker = await session("Marmalade build", mine);
  for (const key of ["one", "two", "three"] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one turn after the other, as the person types them
    await fleet.send(talker.id, SAY[key]);
    // Answered, and its turn closed: the next words are a turn of their own.
    await until(
      `the talker's reply to ${key}`,
      () =>
        fleet.seen.some((request) => request.last.includes(SAY[key])) &&
        fleet.instance(talker.id)?.turn_open_at === null,
      Boolean,
      60_000
    ).catch(() => false);
  }
  const outsider = await session("Other side", other);
  await fleet.send(outsider.id, SAY.other);
  await fleet.api(`/api/projects/${mine.id}/tasks`, {
    title: `Cache the ${WORD} fixtures`,
    description: "Seeded by the find probe.",
    lands: "none",
  });
  // A thread of the person's words, as Caw's threads keep them: no Caw
  // session is started for it (`caw: false`).
  const threadId = crypto.randomUUID();
  const at = Date.now();
  fleet.write(
    "INSERT INTO project_threads (id, project_id, title, setup, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)",
    threadId,
    mine.id,
    "Release questions",
    at,
    at
  );
  fleet.write(
    "INSERT INTO thread_messages (id, thread_id, author, body, created_at) VALUES (?, ?, 'you', ?, ?)",
    crypto.randomUUID(),
    threadId,
    `Is the ${WORD} release still on for Friday?`,
    at
  );
  const artifact = await probe.tool(talker, "artifact_create", {
    kind: "page",
    does: "judge",
    ask: "Judge this page: pin anything that reads wrong",
    name: `${WORD}-notes`,
    html: `<p>The ${WORD} notes.</p>`,
  });
  const orchestrator = await session("Asker", mine);
  const delegate = await session("Leaf asker", mine);
  fleet.write(
    "UPDATE instances SET can_delegate = 0 WHERE id = ?",
    delegate.id
  );
  const lead = await session("Caw stand-in", mine);
  fleet.write("UPDATE instances SET role = 'lead' WHERE id = ?", lead.id);
  // The machine's index holds the words once the dashboard's Find finds them.
  await until(
    "the talker's, the outsider's and the thread's words in /api/find",
    () => probe.engine(WORD),
    (answer) =>
      [talker.id, outsider.id, threadId].every((id) =>
        answer.results.some((result) => result.id === id)
      ),
    120_000
  ).catch(() => undefined);
  return {
    talker,
    outsider,
    threadId,
    artifact,
    orchestrator,
    delegate,
    lead,
  };
};

type Seeded = Awaited<ReturnType<typeof seed>>;

/** a: the dashboard's hits, and one conversation hit's words. */
const sameHits = async (kit: Kit, probe: Probe, seeded: Seeded) => {
  const route = await probe.engine(WORD);
  const all = await probe.find(seeded.orchestrator, {
    query: WORD,
    project: "all",
    limit: 50,
  });
  const fromRoute = route.results.map(keyOf);
  const fromTool = (all.answer.hits ?? []).map(keyOf);
  kit.check(
    "a: find answers the hits GET /api/find answers for the same words, in the same order, sessions, the thread, the task and the artifact among them",
    !all.refused &&
      fromTool.length === fromRoute.length &&
      fromTool.every((key, index) => key === fromRoute[index]) &&
      [
        `conversation:${seeded.talker.id}`,
        `conversation:${seeded.outsider.id}`,
        `thread:${seeded.threadId}`,
      ].every((key) => fromTool.includes(key)) &&
      fromTool.some((key) => key.startsWith("task:")) &&
      fromTool.some(
        (key) => key.startsWith("artifact:") || key.startsWith("decision:")
      ),
    `route [${fromRoute.join(", ")}]\nfind [${fromTool.join(", ")}]\n${said(all)}\nartifact_create: ${seeded.artifact.text.slice(0, 300)}`
  );
  const hit = all.answer.hits?.find((each) => each.id === seeded.talker.id);
  kit.check(
    "a: a conversation hit says its project and machine in words with ids, when, and an excerpt with the matched word",
    Boolean(
      hit?.where.includes(`project Find probe (${probe.mine.id})`) &&
      hit.when &&
      hit.excerpt?.toLowerCase().includes(WORD) &&
      hit.ref?.startsWith(`${seeded.talker.id}#`)
    ),
    JSON.stringify(hit)
  );
  return { all, order: fromTool, ref: hit?.ref };
};

/** b: a hit's turns, by its ref and by its session's id. */
const aroundLegs = async (
  kit: Kit,
  probe: Probe,
  seeded: Seeded,
  ref: string | undefined
) => {
  const around = ref
    ? await probe.find(seeded.orchestrator, { around: ref })
    : undefined;
  const turns = around?.answer.turns ?? [];
  const here = turns.findIndex((turn) => turn.here);
  const words = turns.map((turn) => turn.text).join(" | ");
  kit.check(
    "b: around a hit's ref answers its turn, marked, with the turns before and after it",
    here > 0 &&
      here < turns.length - 1 &&
      (turns[here]?.text.toLowerCase().includes(WORD) ?? false) &&
      [REPLY.one, SAY.one, "quokka", "walrus", SAY.three].some((neighbour) =>
        words.includes(neighbour)
      ),
    ref ? said(around) : "no ref to read around"
  );
  const latest = await probe.find(seeded.orchestrator, {
    around: seeded.talker.id,
  });
  kit.check(
    "b: around a session's id answers its latest turns",
    (latest.answer.turns ?? []).some((turn) => turn.text.includes("walrus")),
    said(latest)
  );
  return [around, latest];
};

/** c: a page of one, then the next by its cursor. */
const pagingLeg = async (
  kit: Kit,
  probe: Probe,
  seeded: Seeded,
  order: string[]
) => {
  const ask = { query: WORD, project: "all", limit: 1 };
  const first = await probe.find(seeded.orchestrator, ask);
  const cursor = first.answer.next_cursor;
  const second = cursor
    ? await probe.find(seeded.orchestrator, { ...ask, cursor })
    : undefined;
  const firstHit = first.answer.hits?.[0];
  const secondHit = second?.answer.hits?.[0];
  kit.check(
    "c: a page of one says has_more, a steering note and the total; its cursor gives the next hit",
    first.answer.has_more === true &&
      first.answer.total === order.length &&
      Boolean(first.answer.note?.includes("next_cursor")) &&
      firstHit !== undefined &&
      keyOf(firstHit) === order[0] &&
      secondHit !== undefined &&
      keyOf(secondHit) === order[1],
    `first ${said(first)}\nsecond ${said(second)}`
  );
  return [first, second];
};

/** d: a delegate's own project, and Caw's thread. */
const scopeLegs = async (kit: Kit, probe: Probe, seeded: Seeded) => {
  const scoped = await probe.find(seeded.delegate, { query: WORD });
  const widened = await probe.find(seeded.delegate, {
    query: WORD,
    project: "all",
  });
  const ids = (scoped.answer.hits ?? []).map((hit) => hit.id);
  kit.check(
    "d: a delegate's find searches its own project unless it asks for all",
    ids.includes(seeded.talker.id) &&
      !ids.includes(seeded.outsider.id) &&
      (scoped.answer.hits ?? []).every((hit) =>
        hit.where.includes(`(${probe.mine.id})`)
      ) &&
      (widened.answer.hits ?? []).some((hit) => hit.id === seeded.outsider.id),
    `scoped ${said(scoped)}\nwidened ${said(widened)}`
  );
  const caw = await probe.find(seeded.lead, { query: WORD, kinds: ["thread"] });
  kit.check(
    "d: Caw's find answers the project's thread by its words",
    (caw.answer.hits ?? []).some((hit) => hit.id === seeded.threadId),
    said(caw)
  );
  return [scoped, widened, caw];
};

/** e: refusals that name what was wrong and give one call that works. */
const refusalLegs = async (kit: Kit, probe: Probe, seeded: Seeded) => {
  const empty = await probe.find(seeded.orchestrator, { query: "  " });
  kit.check(
    "e: an empty query is refused, saying what is wrong and giving one call that works",
    empty.refused &&
      empty.text.includes("query is empty") &&
      empty.text.includes('Example: {"query"'),
    empty.text
  );
  const kind = await probe.find(seeded.orchestrator, {
    query: WORD,
    kinds: ["pin"],
  });
  kit.check(
    "e: an unknown kind is refused with the kinds and an example",
    kind.refused &&
      kind.text.includes("conversation, thread") &&
      kind.text.includes("Example:"),
    kind.text
  );
};

/** f: every answer under the bound, a detailed page of fifty among them. */
const boundLeg = async (
  kit: Kit,
  probe: Probe,
  seeded: Seeded,
  answers: (Called | undefined)[]
) => {
  const detailed = await probe.find(seeded.orchestrator, {
    query: WORD,
    project: "all",
    limit: 50,
    response_format: "detailed",
  });
  const sizes = [...answers, detailed]
    .filter((each): each is Called => each !== undefined)
    .map((each) => each.text.length);
  kit.check(
    `f: every answer stays under ${ANSWER_MAX_CHARS} characters (about 15,000 tokens); detailed adds neighbouring turns`,
    sizes.every((size) => size < ANSWER_MAX_CHARS) &&
      !detailed.refused &&
      JSON.stringify(detailed.answer).includes('"turns"'),
    `sizes ${sizes.join(", ")}; detailed ${said(detailed)}`
  );
};

/** g: who is listed `find`, who loads it upfront, and the delegate's pointer to it. */
const listingLegs = async (kit: Kit, probe: Probe, seeded: Seeded) => {
  const { fleet } = probe;
  const listing = async (id: string) =>
    (
      (await (
        await fetch(`${fleet.base}/api/delegation/tools?instanceId=${id}`)
      ).json()) as {
        tools: { _meta?: Record<string, unknown>; name: string }[];
      }
    ).tools;
  const roles = [seeded.orchestrator, seeded.delegate, seeded.lead];
  const lists = await Promise.all(roles.map((each) => listing(each.id)));
  kit.check(
    "g: the orchestrator, the delegate and Caw are each listed find, and none memory_recall",
    lists.every(
      (list) =>
        list.some((tool) => tool.name === "find") &&
        !list.some((tool) => tool.name === "memory_recall")
    ),
    lists
      .map((list) =>
        list
          .map((tool) => tool.name)
          .filter((name) => name === "find" || name.startsWith("memory_"))
          .join(" ")
      )
      .join(" / ")
  );
  const loads = lists.map(
    (list) =>
      list.find((tool) => tool.name === "find")?._meta?.["anthropic/alwaysLoad"]
  );
  kit.check(
    "g: find loads upfront for the orchestrator and Caw, deferred for a delegate",
    loads[0] === true && loads[1] === undefined && loads[2] === true,
    JSON.stringify(loads)
  );
  const init = await fetch(
    `${fleet.base}/mcp/cawco?instanceId=${seeded.delegate.id}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${seeded.delegate.credential}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "find-probe", version: "1" },
        },
      }),
    }
  ).then((response) => response.text());
  const instructions = INSTRUCTIONS.exec(init)?.[1] ?? init.slice(0, 400);
  const deferred = instructions.indexOf("is deferred:");
  const pointer = instructions.indexOf(POINTER);
  kit.check(
    "g: a delegate's instructions name find first among the deferred tools, with when to reach for it",
    deferred > 0 &&
      pointer > deferred &&
      pointer < instructions.indexOf("task_*"),
    instructions.slice(Math.max(0, deferred - 200), deferred + 500)
  );
};

/** A session in the find probe's own project that says `words` once, answered. */
const talkOnce = async (probe: Probe, title: string, words: string) => {
  const { fleet } = probe;
  const talker = await probe.session(title, probe.mine);
  await fleet.send(talker.id, words);
  await until(
    `${title}'s reply`,
    () =>
      fleet.seen.some((request) => request.last.includes(words)) &&
      fleet.instance(talker.id)?.turn_open_at === null,
    Boolean,
    60_000
  ).catch(() => false);
  return talker;
};

/**
 * Whether the engine (the dashboard's Find) holds `id` for `q` by a moment
 * of its transcript yet: the machine's index read its words. A hit by the
 * session's title alone ("Narwhal box" for "narwhal") is not enough: it
 * comes before the turn is indexed, and the leg's own query then finds
 * nothing.
 */
const indexed = (probe: Probe, q: string, id: string, what: string) =>
  until(
    what,
    () => probe.engine(q),
    (answer) =>
      answer.results.some(
        (result) => result.id === id && (result.moments?.length ?? 0) > 0
      ),
    120_000
  ).catch(() => undefined);

/** h: the person's typed password, through every answer find gives an agent. */
const secretLeg = async (kit: Kit, probe: Probe, seeded: Seeded) => {
  const talker = await talkOnce(probe, "Narwhal box", SAY.secret);
  await indexed(probe, "narwhal", talker.id, "the narwhal turn in /api/find");
  const concise = await probe.find(seeded.orchestrator, {
    query: "narwhal sudo",
    project: "all",
  });
  const detailed = await probe.find(seeded.orchestrator, {
    query: "narwhal sudo",
    project: "all",
    response_format: "detailed",
  });
  const hit = concise.answer.hits?.find((each) => each.id === talker.id);
  const around = hit?.ref
    ? await probe.find(seeded.orchestrator, { around: hit.ref })
    : undefined;
  const answers = { concise, detailed, around };
  const clean = (called: Called | undefined) =>
    called !== undefined &&
    !called.refused &&
    called.text.includes("[redacted]") &&
    !called.text.includes(PASSWORD);
  kit.check(
    "h: a password the person typed comes back [redacted] in find's concise, detailed and around answers",
    clean(concise) && clean(detailed) && clean(around),
    Object.entries(answers)
      .map(([name, called]) => `${name}: ${said(called)}`)
      .join("\n")
  );
};

/** i: a purged session, from the dashboard, is no hit of an agent's find. */
const purgeLeg = async (kit: Kit, probe: Probe, seeded: Seeded) => {
  const { fleet } = probe;
  const talker = await talkOnce(probe, "Axolotl plan", SAY.purge);
  await indexed(probe, "axolotl", talker.id, "the axolotl turn in /api/find");
  const before = await probe.find(seeded.orchestrator, {
    query: "axolotl",
    project: "all",
  });
  const [row] = fleet.query<{ cwd: string; session_id: string | null }>(
    "SELECT session_id, cwd FROM instances WHERE id = ?",
    talker.id
  );
  const requestId = crypto.randomUUID();
  await fleet.post({
    verb: "control",
    machineId: MACHINE,
    requestId,
    payload: {
      requestId,
      method: "deleteSession",
      args: [row?.session_id ?? "", { dir: row?.cwd }],
      harness: "claude",
    },
  });
  const after = await until(
    "the purged session gone from an agent's find",
    () => probe.find(seeded.orchestrator, { query: "axolotl", project: "all" }),
    (called) =>
      !(
        called.refused ||
        (called.answer.hits ?? []).some(
          (hit) =>
            hit.id === talker.id || hit.id.endsWith(`:${row?.session_id ?? ""}`)
        )
      ),
    30_000
  ).catch(() => undefined);
  kit.check(
    "i: a session the person purged is no hit of an agent's find",
    (before.answer.hits ?? []).some((hit) => hit.id === talker.id) &&
      after !== undefined,
    `before ${said(before)}\nafter ${after ? said(after) : "still found after 30 s"}`
  );
  const gone = (answer: { results: { id: string }[] }) =>
    !answer.results.some(
      (result) =>
        result.id === talker.id ||
        result.id.endsWith(`:${row?.session_id ?? ""}`)
    );
  const dashboard = await until(
    "the purged session gone from the dashboard's Find",
    () => probe.engine("axolotl"),
    gone,
    60_000
  ).catch(() => undefined);
  kit.check(
    "i: after a purge, the dashboard's GET /api/find returns none of the session's turns: its machine's index forgot them",
    dashboard !== undefined,
    dashboard
      ? JSON.stringify(dashboard.results)
      : JSON.stringify((await probe.engine("axolotl")).results)
  );
};

/** k: a password typed past the snippet's window from "password", in a concise hit. */
const farSecretLeg = async (kit: Kit, probe: Probe, seeded: Seeded) => {
  const talker = await talkOnce(probe, "Pangolin queue", SAY.far);
  await indexed(probe, "pangolin", talker.id, "the pangolin turn in /api/find");
  const concise = await probe.find(seeded.orchestrator, {
    query: "pangolin",
    project: "all",
  });
  const hit = concise.answer.hits?.find((each) => each.id === talker.id);
  kit.check(
    'k: a password typed more than 16 words after "password" comes back [redacted] in a concise hit',
    Boolean(hit?.excerpt?.includes("[redacted]")) &&
      !FAR_HALVES.some((half) => concise.text.includes(half)),
    said(concise)
  );
};

/** j: `before` keeps a thread's September message, not its October one. */
const beforeLeg = async (kit: Kit, probe: Probe, seeded: Seeded) => {
  const { fleet, mine } = probe;
  const threadId = crypto.randomUUID();
  const at = Date.parse("2026-09-01T09:00:00Z");
  fleet.write(
    "INSERT INTO project_threads (id, project_id, title, setup, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)",
    threadId,
    mine.id,
    "Okapi questions",
    at,
    Date.parse("2026-10-10T09:00:00Z")
  );
  for (const [words, when] of [
    ["The okapi cache was on in September.", "2026-09-01T09:00:00Z"],
    ["The okapi cache went off in October.", "2026-10-10T09:00:00Z"],
  ] as const) {
    fleet.write(
      "INSERT INTO thread_messages (id, thread_id, author, body, created_at) VALUES (?, ?, 'you', ?, ?)",
      crypto.randomUUID(),
      threadId,
      words,
      Date.parse(when)
    );
  }
  const ask = (more: object) =>
    probe.find(seeded.orchestrator, {
      query: "okapi cache",
      project: "all",
      kinds: ["thread"],
      response_format: "detailed",
      ...more,
    });
  const asOf = await until(
    "the okapi thread in an agent's find",
    () => ask({ before: "2026-09-30" }),
    (called) => called.text.includes("okapi"),
    20_000
  ).catch(() => undefined);
  const now = await ask({});
  kit.check(
    "j: before keeps the evidence at or before its day: September's message, not October's",
    Boolean(asOf?.text.includes("September")) &&
      !asOf?.text.includes("October") &&
      now.text.includes("October"),
    `before 2026-09-30: ${said(asOf)}\nunbounded: ${said(now)}`
  );
};

const run = async (kit: Kit) => {
  const probe = await standUp(kit);
  const seeded = await seed(probe);
  const { all, order, ref } = await sameHits(kit, probe, seeded);
  const turns = await aroundLegs(kit, probe, seeded, ref);
  const pages = await pagingLeg(kit, probe, seeded, order);
  const scopes = await scopeLegs(kit, probe, seeded);
  await refusalLegs(kit, probe, seeded);
  await boundLeg(kit, probe, seeded, [all, ...turns, ...pages, ...scopes]);
  await listingLegs(kit, probe, seeded);
  await secretLeg(kit, probe, seeded);
  await purgeLeg(kit, probe, seeded);
  await beforeLeg(kit, probe, seeded);
  await farSecretLeg(kit, probe, seeded);
};

export default { name: "find-tool", run } satisfies Spec;
