/**
 * A project's fact lines and its session search (Projects PRD §5.4, hub
 * memory.ts, memory-facts.ts, session-prose.ts), on a scratch fleet (real
 * hub, agent and sessiond; Claude Code against the mock model) with Jev from
 * the kit's mock, deterministic. Nothing here delegates: a curator run that
 * finds every note proposed by Jev's sort starts no session, and the
 * briefs are read from the work item rows the hub writes before a
 * workspace is cut.
 *
 * Jev on:
 * a. A fact: the person's `knowledge/deploys.md` reads as fact lines; a
 *    line that does not is reported by its file and line.
 * b. A later change: Jev's clear `changes` moves the old line under
 *    `## Formerly` with `until` and `replaced by`; the note's words are the
 *    line, its `since` the note's day.
 * c. A backfill: a note with `since` before the line's (memory_note's
 *    `since`) slots under Formerly by its date, closed where the next began.
 * d. A same-period conflict: both lines under `## Conflict`, each with its
 *    sources.
 * e. A corroboration: the note's id joins the line's `from`.
 *    (b–e are one card, Jev's, approved by the person.)
 * f. A withdrawal: one card retires the fact that rested on the note alone
 *    to `knowledge/archive/`, keeps the fact with another source, and moves
 *    the note to the archive `withdrawn`.
 * g. A brief admits current lines, then a conflict whole and marked, then
 *    Formerly, with their dates and sources, and leaves out the line Jev
 *    said does not bear on the task; each admitted line is a use.
 * h. Session search returns a dated excerpt, with its session id, from
 *    another session's prose.
 * i. A question no past session answers: "not found in past sessions".
 * Jev off: the curator's run gets the note with the line grep found and no
 * card is made; a brief keeps grep's order; search says it is unranked, and
 * a question grep finds nothing for is not found; a withdrawal still
 * retires and keeps.
 *
 *   bun scripts/probe-kit/run.ts memory-facts
 */
import { createHash } from "node:crypto";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { type JevAsked, type JevCall, jevMock, jevOn } from "../jev-mock";
import type { Kit, Spec } from "../kit";

const NOTE = "mcp__cawco__memory_note";
const RECALL = "mcp__cawco__memory_recall";
const PROPOSE = "mcp__cawco__memory_propose";

/** The notes the facts first rest on, in the archive; and the notes Jev sorts. */
const ID = {
  ship: "n-20261001-090000-a1a1a1",
  staging: "n-20261002-090000-b2b2b2",
  /** The changelog's only source, and the staging line's second. */
  withdrawn: "n-20261003-090000-d4d4d4",
  limit: "n-20261001-100000-e5e5e5",
  corroborates: "n-20261010-090000-c0c0c1",
  conflicts: "n-20261011-090000-c0c0c3",
  changes: "n-20261012-090000-c0c0c2",
  off: "n-20261013-090000-c0c0c4",
} as const;

const SHIP = "Deploys go out with `bun run ship` from main.";
const RELEASE = "Deploys now go out with `bun run release` from main.";
const BACKFILL = "Deploys went out with `make deploy` from main.";
const STAGING = "The staging database resets every night.";
const CHANGELOG = "The changelog lives in CHANGES.md.";
const LIMIT_100 = "The API rate limit is 100 requests a minute.";
const LIMIT_60 = "The API rate limit is 60 requests a minute.";
const UNREADABLE = "This line has no parenthesis.";

const DEPLOYS = `Deploys: how releases go out.

- ${SHIP} (since 2026-10-01, from ${ID.ship})
- ${STAGING} (since 2026-10-02, from ${ID.staging} ${ID.withdrawn})
- ${CHANGELOG} (since 2026-10-03, from ${ID.withdrawn})
- ${LIMIT_100} (since 2026-10-01, from ${ID.limit})
${UNREADABLE}
`;

