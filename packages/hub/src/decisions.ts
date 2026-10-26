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
 * - **A send** goes to the session that wrote the page: I'm done picking
 *   as the page's own Send does (artifacts/service.ts `send`), which
 *   revives a session at rest; a note from the tab's composer as the
 *   person's words about the page, never a Send of its picks (a note is
 *   talk, as a comment is: a Send is pressed, never typed). When that
 *   session was ended, Caw is woken with it in a thread of the project, and
 *   reads the picks himself (a project's lead reads every page of his
 *   project); only I'm done picking stamps the page sent.
 * - **A Send decides the page**: whichever control sends its picks (the
 *   page's own Send, the panel's, Needs you's, the tab's I'm done picking;
 *   artifacts/service.ts `sending`, or Caw's path here), `record.json` and
 *   `log.md` are written from the picks as sent, in one commit ({@link
 *   createDecisions} `decide`). The page is decided from then on.
 * - **The record follows the picks**: a pick or note on a decided page
 *   writes its record and log again from the picks as they stand, once his
 *   changes stand quiet (server.ts); so does a move of its cards' tasks.
 * - **Make tasks** is a next step a decided page may take: it writes the
 *   record from the picks with the session it asks, then asks that session
 *   (or Caw) to run to-tasks over it, each task carrying
 *   `decided: <page>#<card>`. A refusal to ask puts the record back as it
 *   was, so the page stands as it was.
 * - **A page's cards** come from its own file in the folder: `page.oui`,
 *   kept there by every create and revision in a project, else the built
 *   `index.html`. Each program is read once per hash. Its artifact is the
 *   project's, one per name, and lives as long as that file (a deleted
 *   session leaves it with no session; db/schema.ts `artifacts.instanceId`).
 * - **Links between pages** are derived from those programs on every list:
 *   a decision whose `after` names another page's decision (`page#card`)
 *   puts that page in its own page's `after`, and its page in the other's
 *   `unlocks`. An `after` naming no decision of the project's links
 *   nothing; its writer is told so on create and revision (`linksOf`).
 */
import {
  type ChoiceEntry,
  decisionsWords,
  ENDED_STATUSES,
  type InstanceRow,
} from "@cawco/core";
import {
  type AfterLinks,
  cardRef,
  DECIDED_FIELD,
  type DecisionCard,
  type DecisionLink,
  type DecisionOption,
  type DecisionPageRead,
  type DecisionPageSummary,
  type DecisionRecord,
  type DecisionSent,
  type DecisionState,
  type DecisionsList,
  type DecisionWriter,
  decidedOf,
  logOf,
  pickRecord,
  picksMade,
  type RecordCard,
} from "@cawco/core/decisions";
import { AFTER_REF } from "@cawco/core/decisions-library";
import { pageHash } from "@cawco/core/preview-proxy";
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

const NAME = /^[a-z0-9][a-z0-9-]{0,62}$/u;

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
const ENTITY = /&(#x[0-9a-f]+|#\d+|[a-z]+);/giu;
const SPACES = /\s+/gu;

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

const MOCKUP_CLASS = /(?:^|\s)mk-([a-z0-9-]+)(?:\s|$)/u;
const RECOMMENDED = /recommended/iu;

/** An option's part as the kit labels it (`Gets: …`, RECIPES.md), its words without the label the card draws for itself. */
const unlabelled = (raw: string, label: (words: string) => string): string => {
  const words = shown(raw);
  const head = label("");
  return words.startsWith(head) ? words.slice(head.length).trim() : words;
};

/** What a page says of itself: its title and its cards, in page order. */
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
  builds: string;
  cost: string;
  label: string;
  line: string;
  option: DecisionOption;
}

/**
 * A built decision page's title and cards. A card is a choice group
 * (`[data-cawco-choice]` with options): its question and why are its
 * article's, its options labelled by their `<b>`, their first plain
 * `<span>` (what it gets), their `.dp-cost` and `.dp-builds`, each without
 * the kit's label, and a `.dp-tag` saying Recommended. A choice group outside an
 * article is named by its `aria-label`.
 */
