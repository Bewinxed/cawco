/**
 * A project's fact lines (Projects PRD §5.4, hub memory.ts,
 * memory-facts.ts), on a scratch fleet (real
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
 * j. A knowledge file written as prose before fact lines: the curator's run
 *    proposes one card that rewrites it as fact lines, every line reading,
 *    every claim kept word for word, `since` its git-blame day, `from` the
 *    file's prose before facts; approved, the file is those lines.
 * m. A rejected rewrite of a prose file, and a rejected archive of a line
 *    unused for months, are not proposed again by the next curator run;
 *    the archived line counts as used now; the rewrite comes back once the
 *    file says something else.
 * k. A memory proposal kept in the one-file shape from before (`path`,
 *    `before`, `content`) is rewritten in the files shape as the hub starts,
 *    and parked as a card with its diff.
 * Jev off: the curator's run gets the note with the line grep found and no
 * card is made; a brief keeps grep's order; a withdrawal still retires and
 * keeps. (What past sessions said is `find`'s: probe-kit spec `find-tool`.)
 *
 * The memory audit's legs (cockpit-1fea49b2#af39ccbe), Jev off:
 * 1. A made-up password typed into a note is committed `[redacted]`, the
 *    note marked secret (secret-filter.ts); so are `token: …` and
 *    `password=…` set to a value.
 * 2. Purging a session (its transcript deleted from the dashboard) proposes
 *    withdrawing its note: one card retires the fact resting on it alone.
 * 3. A ruling survives a withdrawal (the person re-grounds the fact as a
 *    ruling in the card's diff before approving) and disuse (a ruling from
 *    2025 is proposed for no archive).
 * 4. A fold that rewords a line is refused, and the curator's change to
 *    AGENTS.md's `## Notes` (the person's) is refused.
 * 5. A second replacement moves the older Formerly line to the archive, in
 *    Jev's same card (checked in b and c).
 * 6. A current line whose `until` has passed is proposed under Formerly as
 *    the curator's run starts.
 * 7. Below 15 fact files a reshape that merges files is refused, a split is
 *    proposed; the curator's brief asks it to judge two descriptions.
 *
 *   bun scripts/probe-kit/run.ts memory-facts
 */
import { createHash } from "node:crypto";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { type JevAsked, type JevCall, jevMock, jevOn } from "../jev-mock";
import type { Kit, Spec } from "../kit";

const NOTE = "mcp__cawco__memory_note";
const PROPOSE = "mcp__cawco__memory_propose";
/** A made-up password, password-shaped (secret-filter.ts `passwordShaped`): never a real one. */
const PASSWORD = "Zq7!vRt9Lm";

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

/** A knowledge file as the curator wrote them before fact lines: prose. */
const PROSE_PATH = "knowledge/release.md";
const PROSE = `# Release notes

Releases are cut from main every Tuesday.

- The release checklist lives in RELEASE.md.
- Hotfixes skip the Tuesday cut
  and go out the same day.

Tag names look like v1.2.3 (semver).
`;
/** Its claims, each as one fact line must keep its words. */
const PROSE_CLAIMS = [
  "Releases are cut from main every Tuesday.",
  "The release checklist lives in RELEASE.md.",
  "Hotfixes skip the Tuesday cut and go out the same day.",
  "Tag names look like v1.2.3 (semver).",
];
/** A second prose file, whose rewrite the person declines, and a file whose one line went unused for months. */
const HOWTO_PATH = "knowledge/howto.md";
const HOWTO = "# How-to\n\nRun bun install before the first build.\n";
const OLD_PATH = "knowledge/old.md";
const OLD_FACT = "The legacy queue drains on Sundays.";
const OLD = `Old: what was kept long ago.\n\n- ${OLD_FACT} (since 2025-01-01, from n-20250101-090000-f0f0f0)\n`;
/** A proposal kept in the one-file shape from before proposals named their files. */
const OLD_PROPOSAL_ID = "p-20261001-090000-0a0b0c";
const OLD_PROPOSAL_WORDS = "PROBE-FACTS-OLD-PROPOSAL kept across the cutover.";

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
} as const;
const CACHE_REPLY =
  "We tried caching the bun install in CI: builds went from 9 to 4 minutes, but the cache broke on every lockfile change, so we dropped it.";
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