/** How each note bears on the line holding `target`: what the mocked Jev answers. */
const SORTS: Record<string, { sort: string; target: string }> = {
  [ID.corroborates]: { sort: "corroborates", target: STAGING },
  [ID.changes]: { sort: "changes", target: SHIP },
  [ID.conflicts]: { sort: "conflicts", target: LIMIT_100 },
};
const NOTE_TEXT: Record<string, string> = {
  [ID.corroborates]: "The staging database is reset every night.",
  [ID.changes]: RELEASE,
  [ID.conflicts]: LIMIT_60,
  [ID.off]: "The staging database resets at midnight UTC.",
};

/** The person's markers to the mocked sessions. */
const SAY = {
  cache: "PROBE-FACTS-CACHE did caching the bun install in CI help?",
  backfill: "PROBE-FACTS-BACKFILL note how deploys went out before",
  recall: "PROBE-FACTS-RECALL-ON",
  docker: "PROBE-FACTS-RECALL-DOCKER",
  recallOff: "PROBE-FACTS-RECALL-OFF",
  none: "PROBE-FACTS-RECALL-NONE",
} as const;
const CACHE_REPLY =
  "We tried caching the bun install in CI: builds went from 9 to 4 minutes, but the cache broke on every lockfile change, so we dropped it.";
const QUESTION: Record<string, string> = {
  [SAY.recall]: "have we tried caching the install in CI?",
  [SAY.docker]: "have we tried caching the docker images in CI?",
  [SAY.recallOff]: "have we tried caching the install in CI?",
  [SAY.none]: "did anyone try kubernetes?",
};
const NOT_FOUND = "not found in past sessions";

/** What each recall call answered, by its marker. */
const recalled = new Map<string, Record<string, unknown>>();
/** Markers whose tool was looked up once already: a tool the hub does not offer is said so, never looked up twice. */
const lookedUp = new Set<string>();

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const tool = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});

/** A call of a deferred tool: loaded with ToolSearch first, once. */
const call = (
  request: Seen,
  marker: string,
  name: string,
  input: object
): Reply => {
  if (request.toolNames.includes(name)) {
    return tool(name, input);
  }
  if (lookedUp.has(marker) || !request.toolNames.includes("ToolSearch")) {
    return text(`${name} is not offered`);
  }
  lookedUp.add(marker);
  return tool("ToolSearch", { query: `select:${name}`, max_results: 1 });
};

/** The JSON a recall answered with, from the tool result in the conversation. */
const ANSWER_JSON = /\{"answer":.*?"has_more":(?:true|false)[^}]*\}/s;

/** Which mocked session a conversation is: the earliest marker in it. */
const kindOf = (all: string): string | undefined =>
  [SAY.cache, SAY.recall]
    .map((marker) => ({ marker, at: all.indexOf(marker) }))
    .filter(({ at }) => at >= 0)
    .sort((a, b) => a.at - b.at)[0]?.marker;

/** The talker: answers the person about caching, then notes the backfilled fact. */
const talker = (request: Seen): Reply => {
  const { all } = request;
  if (!all.includes(SAY.backfill)) {
    return text(CACHE_REPLY);
  }
  return all.includes('"taint"')
    ? text("Noted.")
    : call(request, SAY.backfill, NOTE, {
        text: BACKFILL,
        since: "2026-09-01",
      });
};

/** The asker: one memory_recall per marker, its answer kept. */
const asker = (request: Seen): Reply => {
  const { all } = request;
  const newest = Object.keys(QUESTION)
    .map((each) => ({ each, at: all.lastIndexOf(each) }))
    .filter(({ at }) => at >= 0)
    .sort((a, b) => b.at - a.at)[0]?.each;
  if (!newest) {
    return text("ok");
  }
  const after = all.slice(all.lastIndexOf(newest));
  const answered = ANSWER_JSON.exec(after)?.[0];
  if (answered) {
    recalled.set(newest, JSON.parse(answered) as Record<string, unknown>);
    return text("Read.");
  }
  if (after.includes("is not offered") || after.includes("Error")) {
    recalled.set(newest, { error: after.slice(0, 400) });
    return text("No recall.");
  }
  return call(request, newest, RECALL, { question: QUESTION[newest] });
};

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Memory facts probe");
  }
  const kind = kindOf(request.all);
  if (kind === SAY.cache) {
    return talker(request);
  }
  return kind === SAY.recall ? asker(request) : text("ok");
};

