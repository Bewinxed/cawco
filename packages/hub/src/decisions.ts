/**
 * A project's decision pages, as the project page's Decisions tab reads and
 * acts on them (Projects spec §5.8; core decisions.ts for the shapes).
 *
 * - **The pages** are the folder's `decisions/<name>/` with a program or a
 *   built page, and the project's page artifacts, by name; the newest
 *   artifact of a name is the page. A program's cards are its Decision
 *   statements (core `readProgram`); an HTML page's (one whose pick the
 *   person places or operates) are read from the built page as the kit
 *   draws them (RECIPES.md: `article.dp-card`, its `h2`, `.dp-why`, its
 *   `[data-cawco-choice]` and their `[data-option]`s). So the record holds
 *   what the person saw and to-tasks needs no page definitions of its own.
 * - **A send** (I'm done picking, a comment) goes to the session that wrote
 *   the page, as its own Send does (artifacts/service.ts `send`), which
 *   revives a session at rest; when that session was ended, Caw is woken
 *   with it in a thread of the project, and reads the picks himself (a
 *   project's lead reads every page of his project).
 * - **Make tasks** writes `record.json` and `log.md` in one commit, then
 *   asks the same session (or Caw) to run to-tasks over them, each task
 *   carrying `decided: <page>#<card>`. A refusal to ask takes the record
 *   back out, so the page stands as it was.
 * - **The record keeps its tasks**: whenever the project's tasks change, a
 *   record whose cards' tasks moved is written again with them.
 * - **The graph** is derived from the programs on every read: each
 *   decision a card, an edge from each decision its `after` names
 *   (`page#card` across pages), a frame per Section. The writer edits the
 *   program (artifact_update's statements); the person's drags are theirs,
 *   kept in each page's artifact state under `graph.places` by card id, so
 *   they outlive revisions; a card with no place is laid out by its depth.
 */
import {
  type ChoiceEntry,
  ENDED_STATUSES,
  type InstanceRow,
} from "@cawco/core";
import {
  DECIDED_FIELD,
  type DecisionCard,
  type DecisionGraph,
  type DecisionOption,
  type DecisionPageRead,
  type DecisionPageSummary,
  type DecisionRecord,
  type DecisionSent,
  type DecisionState,
  type DecisionsList,
  type DecisionWriter,
  decidedOf,
  type GraphCard,
  type GraphPlace,
  graphId,
  logOf,
  PLACES_KEY,
  type RecordCard,
} from "@cawco/core/decisions";
import { AFTER_REF } from "@cawco/core/decisions-library";
import { Elysia, status, t } from "elysia";
import type { ArtifactRow } from "./db/artifacts";
import { PROGRAM_FILE, readKept } from "./decision-program";
import { boardTitle } from "./labels";

export class DecisionRefusal extends Error {
  readonly status: 400 | 404 | 409 | 422 | 503;
  constructor(
    code: 400 | 404 | 409 | 422 | 503,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.status = code;
  }
}

const NAME = /^[a-z0-9][a-z0-9-]{0,62}$/;

// --- the built page, read as the kit draws it ---------------------------------

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  middot: "·",
  times: "×",
  rarr: "→",
};
const ENTITY = /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi;
const SPACES = /\s+/g;

/** Text as the page shows it: its entities read, its runs of space one space. */
const shown = (raw: string): string =>
  raw
    .replace(ENTITY, (whole, name: string) => {
      if (name.startsWith("#x") || name.startsWith("#X")) {
        return String.fromCodePoint(Number.parseInt(name.slice(2), 16));
      }
      if (name.startsWith("#")) {
        return String.fromCodePoint(Number(name.slice(1)));
      }
      return ENTITIES[name.toLowerCase()] ?? whole;
    })
    .replace(SPACES, " ")
    .trim();

const MOCKUP_CLASS = /(?:^|\s)mk-([a-z0-9-]+)(?:\s|$)/;
const RECOMMENDED = /recommended/i;

/** What a page says of itself: its title and its cards, in page order, and a program's Sections. */
export interface ReadPage {
  cards: DecisionCard[];
  /** Its Sections, by id, with their titles; none on an HTML page. */
  sections?: { id: string; title: string }[];
  title: string;
}

interface OpenArticle {
  mockup: string | null;
  question: string;
  why: string;
}

interface OpenOption {
  label: string;
  line: string;
  option: DecisionOption;
}

/**
 * A built decision page's title and cards. A card is a choice group
 * (`[data-cawco-choice]` with options): its question and why are its
 * article's, its options labelled by their `<b>`, their first plain
 * `<span>` and a `.dp-tag` saying Recommended. A choice group outside an
 * article is named by its `aria-label`.
 */