const readPage = async (html: string): Promise<ReadPage> => {
  let title = "";
  let docTitle = "";
  const cards: DecisionCard[] = [];
  let article: OpenArticle | null = null;
  let card: DecisionCard | null = null;
  let option: OpenOption | null = null;
  let span: {
    kind: "dp-tag" | "dp-cost" | "dp-builds" | undefined;
    text: string;
  } | null = null;
  const closeOption = () => {
    if (option && card) {
      option.option.label = shown(option.label) || option.option.id;
      option.option.line = unlabelled(option.line, decisionsWords.gets);
      option.option.cost = unlabelled(option.cost, decisionsWords.costs);
      const builds = unlabelled(option.builds, decisionsWords.builds);
      card.options.push(builds ? { ...option.option, builds } : option.option);
    }
    option = null;
  };
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
          // A kind is a program's (core decides.ts): an HTML page's choice is the person's.
          kind: null,
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
          builds: "",
          cost: "",
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
        const classes = (element.getAttribute("class") ?? "").split(SPACES);
        const kind = (["dp-tag", "dp-cost", "dp-builds"] as const).find((one) =>
          classes.includes(one)
        );
        const open = { kind, text: "" };
        span = open;
        element.onEndTag(() => {
          if (option) {
            if (open.kind === "dp-tag") {
              option.option.recommended ||= RECOMMENDED.test(open.text);
            } else if (open.kind === "dp-cost") {
              option.cost ||= open.text;
            } else if (open.kind === "dp-builds") {
              option.builds ||= open.text;
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
  meta: {
    /** When its session last revised it or asked anew, ISO; null before. */
    revisedAt: string | null;
    sentAt: string | null;
    sentText: string | null;
  };
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
  /** Whether the project is the hub's. */
  projectExists: (projectId: string) => boolean;
  /** The person's I'm done picking on a session's artifact: its Send (artifacts/service.ts `send`), through `route`. */
  send: (
    instanceId: string,
    artifactId: string,
    route: string
  ) => Promise<void>;
  /** Stamps a page's send when Caw took it in place of its ended session. */
  stampSent: (artifactId: string) => void;
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

/** Programs whose reads are kept, by hash. Our bound: a project's pages and their recent revisions, a few KiB each. */
const PROGRAM_READS = 512;

/** A page's picks and notes. */
const responses = (state: Record<string, ChoiceEntry>): ChoiceEntry[] =>
  Object.values(state);

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

/**
 * A page's cards as its record keeps them: each as he saw it, what is picked
 * on it now (an option the card still offers), who settled it when he did
 * not, his note, its dials, and the tasks filed from it.
 */
const recordCardsOf = (
  name: string,
  cards: DecisionCard[],
  state: Record<string, ChoiceEntry>,
  tasks: DecidedTask[]
): RecordCard[] =>
  cards.map((card) => {
    const entry = state[card.id];
    return {
      id: card.id,
      question: card.question,
      why: card.why,
      options: card.options,
      chosen: (entry?.options ?? []).filter((id) =>
        card.options.some((option) => option.id === id)
      ),
      dials: dialsOf(state, card.id),
      note: entry?.note?.trim() ?? "",
      ...(entry?.settled ? { settled: entry.settled } : {}),
      tasks: tasks
        .filter((task) => task.card === card.id)
        .map((task) => task.id),
      mockup: card.mockup,
      still: stillOf(name, card.mockup),
    };
  });

/** What a record's picks are, its tasks aside: what moving them dates the record anew by. */
const picksIn = (cards: RecordCard[]): string =>
  JSON.stringify(cards.map((card) => ({ ...card, tasks: [] })));

/** Its record and log as files, the log naming each task by its title. */
const recordFiles = (
  record: StoredRecord,
  titles: Record<string, string>
): { content: string; path: string }[] => [
  { path: recordPath(record.name), content: recordText(record) },
  { path: logPath(record.name), content: logOf(record, titles) },
];

/** Each task's title by its id, for a log. */
const titlesOf = (tasks: DecidedTask[]): Record<string, string> =>
  Object.fromEntries(tasks.map((task) => [task.id, task.title]));

/**
 * What its record says was decided, for the Decisions tab's search: each
 * card's chosen options by label, and the why behind its pick (core
 * `pickRecord`: the settler's why, or his note on his own).
 */
const answersOf = (record: DecisionRecord | null): string[] =>
  (record?.cards ?? []).flatMap((card) => {
    if (card.chosen.length === 0) {
      return [];
    }
    const labels = card.chosen.map(
      (id) => card.options.find((option) => option.id === id)?.label ?? id
    );
    const { why } = pickRecord(card);
    return why ? [...labels, why] : labels;
  });

/** The `page#card` an `after` on page `page` names: `page#card` across pages, a bare id on its own page. */
const afterId = (page: string, ref: string): string => {
  const found = AFTER_REF.exec(ref);
  return found ? cardRef(found[1] ?? page, found[2] ?? "") : ref;
};

/** Why an `after` names nothing: the page it names has no such decision, or there is no such page. */
const unlinkedWhy = (
  pages: { name: string }[],
  from: string,
  ref: string
): string => {
  const at = from.indexOf("#");
  const page = from.slice(0, at);
  return pages.some((each) => each.name === page)
    ? `${ref}: ${page} has no decision ${from.slice(at + 1)}`
    : `${ref}, which no decision page of this project has`;
};

/**
 * Each page's links to the others: the pages one of its decisions comes
 * after, and the pages with a decision after one of its own, each once, in
 * the order its cards name them. An `after` on its own page, or naming no
 * decision of the project's, links nothing.
 */
const linksAmong = (
  pages: { cards: DecisionCard[]; name: string; title: string }[]
): Map<string, { after: DecisionLink[]; unlocks: DecisionLink[] }> => {
  const ids = new Set(
    pages.flatMap((page) =>
      page.cards.map((card) => cardRef(page.name, card.id))
    )
  );
  const byName = new Map(pages.map((page) => [page.name, page]));
  const links = new Map(
    pages.map((page) => [
      page.name,
      { after: [] as DecisionLink[], unlocks: [] as DecisionLink[] },
    ])
  );
  const add = (list: DecisionLink[], page: { name: string; title: string }) => {
    if (!list.some((each) => each.name === page.name)) {
      list.push({ name: page.name, title: page.title });
    }
  };
  for (const page of pages) {
    for (const card of page.cards) {
      for (const ref of card.after) {
        const from = afterId(page.name, ref);
        const target = byName.get(from.slice(0, from.indexOf("#")));
        if (target && target.name !== page.name && ids.has(from)) {
          add(links.get(page.name)?.after ?? [], target);
          add(links.get(target.name)?.unlocks ?? [], page);
        }
      }
    }
  }
  return links;
};

/** A page's own file in the folder: its program, else its built HTML; undefined when it has neither. */
const keptIn = async (
  folderText: DecisionsDeps["folderText"],
  projectId: string,
  name: string
): Promise<string | undefined> =>
  (await folderText(projectId, programPath(name))) ??
  (await folderText(projectId, builtPath(name)));

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
    const row = artifact?.instanceId
      ? deps.instance(artifact.instanceId)
      : undefined;
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

  /**
   * Where a page stands: decided from his Send of its picks (its record
   * stands), making while its tasks are made, until its session revises it
   * or asks anew, which asks him again (picking, its record kept) until his
   * next Send; sent when he sent it with no picks to carry; else picking.
   */
  const stateOf = (
    record: StoredRecord | null,
    page: PageArtifact | null
  ): DecisionState => {
    const revisedAt = page?.meta.revisedAt;
    const sentAt = page?.meta.sentAt;
    const askedAgain = !!revisedAt && (!sentAt || revisedAt > sentAt);
    if (record && !askedAgain) {
      return making(record) ? "making" : "decided";
    }
    if (record) {
      return "picking";
    }
    if (sentAt && !responses(page.state).some((entry) => entry.at > sentAt)) {
      return "sent";
    }
    return "picking";
  };

  /** Each program read so far, by its hash (core `pageHash`, the page hash the hub keeps), oldest first. */
  const programReads = new Map<string, ReadPage>();

  /** A program's title and cards, parsed once per hash. */
  const programRead = (program: string): ReadPage => {
    const hash = pageHash(program);
    const kept = programReads.get(hash);
    if (kept) {
      return kept;
    }
    const { title, cards } = readKept(program);
    const read = { title, cards };
    programReads.set(hash, read);
    if (programReads.size > PROGRAM_READS) {
      programReads.delete(programReads.keys().next().value as string);
    }
    return read;
  };

  /**
   * A page's title and cards, from its own file in the project's folder:
   * its program (page.oui), else an HTML page's built index.html.
   */
  const pageOf = async (projectId: string, name: string): Promise<ReadPage> => {
    const program = await deps.folderText(projectId, programPath(name));
    if (program !== undefined) {
      return programRead(program);
    }
    const html = await deps.folderText(projectId, builtPath(name));
    return html ? await readPage(html) : { title: name, cards: [] };
  };

  /** One page read whole: its program or built page, its doc, its record and its tasks. */
  const readOne = async (
    projectId: string,
    name: string,
    artifact: ArtifactRow | null,
    tasks: DecidedTask[]
  ): Promise<{ read: DecisionPageRead; page: ReadPage }> => {
    const page = await pageOf(projectId, name);
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
      picked: picksMade(
        page.cards.map((card) => ({ id: card.id, card })),
        state
      ).made,
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

  /** Record writes, one at a time across the hub: each reads the record the last one left. */
  let writing: Promise<unknown> = Promise.resolve();
  const serially = <T>(work: () => Promise<T>): Promise<T> => {
    const run = writing.then(work);
    writing = run.catch(() => undefined);
    return run;
  };

  /**
   * Page `name`'s record as it stands now: its cards from its own file,
   * with the picks of `artifactId` as they are and its tasks as filed, after
   * the cards of `prior` a revision took off the page, kept as they were. Dated
   * now when its picks moved since `prior`, else as `prior` was; who was
   * asked to make its tasks kept. Without its artifact or its cards, `prior`
   * with its tasks moved; null when there is no `prior` either.
   */
  const recordNow = async (
    projectId: string,
    name: string,
    artifactId: string | null,
    prior: StoredRecord | null,
    tasks: DecidedTask[]
  ): Promise<StoredRecord | null> => {
    const own = tasks.filter((task) => task.page === name);
    const page = await pageOf(projectId, name);
    if (!artifactId || page.cards.length === 0) {
      return prior ? { ...prior, ...withTasks(prior, own) } : null;
    }
    const onPage = recordCardsOf(
      name,
      page.cards,
      deps.page(artifactId).state,
      own
    );
    // A card a revision took off the page stays in the record as it was decided.
    const taken = (prior ? withTasks(prior, own).cards : []).filter(
      (card) => !onPage.some((each) => each.id === card.id)
    );
    const cards = [...taken, ...onPage];
    return {
      name,
      title: page.title || name,
      madeAt:
        prior && picksIn(prior.cards) === picksIn(cards)
          ? prior.madeAt
          : new Date().toISOString(),
      askedOf: prior?.askedOf ?? null,
      ...(prior?.askedIn ? { askedIn: prior.askedIn } : {}),
      cards,
    };
  };

  /** Each page name's newest artifact, by name. */
  const artifactsByName = (projectId: string): Map<string, string> => {
    const byName = new Map<string, string>();
    for (const row of deps.artifacts(projectId)) {
      if (!byName.has(row.name)) {
        byName.set(row.name, row.id);
      }
    }
    return byName;
  };

  /**
   * Records written again where their picks or tasks moved (and their
   * logs): every decided page of the project's, or `only` that one.
   */
  const followRecords = async (
    projectId: string,
    only?: string
  ): Promise<void> => {
    const tasks = await deps.tasks(projectId);
    const artifacts = artifactsByName(projectId);
    const writes: { content: string; path: string }[] = [];
    const names = only
      ? [only]
      : await deps.folderNames(projectId, "decisions");
    for (const name of names) {
      if (!NAME.test(name)) {
        continue;
      }
      const prior = await readRecord(projectId, name);
      if (!prior) {
        continue;
      }
      const next = await recordNow(
        projectId,
        name,
        artifacts.get(name) ?? null,
        prior,
        tasks
      );
      if (next && recordText(next) !== recordText(prior)) {
        writes.push(...recordFiles(next, titlesOf(tasks)));
      }
    }
    if (writes.length > 0) {
      await deps.commit(
        projectId,
        { writes, deletes: [] },
        "decisions: the record follows its picks and tasks"
      );
      deps.changed(projectId);
    }
  };

  /** A record write that failed, said in the journal: nothing waits on it. */
  const followed = (projectId: string, run: Promise<void>): void => {
    run.catch((error: unknown) =>
      console.warn(
        `[decisions] ${projectId}: a record was not written: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  };

  /**
   * His Send of page `name`'s picks on artifact `artifactId`: the page is
   * decided, its record and log written from the picks as sent. Nothing for
   * a page with no cards, or an artifact that is not its page now.
   */
  const decide = (
    projectId: string,
    name: string,
    artifactId: string
  ): Promise<void> =>
    serially(async () => {
      if (artifactsByName(projectId).get(name) !== artifactId) {
        return;
      }
      const tasks = await deps.tasks(projectId);
      const prior = await readRecord(projectId, name);
      const next = await recordNow(projectId, name, artifactId, prior, tasks);
      if (!next || (prior && recordText(next) === recordText(prior))) {
        return;
      }
      await deps.commit(
        projectId,
        { writes: recordFiles(next, titlesOf(tasks)), deletes: [] },
        prior
          ? `decisions: ${name}'s picks moved`
          : `decisions: ${name} decided`
      );
      deps.changed(projectId);
    });

  return {
    /** The project's pages, newest first, each with the pages it links to and its questions. */
    async list(projectId: string): Promise<DecisionsList> {
      known(projectId);
      const [names, tasks] = await Promise.all([
        pageNames(projectId),
        deps.tasks(projectId),
      ]);
      const problems: string[] = [];
      const read: { cards: DecisionCard[]; facts: DecisionPageRead }[] = [];
      for (const { name, artifact } of names) {
        try {
          const one = await readOne(projectId, name, artifact, tasks);
          if (decisionPage(one.read, one.page)) {
            read.push({ facts: one.read, cards: one.page.cards });
          }
        } catch (error) {
          problems.push(
            `decisions/${name}/ did not read: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
      const links = linksAmong(
        read.map(({ facts, cards }) => ({
          name: facts.name,
          title: facts.title,
          cards,
        }))
      );
      const pages: DecisionPageSummary[] = read.map(({ facts, cards }) => {
        const { record, sentAt: _sentAt, ...summary } = facts;
        return {
          ...summary,
          after: links.get(facts.name)?.after ?? [],
          unlocks: links.get(facts.name)?.unlocks ?? [],
          questions: cards.map((card) => card.question || card.id),
          answers: answersOf(record),
        };
      });
      pages.sort((a, b) => b.updatedAt - a.updatedAt);
      return { pages, graph: false, problems };
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
     * The person's send on a page: I'm done picking (no words), the page's
     * Send, which decides it ({@link decide}: through the artifact's send to
     * its session, here before Caw is woken); or a note (words), said to its
     * session as the person's own words and never a Send of the page. Its
     * session hears it; an ended one's goes to Caw.
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
      const noted = `On the decision page “${read.title}” (decisions/${name}/) I wrote: ${words}`;
      if ("instance" in to) {
        if (words) {
          deps.tell(to.instance, noted);
        } else {
          await deps.send(
            to.instance.id,
            read.artifactId,
            `POST /api/projects/${projectId}/decisions/${name}/send`
          );
        }
        deps.changed(projectId);
        return { to: "session" };
      }
      if (!words) {
        await decide(projectId, name, read.artifactId);
      }
      const said = words
        ? noted
        : `I'm done picking on the decision page “${read.title}” (decisions/${name}/).`;
      const threadId = await deps.wakeCaw(
        projectId,
        `${said}\n\n${handedToCaw(read)}`
      );
      if (!words) {
        deps.stampSent(read.artifactId);
      }
      deps.changed(projectId);
      return { to: "caw", threadId };
    },

    /**
     * Make tasks, a decided page's next step: its record written from the
     * picks with the session it asks (a page sent before a Send decided it
     * is decided here), then that session (or Caw) asked to run to-tasks
     * over it. Refused once its tasks are filed or while they are made. A
     * refused ask puts the record back as it was and is thrown on.
     */
    async makeTasks(
      projectId: string,
      name: string
    ): Promise<DecisionPageRead> {
      const { read } = await find(projectId, name);
      if (read.tasks > 0) {
        throw new DecisionRefusal(409, `${read.title} has its tasks already.`);
      }
      if (read.state === "making") {
        throw new DecisionRefusal(
          409,
          `${read.title}'s tasks are being made now.`
        );
      }
      const { artifactId } = read;
      if (!artifactId) {
        throw new DecisionRefusal(
          409,
          `${read.title} has no artifact on this hub, so its picks can't be read.`
        );
      }
      const to = heardBy(read);
      const ask = `Make tasks from my picks on the decision page “${read.title}” (decisions/${name}/): load the to-tasks skill and file them now; pressing Make tasks approves the breakdown. ${
        "instance" in to
          ? `artifact_read({ id: "${artifactId}" }) has my picks and notes by card id.`
          : handedToCaw(read)
      } The record is decisions/${name}/record.json (each card's id, question, what I chose and my note), and log.md beside it says it in words. File one or more tasks for each card I decided and none for a card left open, and give each the field ${DECIDED_FIELD}: "${name}#<card id>" (task_create's fields), so it links back to its card.`;
      await serially(async () => {
        const tasks = await deps.tasks(projectId);
        const titles = titlesOf(tasks);
        const prior = await readRecord(projectId, name);
        const now = await recordNow(projectId, name, artifactId, prior, tasks);
        if (!now) {
          throw new DecisionRefusal(
            404,
            `This project has no decision page ${name}.`
          );
        }
        const { askedIn: _askedBefore, ...picks } = now;
        const record: StoredRecord = {
          ...picks,
          askedOf: "instance" in to ? to.instance.id : null,
        };
        await deps.commit(
          projectId,
          { writes: recordFiles(record, titles), deletes: [] },
          `decisions: ${name}'s tasks asked for`
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
            prior
              ? { writes: recordFiles(prior, titles), deletes: [] }
              : { writes: [], deletes: [recordPath(name), logPath(name)] },
            `decisions: ${name}'s tasks were not asked for`
          );
          const { error } = refused;
          throw new DecisionRefusal(
            503,
            `Couldn't make tasks: ${error instanceof Error ? error.message : String(error)}`,
            { cause: error }
          );
        }
      });
      deps.changed(projectId);
      return (await find(projectId, name)).read;
    },

    /**
     * What page `name` drawn with `cards` does to the project's links, for
     * its writer: each of its `after`s naming no decision of the project's,
     * and each of its decisions another page comes after. The other pages
     * as the folder keeps them.
     */
    async linksOf(
      projectId: string,
      name: string,
      cards: DecisionCard[]
    ): Promise<AfterLinks> {
      known(projectId);
      const pages: { cards: DecisionCard[]; name: string }[] = [
        { name, cards },
      ];
      for (const each of await pageNames(projectId)) {
        if (each.name !== name) {
          const page = await pageOf(projectId, each.name);
          pages.push({ name: each.name, cards: page.cards });
        }
      }
      const ids = new Set(
        pages.flatMap((page) =>
          page.cards.map((card) => cardRef(page.name, card.id))
        )
      );
      const unlinked = cards.flatMap((card) =>
        card.after.flatMap((ref) => {
          const from = afterId(name, ref);
          return ids.has(from)
            ? []
            : [`${card.id} after ${unlinkedWhy(pages, from, ref)}`];
        })
      );
      const dependents: Record<string, string[]> = {};
      for (const page of pages.slice(1)) {
        for (const card of page.cards) {
          for (const ref of card.after) {
            const from = afterId(page.name, ref);
            if (from.startsWith(`${name}#`)) {
              const id = from.slice(name.length + 1);
              dependents[id] = [
                ...(dependents[id] ?? []),
                cardRef(page.name, card.id),
              ];
            }
          }
        }
      }
      return { unlinked, dependents };
    },

    decide,

    /**
     * Pages sent before a Send decided them, decided now: each whose picks
     * were sent and that has no record gets its record from them. Once at
     * boot.
     */
    async decideSent(projectId: string): Promise<void> {
      known(projectId);
      const tasks = await deps.tasks(projectId);
      for (const { name, artifact } of await pageNames(projectId)) {
        if (!artifact) {
          continue;
        }
        // One page that does not read or write leaves the others to go on.
        await readOne(projectId, name, artifact, tasks)
          .then(({ read }) =>
            read.state === "sent" && read.picked > 0
              ? decide(projectId, name, artifact.id)
              : undefined
          )
          .catch((error: unknown) =>
            console.warn(
              `[decisions] ${projectId}: decisions/${name}/ was not decided: ${error instanceof Error ? error.message : String(error)}`
            )
          );
      }
    },

    /** A pick or note on page `name` stood quiet: its record, when it is decided, follows it. */
    picksMoved(projectId: string, name: string): void {
      followed(
        projectId,
        serially(() => followRecords(projectId, name))
      );
    },

    /** The project's tasks changed: records whose tasks moved are written again. */
    tasksChanged(projectId: string): void {
      followed(
        projectId,
        serially(() => followRecords(projectId))
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