const SPACES = /\s+/g;
const NOTE_REF = /notes\["([^"]+)"\]/;
const FACT_REF = /facts\["([^"]+)"\]/;
const DEPLOYS_PATH = "knowledge/deploys.md";

/** The files a card changes, by path. */
const pathsOf = (ask: Ask | undefined): string[] =>
  ask?.payload.input.files?.map((file) => file.path) ?? [];

/** The mocked Jev's choices: each inbox note lasting, each pair as {@link SORTS} says, the excerpt that answers. */
const choose = (call_: JevCall, id: string, asked: JevAsked) => {
  if (id === "where") {
    const excerpts = call_.state.excerpts as Record<string, { text: string }>;
    const found = Object.entries(excerpts).find(([, each]) =>
      each.text.includes("dropped it")
    );
    return found ? { choice: found[0], p: 0.9 } : undefined;
  }
  if (id.startsWith("pair")) {
    const { question } = asked.instructions as { question: string };
    const noteId = NOTE_REF.exec(question)?.[1] ?? "";
    const factId = FACT_REF.exec(question)?.[1] ?? "";
    const fact = (call_.state.facts as Record<string, { fact: string }>)[factId]
      ?.fact;
    const note = (call_.state.notes as Record<string, { text: string }>)[noteId]
      ?.text;
    const sort = SORTS[noteId];
    if (sort && fact && sort.target.startsWith(fact.slice(0, 20))) {
      return { choice: sort.sort, p: 0.9 };
    }
    if (note === BACKFILL && fact === SHIP) {
      return { choice: "changes", p: 0.9 };
    }
    return { choice: "unrelated", p: 0.9 };
  }
  if (asked.criteria && "lasting" in (asked.criteria as object)) {
    return { choice: "lasting", p: 0.9 };
  }
};

/** Whether a fact bears on the probe's task, as the mocked Jev answers: the backfilled line does not. */
const bears = (call_: JevCall, id: string): number => {
  if (id === "exists") {
    return String(call_.state.question).includes("docker") ? 0.05 : 0.95;
  }
  if (!("task" in call_.state)) {
    return 0.05;
  }
  const asked = call_.questions[id]?.instructions as
    { fact?: string } | undefined;
  const fact = asked?.fact ?? "";
  if (fact === RELEASE) {
    return 0.95;
  }
  if (fact === LIMIT_100) {
    return 0.9;
  }
  if (fact === SHIP) {
    return 0.8;
  }
  return 0.1;
};

interface Ask {
  instanceId: string;
  machineId: string;
  payload: {
    input: { files?: { content: string; path: string }[]; notes?: string[] };
    proposer?: string;
    toolName: string;
  };
  requestId: string;
}

const noteFile = (id: string, words: string, time: string): string =>
  `---\nid: ${id}\nauthor: "Probe worker"\nsession: probe\nrole: worker\nsource: session\ntime: ${time}\n---\n${words}\n`;

const STAMP = /^n-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/;
const NOTE_ID_LINE = /id: (n-\S+)/;

/** A note id's own time: `n-20261012-090000-…` is 2026-10-12T09:00:00Z. */
const timeOf = (id: string): string => {
  const [, y, mo, d, h, mi, se] = STAMP.exec(id) ?? [];
  return `${y}-${mo}-${d}T${h}:${mi}:${se}.000Z`;
};

