import { type ChoiceEntry, unsentChoices } from "@cawco/core/choices";
import { pinsToTell } from "@cawco/core/comments/deliver";
import {
  newAnswer,
  type Pin,
  readPins,
  seenOf,
} from "@cawco/core/comments/model";
import type { DecisionCard } from "@cawco/core/decisions";
import {
  type ArtifactAsked,
  docMeta,
  getMeta,
  type QuestionClose,
} from "@cawco/core/doc-meta";
import type { InstanceRow } from "@cawco/core/protocol";
import { TUNED_MAP, tunedEntryOf } from "@cawco/core/tuned";
import type { Doc } from "yjs";
import type { ArtifactRow } from "../db/artifacts";
import { readKept } from "../decision-program";
import { boardOf } from "./access";
import type { ArtifactServiceDeps } from "./deps";
import type { ArtifactFacts, ArtifactSessions } from "./needs";
import { answersOf, noneOpen, type Question, questionsOf } from "./questions";

/** The doc's `state`, read as entries. */
/**
 * An artifact's choices as everything reads them: its doc's `state`, and a
 * component's tuned timing (the doc's `tuned` map, core tuned.ts) as the one
 * `tuned` entry, so it answers the judgement and goes with a Send as a pick
 * does.
 */
export const stateOf = (doc: Doc): Record<string, ChoiceEntry> => {
  const state = doc.getMap("state").toJSON() as Record<string, ChoiceEntry>;
  const tuned = tunedEntryOf(doc.getMap(TUNED_MAP).toJSON());
  return tuned ? { ...state, tuned } : state;
};

export const metaOf = (doc: Doc) => {
  const meta = docMeta(doc);
  const sentAt = meta.get("sentAt") ?? null;
  return {
    pageHash: meta.get("pageHash") ?? null,
    sentAt,
    ...(sentAt === null
      ? {}
      : {
          sentBy: meta.get("sentBy") ?? ("person" as const),
        }),
  };
};

/** What createFacts reads of the artifact service: its deps, and the service's parts it calls, each read when called. */
export interface FactsContext {
  choicesAsked: (row: ArtifactRow) => { card?: DecisionCard; id: string }[];
  db: ArtifactServiceDeps["db"];
  deps: ArtifactServiceDeps;
  docs: ArtifactServiceDeps["docs"];
  holder: (row: ArtifactRow) => InstanceRow | undefined;
  programOf: (row: ArtifactRow) => string | undefined;
}