export const readPage = async (html: string): Promise<ReadPage> => {
  let title = "";
  let docTitle = "";
  const cards: DecisionCard[] = [];
  let article: OpenArticle | null = null;
  let card: DecisionCard | null = null;
  let option: OpenOption | null = null;
  let span: { tag: boolean; text: string } | null = null;
  const closeOption = () => {
    if (option && card) {
      option.option.label = shown(option.label) || option.option.id;
      option.option.line = shown(option.line);
      card.options.push(option.option);
    }
    option = null;
  };
  // biome-ignore lint/correctness/noUndeclaredVariables: HTMLRewriter is Bun's own global (bun-types)
  await new HTMLRewriter()
    .on("title", {
      text(chunk) {
        docTitle += chunk.text;
      },
    })
    .on(".dp-hero h1", {
      text(chunk) {
        title += chunk.text;
      },
    })
    .on("article.dp-card", {
      element(element) {
        article = { question: "", why: "", mockup: null };
        element.onEndTag(() => {
          article = null;
        });
      },
    })
    .on("article.dp-card h2", {
      text(chunk) {
        if (article) {
          article.question += chunk.text;
        }
      },
    })
    .on("article.dp-card .dp-why", {
      text(chunk) {
        if (article) {
          article.why += chunk.text;
        }
      },
    })
    .on("article.dp-card .mk", {
      element(element) {
        const found = MOCKUP_CLASS.exec(element.getAttribute("class") ?? "");
        if (article && found && !article.mockup) {
          article.mockup = found[1];
        }
      },
    })
    .on("[data-cawco-choice]", {
      element(element) {
        const id = element.getAttribute("data-cawco-choice")?.trim();
        if (!id) {
          return;
        }
        const open: OpenArticle | null = article;
        const next: DecisionCard = {
          id,
          question:
            shown(open?.question ?? "") ||
            shown(element.getAttribute("aria-label") ?? "") ||
            id,
          why: shown(open?.why ?? ""),
          multiple: element.hasAttribute("data-cawco-multiple"),
          mockup: open?.mockup ?? null,
          options: [],
          after: [],
          section: null,
        };
        card = next;
        element.onEndTag(() => {
          closeOption();
          if (
            next.options.length > 0 &&
            !cards.some((each) => each.id === next.id)
          ) {
            cards.push(next);
          }
          card = null;
        });
      },
    })
    .on("[data-cawco-choice] [data-option]", {
      element(element) {
        const id = element.getAttribute("data-option")?.trim();
        if (!(card && id)) {
          return;
        }
        closeOption();
        option = {
          label: "",
          line: "",
          option: {
            id,
            keycap: card.options.length + 1,
            label: "",
            line: "",
            cost: "",
            recommended: false,
          },
        };
        element.onEndTag(() => closeOption());
      },
    })
    .on("[data-cawco-choice] [data-option] b", {
      text(chunk) {
        if (option) {
          option.label += chunk.text;
        }
      },
    })
    .on("[data-cawco-choice] [data-option] span", {
      element(element) {
        const tag = (element.getAttribute("class") ?? "").includes("dp-tag");
        const open = { tag, text: "" };
        span = open;
        element.onEndTag(() => {
          if (option) {
            if (open.tag) {
              option.option.recommended ||= RECOMMENDED.test(open.text);
            } else if (!option.line) {
              option.line = open.text;
            }
          }
          span = null;
        });
      },
      text(chunk) {
        if (span) {
          span.text += chunk.text;
        }
      },
    })
    .transform(new Response(html))
    .text();
  return { title: shown(title) || shown(docTitle), cards };
};

// --- the module ------------------------------------------------------------------

/** What a project's page needs of its artifact. */
interface PageArtifact {
  meta: { sentAt: string | null; sentText: string | null };
  row: ArtifactRow;
  state: Record<string, ChoiceEntry>;
}

/** One task as the record reads it: its id, its title and the card it names. */
interface DecidedTask {
  card: string;
  id: string;
  page: string;
  title: string;
}

export interface DecisionsDeps {
  /** The page artifacts of a project, newest first. */
  artifacts: (projectId: string) => ArtifactRow[];
  /** A page artifact's built HTML, as the hub keeps it; undefined when its file is gone. */
  builtPage: (artifactId: string) => Promise<string | undefined>;
  /** Broadcasts that a project's decision pages changed. */
  changed: (projectId: string) => void;
  /** Writes and deletes files of the project's folder in one commit, as the operator. */
  commit: (
    projectId: string,
    change: {
      deletes: string[];
      writes: { content: string; path: string }[];
    },
    message: string
  ) => Promise<void>;
  /** The names of the entries in one folder of the project's. */
  folderNames: (projectId: string, path: string) => Promise<string[]>;
  /** A project's folder file, or undefined when it is not there. */
  folderText: (projectId: string, path: string) => Promise<string | undefined>;
  instance: (id: string) => InstanceRow | undefined;
  /** An artifact's doc as the page reads it: its picks and its last send. */
  page: (artifactId: string) => {
    meta: PageArtifact["meta"];
    state: Record<string, ChoiceEntry>;
  };
  /** Keeps the person's places of a page's cards on the graph in its artifact's state, by card id. */
  place: (artifactId: string, places: Record<string, GraphPlace>) => void;
  /** A decision page artifact's program; undefined for an HTML page. */
  program: (artifactId: string) => string | undefined;
  /** Whether the project is the hub's. */
  projectExists: (projectId: string) => boolean;
  /** The person's Send on a session's artifact (artifacts/service.ts `send`). */
  send: (
    instanceId: string,
    artifactId: string,
    text: string | undefined
  ) => Promise<void>;
  /** Stamps a page's send when Caw took it in place of its ended session. */
  stampSent: (artifactId: string, text: string | undefined) => void;
  /** The project's tasks that name a card ({@link DECIDED_FIELD}). */
  tasks: (projectId: string) => Promise<DecidedTask[]>;
  /** The person's own words to a session, through the one send path. */
  tell: (instance: InstanceRow, text: string) => void;
  /** Whether Caw's turn is on a thread now. */
  threadWorking: (threadId: string) => boolean;
  /** Wakes the project's Caw with the person's words, in a new thread; its id. */
  wakeCaw: (projectId: string, text: string) => Promise<string>;
  /** Whether a session is on a turn now. */
  working: (instance: InstanceRow) => boolean;
}