/** The probe's project on its fleet, and what every leg does with it. */
const standUp = async (kit: Kit, jevUrl: string) => {
  const fleet = await kit.fleet(respond);
  fleet.env.CAWCO_TYPESAFE_URL = jevUrl;
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  await jevOn(fleet.base);
  const { id: projectId } = await fleet.api<{ id: string }>("/api/projects", {
    name: "Memory facts",
    machineId: MACHINE,
    cwd: fleet.workdir,
  });
  const folder = `${fleet.base}/api/projects/${projectId}/folder`;
  const put = async (path: string, content: string) => {
    const answer = await fetch(`${folder}/file`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path, content }),
    });
    if (!answer.ok) {
      throw new Error(`${path}: ${answer.status} ${await answer.text()}`);
    }
  };
  const read = async (path: string): Promise<string> => {
    const answer = await fetch(
      `${folder}/file?path=${encodeURIComponent(path)}`
    );
    return answer.ok
      ? ((await answer.json()) as { content: string }).content
      : `(${answer.status})`;
  };
  const proposals = async (): Promise<Ask[]> =>
    (await fleet.api<Ask[]>("/api/pending")).filter(
      (ask) => ask.payload.toolName === PROPOSE
    );
  const approve = (ask: Ask) =>
    fleet.post({
      type: "command",
      commandId: crypto.randomUUID(),
      kind: "permission.answer",
      machineId: ask.machineId,
      sessionId: ask.instanceId,
      payload: {
        instanceId: ask.instanceId,
        requestId: ask.requestId,
        method: "resolvePermission",
        args: [ask.requestId, { behavior: "allow", updatedInput: {} }],
      },
    });
  /** Runs the curator routine now: its run, once it is past starting. */
  const curatorRun = async () => {
    const [routine] = fleet.query<{ id: string }>(
      "SELECT id FROM routines WHERE project_id = ? AND target = 'curator'",
      projectId
    );
    if (!routine) {
      throw new Error("the project has no Memory curator routine");
    }
    await fleet.api(`/api/routines/${routine.id}/run`, {});
    return until(
      "the curator's run to settle",
      () =>
        fleet.query<{
          outcome: string | null;
          reason: string | null;
          state: string;
        }>(
          "SELECT state, outcome, reason FROM routine_runs WHERE routine_id = ? ORDER BY started_at DESC LIMIT 1",
          routine.id
        )[0],
      (row) => row !== undefined && row.state !== "starting",
      60_000
    );
  };
  /** An attempt's brief as the hub wrote its work item, whether or not its workspace could then be cut. */
  const briefOf = async (
    title: string,
    description: string,
    parentInstanceId: string
  ): Promise<string> => {
    const task = await fleet.api<{ id: string }>(
      `/api/projects/${projectId}/tasks`,
      { title, description, lands: "none" }
    );
    const started = await fleet
      .api(`/api/projects/${projectId}/tasks/${task.id}/attempts`, {
        parentInstanceId,
      })
      .then(
        () => "started",
        (error: Error) => error.message
      );
    const item = await until(
      `the attempt's work item for ${title}`,
      () =>
        fleet.query<{ brief: string }>(
          "SELECT brief FROM work_items WHERE brief LIKE ? ORDER BY created_at DESC LIMIT 1",
          `%${title}”%`
        )[0],
      Boolean,
      20_000
    ).catch(() => undefined);
    const brief = item?.brief ?? `(no work item: the attempt ${started})`;
    return brief.slice(Math.max(0, brief.indexOf("## Project context")));
  };
  /** The note in the inbox holding `words`, read whole. */
  const inboxNote = async (words: string) => {
    const listing = await fetch(`${folder}?path=memory/inbox`);
    const { entries } = (await listing.json()) as {
      entries: { path: string }[];
    };
    const notes = await Promise.all(
      entries.map(async (entry) => ({
        path: entry.path,
        content: await read(entry.path),
      }))
    );
    return notes.find((note) => note.content.includes(words));
  };
  return {
    fleet,
    projectId,
    put,
    read,
    proposals,
    approve,
    curatorRun,
    briefOf,
    inboxNote,
  };
};

type Probe = Awaited<ReturnType<typeof standUp>>;

/** The person's fact file and the archived notes it rests on; the notes Jev sorts. */
const seed = async (probe: Probe) => {
  await probe.put("knowledge/deploys.md", DEPLOYS);
  for (const [id, words] of [
    [ID.ship, SHIP],
    [ID.staging, STAGING],
    [ID.withdrawn, CHANGELOG],
    [ID.limit, LIMIT_100],
  ] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one commit each, in order
    await probe.put(
      `memory/archive/${id}.md`,
      noteFile(id, words, "2026-10-01T09:00:00.000Z")
    );
  }
  for (const id of [ID.corroborates, ID.conflicts, ID.changes]) {
    // biome-ignore lint/performance/noAwaitInLoops: one commit each, in order
    await probe.put(
      `memory/inbox/${id}.md`,
      noteFile(id, NOTE_TEXT[id] ?? "", timeOf(id))
    );
  }
};

