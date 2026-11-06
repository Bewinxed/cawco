/**
 * A card on a project's setup page (setup.ts `isSetupPage`: its decision
 * page `setup`, the project-setup skill's) settles only on the person's own
 * pick, whatever the project's Who decides routes its kind to. The page
 * decides what the project is. Private office, 2026-11-06: its `place` card
 * (Tools and conventions) was settled by Common practice at 05:17Z and its
 * `career-ops` card (Approach) by the Advisor at 05:26Z; Caw then told him
 * "the two settle-able cards settled themselves" and filed a task on the
 * Advisor's pick.
 *
 * Every path that sends or settles a card reads its member from one rule,
 * hub settling.ts `routeOf`, which answers the person for a setup page's
 * every card. No fleet: the hub's own settling (`createSettling`) is called
 * with its deps recorded, over a scratch project folder whose decides.md is
 * read as the hub reads it (decides-file.ts `decidesTable`): Approach to
 * the advisor, Tools and conventions to practice, Look and words to Caw,
 * Scope to the agent that asked.
 *
 * (a) The writer puts four cards of those kinds on the setup page
 *     (`routed`, artifacts/service.ts `routesOf` on create and revise):
 *     each line says the card is his on the project's setup page and waits
 *     on him; no member run starts, nothing is handed off, Caw is told
 *     nothing, and no ledger row is written.
 * (b) The same four cards on the project's page `plan` go where the table
 *     says: a run of the research type for practice and of the advisor
 *     type, a decision event to Caw, and the writer's own line. On main,
 *     (a) answered these same lines.
 * (c) `settle` on the setup page (`settler`, artifacts/service.ts
 *     `settlerOf`) is refused to the writer, to Caw's conversation, and to
 *     the Advisor's and Common practice's sessions even with a ledger row
 *     naming them on the card (Private office's rows from before), each in
 *     words saying the card is his on the setup page. On `plan` the same
 *     sessions settle their cards. On main, each of these settles.
 * (d) A member's next run takes the cards stranded on the project's other
 *     pages (`stranded`): a setup page's card a run of practice held before
 *     is not among them; the plan page's stranded card is.
 * (e) His pick on `place` (a state entry with no `settled`, as his views
 *     write it) settles it: `routed` says it is decided, the other three
 *     still wait on him, and `settle` stays refused on the rest.
 *
 *   bun scripts/probe-kit/run.ts setup-cards-yours
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChoiceEntry } from "../../../packages/core/src/choices";
import type { DecisionCard } from "../../../packages/core/src/decisions";
import type { DelegateType } from "../../../packages/core/src/delegate-types";
import type { InstanceRow } from "../../../packages/core/src/protocol";
import { accountsWords } from "../../../packages/core/src/words/accounts";
import { decidesWords } from "../../../packages/core/src/words/decides";
import type { ArtifactRow } from "../../../packages/hub/src/db/artifacts";
import type { CardSettlingRow } from "../../../packages/hub/src/db/decides";
import type { PageCards } from "../../../packages/hub/src/settling";
import type { WorkItemRequest } from "../../../packages/hub/src/work-items";
import type { Kit, Spec } from "../kit";

const PROJECT = "private-office-probe";
const WRITER = "caw-writer";
const CAW = "caw-conversation";
const ADVISOR = "advisor-session";
const PRACTICE = "practice-session";
const SETUP_ID = "page-setup";
const PLAN_ID = "page-plan";

/** Private office's decides.md, as the hub reads it: four kinds, four members. */
const { kinds } = decidesWords;
const DECIDES = `---
${kinds.approach.name}: advisor
${kinds.tools.name}: practice
${kinds.look.name}: caw
${kinds.scope.name}: asker
---
`;

/** A card's kind as its lines name it. */
const kindName = (one: DecisionCard | undefined): string =>
  kinds[(one?.kind ?? "") as keyof typeof kinds]?.name ?? "";

