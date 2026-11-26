import {
  answersIn,
  type ChoiceEntry,
  unsentChoices,
} from "@cawco/core/choices";
import { pinsToTell } from "@cawco/core/comments/deliver";
import { newAnswer, type Pin, seenOf } from "@cawco/core/comments/model";
import type { DecisionCard } from "@cawco/core/decisions";
import {
  type ArtifactAsked,
  docMeta,
  getMeta,
  type QuestionClose,
} from "@cawco/core/doc-meta";
import type { KeptStep } from "@cawco/core/plan";
import type { InstanceRow } from "@cawco/core/protocol";
import { canvasOf } from "@cawco/core/stage";
import { TUNED_MAP, tunedEntryOf } from "@cawco/core/tuned";
import type { Doc } from "yjs";
import type { ArtifactRow } from "../db/artifacts";
import { readKept } from "../decision-program";
import { isVerifierParent } from "../work-item-state";
import { boardOf } from "./access";
import type { ArtifactServiceDeps } from "./deps";
import type { ArtifactFacts, ArtifactSessions } from "./needs";
import { answersOf, noneOpen, type Question, questionsOf } from "./questions";

/** Artifact `id` read back after a write: it stands, or the caller lost it mid-write. */
export const stillThere = (
  row: ArtifactRow | undefined,
  id: string
): ArtifactRow => {
  if (!row) {
    throw new Error(`Artifact ${id} went while it was being written.`);
  }
  return row;
};

/**
 * How many directions design graph `row` puts to the person to pick
 * between (its spec's `directions`, core stage.ts `canvasOf`); 0 for any
 * other artifact. Two or more is a pick: a question.
 */
export const directionsOf = (row: ArtifactRow): number =>
  row.kind === "component" && "path" in row.source
    ? (canvasOf(row.source.path ?? "").spec.directions?.length ?? 0)
    : 0;

/** The doc's `state`, read as entries. */
/**
 * An artifact's choices as everything reads them: its doc's `state`, and a
 * component's tuned timing (the doc's `tuned` map, core tuned.ts) as the one
 * `tuned` entry, so it goes with a Send as a pick does (a value he is
 * trying out, never an answer by itself: core `answersIn`).
 */