/** The talker's prose, and its backfill note through memory_note's `since`: the note's id. */
const talk = async (kit: Kit, probe: Probe, talkerId: string) => {
  const { fleet } = probe;
  await fleet.send(talkerId, SAY.cache);
  await until(
    "the talker's reply in its prose",
    () =>
      fleet.query<{ n: number }>(
        "SELECT count(*) AS n FROM session_prose WHERE instance_id = ? AND who = 'agent'",
        talkerId
      )[0]?.n ?? 0,
    (n) => n > 0,
    60_000
  ).catch(() => 0);
  await fleet.send(talkerId, SAY.backfill);
  const backfill = await until(
    "the backfill note in the inbox",
    () => probe.inboxNote(BACKFILL),
    Boolean,
    90_000
  ).catch(() => undefined);
  kit.check(
    "c: memory_note keeps the day a backfilled fact became true",
    Boolean(backfill?.content.includes("since: 2026-09-01")),
    backfill?.content ?? "no note"
  );
  return NOTE_ID_LINE.exec(backfill?.content ?? "")?.[1] ?? "";
};

/** a–e: one curator run; Jev's card approved; the file read back. */
const sortLegs = async (kit: Kit, probe: Probe, backfillId: string) => {
  const ran = await probe.curatorRun().catch((error: Error) => error);
  const cards = await until(
    "Jev's card for knowledge/deploys.md",
    probe.proposals,
    (found) => found.some((ask) => pathsOf(ask)[0] === DEPLOYS_PATH),
    30_000
  ).catch(() => [] as Ask[]);
  const card = cards.find((ask) => pathsOf(ask)[0] === DEPLOYS_PATH);
  kit.check(
    "Jev's clear sorts pre-fill one proposal for the person, citing the notes; nothing is left for the curator's run",
    Boolean(
      card?.payload.proposer?.startsWith("Jev") &&
      [ID.corroborates, ID.changes, ID.conflicts, backfillId].every((id) =>
        card.payload.input.notes?.includes(id)
      )
    ) &&
      !(ran instanceof Error) &&
      ran.outcome === "silent",
    `run ${ran instanceof Error ? ran.message : JSON.stringify(ran)}; card ${JSON.stringify(card?.payload.input.notes)} by ${card?.payload.proposer}`
  );
  if (card) {
    await probe.approve(card);
  }
  const deploys = await until(
    "knowledge/deploys.md as approved",
    () => probe.read(DEPLOYS_PATH),
    (content) => content.includes(RELEASE),
    30_000
  ).catch(() => "(not approved)");
  const lines = deploys.split("\n");
  const at = (words: string) => lines.findIndex((line) => line.includes(words));
  const lineWith = (words: string) => lines[at(words)] ?? "";
  const hubLog = await probe.fleet.logs("hub");
  kit.check(
    "a: the person's fact lines read, and the line that does not is reported by file and line",
    hubLog.includes(`${DEPLOYS_PATH}:7 (not a fact line`) &&
      !hubLog.includes(`${DEPLOYS_PATH}:3 (`) &&
      deploys.includes(UNREADABLE),
    hubLog
      .split("\n")
      .filter((line) => line.includes(`${DEPLOYS_PATH}:`))
      .slice(0, 3)
      .join("\n")
  );
  const formerly = at("## Formerly");
  const conflict = at("## Conflict");
  kit.check(
    "b: a later change keeps the old line under Formerly, closed by the note's day and naming it",
    lineWith(RELEASE) ===
      `- ${RELEASE} (since 2026-10-12, from ${ID.changes}, used 2026-10-12)` &&
      lineWith(SHIP) ===
        `- ${SHIP} (since 2026-10-01, until 2026-10-12, from ${ID.ship}, replaced by ${ID.changes})` &&
      at(SHIP) > formerly &&
      at(RELEASE) < formerly,
    deploys
  );
  kit.check(
    "c: a backfilled older fact slots under Formerly by its since, before the line that replaced it",
    lineWith(BACKFILL) ===
      `- ${BACKFILL} (since 2026-09-01, until 2026-10-01, from ${backfillId}, replaced by ${ID.ship})` &&
      at(BACKFILL) > formerly &&
      at(BACKFILL) < at(SHIP),
    deploys
  );
  kit.check(
    "d: a same-period conflict keeps both lines under Conflict, each with its sources",
    conflict > 0 &&
      conflict < formerly &&
      at(LIMIT_100) > conflict &&
      at(LIMIT_60) === at(LIMIT_100) + 1 &&
      lineWith(LIMIT_100).includes(`from ${ID.limit}`) &&
      lineWith(LIMIT_60) ===
        `- ${LIMIT_60} (since 2026-10-11, from ${ID.conflicts}, used 2026-10-11)`,
    deploys
  );
  kit.check(
    "e: a corroboration adds its note to the line's sources",
    lineWith(STAGING) ===
      `- ${STAGING} (since 2026-10-02, from ${ID.staging} ${ID.withdrawn} ${ID.corroborates}, used 2026-10-10)`,
    deploys
  );
};

