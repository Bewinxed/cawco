/**
 * A project's decision pages, as the project page's Decisions tab reads and
 * acts on them (Projects spec §5.8; core decisions.ts for the shapes).
 *
 * - **The pages** are the folder's `decisions/<name>/` with a built page and
 *   the project's page artifacts, by name; the newest artifact of a name is
 *   the page. Its cards are read from the built page as the kit draws them
 *   (RECIPES.md: `article.dp-card`, its `h2`, `.dp-why`, its
 *   `[data-cawco-choice]` and their `[data-option]`s), so the record holds
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
 * - **The graph** (`decisions/decisions.json`) is the person's drags and
 *   Caw's: he writes the file, or calls `decision_add` (a page's cards, each
 *   checked against the built page and placed on a new row under the rest),
 *   `decision_link` (edges between cards on it) and `decision_group` (a named
 *   frame round some of them). Each is one commit as Caw that keeps whatever
 *   else the file holds, the person's places included.
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
  GRAPH_FILE,
  type GraphCard,
  logOf,
  type RecordCard,
} from "@cawco/core/decisions";
import { Elysia, status, t } from "elysia";
import type { ArtifactRow } from "./db/artifacts";
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

/** What a built page says of itself: its title and its cards, in page order. */
export interface ReadPage {
  cards: DecisionCard[];
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
  /** Writes and deletes files of the project's folder in one commit, as the operator, or as Caw for his graph tools. */
  commit: (
    projectId: string,
    change: {
      deletes: string[];
      writes: { content: string; path: string }[];
    },
    message: string,
    by?: "caw"
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

/**
 * Where `decision_add` places new cards: rows of {@link ROW_CARDS} under the
 * lowest card, a step apart that clears the graph view's card (148 × 56,
 * DecisionGraph.svelte) and a group's frame round it.
 */
const STEP = { x: 188, y: 120 };
const ROW_CARDS = 4;
const GROUP_ID = /[^a-z0-9]+/g;
const EDGE_ENDS = /^-+|-+$/g;

/** The graph file as written: what a change keeps beside the cards, edges and groups it rewrites. */
type GraphFile = Record<string, unknown>;

/**
 * A page's card going onto the graph: its question, or null when the graph
 * has it already; refused when the page has no such card, or the graph has
 * that id from another page.
 */
const newCard = (
  onGraph: GraphCard[],
  page: string,
  card: string,
  cards: DecisionCard[]
): string | null => {
  const drawn = cards.find((each) => each.id === card);
  if (!drawn) {
    throw new DecisionRefusal(
      404,
      `decisions/${page}/ has no card ${card}; its cards are ${cards.map((each) => each.id).join(", ") || "none"}.`
    );
  }
  const there = onGraph.find((each) => each.id === card);
  if (there && there.page !== page) {
    throw new DecisionRefusal(
      409,
      `The graph has a card ${card} from decisions/${there.page}/ already, and cards are keyed by id.`
    );
  }
  return there ? null : drawn.question;
};

/** A list the file holds, or none when it holds something else there. */
const listed = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

const recordPath = (name: string) => `decisions/${name}/record.json`;
const logPath = (name: string) => `decisions/${name}/log.md`;
const builtPath = (name: string) => `decisions/${name}/index.html`;

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

export const createDecisions = (deps: DecisionsDeps) => {
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
        const built = await deps.folderText(projectId, builtPath(name));
        if (built !== undefined) {
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
    if (
      sentAt &&
      !Object.values(page.state).some((entry) => entry.at > sentAt)
    ) {
      return "sent";
    }
    return "picking";
  };

  /** One page read whole: its built page, its doc, its record and its tasks. */
  const readOne = async (
    projectId: string,
    name: string,
    artifact: ArtifactRow | null,
    tasks: DecidedTask[]
  ): Promise<{ read: DecisionPageRead; page: ReadPage }> => {
    const html =
      (artifact ? await deps.builtPage(artifact.id) : undefined) ??
      (await deps.folderText(projectId, builtPath(name)));
    const page = html ? await readPage(html) : { title: name, cards: [] };
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
  const decisionPage = (read: DecisionPageRead, page: ReadPage): boolean =>
    page.cards.length > 0 || read.record !== null;

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
    if (!(one && decisionPage(one.read, one.page))) {
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

  /** The graph file as it stands, and read; an empty one while the folder has none. */
  const graphFile = async (
    projectId: string
  ): Promise<{ file: GraphFile; graph: DecisionGraph }> => {
    known(projectId);
    const text = await deps.folderText(projectId, GRAPH_FILE);
    if (text === undefined) {
      return { file: {}, graph: { cards: [], edges: [], groups: [] } };
    }
    const graph = graphOf(text);
    const file = jsonOf(text);
    if (Array.isArray(file)) {
      throw new DecisionRefusal(
        422,
        `${GRAPH_FILE} is a list; Caw writes it as { cards, edges, groups }.`
      );
    }
    return { file: file as GraphFile, graph };
  };

  /** Caw's change to the graph: one commit as Caw, keeping what else the file holds. */
  const writeGraph = async (
    projectId: string,
    file: GraphFile,
    change: Partial<Record<keyof DecisionGraph, unknown[]>>,
    message: string
  ): Promise<void> => {
    await deps.commit(
      projectId,
      {
        writes: [
          {
            path: GRAPH_FILE,
            content: `${JSON.stringify({ ...file, ...change }, null, 2)}\n`,
          },
        ],
        deletes: [],
      },
      message,
      "caw"
    );
    deps.changed(projectId);
  };

  /** The ids named that are not cards on the graph, refused in one sentence. */
  const onGraph = (graph: DecisionGraph, ids: string[]): void => {
    const there = new Set(graph.cards.map((card) => card.id));
    const missing = [...new Set(ids)].filter((id) => !there.has(id));
    if (missing.length > 0) {
      throw new DecisionRefusal(
        404,
        `${missing.join(", ")} ${missing.length > 1 ? "are" : "is"} not on the graph; put ${missing.length > 1 ? "them" : "it"} there with decision_add first.`
      );
    }
  };

  return {
    /** The project's pages, newest first, and whether its decisions form a graph. */
    async list(projectId: string): Promise<DecisionsList> {
      known(projectId);
      const [names, tasks, graph] = await Promise.all([
        pageNames(projectId),
        deps.tasks(projectId),
        deps.folderText(projectId, GRAPH_FILE),
      ]);
      const problems: string[] = [];
      const pages: DecisionPageSummary[] = [];
      for (const { name, artifact } of names) {
        try {
          // biome-ignore lint/performance/noAwaitInLoops: one page's files at a time keeps the folder's reads small
          const { read, page } = await readOne(
            projectId,
            name,
            artifact,
            tasks
          );
          if (!decisionPage(read, page)) {
            continue;
          }
          const { record: _record, sentAt: _sentAt, ...summary } = read;
          pages.push(summary);
        } catch (error) {
          problems.push(
            `decisions/${name}/ did not read: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
      pages.sort((a, b) => b.updatedAt - a.updatedAt);
      return { pages, graph: graph !== undefined, problems };
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
          decisionPage(read, page)
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

    /** The graph, each card's pick read from its page; null when the decisions form none. */
    async graph(projectId: string): Promise<DecisionGraph | null> {
      known(projectId);
      const text = await deps.folderText(projectId, GRAPH_FILE);
      if (text === undefined) {
        return null;
      }
      const graph = graphOf(text);
      const states = new Map<string, Record<string, ChoiceEntry>>();
      for (const { name, artifact } of await pageNames(projectId)) {
        if (artifact) {
          states.set(name, deps.page(artifact.id).state);
        }
      }
      return {
        ...graph,
        cards: graph.cards.map((card) => ({
          ...card,
          picked: (states.get(card.page)?.[card.id]?.options ?? []).length > 0,
        })),
      };
    },

    /** The person's drags: each card named takes its new place in the file. */
    async place(
      projectId: string,
      places: { id: string; x: number; y: number }[]
    ): Promise<void> {
      known(projectId);
      const text = await deps.folderText(projectId, GRAPH_FILE);
      if (text === undefined) {
        throw new DecisionRefusal(404, `${GRAPH_FILE} is not in the folder.`);
      }
      const raw = jsonOf(text) as { cards?: Partial<GraphCard>[] } | null;
      if (!raw || typeof raw !== "object") {
        throw new DecisionRefusal(
          422,
          `${GRAPH_FILE} is not JSON, so its places weren't saved.`
        );
      }
      const at = new Map(places.map((place) => [place.id, place]));
      const cards = (raw.cards ?? []).map((card) => {
        const moved = card.id ? at.get(card.id) : undefined;
        return moved
          ? { ...card, x: Math.round(moved.x), y: Math.round(moved.y) }
          : card;
      });
      await deps.commit(
        projectId,
        {
          writes: [
            {
              path: GRAPH_FILE,
              content: `${JSON.stringify({ ...raw, cards }, null, 2)}\n`,
            },
          ],
          deletes: [],
        },
        "decisions: the graph's places"
      );
      deps.changed(projectId);
    },

    /**
     * `decision_add`: cards of the project's pages onto the graph, each a card
     * its built page has, named by `name` or else its question, placed on new
     * rows under the lowest card. A card already on the graph stays where it
     * is; one id on two pages is refused, since the graph keys cards by id.
     */
    async add(
      projectId: string,
      asked: { card: string; name?: string; page: string }[]
    ): Promise<GraphCard[]> {
      const { file, graph } = await graphFile(projectId);
      const pages = new Map<string, DecisionCard[]>();
      for (const { page } of asked) {
        if (!pages.has(page)) {
          // biome-ignore lint/performance/noAwaitInLoops: a call names a page or two; read one at a time
          pages.set(page, (await find(projectId, page)).page.cards);
        }
      }
      const bottom = graph.cards.length
        ? Math.max(...graph.cards.map((card) => card.y)) + STEP.y
        : 0;
      const added: GraphCard[] = [];
      for (const { page, card, name } of asked) {
        const question = newCard(
          [...graph.cards, ...added],
          page,
          card,
          pages.get(page) ?? []
        );
        if (question !== null) {
          added.push({
            id: card,
            name: name?.trim() || question,
            page,
            x: (added.length % ROW_CARDS) * STEP.x,
            y: bottom + Math.floor(added.length / ROW_CARDS) * STEP.y,
          });
        }
      }
      if (added.length > 0) {
        await writeGraph(
          projectId,
          file,
          { cards: [...listed(file.cards), ...added] },
          `decisions: Caw puts ${added.map((card) => card.id).join(", ")} on the graph`
        );
      }
      return added;
    },

    /** `decision_link`: edges between cards on the graph, each from one to the card it leads to; one there already stays one. */
    async link(
      projectId: string,
      asked: { from: string; to: string }[]
    ): Promise<[string, string][]> {
      const { file, graph } = await graphFile(projectId);
      onGraph(
        graph,
        asked.flatMap((edge) => [edge.from, edge.to])
      );
      const drawn = new Set(graph.edges.map(([from, to]) => `${from}\0${to}`));
      const added: [string, string][] = [];
      for (const { from, to } of asked) {
        if (from === to) {
          throw new DecisionRefusal(400, `${from} can't lead to itself.`);
        }
        if (!drawn.has(`${from}\0${to}`)) {
          drawn.add(`${from}\0${to}`);
          added.push([from, to]);
        }
      }
      if (added.length > 0) {
        await writeGraph(
          projectId,
          file,
          { edges: [...listed(file.edges), ...added] },
          `decisions: Caw links ${added.map(([from, to]) => `${from} → ${to}`).join(", ")}`
        );
      }
      return added;
    },

    /**
     * `decision_group`: a named frame round cards on the graph. Its id is its
     * name made a slug; the same name again sets its cards, and no cards
     * takes the group away.
     */
    async group(
      projectId: string,
      name: string,
      cards: string[]
    ): Promise<{ cards: string[]; id: string; name: string } | null> {
      const { file, graph } = await graphFile(projectId);
      const id = name
        .trim()
        .toLowerCase()
        .replace(GROUP_ID, "-")
        .replace(EDGE_ENDS, "");
      if (!id) {
        throw new DecisionRefusal(400, "Name the group in words.");
      }
      onGraph(graph, cards);
      const group = cards.length
        ? { id, name: name.trim(), cards: [...new Set(cards)] }
        : null;
      const others = listed(file.groups).filter(
        (each) => (each as { id?: unknown } | null)?.id !== id
      );
      await writeGraph(
        projectId,
        file,
        { groups: group ? [...others, group] : others },
        group
          ? `decisions: Caw groups ${group.cards.join(", ")} as ${group.name}`
          : `decisions: Caw takes the group ${name.trim()} away`
      );
      return group;
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

/** A file's JSON, or null when it is not JSON. */
const jsonOf = (text: string): unknown => {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
};

/** `decisions.json` read leniently: what is not a card, edge or group is left out. */
export const graphOf = (text: string): DecisionGraph => {
  const raw = jsonOf(text) as Partial<DecisionGraph> | null;
  if (!raw || typeof raw !== "object") {
    throw new DecisionRefusal(
      422,
      `${GRAPH_FILE} is not JSON; Caw writes it as { cards, edges, groups }.`
    );
  }
  const cards = (Array.isArray(raw.cards) ? raw.cards : []).filter(
    (card): card is GraphCard =>
      !!card &&
      typeof card.id === "string" &&
      typeof card.page === "string" &&
      Number.isFinite(card.x) &&
      Number.isFinite(card.y)
  );
  const ids = new Set(cards.map((card) => card.id));
  return {
    cards: cards.map(({ id, name, page, x, y }) => ({
      id,
      name: typeof name === "string" && name ? name : id,
      page,
      x,
      y,
    })),
    edges: (Array.isArray(raw.edges) ? raw.edges : []).filter(
      (edge): edge is [string, string] =>
        Array.isArray(edge) && ids.has(edge[0]) && ids.has(edge[1])
    ),
    groups: (Array.isArray(raw.groups) ? raw.groups : [])
      .filter(
        (group) =>
          !!group && typeof group.id === "string" && Array.isArray(group.cards)
      )
      .map((group) => ({
        id: group.id,
        name: typeof group.name === "string" ? group.name : group.id,
        cards: group.cards.filter((id) => ids.has(id)),
      })),
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
          status(404, `${GRAPH_FILE} is not in the folder.`)
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