export const stateOf = (doc: Doc): Record<string, ChoiceEntry> => {
  const state = Object.fromEntries(doc.getMap<ChoiceEntry>("state").entries());
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

/** What the lane reads of an artifact's holder: whether it is over for good, and its harness and machine. */
export type HolderRead = Pick<
  ArtifactSessions,
  "ended" | "harness" | "machineId"
>;

/**
 * What one read of Needs you's lane read of a session: as the holder of an
 * artifact in it, its {@link HolderRead}; as the writer of one's ask, its
 * plan's steps (needs.ts `planHolds`).
 */
export interface SessionRead {
  holder?: HolderRead;
  steps?: readonly KeptStep[];
}

/** What createFacts reads of the artifact service: its deps, and the service's parts it calls, each read when called. */
export interface FactsContext {
  choicesAsked: (row: ArtifactRow) => { card?: DecisionCard; id: string }[];
  db: ArtifactServiceDeps["db"];
  deps: ArtifactServiceDeps;
  docs: ArtifactServiceDeps["docs"];
  holder: (row: ArtifactRow) => InstanceRow | undefined;
  programOf: (row: ArtifactRow) => string | undefined;
}

/**
 * What an artifact's doc and row say for Needs you and the session lists,
 * read once per change of what they are read from, and the caches that
 * hold them. A person's update to the doc (sync.ts) asks for them twice
 * (lane.ts `artifactMoved`, service `answersMoved`): one that writes none
 * of their parts reads the kept ones, and one that does reads its pins off
 * the doc's kept pins (docs.ts `pins`), each read again only once touched,
 * so neither walks the doc.
 */
export const createFacts = (ctx: FactsContext) => {
  const { choicesAsked, db, deps, docs, holder, programOf } = ctx;

  /* ── Needs you (needs.ts) ───────────────────────────────────────────── */

  /** Each artifact's facts as last read, with the row's marks they were read at. */
  const factsKept = new Map<string, { facts: ArtifactFacts; mark: string }>();
  /**
   * What a change of the facts' sources moves: past it, they are read
   * again. Of the doc, the parts they are read from (its facts stamp,
   * docs.ts `factsStamp`): ink, a canvas's elements, files or requests move
   * none. Of the row, every field but the two each doc update moves
   * (`seq`, `updatedAt`, db/artifacts.ts `append`). A page's files move
   * with a revision, whose stamp of the doc's meta follows them
   * (service `stampMeta`).
   */
  const factsMark = (row: ArtifactRow): string => {
    const { seq: _seq, updatedAt: _updatedAt, ...written } = row;
    return `${docs.factsStamp(row.id)}:${JSON.stringify(written)}`;
  };
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
   * doc; `put` whether it is put to the person at all (needs.ts `asks`).
   * Needs you reads them with it set and its own rules gating (needs.ts),
   * `open_items` with it read here.
   */
  const questionsFrom = (
    row: ArtifactRow,
    doc: Doc,
    pins: readonly Pin[],
    put: { asked: boolean }
  ): Question[] =>
    questionsOf({
      artifact: { id: row.id, name: row.name, title: row.title, ask: row.ask },
      ...put,
      cards: choicesAsked(row),
      judged: row.does === "judge" && directionsOf(row) >= 2,
      media: row.kind === "page" ? mediaCards(row) : new Map(),
      pins,
      // His answers alone: a dial he moves answers nothing.
      state: answersIn(stateOf(doc)),
      closes: closesOf(doc),
    });
  /** An artifact's questions counted (a page's cards, a design graph's pick), its first open card, and whether a design graph's pick has its answer (needs.ts). */
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
    const answers = answersIn(state);
    const { sentAt } = metaOf(doc);
    const pins = pinsToTell(docs.pins(row.id).values()).sort(
      (a, b) => a.number - b.number
    );
    const questions = questionsFrom(row, doc, pins, { asked: true });
    const facts: ArtifactFacts = {
      ...answersFacts(questions),
      asked: meta.get("asked") ?? null,
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
      reading: meta.get("reading") === true,
      unsent: unsentChoices(state, sentAt),
      unsentAnswers: unsentChoices(answers, sentAt),
      verifier: isVerifierParent(
        deps.instance(row.madeBy ?? row.instanceId ?? "")?.parentInstanceId
      ),
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
  /** What the lane reads of artifact holder `id` (rule 4): whether it is over for good, and where it runs. */
  const heldOf = (id: string): HolderRead => {
    const owner = deps.instance(id);
    return {
      ended: !owner || deps.finished(owner),
      harness: owner?.harness ?? null,
      machineId: owner?.machineId ?? null,
    };
  };
  /**
   * {@link sessionsOf} for one read of the lane (Needs you): each holder,
   * plan and project read once however many artifacts name it, and what was
   * read of each session kept in `sessions` (its end as a holder, its steps
   * as a writer), so the lane reads again only when one of them reads
   * otherwise ({@link readsOtherwise}; lane.ts `sessionsMoved`). Whether a
   * holder is over for good (server.ts `overForGood`) is most of a lane's
   * read: per artifact, it was 1.4 of 2.0 s of obelisk's start profile on
   * 2026-11-19. With `kept`, a session's part it holds is taken from it,
   * not read: one artifact read again against the lane's last read
   * (service `laneMoved`), `fresh` saying whether anything was read anew.
   */
  const sessionsReader = (kept?: ReadonlyMap<string, SessionRead>) => {
    const sessions = new Map<string, SessionRead>();
    let fresh = false;
    const entry = (id: string): SessionRead => {
      const held = sessions.get(id) ?? {};
      sessions.set(id, held);
      return held;
    };
    const holderRead = (id: string): HolderRead => {
      const read = entry(id);
      const was = kept?.get(id)?.holder;
      if (!read.holder) {
        fresh ||= was === undefined;
        read.holder = was ?? heldOf(id);
      }
      return read.holder;
    };
    const steps = (writer: string): readonly KeptStep[] => {
      const read = entry(writer);
      const was = kept?.get(writer)?.steps;
      if (!read.steps) {
        fresh ||= was === undefined;
        read.steps = was ?? deps.steps(writer);
      }
      return read.steps;
    };
    const setUp = new Map<string, boolean>();
    const setUpOf = (project: string): boolean => {
      const held = setUp.get(project) ?? deps.setUp(project);
      setUp.set(project, held);
      return held;
    };
    return {
      /** Whether a part of a session was read here that `kept` did not hold. */
      fresh: () => fresh,
      sessions,
      of: (row: ArtifactRow, facts: ArtifactFacts): ArtifactSessions => {
        const writer = askOf(row, facts)?.by;
        const project = boardOf(row);
        return {
          ...(row.instanceId === null
            ? { ended: true, harness: null, machineId: null }
            : holderRead(row.instanceId)),
          setUp: project !== null && setUpOf(project),
          steps: writer ? steps(writer) : [],
        };
      },
    };
  };
  /**
   * Whether session `id` reads otherwise now than `was`, what the lane's
   * last read read of it: its end or place as a holder, its steps as a
   * writer. A row written for anything else (a turn's tokens, its last
   * request, its title) moves nothing the lane reads.
   */
  const readsOtherwise = (id: string, was: SessionRead): boolean =>
    (was.holder !== undefined && !Bun.deepEquals(heldOf(id), was.holder)) ||
    (was.steps !== undefined && !Bun.deepEquals(deps.steps(id), was.steps));
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
    readsOtherwise,
    sessionsOf,
    sessionsReader,
    withMedia,
  };
};