/** Withdraws `id` and approves its card: the route's answer, the card, and the files after. */
const withdraw = async (probe: Probe, id: string, applied: string) => {
  const before = new Set((await probe.proposals()).map((ask) => ask.requestId));
  const route = await fetch(
    `${probe.fleet.base}/api/projects/${probe.projectId}/memory/notes/${id}/withdraw`,
    { method: "POST" }
  );
  const said = await route.text();
  const card = await until(
    `the withdrawal card for ${id}`,
    async () =>
      (await probe.proposals()).find((ask) => !before.has(ask.requestId)),
    Boolean,
    20_000
  ).catch(() => undefined);
  if (card) {
    await probe.approve(card);
  }
  const after = await until(
    `${id}'s withdrawal applied`,
    () => probe.read(DEPLOYS_PATH),
    (content) => !content.includes(applied),
    20_000
  ).catch(() => "(not applied)");
  return { route, said, card, after };
};

/** f: one card retires the sole-source fact, keeps the other. */
const withdrawLeg = async (kit: Kit, probe: Probe) => {
  const { route, said, card, after } = await withdraw(
    probe,
    ID.withdrawn,
    CHANGELOG
  );
  const archived = await probe.read("knowledge/archive/deploys.md");
  const gone = await probe.read(`memory/archive/${ID.withdrawn}.md`);
  kit.check(
    "f: withdrawing a note retires the fact it alone grounded and keeps the fact with another source, in one card",
    route.ok &&
      pathsOf(card).length === 2 &&
      !after.includes(CHANGELOG) &&
      archived.includes(
        `- ${CHANGELOG} (since 2026-10-03, from ${ID.withdrawn}`
      ) &&
      after.includes(
        `- ${STAGING} (since 2026-10-02, from ${ID.staging} ${ID.corroborates}, used 2026-10-10)`
      ) &&
      gone.includes('outcome: "withdrawn"'),
    `route ${route.status} ${said}\ncard files ${JSON.stringify(pathsOf(card))}\n${after}\narchive:\n${archived}\nnote:\n${gone}`
  );
};

const TASK_WORDS =
  "Run the deploy command from main; keep calls under the API rate limit.";

/** A fact's words as the hub keys its uses (memory-facts.ts `factKey`): case and spacing aside, hashed. */
const keyOf = (words: string): string =>
  createHash("sha1")
    .update(words.toLowerCase().replace(SPACES, " ").trim())
    .digest("hex")
    .slice(0, 16);

/**
 * A brief for the probe's task, parented by `parent`: its words when the
 * hub could write its work item (where a workspace can be cut), and the
 * lines it carried either way, by key, from the hub's own record of each
 * line a brief carries (db `fact_uses`).
 */
const briefFor = async (probe: Probe, title: string, parent: string) => {
  const from = Date.now();
  const words = await probe
    .briefOf(title, TASK_WORDS, parent)
    .catch((error: Error) => error.message);
  // A hub with no record of uses (before fact lines) carried none.
  const rows = (() => {
    try {
      return probe.fleet.query<{ key: string }>(
        "SELECT key FROM fact_uses WHERE project_id = ? AND used_at >= ?",
        probe.projectId,
        from
      );
    } catch {
      return [];
    }
  })();
  const carried = new Set(rows.map((row) => row.key));
  return { words, carried, written: words.startsWith("## Project context") };
};

