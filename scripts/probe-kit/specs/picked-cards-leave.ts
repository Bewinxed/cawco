/**
 * A decision card the person picks himself stops counting as waiting on the
 * member of Who decides it went to. Who decides draws each member's record
 * (`GET /api/decides/members/:id/record`): `waiting` counts the ledger rows
 * (card_settlings) the member still holds. A card sent to Caw, or handed to
 * a member's warm session, carries no work item and no `signed` line, so on
 * main its row stayed open after his pick and Caw's count grew with cards he
 * had already decided (hub server.ts `changed` touched only a card a member
 * had settled).
 *
 * A hub built in this process (hub-in-process.ts) on a scratch database,
 * its routes answered with no port. The project's decides.md sends
 * Behaviour to Caw and Approach to the Advisor. The writer's page `plan` asks
 * four cards; their ledger rows stand as the hub writes them when it sends
 * them (settling.ts `toCaw`, `handTo`): `look` and `words` to Caw's
 * conversation, `shape` and `order` handed to the Advisor's warm session,
 * each with no work item. His picks go in as his views write them: a Yjs
 * update carried by the Decisions tab's Send (artifacts/sync.ts
 * `takeSentWrites`, the same path a view's socket takes).
 *
 * (a) Before he picks: Caw waits on 2, the Advisor on 2, neither decided.
 * (b) He picks `look` (Caw's) and `shape` (handed to the Advisor): Caw
 *     waits on 1, the Advisor on 1, and neither counts it decided. On main
 *     both still read 2.
 * (c) A note alone on `words` is no pick: Caw still waits on 1.
 * (d) The Advisor's own session settles `order` (`settle`): it waits on 0
 *     and has decided 1, as before.
 * (e) He then picks `order` otherwise: it is taken back from the Advisor,
 *     whose record keeps 1 decided and counts 1 taken back, as before.
 * (f) The page's ledger (`GET /api/decides/pages/:id`) says the cards he
 *     picked were taken back and never settled by their member.
 * (g) Rows stuck before this change (a card he picked while it waited on
 *     Caw, its row still open) are taken back once as the hub starts
 *     (settling.ts `takeBackPickedOnce`), at his pick's time; a second
 *     start leaves them be.
 * (h) A second page `later` with a card open on Caw and a card Caw settled
 *     is deleted (`artifact_delete`, the route every delete of a page takes
 *     down to db artifacts.ts `dropArtifactRows`): its open card no longer
 *     waits on Caw, and what Caw settled there still counts as decided. On
 *     main the open card counted for good: nothing cascades from a page's
 *     row to the ledger.
 *
 *   bun scripts/probe-kit/run.ts picked-cards-leave
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyUpdate, Doc, encodeStateAsUpdate, encodeStateVector } from "yjs";
import { PRESENCE_HEADER } from "../../../packages/core/src/browser-gate";
import type { ChoiceEntry } from "../../../packages/core/src/choices";
import type { DecisionCard } from "../../../packages/core/src/decisions";
import { machinePath } from "../../../packages/core/src/machine-path";
import { decidesWords } from "../../../packages/core/src/words/decides";
import type { hubInProcess as inProcess } from "../../../packages/hub/scripts/hub-in-process";
import type { CardSettlingRow } from "../../../packages/hub/src/db/decides";
import { type HubAsk, handled, said } from "../hub";
import type { Kit, Spec } from "../kit";

const MACHINE = "probe-picked-machine";
const PRESENCE = "probe-presence-7c1e";
const PROJECT = "probe-picked-cards";
const CAW = "caw-conversation-probe";
const PAGE = "plan";

const { kinds } = decidesWords;
const DECIDES = `---
${kinds.behaviour.name}: caw
${kinds.approach.name}: advisor
---
`;

const PROGRAM = `root = Decisions("Plan the office's board", [look, words, shape, order])
look = Decision("look", "Which look does the board take?", [la, lb], "Two looks, drawn.", [], [], false, null, "behaviour")
la = Option("a", "Quiet columns", "Columns with hairlines.", true, [], "Less colour.")
lb = Option("b", "Cards on a wash", "Cards on a tinted ground.", false, [], "More colour.")
words = Decision("words", "What does the empty board say?", [wa, wb], "Two lines.", [], [], false, null, "behaviour")
wa = Option("a", "Nothing yet", "Two words.", true, [], "Says little.")
wb = Option("b", "Your first task lands here", "A full line.", false, [], "Longer.")
shape = Decision("shape", "How do tasks move between stages?", [sa, sb], "Two ways.", [], [], false, null, "approach")
sa = Option("a", "By hand", "He drags them.", true, [], "His time.")
sb = Option("b", "On the agent's report", "The report moves it.", false, [], "Less control.")
order = Decision("order", "Which stage comes first?", [oa, ob], "Two orders.", [], [], false, null, "approach")
oa = Option("a", "Inbox first", "Everything lands there.", true, [], "One more column.")
ob = Option("b", "Doing first", "Work in hand leads.", false, [], "No inbox.")`;

interface Answer {
  json: unknown;
  status: number;
  text: string;
}

interface Record {
  decided: number;
  takenBack: number;
  waiting: number;
}

type HubDb = Awaited<ReturnType<typeof inProcess>>["db"];

/** His pick or note, as his views write it: no `settled`. */
const his = (options: string[], note: string | null = null): ChoiceEntry => ({
  options,
  note,
  value: null,
  pageHash: "0".repeat(64),
  at: new Date().toISOString(),
});