/** The record as written: what the hub reads back, with who it asked. */
interface StoredRecord extends DecisionRecord {
  /** The thread Caw was asked in, when Caw was asked. */
  askedIn?: string | null;
}

const recordPath = (name: string) => `decisions/${name}/record.json`;
const logPath = (name: string) => `decisions/${name}/log.md`;
const builtPath = (name: string) => `decisions/${name}/index.html`;
const programPath = (name: string) => `decisions/${name}/${PROGRAM_FILE}`;

/**
 * Where a card with no place of the person's stands: a column per depth
 * along its `after`s, its row its place among that depth's cards, a step
 * apart that clears the graph view's card (148 × 56, DecisionGraph.svelte)
 * and a Section's frame round it.
 */
const STEP = { x: 220, y: 104 };

/** The person's places of a page's cards, as its state keeps them. */
const placesIn = (
  state: Record<string, ChoiceEntry>
): Record<string, GraphPlace> => {
  const value = (state[PLACES_KEY] as ChoiceEntry | undefined)?.value;
  if (!value || typeof value !== "object") {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, Partial<GraphPlace>>).filter(
      (entry): entry is [string, GraphPlace] =>
        Number.isFinite(entry[1]?.x) && Number.isFinite(entry[1]?.y)
    )
  );
};

/** A page's picks and notes, the person's graph places not among them. */
const responses = (state: Record<string, ChoiceEntry>): ChoiceEntry[] =>
  Object.entries(state)
    .filter(([key]) => key !== PLACES_KEY)
    .map(([, entry]) => entry);

const isRecord = (value: unknown): value is StoredRecord =>
  !!value &&
  typeof value === "object" &&
  Array.isArray((value as StoredRecord).cards) &&
  typeof (value as StoredRecord).name === "string";

/** The record file's text: two-space JSON on a final newline, as a repository keeps it. */
const recordText = (record: StoredRecord): string =>
  `${JSON.stringify(record, null, 2)}\n`;

/** A dials panel named as a card, its values in order, each as written. */
const dialsOf = (
  state: Record<string, ChoiceEntry>,
  card: string
): [string, string][] => {
  const panels = (state.dials as ChoiceEntry | undefined)?.value;
  if (!panels || typeof panels !== "object") {
    return [];
  }
  const panel = (panels as Record<string, unknown>)[card];
  if (!panel || typeof panel !== "object") {
    return [];
  }
  return Object.entries(panel as Record<string, unknown>).map(
    ([key, value]) => [
      key,
      typeof value === "string" ? value : JSON.stringify(value),
    ]
  );
};

/**
 * The still of a card's mockup in its chosen state, by the mockup's built
 * output. A mockup takes no pick today (CONTRACT.md), so there is none; the
 * one place a bake that draws the chosen state fills.
 */
const stillOf = (_name: string, _mockup: string | null): string | null => null;

/** A page as the graph reads it: its cards and Sections, its picks, and the person's places. */
interface GraphPage {
  cards: DecisionCard[];
  name: string;
  places: Record<string, GraphPlace>;
  sections: { id: string; title: string }[];
  state: Record<string, ChoiceEntry>;
}

/** Every `after` as an edge, from the decision depended on; one naming no decision of the project goes to `problems`. */
const edgesOf = (
  pages: GraphPage[],
  problems: string[]
): [string, string][] => {
  const ids = new Set(
    pages.flatMap((page) =>
      page.cards.map((card) => graphId(page.name, card.id))
    )
  );
  const edges: [string, string][] = [];
  for (const page of pages) {
    for (const card of page.cards) {
      for (const ref of card.after) {
        const found = AFTER_REF.exec(ref);
        const from = found
          ? graphId(found[1] ?? page.name, found[2] ?? "")
          : ref;
        if (ids.has(from)) {
          edges.push([from, graphId(page.name, card.id)]);
        } else {
          problems.push(
            `${page.name}#${card.id} comes after ${ref}, which no decision page of this project has.`
          );
        }
      }
    }
  }
  return edges;
};