/** Which of `lines` a brief carried, as words: what a failed check names. */
const carriedOf = (carried: Set<string>): string =>
  [RELEASE, SHIP, BACKFILL, STAGING, LIMIT_100, LIMIT_60]
    .filter((line) => carried.has(keyOf(line)))
    .join(" | ");

/** g: the brief selects lines, as the mocked Jev ranked them. */
const briefLeg = async (kit: Kit, probe: Probe, parent: string) => {
  const brief = await briefFor(
    probe,
    "Ship the release within the API rate limit",
    parent
  );
  kit.check(
    "g: a brief carries the lines the mocked Jev said bear on the task, a conflict with its other side, and leaves out the lines Jev said do not; each carried line is a use",
    [RELEASE, LIMIT_100, LIMIT_60, SHIP].every((line) =>
      brief.carried.has(keyOf(line))
    ) && ![BACKFILL, STAGING].some((line) => brief.carried.has(keyOf(line))),
    `carried: ${carriedOf(brief.carried)}`
  );
  const b = (words: string) => brief.words.indexOf(words);
  if (!brief.written) {
    kit.note(
      `g: the brief's words are checked only where a workspace can be cut (${brief.words.slice(0, 200)})`
    );
    return;
  }
  kit.check(
    "g: the brief writes current lines, then the conflict whole and marked, then Formerly, each with its dates and sources",
    b(`- ${RELEASE} (since 2026-10-12, from ${ID.changes}`) > 0 &&
      b("Conflicting, not settled") > b(RELEASE) &&
      b(LIMIT_100) > b("Conflicting, not settled") &&
      b(LIMIT_60) > 0 &&
      b("Formerly (no longer true):") > b(LIMIT_60) &&
      b(`- ${SHIP} (since 2026-10-01, until 2026-10-12`) > b("Formerly") &&
      b(BACKFILL) < 0 &&
      b(STAGING) < 0,
    brief.words.slice(0, 1600)
  );
};

/** A recall the asker makes for `marker`: what the tool answered. */
const recallFor = async (probe: Probe, askerId: string, marker: string) => {
  await probe.fleet.send(askerId, marker);
  return until(
    `the recall for ${marker}`,
    () => recalled.get(marker),
    Boolean,
    90_000
  ).catch(() => ({ error: "no answer" }) as Record<string, unknown>);
};

/** h, i: session search with Jev on. */
const recallLegs = async (
  kit: Kit,
  probe: Probe,
  askerId: string,
  talkerId: string
) => {
  const today = new Date().toISOString().slice(0, 10);
  const found = await recallFor(probe, askerId, SAY.recall);
  const [excerpt] = (found.excerpts ?? []) as {
    session: string;
    sitting: string;
    text: string;
  }[];
  kit.check(
    "h: session search returns a dated excerpt from another session, with its session id",
    found.answer === "answered" &&
      excerpt?.session === talkerId &&
      excerpt.sitting === today &&
      excerpt.text.includes("we dropped it"),
    JSON.stringify(found).slice(0, 800)
  );
  const docker = await recallFor(probe, askerId, SAY.docker);
  kit.check(
    'i: a question no past session answers is "not found in past sessions"',
    docker.answer === NOT_FOUND &&
      Array.isArray(docker.excerpts) &&
      docker.excerpts.length === 0,
    JSON.stringify(docker).slice(0, 400)
  );
};