/**
 * His entries as one Yjs update to the page's `state`, as a view sends it:
 * written on the doc as the hub holds it (`held`, its kept updates), the
 * update only what he changed.
 */
const writesOf = (
  held: Uint8Array[],
  entries: { [card: string]: ChoiceEntry }
): string => {
  const doc = new Doc();
  for (const update of held) {
    applyUpdate(doc, update);
  }
  const before = encodeStateVector(doc);
  const state = doc.getMap("state");
  for (const [card, entry] of Object.entries(entries)) {
    state.set(card, entry);
  }
  return Buffer.from(encodeStateAsUpdate(doc, before)).toString("base64");
};

const run = async (kit: Kit): Promise<void> => {
  const { check } = kit;
  const scratch = await mkdtemp(
    join(process.env.TMPDIR ?? tmpdir(), "picked-cards-leave-")
  );
  try {
    const { hubInProcess } =
      await import("../../../packages/hub/scripts/hub-in-process");
    const { db, hub } = await hubInProcess(
      join(scratch, "hub", "hub.db"),
      join(scratch, "home")
    );
    const { writeFolderFile } =
      await import("../../../packages/hub/src/project-folder");
    const call = async (request: HubAsk): Promise<Answer> => {
      const answer = await request(
        handled((r) => hub.handle(r), {
          headers: { [PRESENCE_HEADER]: PRESENCE },
        })
      );
      return said(answer);
    };
    const recordOf = async (member: string): Promise<Record> => {
      const { json, text } = await call((client) =>
        client.api.decides.members({ id: member }).record.get({ query: {} })
      );
      if (!json) {
        throw new Error(`record of ${member}: ${text}`);
      }
      return json as Record;
    };
    const shown = (record: Record) =>
      `waiting ${record.waiting}, decided ${record.decided}, taken back ${record.takenBack}`;

    const { writer, advisor } = await seed(db, writeFolderFile);
    const made = await call((client) =>
      client.api.instances({ id: writer }).artifacts.post({
        kind: "page",
        does: "pick",
        name: PAGE,
        title: "Plan the office's board",
        ask: "Pick how the board looks and runs",
        program: PROGRAM,
      })
    );
    const pageId = (made.json as { id?: string } | undefined)?.id;
    if (!pageId) {
      throw new Error(`the page was not made (${made.status}): ${made.text}`);
    }
    // Where the hub sent each card, as toCaw and handTo write it: no work
    // item, no signed line.
    const sent = (
      card: string,
      route: string,
      instanceId: string
    ): CardSettlingRow => ({
      artifactId: pageId,
      card,
      route,
      instanceId,
      workItemId: null,
      askedBy: writer,
      createdAt: new Date(),
      signed: null,
      settledAt: null,
      takenBackAt: null,
      kind: route === "caw" ? "behaviour" : "approach",
    });
    db.decides.putSettlings([
      sent("look", "caw", CAW),
      sent("words", "caw", CAW),
      sent("shape", "advisor", advisor),
      sent("order", "advisor", advisor),
    ]);
    const send = async (entries: { [card: string]: ChoiceEntry }) => {
      const answer = await call((client) =>
        client.api
          .projects({ id: PROJECT })
          .decisions({ name: PAGE })
          .send.post({
            text: "Picked a few.",
            writes: writesOf(db.artifacts.updates(pageId), entries),
          })
      );
      if (answer.status >= 400) {
        throw new Error(`his send (${answer.status}): ${answer.text}`);
      }
    };

    // (a) Before he picks.
    const cawBefore = await recordOf("caw");
    const advisorBefore = await recordOf("advisor");
    check(
      "a: before he picks, Caw waits on 2 and the Advisor on 2, neither decided",
      cawBefore.waiting === 2 &&
        cawBefore.decided === 0 &&
        advisorBefore.waiting === 2 &&
        advisorBefore.decided === 0,
      `Caw: ${shown(cawBefore)}; Advisor: ${shown(advisorBefore)}`
    );

    // (b) He picks a card sent to Caw and one handed to the Advisor's warm session.
    await send({ look: his(["b"]), shape: his(["a"]) });
    const cawPicked = await recordOf("caw");
    const advisorPicked = await recordOf("advisor");
    check(
      "b: his pick on look leaves Caw waiting on 1, none of it decided by Caw",
      cawPicked.waiting === 1 &&
        cawPicked.decided === 0 &&
        cawPicked.takenBack === 0,
      shown(cawPicked)
    );
    check(
      "b: his pick on shape leaves the Advisor's warm session waiting on 1, none of it decided by the Advisor",
      advisorPicked.waiting === 1 &&
        advisorPicked.decided === 0 &&
        advisorPicked.takenBack === 0,
      shown(advisorPicked)
    );

    // (c) A note alone is no pick.
    await send({ words: his([], "Ask me again once the look is set.") });
    const cawNoted = await recordOf("caw");
    check(
      "c: a note alone on words leaves it Caw's: Caw still waits on 1",
      cawNoted.waiting === 1,
      shown(cawNoted)
    );

    // (d) The Advisor's own session settles order.
    const settled = await call((client) =>
      client.api
        .instances({ id: advisor })
        .artifacts({ artifact: pageId })
        .settle.post({
          card: "order",
          option: "a",
          why: "Everything lands in one place first.",
          sources: [],
        })
    );
    const advisorSettled = await recordOf("advisor");
    check(
      "d: the Advisor settles order itself: it waits on 0 and has decided 1",
      settled.status < 400 &&
        advisorSettled.waiting === 0 &&
        advisorSettled.decided === 1 &&
        advisorSettled.takenBack === 0,
      `settle ${settled.status}${settled.status < 400 ? "" : `: ${settled.text}`}; ${shown(advisorSettled)}`
    );

    // (e) He picks order otherwise.
    await send({ order: his(["b"]) });
    const advisorTaken = await recordOf("advisor");
    check(
      "e: he picks order otherwise: the Advisor keeps 1 decided and counts 1 taken back",
      advisorTaken.waiting === 0 &&
        advisorTaken.decided === 1 &&
        advisorTaken.takenBack === 1,
      shown(advisorTaken)
    );

    // (f) The page's ledger.
    const ledger = (
      (
        await call((client) =>
          client.api.decides.pages({ artifactId: pageId }).get()
        )
      ).json as {
        cards: {
          card: string;
          settledAt: string | null;
          takenBackAt: string | null;
        }[];
      }
    ).cards;
    const row = (card: string) => ledger.find((one) => one.card === card);
    check(
      "f: look and shape read taken back and never settled; order settled then taken back; words open",
      ["look", "shape"].every(
        (card) => row(card)?.settledAt === null && row(card)?.takenBackAt
      ) &&
        !!row("order")?.settledAt &&
        !!row("order")?.takenBackAt &&
        row("words")?.settledAt === null &&
        row("words")?.takenBackAt === null,
      JSON.stringify(ledger)
    );

    // (g) A row stuck before this change, taken back once as the hub starts.
    await stuckOnce(kit, db, pageId, writer);

    // (h) A page deleted with a card still open on Caw.
    await deletedPage(kit, { call, recordOf, shown, db, writer, sent });
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
};

/**
 * (h) Page `later`, made by the writer, its `look` open on Caw and its
 * `words` settled by Caw, then deleted as `artifact_delete` deletes it.
 */
const deletedPage = async (
  { check }: Kit,
  on: {
    call: (request: HubAsk) => Promise<Answer>;
    db: HubDb;
    recordOf: (member: string) => Promise<Record>;
    sent: (card: string, route: string, instanceId: string) => CardSettlingRow;
    shown: (record: Record) => string;
    writer: string;
  }
): Promise<void> => {
  const { call, db, recordOf, sent, shown, writer } = on;
  const made = await call((client) =>
    client.api.instances({ id: writer }).artifacts.post({
      kind: "page",
      does: "pick",
      name: "later",
      title: "Plan the office's later board",
      ask: "Pick how the later board looks",
      program: PROGRAM,
    })
  );
  const laterId = (made.json as { id?: string } | undefined)?.id;
  if (!laterId) {
    throw new Error(`later was not made (${made.status}): ${made.text}`);
  }
  const before = await recordOf("caw");
  db.decides.putSettlings([
    { ...sent("look", "caw", CAW), artifactId: laterId },
    {
      ...sent("words", "caw", CAW),
      artifactId: laterId,
      settledAt: new Date(),
    },
  ]);
  const seeded = await recordOf("caw");
  const removed = await call((client) =>
    client.api
      .instances({ id: writer })
      .artifacts({ artifact: laterId })
      .delete(undefined, { query: { by: "agent" } })
  );
  const after = await recordOf("caw");
  check(
    "h: later deleted: its open card no longer waits on Caw, and what Caw settled there stays decided",
    removed.status < 400 &&
      seeded.waiting === before.waiting + 1 &&
      seeded.decided === before.decided + 1 &&
      after.waiting === before.waiting &&
      after.decided === before.decided + 1,
    `before ${shown(before)}; with later ${shown(seeded)}; delete ${removed.status}${removed.status < 400 ? "" : `: ${removed.text}`}; after ${shown(after)}`
  );
};

/**
 * The writer and the Advisor's session in the project, and its decides.md.
 * Answers their ids.
 */
const seed = async (
  db: HubDb,
  writeFolderFile: typeof import("../../../packages/hub/src/project-folder").writeFolderFile
): Promise<{ advisor: string; writer: string }> => {
  db.upsertAgent({
    machineId: MACHINE,
    hostname: `${MACHINE}.local`,
    os: "linux",
    auth: "unknown",
  });
  db.createProject({ id: PROJECT, name: "Probe office", remote: null });
  const committed = await writeFolderFile(PROJECT, "decides.md", DECIDES, {
    author: { name: "probe" },
  });
  if (!("sha" in committed)) {
    throw new Error(committed.response.detail);
  }
  const open = (title: string): string => {
    const id = crypto.randomUUID();
    db.openInstance({
      id,
      machineId: MACHINE,
      cwd: machinePath("/home/probe", "/home/probe/office", MACHINE),
      sessionId: crypto.randomUUID(),
      harness: "claude",
      origin: "person",
      projectId: PROJECT,
      title,
      kind: "mainline",
      permissionMode: "bypassPermissions",
      model: "claude-opus-5-5",
    });
    return id;
  };
  return { writer: open("Plan the board"), advisor: open("Advisor") };
};

/**
 * (g) settling.ts `takeBackPickedOnce` over the hub's own ledger: a card on
 * a page he had picked while it waited on Caw, its row open, and a card he
 * has not picked; the page's state read as the hub reads it.
 */
const stuckOnce = async (
  { check }: Kit,
  db: HubDb,
  pageId: string,
  writer: string
): Promise<void> => {
  const { createSettling } = await import("../../../packages/hub/src/settling");
  const STUCK = "page-stuck";
  const pickedAt = "2026-11-01T09:30:00.000Z";
  const card = (id: string): DecisionCard =>
    ({
      id,
      kind: "behaviour",
      question: id,
      options: [{ id: "a" }, { id: "b" }],
    }) as DecisionCard;
  db.decides.putSettlings(
    ["old-pick", "still-open"].map((id) => ({
      artifactId: STUCK,
      card: id,
      route: "caw",
      instanceId: CAW,
      workItemId: null,
      askedBy: writer,
      createdAt: new Date("2026-11-01T09:00:00.000Z"),
      signed: null,
      settledAt: null,
      takenBackAt: null,
      kind: "behaviour",
    }))
  );
  const migrated = new Set<string>();
  const settling = createSettling({
    db: db.decides,
    pageCards: (artifactId: string) =>
      artifactId === STUCK
        ? ({
            row: { id: STUCK } as never,
            all: [card("old-pick"), card("still-open")],
            cards: [],
            state: { "old-pick": { ...his(["b"]), at: pickedAt } },
          } as never)
        : undefined,
  } as never) as Partial<ReturnType<typeof createSettling>>;
  const once = {
    dataMigrated: (name: string) => migrated.has(name),
    markDataMigrated: (name: string) => {
      migrated.add(name);
    },
  };
  const { decided } = db.decides.record("caw");
  const first = settling.takeBackPickedOnce?.(once);
  const second = settling.takeBackPickedOnce?.(once);
  const old = db.decides.settling(STUCK, "old-pick");
  const open = db.decides.settling(STUCK, "still-open");
  const caw = db.decides.record("caw");
  check(
    "g: the stuck card he picked is taken back once, at his pick's time; the unpicked one stays Caw's; a second pass does nothing",
    first === 1 &&
      second === null &&
      old?.settledAt === null &&
      old?.takenBackAt?.toISOString() === pickedAt &&
      open?.takenBackAt === null &&
      caw.decided === decided,
    `first ${String(first)}, second ${String(second)}; old-pick taken back ${old?.takenBackAt?.toISOString() ?? "never"}, still-open taken back ${open?.takenBackAt?.toISOString() ?? "never"}; page ${pageId} aside`
  );
};

export default {
  group: "Previews, pages and comments",
  name: "picked-cards-leave",
  ownProcess:
    "it builds a hub in this process on a scratch database: config.ts reads CAWCO_DB_PATH and HOME once, as the hub's modules load",
  run,
} satisfies Spec;