/** Whether the talker called memory_note: it does once. */
let noted = false;

/** The talker: answers the person about caching, then notes the backfilled fact. */
const talker = (request: Seen): Reply => {
  const { all } = request;
  if (!all.includes(SAY.backfill)) {
    return text(CACHE_REPLY);
  }
  // One note, whatever the harness asks after it: a second would be left
  // for the curator's run, which the sort leg expects Jev to leave nothing.
  if (noted || all.includes('"taint"')) {
    return text("Noted.");
  }
  const reply = call(request, SAY.backfill, NOTE, {
    text: BACKFILL,
    since: "2026-09-01",
  });
  noted = reply.tool?.name === NOTE;
  return reply;
};

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Memory facts probe");
  }
  return request.all.includes(SAY.cache) ? talker(request) : text("ok");
};

const SPACES = /\s+/g;
const NOTE_REF = /notes\["([^"]+)"\]/;
const FACT_REF = /facts\["([^"]+)"\]/;
const DEPLOYS_PATH = "knowledge/deploys.md";

/** The files a card changes, by path. */
const pathsOf = (ask: Ask | undefined): string[] =>
  ask?.payload.input.files?.map((file) => file.path) ?? [];

/** The mocked Jev's choices: each inbox note lasting, each pair as {@link SORTS} says. */
const choose = (call_: JevCall, id: string, asked: JevAsked) => {
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
  if (!("task" in call_.state)) {
    return 0.05;
  }
  const asked = call_.questions[id]?.instructions as
    { fact?: string } | undefined;
  const fact = asked?.fact ?? "";
  if (fact === RELEASE || fact.startsWith("# Release notes")) {
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
    presentation?: { changes: { after: string; path: string }[] };
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
  fleet.standIns.typesafeUrl = jevUrl;
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
  /** The person's answer to a card, as the dashboard sends it. */
  const answer = (ask: Ask, result: object) =>
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
        args: [ask.requestId, result],
      },
    });
  const approve = (ask: Ask) =>
    answer(ask, { behavior: "allow", updatedInput: {} });
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
  /** A session in the project, its credential read from its process. */
  const session = async (title: string) => {
    const id = await fleet.spawn("claude", title, fleet.workdir, {
      projectId,
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
  /** One tool call through the hub's REST door, as `as`: refused or not, and its words. */
  const callTool = async (
    as: { credential: string; id: string },
    name: string,
    args: object
  ) => {
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
  return {
    fleet,
    projectId,
    put,
    read,
    session,
    tool: callTool,
    proposals,
    answer,
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
  await probe.put(PROSE_PATH, PROSE);
  await probe.put(HOWTO_PATH, HOWTO);
  await probe.put(OLD_PATH, OLD);
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
    "the talker's reply",
    () =>
      fleet.seen.some((request) => request.last.includes(SAY.cache)) &&
      fleet.instance(talkerId)?.turn_open_at === null,
    Boolean,
    60_000
  ).catch(() => false);
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
  // A run that started a session was left something: its brief says what.
  const [left] =
    ran instanceof Error || ran.outcome === "silent"
      ? []
      : probe.fleet.query<{ brief: string }>(
          "SELECT w.brief FROM routine_runs r JOIN work_items w ON w.id = r.work_item_id WHERE r.routine_id = (SELECT id FROM routines WHERE project_id = ? AND target = 'curator') ORDER BY r.started_at DESC LIMIT 1",
          probe.projectId
        );
  const inbox = left?.brief.indexOf("## The inbox") ?? -1;
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
    `run ${ran instanceof Error ? ran.message : JSON.stringify(ran)}; card ${JSON.stringify(card?.payload.input.notes)} by ${card?.payload.proposer}${left ? `\nthe curator's brief:\n${left.brief.slice(Math.max(0, inbox), Math.max(0, inbox) + 1500)}` : ""}`
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
  const archive = await probe.read("knowledge/archive/deploys.md");
  kit.check(
    "c: a backfilled older fact slots into the line's history by its since, closed where the line that replaced it began",
    archive.includes(
      `- ${BACKFILL} (since 2026-09-01, until 2026-10-01, from ${backfillId}, replaced by ${ID.ship})`
    ),
    `archive:\n${archive}\n${deploys}`
  );
  kit.check(
    "5: a second replacement keeps one Formerly line and moves the older to knowledge/archive/, in the same card",
    at(BACKFILL) < 0 &&
      at(SHIP) > formerly &&
      pathsOf(card).includes("knowledge/archive/deploys.md") &&
      archive.includes(BACKFILL),
    `card files ${JSON.stringify(pathsOf(card))}\n${deploys}\narchive:\n${archive}`
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

const FACT_SHAPE =
  /^- (.+) \(since (\d{4}-\d{2}-\d{2}), from (.+?)(?:, used \d{4}-\d{2}-\d{2})?\)$/;

/**
 * j: the prose file's rewrite, made as the curator's run started: one card,
 * every line a fact line, every claim kept word for word, dated by git
 * blame (the file was committed today), resting on the file's prose; a
 * brief before it is approved carries the prose as one block, marked;
 * approved, the file is those lines.
 */
const proseLeg = async (kit: Kit, probe: Probe, parent: string) => {
  const today = new Date().toISOString().slice(0, 10);
  const card = (await probe.proposals()).find(
    (ask) => pathsOf(ask)[0] === PROSE_PATH
  );
  const proposed = card?.payload.input.files?.[0]?.content ?? "";
  const [description, ...body] = proposed
    .split("\n")
    .filter((line) => line.trim() !== "");
  const facts = body.map((line) => FACT_SHAPE.exec(line));
  kit.check(
    "j: a prose knowledge file gets one card rewriting it as fact lines that all read, every claim kept, dated by git blame, resting on its prose",
    card !== undefined &&
      description === "# Release notes" &&
      facts.length === PROSE_CLAIMS.length &&
      facts.every(
        (fact) =>
          fact?.[2] === today && fact[3] === `${PROSE_PATH} (before facts)`
      ) &&
      PROSE_CLAIMS.every((claim) => facts.some((fact) => fact?.[1] === claim)),
    `card by ${card?.payload.proposer}:\n${proposed}`
  );
  const brief = await briefFor(
    probe,
    "Cut the Tuesday release from main",
    parent
  );
  if (brief.written) {
    kit.check(
      "j: until it is approved, a brief carries the prose file as one block marked not yet fact lines",
      brief.words.includes(`### ${PROSE_PATH} (not yet fact lines)`) &&
        brief.words.includes("Hotfixes skip the Tuesday cut"),
      brief.words.slice(0, 1600)
    );
  } else {
    kit.note(
      `j: the brief's prose block is checked only where a workspace can be cut (${brief.words.slice(0, 160)})`
    );
  }
  if (card) {
    await probe.approve(card);
  }
  const after = await until(
    `${PROSE_PATH} as approved`,
    () => probe.read(PROSE_PATH),
    (content) => content.includes("(before facts)"),
    20_000
  ).catch(() => "(not approved)");
  kit.check(
    "j: approved, the prose file is its fact lines",
    after === proposed,
    after
  );
};

/**
 * m: the person rejects the curator run's rewrite of a second prose file
 * and its archive of a line unused for months; the next run proposes
 * neither again, and the line counts as used now; once the prose file
 * changes, its rewrite is proposed again.
 */
const rejectLeg = async (kit: Kit, probe: Probe) => {
  const cardFor = async (path: string) =>
    (await probe.proposals()).find((ask) => pathsOf(ask)[0] === path);
  const rewrite = await cardFor(HOWTO_PATH);
  const archive = await cardFor(OLD_PATH);
  for (const card of [rewrite, archive]) {
    if (card) {
      // biome-ignore lint/performance/noAwaitInLoops: one answer at a time, as the person gives them
      await probe.answer(card, { behavior: "deny", message: "Not now" });
    }
  }
  await until(
    "both cards answered",
    async () => (await cardFor(HOWTO_PATH)) ?? (await cardFor(OLD_PATH)),
    (left) => left === undefined,
    20_000
  ).catch(() => undefined);
  await probe.curatorRun().catch(() => undefined);
  const again = {
    rewrite: await cardFor(HOWTO_PATH),
    archive: await cardFor(OLD_PATH),
  };
  const used = probe.fleet
    .query<{ key: string }>(
      "SELECT key FROM fact_uses WHERE project_id = ? AND path = ?",
      probe.projectId,
      OLD_PATH
    )
    .map((row) => row.key);
  await probe.put(HOWTO_PATH, `${HOWTO}\nCache the install between builds.\n`);
  await probe.curatorRun().catch(() => undefined);
  const changed = await cardFor(HOWTO_PATH);
  kit.check(
    "m: a rejected rewrite and a rejected archive are not proposed again; the archived line counts as used; the rewrite returns once the file changes",
    rewrite !== undefined &&
      archive !== undefined &&
      pathsOf(archive).includes("knowledge/archive/old.md") &&
      again.rewrite === undefined &&
      again.archive === undefined &&
      used.includes(keyOf(OLD_FACT)) &&
      changed !== undefined &&
      Boolean(
        changed.payload.input.files?.[0]?.content.includes(
          "- Cache the install between builds. ("
        )
      ),
    `first: rewrite ${rewrite?.requestId}, archive ${archive?.requestId} ${JSON.stringify(pathsOf(archive))}; next run: rewrite ${again.rewrite?.requestId}, archive ${again.archive?.requestId}; uses of ${OLD_PATH}: ${used.length}; after the change: ${changed?.requestId}`
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

/**
 * k: what the hub converts as it starts. A proposal kept in the one-file
 * shape is put in place while the hub is down; then the hub and its agent
 * come back.
 */
const restartLeg = async (kit: Kit, probe: Probe) => {
  const { fleet, projectId } = probe;
  await probe.put(
    `memory/proposals/${OLD_PROPOSAL_ID}.json`,
    `${JSON.stringify(
      {
        id: OLD_PROPOSAL_ID,
        projectId,
        path: "AGENTS.md",
        base: "",
        before: "",
        content: `# Agents\n\n${OLD_PROPOSAL_WORDS}\n`,
        notes: [],
        why: "An open proposal from before proposals named their files",
        by: "Caw",
        session: "",
        time: "2026-10-01T09:00:00.000Z",
      },
      null,
      2
    )}\n`
  );
  await fleet.stop("hub");
  fleet.launch("hub");
  await fleet.hubUp();
  await fleet.agentUp();
  const parked = await until(
    "the one-file proposal parked as a card",
    async () =>
      (await probe.proposals()).find(
        (ask) => ask.requestId === OLD_PROPOSAL_ID
      ),
    Boolean,
    30_000
  ).catch(() => undefined);
  const onDisk = await probe.read(`memory/proposals/${OLD_PROPOSAL_ID}.json`);
  const kept = (() => {
    try {
      return JSON.parse(onDisk) as { files?: unknown; path?: unknown };
    } catch {
      return {};
    }
  })();
  const [change] = parked?.payload.presentation?.changes ?? [];
  kit.check(
    "k: a proposal in the one-file shape is rewritten in the files shape as the hub starts, and parked as a card with its diff",
    pathsOf(parked)[0] === "AGENTS.md" &&
      change?.path === "AGENTS.md" &&
      change.after.includes(OLD_PROPOSAL_WORDS) &&
      Array.isArray(kept.files) &&
      !("path" in kept),
    `card ${JSON.stringify(parked?.payload.input.files?.map((file) => file.path))}, diff ${change?.path}\n${onDisk.slice(0, 400)}`
  );
};

/** The same legs with Jev off. */
const offLegs = async (kit: Kit, probe: Probe, talkerId: string) => {
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
    "Jev off: a brief carries the lines grep finds, the Formerly one Jev left out too",
    [RELEASE, SHIP, LIMIT_100].every((line) =>
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
      brief.words.includes("Jev is off") && brief.words.includes(SHIP),
      brief.words.slice(0, 1600)
    );
  }
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

interface Caller {
  credential: string;
  id: string;
}

/** A note's id in memory_note's words: "Noted in the inbox as n-20261022-075232-7b9e3c." */
const NOTED_ID = /\b(n-\d{8}-\d{6}-[0-9a-f]+)\b/;

/** The card that appears after `before` (a set of request ids) whose files include `path`. */
const newCard = (
  probe: Probe,
  before: Set<string>,
  path: string,
  what: string
) =>
  until(
    what,
    async () =>
      (await probe.proposals()).find(
        (ask) => !before.has(ask.requestId) && pathsOf(ask).includes(path)
      ),
    Boolean,
    20_000
  ).catch(() => undefined);

const requestIds = async (probe: Probe) =>
  new Set((await probe.proposals()).map((ask) => ask.requestId));

/** 1: a password typed into a note is committed redacted, the note marked secret. */
const noteSecretLeg = async (kit: Kit, probe: Probe, writer: Caller) => {
  const said = await probe.tool(writer, "memory_note", {
    text: `The build box's sudo password is ${PASSWORD}, as the person typed it.`,
  });
  const note = await until(
    "the password note in the inbox",
    () => probe.inboxNote("build box's sudo password"),
    Boolean,
    20_000
  ).catch(() => undefined);
  kit.check(
    "1: a made-up password typed in a note is committed as [redacted], the note marked secret",
    Boolean(
      note?.content.includes("[redacted]") &&
      !note.content.includes(PASSWORD) &&
      note.content.includes("verdict: secret")
    ),
    `memory_note: ${said.text}\n${note?.content ?? "no note"}`
  );
  const shapes = await probe.tool(writer, "memory_note", {
    text: "The staging token: abcd1234efgh and the admin password=hunter2hunter2 are set.",
  });
  const valued = await until(
    "the key-value note in the inbox",
    () => probe.inboxNote("The staging token:"),
    Boolean,
    20_000
  ).catch(() => undefined);
  kit.check(
    "1: `token: abcd1234efgh` and `password=hunter2hunter2` in a note are committed as [redacted]",
    Boolean(
      valued?.content.includes("token: [redacted]") &&
      valued.content.includes("password=[redacted]") &&
      !valued.content.includes("abcd1234efgh") &&
      !valued.content.includes("hunter2hunter2")
    ),
    `memory_note: ${shapes.text}\n${valued?.content ?? "no note"}`
  );
};

const PURGED_FACT = "The purge probe cache lives in /var/cache/purge-probe.";

/** 2: purging a session proposes withdrawing its note, retiring the fact resting on it alone. */
const purgeLeg = async (kit: Kit, probe: Probe) => {
  const { fleet } = probe;
  const writer = await probe.session("Purge source");
  await fleet.send(writer.id, "PROBE-FACTS-PURGE hello");
  await until(
    "the purge source's first turn",
    () => fleet.instance(writer.id)?.turn_open_at === null,
    Boolean,
    60_000
  ).catch(() => false);
  const written = await probe.tool(writer, "memory_note", {
    text: PURGED_FACT,
  });
  const id = NOTED_ID.exec(written.text)?.[1] ?? "";
  const today = new Date().toISOString().slice(0, 10);
  await probe.put(
    "knowledge/purge.md",
    `Purge: what a purged session left.\n\n- ${PURGED_FACT} (since ${today}, from ${id})\n`
  );
  const [row] = fleet.query<{ cwd: string; session_id: string | null }>(
    "SELECT session_id, cwd FROM instances WHERE id = ?",
    writer.id
  );
  const before = await requestIds(probe);
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
  const card = await newCard(
    probe,
    before,
    "knowledge/purge.md",
    "the purged session's withdrawal card"
  );
  kit.check(
    "2: purging a session proposes withdrawing its note: one card retires the fact resting on it alone",
    Boolean(id) &&
      card !== undefined &&
      pathsOf(card).includes("knowledge/archive/purge.md") &&
      !(
        card.payload.input.files?.find(
          (file) => file.path === "knowledge/purge.md"
        )?.content ?? PURGED_FACT
      ).includes(PURGED_FACT),
    `note ${written.text}\nsession ${row?.session_id}\ncard ${JSON.stringify(card?.payload.input.files)}`
  );
};

const RULINGS_PATH = "knowledge/rulings.md";
const RULED = "Releases need the person's sign-off.";
const WARMED = "The probe cache is warmed nightly.";
const WARMED_ID = "n-20261004-090000-f1f1f1";

/** 3: a ruling survives the withdrawal of a fact's only note (re-grounded in the card's diff) and disuse. */
const rulingLeg = async (kit: Kit, probe: Probe) => {
  const today = new Date().toISOString().slice(0, 10);
  await probe.put(
    `memory/archive/${WARMED_ID}.md`,
    noteFile(WARMED_ID, WARMED, timeOf(WARMED_ID))
  );
  await probe.put(
    RULINGS_PATH,
    `Rulings: the person's word.\n\n- ${RULED} (ruling 2025-01-01)\n- ${WARMED} (since 2026-10-04, from ${WARMED_ID})\n`
  );
  const before = await requestIds(probe);
  await fetch(
    `${probe.fleet.base}/api/projects/${probe.projectId}/memory/notes/${WARMED_ID}/withdraw`,
    { method: "POST" }
  );
  const card = await newCard(
    probe,
    before,
    RULINGS_PATH,
    "the withdrawal card"
  );
  const proposed =
    card?.payload.input.files?.find((file) => file.path === RULINGS_PATH)
      ?.content ?? "";
  // The person re-grounds the fact as their own word before approving.
  const edited = proposed.replace(
    `- ${RULED} (ruling 2025-01-01)`,
    `- ${RULED} (ruling 2025-01-01)\n- ${WARMED} (ruling ${today})`
  );
  if (card) {
    await probe.answer(card, {
      behavior: "allow",
      updatedInput: { edits: [{ path: RULINGS_PATH, content: edited }] },
    });
  }
  const after = await until(
    `${RULINGS_PATH} as approved`,
    () => probe.read(RULINGS_PATH),
    (content) => !content.includes(WARMED_ID),
    20_000
  ).catch(() => "(not approved)");
  const disuse = await requestIds(probe);
  await probe.curatorRun().catch(() => undefined);
  const archived = await newCard(
    probe,
    disuse,
    RULINGS_PATH,
    "no archive card for the rulings"
  );
  kit.check(
    "3: a ruling survives a withdrawal (re-grounded in the card's diff) and disuse (a 2025 ruling is proposed for no archive)",
    after.includes(`- ${RULED} (ruling 2025-01-01)`) &&
      after.includes(`- ${WARMED} (ruling ${today})`) &&
      archived === undefined,
    `${after}\narchive card: ${JSON.stringify(archived?.payload.input.files?.map((file) => file.path))}`
  );
};

/** 4: a fold that rewords a line is refused; so is the curator's change to AGENTS.md's ## Notes. */
const foldLeg = async (kit: Kit, probe: Probe, curator: Caller) => {
  const deploys = await probe.read(DEPLOYS_PATH);
  const reworded = deploys.replace(
    RELEASE,
    "Releases ship with `bun run release`."
  );
  const fold = await probe.tool(curator, "memory_propose", {
    files: [{ path: DEPLOYS_PATH, content: reworded }],
    notes: [],
    why: "Fold knowledge/deploys.md",
  });
  const cited = "n-20261014-090000-c0c0c5";
  await probe.put(
    "AGENTS.md",
    "# Agents\n\n## Notes\n\n- The person's own note.\n"
  );
  await probe.put(
    `memory/inbox/${cited}.md`,
    noteFile(cited, "Builds run on the big box.", timeOf(cited))
  );
  const notes = await probe.tool(curator, "memory_propose", {
    files: [
      {
        path: "AGENTS.md",
        content:
          "# Agents\n\nBuilds run on the big box.\n\n## Notes\n\n- An agent's rewording of the note.\n",
      },
    ],
    notes: [cited],
    why: "Builds run on the big box",
  });
  kit.check(
    "4: a fold proposal that rewords a fact line is refused; the curator's change to AGENTS.md's ## Notes is refused",
    fold.refused &&
      fold.text.includes("fold") &&
      notes.refused &&
      notes.text.includes("## Notes"),
    `fold: ${fold.text}\nnotes: ${notes.text}`
  );
};

const KEYS_PATH = "knowledge/keys.md";
const KEY_FACT = "The staging key is k1.";

/** 6: a current line whose until has passed is proposed under Formerly as the curator's run starts. */
const untilLeg = async (kit: Kit, probe: Probe) => {
  await probe.put(
    KEYS_PATH,
    `Keys: when they rotate.\n\n- ${KEY_FACT} (since 2026-10-01, until 2026-10-02, from n-20261001-110000-a2a2a2)\n`
  );
  const before = await requestIds(probe);
  await probe.curatorRun().catch(() => undefined);
  const card = await newCard(probe, before, KEYS_PATH, "the retirement card");
  const content =
    card?.payload.input.files?.find((file) => file.path === KEYS_PATH)
      ?.content ?? "";
  const lines = content.split("\n");
  kit.check(
    "6: a current line whose until has passed is proposed under Formerly, with its window",
    lines.indexOf("## Formerly") >= 0 &&
      lines.indexOf(
        `- ${KEY_FACT} (since 2026-10-01, until 2026-10-02, from n-20261001-110000-a2a2a2)`
      ) > lines.indexOf("## Formerly"),
    `card by ${card?.payload.proposer}:\n${content}`
  );
};

/** 7: below 15 fact files a merging reshape is refused and a split is proposed; the curator's brief asks for the two-description judgment. */
const reshapeLeg = async (kit: Kit, probe: Probe, curator: Caller) => {
  const queue =
    "- The alpha queue drains hourly. (since 2026-10-05, from n-20261005-090000-a3a3a3)";
  const bucket =
    "- The beta bucket is private. (since 2026-10-05, from n-20261005-090000-b3b3b3)";
  const job =
    "- The gamma job runs daily. (since 2026-10-05, from n-20261005-090000-c3c3c3)";
  await probe.put(
    "knowledge/alpha.md",
    `Alpha: the queue.\n\n${queue}\n${bucket}\n`
  );
  await probe.put("knowledge/gamma.md", `Gamma: the job.\n\n${job}\n`);
  const merge = await probe.tool(curator, "memory_propose", {
    files: [
      {
        path: "knowledge/alpha.md",
        content: `Alpha: the queue and the job.\n\n${queue}\n${bucket}\n${job}\n`,
      },
      { path: "knowledge/gamma.md", content: "" },
    ],
    notes: [],
    why: "Reshape: merge gamma into alpha",
  });
  const split = await probe.tool(curator, "memory_propose", {
    files: [
      {
        path: "knowledge/alpha.md",
        content: `Alpha: the queue.\n\n${queue}\n`,
      },
      {
        path: "knowledge/beta.md",
        content: `Beta: the bucket.\n\n${bucket}\n`,
      },
    ],
    notes: [],
    why: "Reshape: alpha's facts fall under two descriptions",
  });
  kit.check(
    "7: below 15 fact files a reshape that merges files is refused, and one that splits a two-description file is proposed",
    merge.refused && merge.text.includes("only splits") && !split.refused,
    `merge: ${merge.text}\nsplit: ${split.text}`
  );
  const [brief] = probe.fleet.query<{ brief: string }>(
    "SELECT w.brief FROM routine_runs r JOIN work_items w ON w.id = r.work_item_id WHERE r.routine_id = (SELECT id FROM routines WHERE project_id = ? AND target = 'curator') ORDER BY r.started_at DESC LIMIT 1",
    probe.projectId
  );
  if (brief) {
    kit.check(
      "7: the curator's brief asks it to judge whether a file's facts fall under two descriptions",
      brief.brief.includes("fall under two descriptions"),
      brief.brief.slice(
        Math.max(0, brief.brief.indexOf("## What the files ask")),
        1200
      )
    );
  } else {
    kit.note(
      "7: the curator's brief is checked only where its run starts a session"
    );
  }
};

/** The memory audit's legs, Jev off. */
const auditLegs = async (kit: Kit, probe: Probe) => {
  const writer = await probe.session("Note writer");
  await noteSecretLeg(kit, probe, writer);
  await purgeLeg(kit, probe);
  await rulingLeg(kit, probe);
  const curator = await probe.session("Curator stand-in");
  probe.fleet.write(
    "UPDATE instances SET role = 'curator' WHERE id = ?",
    curator.id
  );
  await foldLeg(kit, probe, curator);
  await untilLeg(kit, probe);
  await reshapeLeg(kit, probe, curator);
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
    await proseLeg(kit, probe, talkerId);
    await rejectLeg(kit, probe);
    await withdrawLeg(kit, probe);
    await briefLeg(kit, probe, talkerId);
    await restartLeg(kit, probe);
    await offLegs(kit, probe, talkerId);
    await auditLegs(kit, probe);
  } finally {
    jev.stop();
  }
};

export default { name: "memory-facts", run } satisfies Spec;