const option = (id: string, label: string) => ({
  id,
  label,
  line: "",
  cost: "",
  builds: "",
  recommended: id === "a",
  keycap: id === "a" ? 1 : 2,
});

const card = (id: string, kind: string, question: string): DecisionCard =>
  ({
    id,
    kind,
    question,
    why: "",
    after: [],
    mockup: null,
    multiple: false,
    section: null,
    options: [option("a", "The first"), option("b", "The second")],
  }) as DecisionCard;

/** The four cards, of the kinds the table hands away. */
const CARDS: DecisionCard[] = [
  card("place", "tools", "Where does the office's work live?"),
  card("career-ops", "approach", "How does career-ops run?"),
  card("board-look", "look", "Which look does the board take?"),
  card("first-cut", "scope", "How much goes in the first cut?"),
];

const pageRow = (id: string, name: string): ArtifactRow =>
  ({
    id,
    name,
    kind: "page",
    does: "pick",
    title: name === "setup" ? "Set up Private office" : "Plan",
    ask: "Pick",
    instanceId: WRITER,
    madeBy: WRITER,
    projectId: PROJECT,
    heldFor: null,
    revision: 1,
    openedRevision: 1,
    createdAt: new Date(),
  }) as ArtifactRow;

const SETUP = pageRow(SETUP_ID, "setup");
const PLAN = pageRow(PLAN_ID, "plan");

const session = (id: string): InstanceRow =>
  ({
    id,
    title: id,
    cwd: "/home/owner/private-office",
    launchDir: "known",
    harness: "claude",
    model: "claude-opus-5-5",
    parentInstanceId: null,
    workItemId: null,
    projectId: PROJECT,
  }) as InstanceRow;

/** His pick, as his views write it: no `settled`. */
const hisPick = (picked: string): ChoiceEntry => ({
  options: [picked],
  note: null,
  value: null,
  pageHash: "0".repeat(64),
  at: new Date().toISOString(),
});