/** Each card's depth along the edges: one more than the deepest it comes after; a cycle stops at 0. */
const depthsOf = (edges: [string, string][]): ((id: string) => number) => {
  const into = new Map<string, string[]>();
  for (const [from, to] of edges) {
    into.set(to, [...(into.get(to) ?? []), from]);
  }
  const depth = new Map<string, number>();
  const depthOf = (id: string, path: Set<string>): number => {
    const known = depth.get(id);
    if (known !== undefined) {
      return known;
    }
    if (path.has(id)) {
      return 0;
    }
    path.add(id);
    const deepest = Math.max(
      -1,
      ...(into.get(id) ?? []).map((from) => depthOf(from, path))
    );
    path.delete(id);
    depth.set(id, deepest + 1);
    return deepest + 1;
  };
  return (id) => depthOf(id, new Set());
};

/** Every card where the person put it, else in its depth's column, one row after the last there. */
const placedCards = (
  pages: GraphPage[],
  edges: [string, string][]
): GraphCard[] => {
  const columnOf = depthsOf(edges);
  const rows = new Map<number, number>();
  return pages.flatMap((page) =>
    page.cards.map((card) => {
      const id = graphId(page.name, card.id);
      const column = columnOf(id);
      const row = rows.get(column) ?? 0;
      rows.set(column, row + 1);
      const placed = page.places[card.id];
      return {
        id,
        card: card.id,
        page: page.name,
        name: card.question || card.id,
        picked: (page.state[card.id]?.options ?? []).length > 0,
        x: placed?.x ?? column * STEP.x,
        y: placed?.y ?? row * STEP.y,
      };
    })
  );
};

/** A page's Sections as frames round their cards. */
const groupsOf = (page: GraphPage) => {
  const members = new Map<string, string[]>();
  for (const card of page.cards) {
    if (card.section) {
      members.set(card.section, [
        ...(members.get(card.section) ?? []),
        graphId(page.name, card.id),
      ]);
    }
  }
  const titles = new Map(page.sections.map((each) => [each.id, each.title]));
  return [...members].map(([section, cards]) => ({
    id: graphId(page.name, section),
    name: titles.get(section) ?? section,
    cards,
  }));
};

/** A page's own file in the folder: its program, else its built HTML; undefined when it has neither. */
const keptIn = async (
  folderText: DecisionsDeps["folderText"],
  projectId: string,
  name: string
): Promise<string | undefined> =>
  (await folderText(projectId, programPath(name))) ??
  (await folderText(projectId, builtPath(name)));

/**
 * A page's decisions form a graph: one names another in `after`, or stands
 * in a Section. The one rule for the list's `graph` and the project row's
 * `decisionsGraphed`.
 */
const formsGraph = (
  cards: readonly { after: string[]; section: string | null }[]
) => cards.some((card) => card.after.length > 0 || card.section !== null);

/** A project's decisions as its row tells them: whether they form a graph, and how many pages the list holds. */
export interface DecisionsShape {
  graphed: boolean;
  pages: number;
}