/** What an artifact's doc and row say for Needs you and the session lists, read once per change of either, and the caches that hold them. */
export const createFacts = (ctx: FactsContext) => {
  const { choicesAsked, db, deps, docs, holder, programOf } = ctx;

  /* ── Needs you (needs.ts) ───────────────────────────────────────────── */

  /** Each artifact's facts as last read, with the row's marks they were read at. */
  const factsKept = new Map<string, { facts: ArtifactFacts; mark: string }>();
  /** What a change of the doc (its seq) or of the row moves: past it, the facts are read again. */
  const factsMark = (row: ArtifactRow): string =>
    `${row.seq}:${row.revision}:${row.openedRevision}:${row.readSeq}:${row.deliveredSeq}:${row.updatedAt.getTime()}`;
  /** When the agent last answered on `pin`: its newest entry, or its resolve. */
  const answeredOn = (pin: Pin): string => {
    const entry = pin.thread.findLast((one) => one.by === "agent")?.at ?? "";
    const resolved =
      pin.resolvedBy === "agent" && pin.resolvedAt ? pin.resolvedAt : "";
    return entry > resolved ? entry : resolved;
  };
  /** The agent's closes of an artifact's questions (`meta.questionsClosed`). */
  const closesOf = (doc: Doc): Record<string, QuestionClose> =>
    getMeta(doc, "questionsClosed") ?? {};
  /** The card each Canvas or Preview piece of page `row` is a picture of, by the artifact it shows. */
  const mediaCards = (row: ArtifactRow): Map<string, string> => {
    const program = programOf(row);
    return new Map(
      program === undefined
        ? []
        : readKept(program).artifacts.flatMap((media) =>
            media.card ? [[media.id, media.card] as const] : []
          )
    );
  };
  /**
   * Artifact `row`'s questions to the person (questions.ts), read from its
   * doc; `put` whether it is put to the person at all (needs.ts `asks`) and
   * whether its pins may ask him. Needs you reads them with both set and
   * its own rules gating (needs.ts), `open_items` with each read here.
   */
  const questionsFrom = (
    row: ArtifactRow,
    doc: Doc,
    pins: readonly Pin[],
    put: { asked: boolean; pinsMayAsk: boolean }
  ): Question[] =>
    questionsOf({
      artifact: { id: row.id, name: row.name, title: row.title, ask: row.ask },
      ...put,
      cards: choicesAsked(row),
      judged: row.does === "judge",
      media: row.kind === "page" ? mediaCards(row) : new Map(),
      pins,
      state: stateOf(doc),
      closes: closesOf(doc),
    });
  /** A decision page's questions counted, its first open one, and whether a canvas to judge has its answer (needs.ts). */
  const answersFacts = (
    questions: readonly Question[]
  ): Pick<ArtifactFacts, "answers" | "firstOpen" | "judged"> => {
    const { asked, answered, firstOpen } = answersOf(questions);
    return {
      answers: asked > 0 ? { asked, answered } : null,
      firstOpen,
      judged: noneOpen(questions, "judge"),
    };
  };
  /** The latest revision's changes the person hasn't looked at. */
  const changesFacts = (doc: Doc): ArtifactFacts["changes"] => {
    const changes = getMeta(doc, "changes");
    if (!changes) {
      return null;
    }
    const seen = new Set(seenOf(doc).get(String(changes.revision)) ?? []);
    return {
      revision: changes.revision,
      count: changes.items.filter((item) => !seen.has(item.anchor)).length,
    };
  };
  /**
   * What artifact `row`'s doc says, read once per change of it or of its
   * row. `heldNext`: whether a maker's change is held for it, when the
   * caller read that for every artifact at once.
   */
  const factsOf = (
    row: ArtifactRow,
    heldNext = db.heldOf(row.id) !== undefined
  ): ArtifactFacts => {
    // A maker's change held for its parent to open: the parent's move.
    const mark = factsMark(row);
    const kept = factsKept.get(row.id);
    if (kept?.mark === mark) {
      return heldNext ? { ...kept.facts, handed: true } : kept.facts;
    }
    const doc = docs.doc(row.id);
    const meta = docMeta(doc);
    const state = stateOf(doc);
    const { sentAt } = metaOf(doc);
    const pins = pinsToTell(readPins(doc).values()).sort(
      (a, b) => a.number - b.number
    );
    const questions = questionsFrom(row, doc, pins, {
      asked: true,
      pinsMayAsk: true,
    });
    // A pin asks while its question is open: its reply answers it, and the agent's close takes it.
    const open = new Set(
      questions.flatMap((one) =>
        one.kind === "pin" && one.state === "open" ? [one.key] : []
      )
    );
    const asking = pins.filter((pin) => open.has(`pin:${pin.id}`));
    const facts: ArtifactFacts = {
      ...answersFacts(questions),
      asked: meta.get("asked") ?? null,
      asking: asking.map((pin) => pin.number),
      askingAt: asking
        .map(answeredOn)
        .reduce<string | null>((a, b) => (a !== null && a > b ? a : b), null),
      changes: changesFacts(doc),
      closed: pins
        .filter((pin) => pin.resolvedAt && newAnswer(pin))
        .map((pin) => ({ pin: pin.number, at: answeredOn(pin) })),
      draft: meta.get("draft") === true,
      gone: meta.get("sourceGone")?.why ?? null,
      lookedAt: meta.get("lookedAt") ?? null,
      // Its page gone; one standing now is read beside the facts (mediaNow).
      media: meta.has("mediaOf"),
      revisedAt: meta.get("revisedAt") ?? null,
      handed: meta.get("handed") === true,
      unsent: unsentChoices(state, sentAt),
    };
    factsKept.set(row.id, { facts, mark });
    return heldNext ? { ...facts, handed: true } : facts;
  };
  /**
   * Its ask as its doc keeps it; one made before asks were kept stands as
   * its maker's at its last publish, so its writer's turns retire it too.
   */
  const askOf = (
    row: ArtifactRow,
    facts: ArtifactFacts
  ): ArtifactAsked | null => {
    if (facts.asked) {
      return facts.asked;
    }
    const by = row.madeBy ?? row.instanceId;
    return by
      ? { by, at: facts.revisedAt ?? row.updatedAt.toISOString() }
      : null;
  };
  /** What the hub holds of `row`'s sessions, as its rules read it (needs.ts). */
  const sessionsOf = (
    row: ArtifactRow,
    facts: ArtifactFacts
  ): ArtifactSessions => {
    const owner = holder(row);
    const writer = askOf(row, facts)?.by;
    const project = boardOf(row);
    return {
      ended: !owner || deps.finished(owner),
      harness: owner?.harness ?? null,
      machineId: owner?.machineId ?? null,
      setUp: project !== null && deps.setUp(project),
      steps: writer ? deps.steps(writer) : [],
    };
  };
  /** The artifacts each decision page's Canvas and Preview pieces show, by the page's id, read once per change of it. */
  const mediaKept = new Map<string, { at: number; ids: string[] }>();
  const mediaOf = (row: ArtifactRow): string[] => {
    const at = row.updatedAt.getTime();
    const kept = mediaKept.get(row.id);
    if (kept?.at === at) {
      return kept.ids;
    }
    const program = programOf(row);
    const ids =
      program === undefined
        ? []
        : readKept(program).artifacts.map((media) => media.id);
    mediaKept.set(row.id, { at, ids });
    return ids;
  };
  /**
   * `row`'s facts with whether it is an option's media now: a Canvas or
   * Preview piece of a decision page among `pages` (its session's, read
   * here when not given), or of one that went (`facts.media`).
   */
  const withMedia = (
    row: ArtifactRow,
    facts: ArtifactFacts,
    pages?: readonly ArtifactRow[]
  ): ArtifactFacts => {
    if (facts.media || row.instanceId === null || row.kind === "page") {
      return facts;
    }
    const shownOn = (
      pages ??
      db.ofInstance(row.instanceId).filter((one) => one.kind === "page")
    ).some((page) => mediaOf(page).includes(row.id));
    return shownOn ? { ...facts, media: true } : facts;
  };

  return {
    askOf,
    closesOf,
    factsKept,
    factsOf,
    mediaOf,
    questionsFrom,
    sessionsOf,
    withMedia,
  };
};