const run = async (kit: Kit): Promise<void> => {
  const { check } = kit;
  const scratch = await mkdtemp(
    join(process.env.TMPDIR ?? tmpdir(), "setup-cards-yours-")
  );
  process.env.CAWCO_DB_PATH = join(scratch, "hub", "hub.db");
  process.env.HOME = join(scratch, "home");
  try {
    const { writeFolderFile } =
      await import("../../../packages/hub/src/project-folder");
    const { createSettling } =
      await import("../../../packages/hub/src/settling");
    const { BUILT_IN, DEFAULT_ROUTES, KIND_SEED } =
      await import("../../../packages/core/src/decides");
    await writeFolderFile(PROJECT, "decides.md", DECIDES, {
      author: { name: "probe" },
    });

    // What settling did, recorded.
    const ledger = new Map<string, CardSettlingRow>();
    const started: WorkItemRequest[] = [];
    const told: string[] = [];
    const handed: string[] = [];
    const states = new Map<string, Record<string, ChoiceEntry>>([
      [SETUP_ID, {}],
      [PLAN_ID, {}],
    ]);
    const rows = new Map([
      [SETUP_ID, SETUP],
      [PLAN_ID, PLAN],
    ]);
    const sessions = new Map(
      [WRITER, CAW, ADVISOR, PRACTICE].map((id) => [id, session(id)])
    );
    const types: Record<string, DelegateType> = {
      advisor: {
        name: "advisor",
        harness: "claude",
        model: "claude-opus-5-5",
        description: "Advises.",
      } as DelegateType,
      research: {
        name: "research",
        harness: "claude",
        model: "claude-opus-5-5",
        description: "Researches.",
      } as DelegateType,
    };
    let runs = 0;
    const settling = createSettling({
      db: {
        fleet: () => ({
          kinds: KIND_SEED,
          members: Object.values(BUILT_IN),
          pictures: {},
          routes: { ...DEFAULT_ROUTES },
        }),
        settling: (artifactId: string, cardId: string) =>
          ledger.get(`${artifactId}#${cardId}`),
        putSettlings: (put: CardSettlingRow[]) => {
          for (const one of put) {
            ledger.set(`${one.artifactId}#${one.card}`, one);
          }
        },
        onProject: (member: string) =>
          [...ledger.values()].filter((one) => one.route === member),
        markSettled: (artifactId: string, cardId: string, at: Date) => {
          const kept = ledger.get(`${artifactId}#${cardId}`);
          if (kept) {
            kept.settledAt = at;
          }
        },
      } as never,
      delegateType: (name) => types[name],
      handoff: (_from, to) => {
        handed.push(to);
        return Promise.resolve("handed");
      },
      harnessName: () => accountsWords.harnesses.claude,
      harnessOnline: () => true,
      heard: () => undefined,
      seen: () => undefined,
      instance: (id) => sessions.get(id),
      live: () => false,
      modelName: () => "Opus 5.5",
      pageCards: (artifactId, ids) => {
        const row = rows.get(artifactId);
        const state = states.get(artifactId) ?? {};
        return row
          ? ({
              row,
              all: CARDS,
              state,
              cards: CARDS.filter(
                (one) => ids.includes(one.id) && !state[one.id]
              ),
            } satisfies PageCards)
          : undefined;
      },
      project: () => ({
        areaId: null,
        cawHarness: "claude",
        cawModel: null,
        conversationInstanceId: CAW,
        eventsOn: true,
        name: "Private office",
      }),
      start: (request) => {
        started.push(request);
        runs += 1;
        return Promise.resolve({
          item: {
            id: `item-${runs}`,
            instanceId: request.type === "advisor" ? ADVISOR : PRACTICE,
            type: request.type,
          },
        } as never);
      },
      tellCaw: (_projectId, event) => {
        told.push(event.text);
        return Promise.resolve({ instanceId: CAW });
      },
      warm: () => false,
    });
    const writer = sessions.get(WRITER) as InstanceRow;
    const routedOn = (row: ArtifactRow, cards = CARDS) =>
      settling.routed(writer, row, cards, CARDS, states.get(row.id) ?? {});
    const his = (kind: string) =>
      decidesWords.routedYou(kind, decidesWords.here("setup"));

    // (a) The setup page's cards, as the writer puts them on it.
    const onSetup = await routedOn(SETUP);
    const setupLines = CARDS.map((one) => onSetup[one.id] ?? "");
    check(
      "a: each setup card's line says it is his on the setup page and waits on him",
      CARDS.every((one, at) => setupLines[at]?.endsWith(his(kindName(one)))),
      setupLines.join(" | ")
    );
    check(
      "a: no run started, nothing handed off, Caw told nothing, no ledger row written",
      started.length === 0 &&
        handed.length === 0 &&
        told.length === 0 &&
        ledger.size === 0,
      JSON.stringify({
        started: started.map((one) => one.type),
        handed,
        told: told.length,
        ledger: [...ledger.keys()],
      })
    );

    // (b) The same cards on the project's plan page go where the table says.
    const onPlan = await routedOn(PLAN);
    const planLines = CARDS.map((one) => onPlan[one.id] ?? "");
    check(
      "b: on plan, practice and the advisor each start a run, Caw is told, the writer's scope is its own",
      started.map((one) => one.type).join() === "research,advisor" &&
        told.length === 1 &&
        ledger.get(`${PLAN_ID}#first-cut`)?.route === "asker" &&
        planLines[0]?.includes("goes to Common practice on this project") ===
          true &&
        planLines[1]?.includes("goes to Advisor on this project") === true,
      planLines.join(" | ")
    );

    // (c) settle on the setup page, with ledger rows naming the members (Private office's from before).
    const signedOn = (id: string, member: string, instanceId: string) =>
      ledger.set(`${SETUP_ID}#${id}`, {
        artifactId: SETUP_ID,
        card: id,
        route: member,
        askedBy: WRITER,
        createdAt: new Date(),
        kind: CARDS.find((one) => one.id === id)?.kind ?? null,
        settledAt: null,
        takenBackAt: null,
        instanceId,
        workItemId: null,
        signed: null,
      });
    signedOn("place", "practice", PRACTICE);
    signedOn("career-ops", "advisor", ADVISOR);
    signedOn("board-look", "caw", CAW);
    signedOn("first-cut", "asker", WRITER);
    const settleAs = async (
      by: string,
      row: ArtifactRow,
      id: string
    ): Promise<string> => {
      try {
        const signed = await settling.settler(
          sessions.get(by) as InstanceRow,
          row,
          CARDS.find((one) => one.id === id) as DecisionCard
        );
        return `settles as ${signed.by}`;
      } catch (error) {
        return `refused: ${error instanceof Error ? error.message : String(error)}`;
      }
    };
    const tries: [string, string][] = [
      [PRACTICE, "place"],
      [ADVISOR, "career-ops"],
      [CAW, "board-look"],
      [WRITER, "first-cut"],
    ];
    const onSetupSettles = await Promise.all(
      tries.map(([by, id]) => settleAs(by, SETUP, id))
    );
    check(
      "c: on the setup page, practice, the advisor, Caw and the writer are each refused, the card his",
      tries.every(
        ([, id], at) =>
          onSetupSettles[at] ===
          `refused: ${decidesWords.settleYours(
            kindName(CARDS.find((one) => one.id === id)),
            decidesWords.here("setup")
          )}`
      ),
      onSetupSettles.join(" | ")
    );
    const onPlanSettles = await Promise.all(
      tries.map(([by, id]) => settleAs(by, PLAN, id))
    );
    check(
      "c: on plan, the same sessions settle their cards",
      onPlanSettles.join() ===
        "settles as practice,settles as advisor,settles as caw,settles as asker",
      onPlanSettles.join(" | ")
    );

    // (d) A member's next run takes what is stranded: never a setup page's card.
    started.length = 0;
    ledger.set(`${PLAN_ID}#place`, {
      ...(ledger.get(`${PLAN_ID}#place`) as CardSettlingRow),
      instanceId: PRACTICE,
      workItemId: "item-gone",
    });
    const more = card("format", "tools", "Which format do the notes take?");
    rows.set("page-notes", pageRow("page-notes", "notes"));
    await settling.routed(
      writer,
      rows.get("page-notes") as ArtifactRow,
      [more],
      [more],
      {}
    );
    const brief = started[0]?.prompt ?? "";
    check(
      "d: practice's next run takes the plan page's stranded card, and not the setup page's",
      started.length === 1 &&
        brief.includes(`"${PLAN_ID}#place"`) &&
        !brief.includes(`"${SETUP_ID}#place"`),
      `${started.length} run(s); cards named: ${[...brief.matchAll(/card: "([^"]+)"/gu)].map((one) => one[1]).join(", ")}`
    );

    // (e) His pick on place settles it.
    states.set(SETUP_ID, { place: hisPick("b") });
    const afterPick = await routedOn(SETUP);
    check(
      "e: his pick on place: it is decided, the other three still wait on him",
      afterPick.place?.endsWith(`: ${decidesWords.decidedAlready}`) === true &&
        CARDS.slice(1).every((one) =>
          afterPick[one.id]?.endsWith(his(kindName(one)))
        ),
      CARDS.map((one) => afterPick[one.id]).join(" | ")
    );
    const stillRefused = await settleAs(ADVISOR, SETUP, "career-ops");
    check(
      "e: settle stays refused on the setup page's open cards",
      stillRefused.startsWith("refused: "),
      stillRefused
    );
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
};

export default {
  group: "Previews, pages and comments",
  name: "setup-cards-yours",
  ownProcess:
    "it reads decides.md from a scratch project folder: project-folder.ts reads CAWCO_DB_PATH once, as the hub's modules load",
  run,
} satisfies Spec;