/** The same legs with Jev off. */
const offLegs = async (
  kit: Kit,
  probe: Probe,
  askerId: string,
  talkerId: string
) => {
  const { fleet, projectId } = probe;
  await fetch(`${fleet.base}/api/jev/typesafe-key`, { method: "DELETE" });
  await probe.put(
    `memory/inbox/${ID.off}.md`,
    noteFile(ID.off, NOTE_TEXT[ID.off], timeOf(ID.off))
  );
  const before = (await probe.proposals()).length;
  const ran = await probe.curatorRun().catch((error: Error) => error);
  const offLog = await fleet.logs("hub");
  kit.check(
    "Jev off: the curator's run is handed the note and its grep-found line; no card is pre-filled",
    offLog.includes(
      `[jev off] Fact sorting project=${projectId}: the curator sorts 1 note against 1 fact line pairing on its run`
    ) && (await probe.proposals()).length === before,
    offLog
      .split("\n")
      .filter((line) => line.includes("[jev off]"))
      .join("\n")
  );
  const [curator] = fleet.query<{ brief: string }>(
    "SELECT brief FROM work_items WHERE brief LIKE ? ORDER BY created_at DESC LIMIT 1",
    `%${ID.off}%`
  );
  if (curator) {
    const inbox = curator.brief.indexOf("## The inbox");
    kit.check(
      "Jev off: the curator's brief lists the note with the line grep found, for it to sort",
      curator.brief.includes(
        "Jev is off: sort each note against its lines yourself."
      ) && curator.brief.includes(`\`- ${STAGING} (since 2026-10-02`),
      curator.brief.slice(inbox, inbox + 900)
    );
  } else {
    kit.note(
      `Jev off: the curator's run started no session here, so the brief it reads is checked only where a boundary can start (${ran instanceof Error ? ran.message : (ran.reason ?? ran.state)})`
    );
  }
  const brief = await briefFor(
    probe,
    "Ship the release within the API rate limit, again",
    talkerId
  );
  kit.check(
    "Jev off: a brief carries the lines grep finds, the backfilled one Jev left out too",
    [RELEASE, BACKFILL, SHIP, LIMIT_100].every((line) =>
      brief.carried.has(keyOf(line))
    ) &&
      (await fleet.logs("hub")).includes(
        `[jev off] Brief context project=${projectId}`
      ),
    `carried: ${carriedOf(brief.carried)}`
  );
  if (brief.written) {
    kit.check(
      "Jev off: the brief says its facts are in grep's order",
      brief.words.includes("Jev is off") && brief.words.includes(BACKFILL),
      brief.words.slice(0, 1600)
    );
  }
  const unranked = await recallFor(probe, askerId, SAY.recallOff);
  kit.check(
    "Jev off: session search returns grep's shortlist and says it was not ranked",
    unranked.answer === "unranked" &&
      String(unranked.more).includes("Jev is off") &&
      ((unranked.excerpts ?? []) as { session: string }[])[0]?.session ===
        talkerId,
    JSON.stringify(unranked).slice(0, 600)
  );
  const none = await recallFor(probe, askerId, SAY.none);
  kit.check(
    'Jev off: a question grep finds nothing for is "not found in past sessions"',
    none.answer === NOT_FOUND,
    JSON.stringify(none).slice(0, 300)
  );
  const { route, card, after } = await withdraw(probe, ID.conflicts, LIMIT_60);
  kit.check(
    "Jev off: a withdrawal still retires the fact its note alone grounded",
    route.ok &&
      pathsOf(card).includes("knowledge/archive/deploys.md") &&
      !after.includes(LIMIT_60) &&
      after.includes(LIMIT_100),
    `${route.status} ${JSON.stringify(pathsOf(card))}\n${after}`
  );
};

const run = async (kit: Kit) => {
  const jev = jevMock(undefined, bears, choose);
  try {
    const probe = await standUp(kit, jev.url);
    await seed(probe);
    const talkerId = await probe.fleet.spawn(
      "claude",
      "Caching in CI",
      probe.fleet.workdir,
      { projectId: probe.projectId }
    );
    const backfillId = await talk(kit, probe, talkerId);
    await sortLegs(kit, probe, backfillId);
    await withdrawLeg(kit, probe);
    await briefLeg(kit, probe, talkerId);
    const askerId = await probe.fleet.spawn(
      "claude",
      "Asker",
      probe.fleet.workdir,
      { projectId: probe.projectId }
    );
    await recallLegs(kit, probe, askerId, talkerId);
    await offLegs(kit, probe, askerId, talkerId);
  } finally {
    jev.stop();
  }
};

export default { name: "memory-facts", run } satisfies Spec;