export const createDecisions = (deps: DecisionsDeps) => {
  /**
   * Each project's decisions as last listed, their shape alone: whether they
   * form a graph and how many pages the list holds. What its row says before
   * the Decisions tab reads them (`decisionsGraphed`, `decisionPages`), so
   * the tab's skeleton stands where its list will.
   */
  const shapeBy = new Map<string, DecisionsShape>();

  const known = (projectId: string) => {
    if (!deps.projectExists(projectId)) {
      throw new DecisionRefusal(404, `The hub keeps no project ${projectId}.`);
    }
  };

  /** Each page name with its newest artifact, and the folder's built pages beside them. */
  const pageNames = async (
    projectId: string
  ): Promise<{ artifact: ArtifactRow | null; name: string }[]> => {
    const byName = new Map<string, ArtifactRow | null>();
    for (const row of deps.artifacts(projectId)) {
      if (!byName.has(row.name)) {
        byName.set(row.name, row);
      }
    }
    for (const name of await deps.folderNames(projectId, "decisions")) {
      if (NAME.test(name) && !byName.has(name)) {
        // biome-ignore lint/performance/noAwaitInLoops: a project holds a handful of pages; read one at a time
        const kept = await keptIn(deps.folderText, projectId, name);
        if (kept !== undefined) {
          byName.set(name, null);
        }
      }
    }
    return [...byName].map(([name, artifact]) => ({ name, artifact }));
  };

  const readRecord = async (
    projectId: string,
    name: string
  ): Promise<StoredRecord | null> => {
    const text = await deps.folderText(projectId, recordPath(name));
    if (text === undefined) {
      return null;
    }
    try {
      const parsed = JSON.parse(text) as unknown;
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  };

  const writerOf = (artifact: ArtifactRow | null): DecisionWriter | null => {
    const row = artifact ? deps.instance(artifact.instanceId) : undefined;
    return row
      ? {
          instanceId: row.id,
          title: boardTitle(row),
          ended: ENDED_STATUSES.has(row.status),
        }
      : null;
  };

  const making = (record: StoredRecord): boolean => {
    if (record.askedIn) {
      return deps.threadWorking(record.askedIn);
    }
    const asked = record.askedOf ? deps.instance(record.askedOf) : undefined;
    return !!asked && deps.working(asked);
  };

  const stateOf = (
    record: StoredRecord | null,
    page: PageArtifact | null
  ): DecisionState => {
    if (record) {
      return making(record) ? "making" : "decided";
    }
    const sentAt = page?.meta.sentAt;
    if (sentAt && !responses(page.state).some((entry) => entry.at > sentAt)) {
      return "sent";
    }
    return "picking";
  };

  /**
   * A page's title and cards: its program's (the artifact's, else the
   * folder's page.oui), or an HTML page's read from its built page.
   */
  const pageOf = async (
    projectId: string,
    name: string,
    artifact: ArtifactRow | null
  ): Promise<ReadPage> => {
    const program =
      (artifact ? deps.program(artifact.id) : undefined) ??
      (artifact?.kind === "page" && (await deps.builtPage(artifact.id))
        ? undefined
        : await deps.folderText(projectId, programPath(name)));
    if (program !== undefined) {
      const { title, cards, sections } = readKept(program);
      return { title, cards, sections };
    }
    const html =
      (artifact ? await deps.builtPage(artifact.id) : undefined) ??
      (await deps.folderText(projectId, builtPath(name)));
    return html ? await readPage(html) : { title: name, cards: [] };
  };

  /** One page read whole: its program or built page, its doc, its record and its tasks. */
  const readOne = async (
    projectId: string,
    name: string,
    artifact: ArtifactRow | null,
    tasks: DecidedTask[]
  ): Promise<{ read: DecisionPageRead; page: ReadPage }> => {
    const page = await pageOf(projectId, name, artifact);
    const doc: PageArtifact | null = artifact
      ? { row: artifact, ...deps.page(artifact.id) }
      : null;
    const state = doc?.state ?? {};
    const record = await readRecord(projectId, name);
    const own = tasks.filter((task) => task.page === name);
    const read: DecisionPageRead = {
      name,
      title: page.title || name,
      artifactId: artifact?.id ?? null,
      writer: writerOf(artifact),
      cards: page.cards.length,
      picked: page.cards.filter(
        (card) => (state[card.id]?.options ?? []).length > 0
      ).length,
      notes: page.cards.filter((card) => state[card.id]?.note?.trim()).length,
      decided:
        record?.cards.filter((card) => card.chosen.length > 0).length ?? 0,
      tasks: own.length,
      state: stateOf(record, doc),
      updatedAt: artifact?.updatedAt.getTime() ?? 0,
      sentAt: doc?.meta.sentAt ?? null,
      record: record ? withTasks(record, own) : null,
    };
    return { read, page };
  };

  /**
   * Whether a page is a decision page: its built page has cards (the kit's
   * choice groups, {@link readPage}), or a record was made from it. A page
   * artifact without them, a design system's Foundations specimen
   * ("Caw&Co foundations", nightly 3944), is no decision: it is not listed,
   * read, sent on, or a session's open question.
   */
  const decisionPage = (page: ReadPage, record: unknown): boolean =>
    page.cards.length > 0 || record !== null;

  /** A record with each card's tasks as the task list has them now. */
  const withTasks = (
    record: StoredRecord,
    tasks: DecidedTask[]
  ): DecisionRecord => ({
    name: record.name,
    title: record.title,
    madeAt: record.madeAt,
    askedOf: record.askedOf,
    cards: record.cards.map((card) => ({
      ...card,
      tasks: tasks
        .filter((task) => task.card === card.id)
        .map((task) => task.id),
    })),
  });

  const find = async (projectId: string, name: string) => {
    known(projectId);
    if (!NAME.test(name)) {
      throw new DecisionRefusal(400, `${JSON.stringify(name)} names no page.`);
    }
    const found = (await pageNames(projectId)).find(
      (page) => page.name === name
    );
    const one = found
      ? await readOne(
          projectId,
          name,
          found.artifact,
          await deps.tasks(projectId)
        )
      : undefined;
    if (!(one && decisionPage(one.page, one.read.record))) {
      throw new DecisionRefusal(
        404,
        `This project has no decision page ${name}.`
      );
    }
    return one;
  };

  /** Who hears a page's send or its Make tasks: its session while it stands, else Caw. */
  const heardBy = (
    read: DecisionPageRead
  ): { instance: InstanceRow } | { caw: true } => {
    const instance = read.writer
      ? deps.instance(read.writer.instanceId)
      : undefined;
    return instance && !ENDED_STATUSES.has(instance.status)
      ? { instance }
      : { caw: true };
  };

  /** What tells Caw a page is his now: where it is and how to read it. */
  const handedToCaw = (read: DecisionPageRead): string =>
    `${read.writer ? `Its session “${read.writer.title}” has ended, so this page is yours` : "No session holds this page now, so it is yours"}: read my picks and notes with artifact_read({ id: "${read.artifactId}" }).`;

  let syncing = Promise.resolve();
  /** Records whose cards' tasks moved, written again with them (and their log). */
  const syncRecords = async (projectId: string): Promise<void> => {
    const tasks = await deps.tasks(projectId);
    const titles = Object.fromEntries(
      tasks.map((task) => [task.id, task.title])
    );
    const writes: { content: string; path: string }[] = [];
    for (const name of await deps.folderNames(projectId, "decisions")) {
      if (!NAME.test(name)) {
        continue;
      }
      // biome-ignore lint/performance/noAwaitInLoops: a project holds a handful of pages; read one at a time
      const record = await readRecord(projectId, name);
      if (!record) {
        continue;
      }
      const next = {
        ...record,
        ...withTasks(
          record,
          tasks.filter((task) => task.page === name)
        ),
      };
      if (JSON.stringify(next.cards) !== JSON.stringify(record.cards)) {
        writes.push(
          { path: recordPath(name), content: recordText(next) },
          { path: logPath(name), content: logOf(next, titles) }
        );
      }
    }
    if (writes.length > 0) {
      await deps.commit(
        projectId,
        { writes, deletes: [] },
        "decisions: the record keeps its tasks"
      );
      deps.changed(projectId);
    }
  };

  return {
    /** The project's pages, newest first, and whether its decisions form a graph. */
    async list(projectId: string): Promise<DecisionsList> {
      known(projectId);
      const [names, tasks] = await Promise.all([
        pageNames(projectId),
        deps.tasks(projectId),
      ]);
      const problems: string[] = [];
      const pages: DecisionPageSummary[] = [];
      let graph = false;
      for (const { name, artifact } of names) {
        try {
          // biome-ignore lint/performance/noAwaitInLoops: one page's files at a time keeps the folder's reads small
          const { read, page } = await readOne(
            projectId,
            name,
            artifact,
            tasks
          );
          if (!decisionPage(page, read.record)) {
            continue;
          }
          graph ||= formsGraph(page.cards);
          const { record: _record, sentAt: _sentAt, ...summary } = read;
          pages.push(summary);
        } catch (error) {
          problems.push(
            `decisions/${name}/ did not read: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
      pages.sort((a, b) => b.updatedAt - a.updatedAt);
      shapeBy.set(projectId, { graphed: graph, pages: pages.length });
      return { pages, graph, problems };
    },

    /**
     * The project's decisions' shape, as its last list said; else read now
     * from its pages' cards and records alone (no tasks), by the list's own
     * rules (`formsGraph`, `decisionPage`). A page that does not read counts
     * for nothing, as in the list.
     */
    async shape(projectId: string): Promise<DecisionsShape> {
      const kept = shapeBy.get(projectId);
      if (kept) {
        return kept;
      }
      if (!deps.projectExists(projectId)) {
        return { graphed: false, pages: 0 };
      }
      const shape: DecisionsShape = { graphed: false, pages: 0 };
      for (const { name, artifact } of await pageNames(projectId)) {
        try {
          // biome-ignore lint/performance/noAwaitInLoops: one page's program and record at a time keeps the folder's reads small
          const page = await pageOf(projectId, name, artifact);
          if (decisionPage(page, await readRecord(projectId, name))) {
            shape.pages += 1;
            shape.graphed ||= formsGraph(page.cards);
          }
        } catch {
          // A page that does not read is not in the list either.
        }
      }
      shapeBy.set(projectId, shape);
      return shape;
    },

    /** Its decisions changed: the next row reads them again. */
    forget(projectId: string): void {
      shapeBy.delete(projectId);
    },

    /** One page: its summary, its record (each card's tasks as filed now) and its last send. */
    async read(projectId: string, name: string): Promise<DecisionPageRead> {
      return (await find(projectId, name)).read;
    },

    /**
     * The pages `instanceId` wrote that are not decided yet, newest first,
     * each with its cards as the person sees them: a session's open
     * questions to the person, for its open items (open-items.ts).
     */
    async undecidedBy(
      projectId: string,
      instanceId: string
    ): Promise<{ cards: DecisionCard[]; read: DecisionPageRead }[]> {
      known(projectId);
      const [names, tasks] = await Promise.all([
        pageNames(projectId),
        deps.tasks(projectId),
      ]);
      const pages: { cards: DecisionCard[]; read: DecisionPageRead }[] = [];
      for (const { name, artifact } of names) {
        if (artifact && writerOf(artifact)?.instanceId !== instanceId) {
          continue;
        }
        // biome-ignore lint/performance/noAwaitInLoops: one page's files at a time keeps the folder's reads small
        const { read, page } = await readOne(projectId, name, artifact, tasks);
        if (
          read.writer?.instanceId === instanceId &&
          read.state !== "decided" &&
          decisionPage(page, read.record)
        ) {
          pages.push({ read, cards: page.cards });
        }
      }
      return pages.sort((a, b) => b.read.updatedAt - a.read.updatedAt);
    },

    /**
     * The person's send on a page: I'm done picking (no words) or a comment.
     * Its session hears it as from its own panel; an ended one's goes to Caw.
     */
    async send(
      projectId: string,
      name: string,
      text: string | undefined
    ): Promise<DecisionSent> {
      const { read } = await find(projectId, name);
      if (!read.artifactId) {
        throw new DecisionRefusal(
          409,
          `${read.title} has no artifact on this hub to send on; its session can publish it again.`
        );
      }
      const words = text?.trim() || undefined;
      const to = heardBy(read);
      if ("instance" in to) {
        await deps.send(to.instance.id, read.artifactId, words);
        deps.changed(projectId);
        return { to: "session" };
      }
      const said = words
        ? `On the decision page “${read.title}” (decisions/${name}/) I wrote: ${words}`
        : `I'm done picking on the decision page “${read.title}” (decisions/${name}/).`;
      const threadId = await deps.wakeCaw(
        projectId,
        `${said}\n\n${handedToCaw(read)}`
      );
      deps.stampSent(read.artifactId, words);
      deps.changed(projectId);
      return { to: "caw", threadId };
    },

    /**
     * Make tasks: the record and its log written in one commit, then its
     * session (or Caw) asked to run to-tasks over them. A refused ask takes
     * the record back out and is thrown on.
     */
    async makeTasks(
      projectId: string,
      name: string
    ): Promise<DecisionPageRead> {
      const { read, page } = await find(projectId, name);
      if (read.record) {
        throw new DecisionRefusal(409, `${read.title} has its tasks already.`);
      }
      if (!read.artifactId) {
        throw new DecisionRefusal(
          409,
          `${read.title} has no artifact on this hub, so its picks can't be read.`
        );
      }
      const { state } = deps.page(read.artifactId);
      const cards: RecordCard[] = page.cards.map((card) => ({
        id: card.id,
        question: card.question,
        why: card.why,
        options: card.options,
        chosen: (state[card.id]?.options ?? []).filter((id) =>
          card.options.some((option) => option.id === id)
        ),
        dials: dialsOf(state, card.id),
        note: state[card.id]?.note?.trim() ?? "",
        tasks: [],
        mockup: card.mockup,
        still: stillOf(name, card.mockup),
      }));
      const to = heardBy(read);
      const record: StoredRecord = {
        name,
        title: read.title,
        madeAt: new Date().toISOString(),
        askedOf: "instance" in to ? to.instance.id : null,
        cards,
      };
      const ask = `Make tasks from my picks on the decision page “${read.title}” (decisions/${name}/): load the to-tasks skill and file them now; pressing Make tasks approves the breakdown. ${
        "instance" in to
          ? `artifact_read({ id: "${read.artifactId}" }) has my picks and notes by card id.`
          : handedToCaw(read)
      } The record is decisions/${name}/record.json (each card's id, question, what I chose and my note), and log.md beside it says it in words. File one or more tasks for each card I decided and none for a card left open, and give each the field ${DECIDED_FIELD}: "${name}#<card id>" (task_create's fields), so it links back to its card.`;
      await deps.commit(
        projectId,
        {
          writes: [
            { path: recordPath(name), content: recordText(record) },
            { path: logPath(name), content: logOf(record) },
          ],
          deletes: [],
        },
        `decisions: ${name} decided`
      );
      const refused = await (async () => {
        try {
          if ("instance" in to) {
            deps.tell(to.instance, ask);
            return null;
          }
          const askedIn = await deps.wakeCaw(projectId, ask);
          await deps.commit(
            projectId,
            {
              writes: [
                {
                  path: recordPath(name),
                  content: recordText({ ...record, askedIn }),
                },
              ],
              deletes: [],
            },
            `decisions: ${name} asked of Caw`
          );
          return null;
        } catch (error) {
          return { error };
        }
      })();
      if (refused) {
        await deps.commit(
          projectId,
          { writes: [], deletes: [recordPath(name), logPath(name)] },
          `decisions: ${name}'s tasks were not asked for`
        );
        const { error } = refused;
        throw new DecisionRefusal(
          503,
          `Couldn't make tasks: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error }
        );
      }
      deps.changed(projectId);
      return (await find(projectId, name)).read;
    },

    /**
     * The graph, derived from the project's pages now: a card per decision
     * of each page whose artifact the hub holds (a page whose artifact is
     * gone is named in `problems`), edges from each `after`, a frame per
     * Section, each card where the person put it or laid out by its depth.
     * Null when no decision names another or stands in a Section.
     */
    async graph(projectId: string): Promise<DecisionGraph | null> {
      known(projectId);
      const problems: string[] = [];
      const pages: GraphPage[] = [];
      for (const { name, artifact } of await pageNames(projectId)) {
        // biome-ignore lint/performance/noAwaitInLoops: one page's files at a time keeps the folder's reads small
        const page = await pageOf(projectId, name, artifact);
        if (page.cards.length === 0) {
          continue;
        }
        if (!artifact) {
          problems.push(
            `decisions/${name}/ has no artifact on this hub, so its decisions are not on the graph; its session can publish it again.`
          );
          continue;
        }
        const { state } = deps.page(artifact.id);
        pages.push({
          name,
          cards: page.cards,
          sections: page.sections ?? [],
          state,
          places: placesIn(state),
        });
      }
      if (
        !pages.some((page) =>
          page.cards.some((card) => card.after.length > 0 || card.section)
        )
      ) {
        return null;
      }
      const edges = edgesOf(pages, problems);
      return {
        cards: placedCards(pages, edges),
        edges,
        groups: pages.flatMap(groupsOf),
        problems,
      };
    },

    /**
     * The person's drags: each card named by its graph id takes its new
     * place in its page's artifact state, beside the places it kept.
     */
    async place(
      projectId: string,
      places: { id: string; x: number; y: number }[]
    ): Promise<void> {
      known(projectId);
      const artifacts = new Map(
        (await pageNames(projectId)).flatMap(({ name, artifact }) =>
          artifact ? [[name, artifact] as const] : []
        )
      );
      const byPage = new Map<string, Record<string, GraphPlace>>();
      for (const place of places) {
        const at = place.id.indexOf("#");
        const page = place.id.slice(0, at);
        const card = place.id.slice(at + 1);
        if (at < 1 || !card || !artifacts.has(page)) {
          throw new DecisionRefusal(
            404,
            `${place.id} is no card of this project's decision pages.`
          );
        }
        byPage.set(page, {
          ...byPage.get(page),
          [card]: { x: Math.round(place.x), y: Math.round(place.y) },
        });
      }
      for (const [page, moved] of byPage) {
        const artifact = artifacts.get(page) as ArtifactRow;
        deps.place(artifact.id, {
          ...placesIn(deps.page(artifact.id).state),
          ...moved,
        });
      }
      deps.changed(projectId);
    },

    /** The project's tasks changed: records whose tasks moved are written again, one at a time. */
    tasksChanged(projectId: string): void {
      syncing = syncing
        .then(() => syncRecords(projectId))
        .catch((error: unknown) =>
          console.warn(
            `[decisions] ${projectId}: a record's tasks were not written: ${error instanceof Error ? error.message : String(error)}`
          )
        );
    },
  };
};

/** The tasks of a list that name a card, as the record reads them. */
export const decidedTasks = (
  tasks: { fields: Record<string, string>; id: string; title: string }[]
): DecidedTask[] =>
  tasks.flatMap((task) => {
    const named = decidedOf(task.fields[DECIDED_FIELD]);
    return named
      ? [{ id: task.id, title: task.title, page: named.page, card: named.card }]
      : [];
  });

export type Decisions = ReturnType<typeof createDecisions>;

const refused = (error: unknown) => {
  if (error instanceof DecisionRefusal) {
    return status(error.status, error.message);
  }
  throw error;
};

/** The Decisions tab's routes, under `/api/projects/:id/decisions`. */
export const decisionRoutes = (decisions: Decisions) =>
  new Elysia()
    .get("/api/projects/:id/decisions", async ({ params }) => {
      try {
        return await decisions.list(params.id);
      } catch (error) {
        return refused(error);
      }
    })
    .get("/api/projects/:id/decisions/graph", async ({ params }) => {
      try {
        return (
          (await decisions.graph(params.id)) ??
          status(
            404,
            "This project's decisions form no graph: none names another in after, or stands in a Section."
          )
        );
      } catch (error) {
        return refused(error);
      }
    })
    .put(
      "/api/projects/:id/decisions/graph",
      {
        body: t.Object({
          places: t.Array(
            t.Object({
              id: t.String({ minLength: 1, maxLength: 200 }),
              x: t.Number(),
              y: t.Number(),
            }),
            { maxItems: 500 }
          ),
        }),
      },
      async ({ params, body }) => {
        try {
          await decisions.place(params.id, body.places);
          return { placed: body.places.length };
        } catch (error) {
          return refused(error);
        }
      }
    )
    .get("/api/projects/:id/decisions/:name", async ({ params }) => {
      try {
        return await decisions.read(params.id, params.name);
      } catch (error) {
        return refused(error);
      }
    })
    .post(
      "/api/projects/:id/decisions/:name/send",
      {
        body: t.Object({
          text: t.Optional(t.String({ maxLength: 2000 })),
        }),
      },
      async ({ params, body }) => {
        try {
          return await decisions.send(params.id, params.name, body.text);
        } catch (error) {
          return refused(error);
        }
      }
    )
    .post("/api/projects/:id/decisions/:name/tasks", async ({ params }) => {
      try {
        return await decisions.makeTasks(params.id, params.name);
      } catch (error) {
        return refused(error);
      }
    });
