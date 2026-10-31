/**
 * Three decision pages in a scratch fleet's project, as sessions publish
 * them (programs over the decision library, as the decision-page skill
 * writes them; the hub serves each in its host page) and picked as the
 * person picks, through the page's doc (`pickAsThePerson`), for the probes that
 * seed a project with them (probe-kit specs/web/safari-blurs.ts):
 *
 * - **landing** — "Landing page hero", 12 cards, 5 picked and 2 noted: the
 *   tab says `5 of 12 picked · 2 notes`.
 * - **pricing** — "Price the hosted plan", 6 cards, sent and decided: one
 *   left open, notes, a dial, a card with a diagram, a recommendation
 *   turned down, and three tasks filed back onto its cards (`decided`).
 * - **onboarding** — "Shape onboarding", 5 cards, 2 picked, in a Section,
 *   each after the one before, with the landing's two hero cards
 *   after its last (`onboarding#caw-intro`): landing comes after onboarding.
 *
 * Card and option ids are dashed, so no word of the page's prose is one:
 * the probe asserts no element's text holds a card id.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join as joinPath } from "node:path";
import { crc32, deflateSync } from "node:zlib";
import { messageAuth, WebsocketProvider } from "y-websocket";
import { Doc } from "yjs";
import { readWithin } from "../../packages/core/src/bounded";
import {
  type ChoiceEntry,
  changedEntry,
} from "../../packages/core/src/choices";
import type { BuiltInKind } from "../../packages/core/src/decides";
import { unhandled } from "../../packages/core/src/unhandled";
import { type Fleet, until } from "../scratch-fleet";

interface SeedOption {
  id: string;
  label: string;
  line: string;
  recommended?: boolean;
}

interface SeedCard {
  /** The decisions it depends on: an id on its page, or `page#id`. */
  after?: string[];
  /** A Mermaid diagram shown between its why and its options. */
  diagram?: string;
  id: string;
  /**
   * What sort of choice it is, by what it asks (decision-page skill, Kinds):
   * `look` for how something looks or reads on screen (layout, copy, colour,
   * motion, a face), `behaviour` for what the product does, `scope` for how
   * much is built. A look card's every option carries a picture.
   */
  kind: Extract<BuiltInKind, "behaviour" | "look" | "scope">;
  options: SeedOption[];
  question: string;
  /** The Section it stands in, by title. */
  section?: string;
  why: string;
}

interface SeedPage {
  /** The panel head's one line: what the person picks here. */
  ask: string;
  cards: SeedCard[];
  name: string;
  title: string;
  /** The session that writes it. */
  writer: string;
}

const option = (
  id: string,
  label: string,
  line: string,
  recommended = false
): SeedOption => ({ id, label, line, recommended });

const LANDING: SeedPage = {
  name: "landing",
  title: "Landing page hero",
  writer: "Orchestrate the landing",
  ask: "Pick what the landing page leads with",
  cards: [
    {
      id: "hero-lead",
      kind: "look",
      section: "The hero",
      after: ["onboarding#caw-intro"],
      question: "Which hero leads the landing page?",
      why: "Today the hero is a screenshot of the board.",
      options: [
        option(
          "lead-fleet",
          "The fleet at a glance",
          "Every machine and session, live.",
          true
        ),
        option(
          "lead-film",
          "A short film",
          "Sixty seconds of a session at work."
        ),
        option("lead-quote", "A quote", "One person who runs it daily."),
      ],
    },
    {
      id: "head-words",
      kind: "look",
      question: "What does the headline say?",
      why: 'Today: "A control plane for coding agents".',
      options: [
        option(
          "words-board",
          "One board for every agent",
          "Names the thing you see.",
          true
        ),
        option(
          "words-plane",
          "Your agents, one place",
          "Plain, a little vague."
        ),
      ],
    },
    {
      id: "main-act",
      kind: "behaviour",
      section: "The hero",
      after: ["hero-lead"],
      question: "What is the primary action?",
      why: "One coral button under the headline.",
      options: [
        option("act-install", "Install on a machine", "The one-line install."),
        option("act-watch", "Watch it run", "A sixty-second film."),
        option("act-docs", "Read the docs", "For the careful reader.", true),
      ],
    },
    {
      id: "caw-pose",
      kind: "look",
      question: "Caw's pose in the hero",
      why: "He stands beside the headline.",
      options: [
        option("pose-ready", "Ready", "Upright, looking at the reader.", true),
        option("pose-working", "Working", "Head down over the board."),
      ],
    },
    {
      id: "hero-motion",
      kind: "look",
      question: "How does the hero move?",
      why: "The board in the hero is live by default.",
      options: [
        option(
          "motion-loop",
          "A session loop",
          "One row every four seconds.",
          true
        ),
        option("motion-still", "Still", "Nothing moves until you scroll."),
      ],
    },
    {
      id: "under-hero",
      kind: "look",
      question: "What stands under the hero?",
      why: "The first section after the fold.",
      options: [
        option("under-quotes", "Quotes", "Three people who use it."),
        option(
          "under-steps",
          "Three steps",
          "Install, join, open the board.",
          true
        ),
      ],
    },
    {
      id: "phone-shot",
      kind: "look",
      question: "Where does the phone stand?",
      why: "The phone app is half the story.",
      options: [
        option(
          "phone-beside",
          "Beside the board",
          "Two devices, one fleet.",
          true
        ),
        option("phone-own", "Its own section", "Lower on the page."),
      ],
    },
    {
      id: "lead-theme",
      kind: "look",
      question: "Which theme leads?",
      why: "The page follows the reader's system today.",
      options: [
        option("theme-dark", "Dark", "The board at night."),
        option("theme-light", "Light", "The board by day.", true),
      ],
    },
    {
      id: "name-harness",
      kind: "look",
      question: "Name the harnesses?",
      why: "Claude Code, OpenCode and pi run today.",
      options: [
        option("names-yes", "Name them", "Logos under the hero.", true),
        option("names-no", "Leave them out", "Agents, unnamed."),
      ],
    },
    {
      id: "film-length",
      kind: "scope",
      question: "How long is the film?",
      why: "Only if the film leads.",
      options: [
        option(
          "film-thirty",
          "Thirty seconds",
          "One flow, start to end.",
          true
        ),
        option("film-ninety", "Ninety seconds", "Three flows."),
      ],
    },
    {
      id: "head-face",
      kind: "look",
      question: "The headline's face",
      why: "The wordmark is Nunito.",
      options: [
        option("face-nunito", "Nunito", "The wordmark's own.", true),
        option("face-figtree", "Figtree", "The product's body face."),
      ],
    },
    {
      id: "page-voice",
      kind: "look",
      question: "The page's voice",
      why: "Calm and short, as the product is.",
      options: [
        option("voice-calm", "Calm", "Short sentences, no hype.", true),
        option("voice-bold", "Bold", "Big claims, big type."),
      ],
    },
  ],
};

/** The landing's picks: 5 of its 12, two with notes. */
const LANDING_PICKS: Record<string, { note?: string; options: string[] }> = {
  "hero-lead": { options: ["lead-fleet"], note: "fits the phone first" },
  "head-words": { options: ["words-board"] },
  "main-act": { options: ["act-install"], note: "the install is the product" },
  "caw-pose": { options: ["pose-ready"] },
  "hero-motion": { options: ["motion-loop"] },
};

const PRICING: SeedPage = {
  name: "pricing",
  title: "Price the hosted plan",
  writer: "Price the hosted plan",
  ask: "Pick how the hosted hub is priced",
  cards: [
    {
      id: "plan-shape",
      kind: "behaviour",
      question: "What shape is the plan?",
      why: "Today the hub is self-hosted only.",
      diagram:
        "flowchart LR\nobelisk[obelisk] --> plan[One plan]\nmacbook[macbook] --> plan",
      options: [
        option("shape-seat", "Per seat", "Each person who opens the board."),
        option(
          "shape-machine",
          "Per machine",
          "Each machine that joins the fleet.",
          true
        ),
        option("shape-flat", "One flat price", "Every machine and person."),
      ],
    },
    {
      id: "trial-length",
      kind: "behaviour",
      question: "How long is the trial?",
      why: "A fleet takes a week to set up properly.",
      options: [
        option(
          "trial-two-weeks",
          "Two weeks",
          "Long enough to join three machines.",
          true
        ),
        option("trial-month", "A month", "Room for a whole project."),
      ],
    },
    {
      id: "free-tier",
      kind: "behaviour",
      question: "Is there a free tier?",
      why: "Self-hosting stays free either way.",
      options: [
        option(
          "free-one-machine",
          "One machine free",
          "The hub and one session."
        ),
        option(
          "free-none",
          "No free tier",
          "The trial is the free part.",
          true
        ),
      ],
    },
    {
      id: "pay-when",
      kind: "behaviour",
      question: "When does the bill land?",
      why: "Usage moves with the fleet's size.",
      options: [
        option(
          "pay-monthly",
          "Monthly",
          "The machines of the month before.",
          true
        ),
        option("pay-yearly", "Yearly", "Two months off."),
      ],
    },
    {
      id: "price-page",
      kind: "look",
      question: "Pricing in the top bar?",
      why: "The top bar holds four links today.",
      options: [
        option("bar-yes", "In the top bar", "Pricing beside Docs."),
        option("bar-footer", "In the footer", "Out of the way.", true),
      ],
    },
    {
      id: "spend-cap",
      kind: "behaviour",
      question: "A spend cap per project?",
      why: "Projects already stop at their own cap.",
      options: [
        option(
          "cap-yes",
          "Yes, per project",
          "Set on the project's page.",
          true
        ),
        option("cap-fleet", "One for the fleet", "Set once."),
      ],
    },
  ],
};

/** The pricing picks: five decided, one left open, notes and a dial. */
const PRICING_PICKS: Record<
  string,
  { note?: string; options: string[]; value?: unknown }
> = {
  "plan-shape": {
    options: ["shape-machine"],
    note: "machines are what cost us",
  },
  "trial-length": {
    options: ["trial-month"],
    note: "a project takes longer than a week",
  },
  "free-tier": { options: ["free-none"] },
  "pay-when": { options: ["pay-monthly"] },
  "spend-cap": { options: ["cap-yes"] },
  dials: {
    options: [],
    value: { "trial-length": { reminder: "3 days", grace: "48h" } },
  },
};

/** The tasks Make tasks files back onto the pricing cards. */
const PRICING_TASKS = [
  { card: "plan-shape", title: "Bill by machine joined" },
  { card: "trial-length", title: "Run the trial for a month" },
  { card: "spend-cap", title: "Cap spend on the project page" },
];

const ONBOARDING: SeedPage = {
  name: "onboarding",
  title: "Shape onboarding",
  writer: "Shape onboarding",
  ask: "Pick the first ten minutes after the install",
  cards: [
    {
      id: "first-screen",
      kind: "behaviour",
      section: "The first ten minutes",
      question: "What is the first screen?",
      why: "Today it is the empty board.",
      options: [
        option(
          "first-board",
          "The board",
          "Empty, Caw standing over it.",
          true
        ),
        option("first-tour", "A tour", "Four cards, one at a time."),
      ],
    },
    {
      id: "join-second",
      kind: "behaviour",
      section: "The first ten minutes",
      after: ["first-screen"],
      question: "When does the second machine join?",
      why: "One machine is a session, two is a fleet.",
      options: [
        option("join-now", "Right away", "A code on the first screen.", true),
        option("join-later", "Later", "From the machines list."),
      ],
    },
    {
      id: "first-project",
      kind: "behaviour",
      section: "The first ten minutes",
      after: ["first-screen"],
      question: "Is there a first project?",
      why: "A project holds the board.",
      options: [
        option(
          "project-made",
          "Made for you",
          "From the folder you opened.",
          true
        ),
        option("project-ask", "Asked for", "Its name and folder."),
      ],
    },
    {
      id: "phone-pair",
      kind: "behaviour",
      section: "The first ten minutes",
      after: ["join-second"],
      question: "When is the phone paired?",
      why: "Approvals reach the phone.",
      options: [
        option(
          "pair-first",
          "In the first ten minutes",
          "A code to scan.",
          true
        ),
        option("pair-later", "When the first ask comes", "Asked in place."),
      ],
    },
    {
      id: "caw-intro",
      kind: "look",
      section: "The first ten minutes",
      after: ["first-project"],
      question: "How does Caw say hello?",
      why: "He is the project's conversation.",
      options: [
        option("intro-line", "One line", "Over the empty board.", true),
        option("intro-card", "A card", "What he does, in three lines."),
      ],
    },
  ],
};

const ONBOARDING_PICKS: Record<string, { note?: string; options: string[] }> = {
  "first-screen": { options: ["first-board"] },
  "join-second": { options: ["join-now"], note: "the fleet is the point" },
};

const say = (text: string): string => JSON.stringify(text);

/** A PNG chunk: its length, type, data and CRC (PNG spec §5.3). */
const chunk = (type: string, data: Uint8Array): Uint8Array => {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
};

/** The swatches a look card's options stand on, one hue each, so each option's picture differs. */
const SWATCHES: [number, number, number][] = [
  [233, 113, 82],
  [72, 128, 196],
  [96, 160, 104],
  [200, 168, 64],
  [140, 104, 180],
];

/**
 * A look option's picture: a 160x100 swatch PNG in `dir`, one hue per place
 * on its card, written once and named by its absolute path, as an Image names
 * a file on the writer's machine (decisions library `Image`).
 */
const pictureOf = (dir: string, id: string, at: number): string => {
  const path = joinPath(dir, `${id}.png`);
  if (existsSync(path)) {
    return path;
  }
  const [width, height] = [160, 100];
  const [r, g, b] = SWATCHES[at % SWATCHES.length];
  const rows = new Uint8Array((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      rows.set([r, g, b], y * (width * 3 + 1) + 1 + x * 3);
    }
  }
  const head = new Uint8Array(13);
  const view = new DataView(head.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  head.set([8, 2, 0, 0, 0], 8);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path,
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", head),
      chunk("IDAT", deflateSync(rows)),
      chunk("IEND", new Uint8Array()),
    ])
  );
  return path;
};

/**
 * The page as a session writes it: a program over the decision library,
 * each card a Decision (its diagram, `after`, Section and kind as written),
 * its options in order, the recommended one marked, each of a look card's
 * with its picture.
 */
const pageProgram = (page: SeedPage, pictures: string): string => {
  const lines: string[] = [];
  const top: string[] = [];
  const sections = new Map<string, string[]>();
  for (const [index, card] of page.cards.entries()) {
    const name = `card${index + 1}`;
    const options = card.options.map((each, at) => {
      const statement = `${name}o${at + 1}`;
      // What picking it costs: the card's other answers, given up.
      const cost = `Gives up ${card.options
        .filter((other) => other !== each)
        .map((other) => other.label)
        .join(" and ")}.`;
      const media =
        card.kind === "look"
          ? `[Image(${say(pictureOf(pictures, each.id, at))}, ${say(`${each.label}: ${each.line}`)})]`
          : "[]";
      lines.push(
        `${statement} = Option(${say(each.id)}, ${say(each.label)}, ${say(each.line)}, ${each.recommended ? "true" : "false"}, ${media}, ${say(cost)})`
      );
      return statement;
    });
    const media = card.diagram
      ? `[Diagram(${say(card.diagram)}, "How it would look")]`
      : "[]";
    lines.push(
      `${name} = Decision(${say(card.id)}, ${say(card.question)}, [${options.join(", ")}], ${say(card.why)}, ${media}, ${JSON.stringify(card.after ?? [])}, false, null, ${say(card.kind)})`
    );
    if (card.section) {
      if (!sections.has(card.section)) {
        sections.set(card.section, []);
        top.push(`section${sections.size}`);
      }
      sections.get(card.section)?.push(name);
    } else {
      top.push(name);
    }
  }
  for (const [at, [title, members]] of [...sections].entries()) {
    lines.push(
      `section${at + 1} = Section(${say(title)}, [${members.join(", ")}])`
    );
  }
  return `${[
    `root = Decisions(${say(page.title)}, [${top.join(", ")}])`,
    ...lines,
  ].join("\n")}\n`;
};

/** A JSON request to the fleet's hub; its answer, or its refusal thrown. */
const hub = async <T>(
  fleet: Fleet,
  method: string,
  path: string,
  body?: unknown
): Promise<T> => {
  const read = await readWithin(60_000, async (signal) => {
    const response = await fetch(`${fleet.base}${path}`, {
      method,
      ...(body === undefined
        ? {}
        : {
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          }),
      signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`${method} ${path}: ${response.status} ${text}`);
    }
    return (text ? JSON.parse(text) : null) as T;
  });
  switch (read.kind) {
    case "answered":
      return read.value;
    case "unanswered":
      throw new Error(
        `${method} ${path}: the hub did not answer within ${read.after} ms (${read.reason})`
      );
    default:
      unhandled("read", read);
  }
};

/** The hub base's scheme, which its doc socket takes as `ws`/`wss`. */
const HTTP_SCHEME = /^http/u;

type SeedPicks = Record<
  string,
  { note?: string; options: string[]; value?: unknown }
>;

/**
 * The person's picks, written as they write them: into the page's doc
 * `state` over the pane's link (hub preview-routes.ts `/ws/artifact/
 * :instance/:artifact`, the same doc socket as the overlay's own on the
 * preview listener, artifacts/sync.ts), each entry made as the overlay's
 * `choose` makes it (core `changedEntry`). A card's pick is the person's
 * (Who decides): the writer's artifact_update may not write one. Resolves
 * once a fresh client reads every pick back from the hub.
 */
const pickAsThePerson = async (
  fleet: Fleet,
  writer: string,
  artifact: string,
  picks: SeedPicks
): Promise<void> => {
  const url = `${fleet.base.replace(HTTP_SCHEME, "ws")}/ws/artifact/${writer}`;
  const join = async () => {
    const doc = new Doc();
    const link = new WebsocketProvider(url, artifact, doc, {
      disableBc: true,
      WebSocketPolyfill: WebSocket as never,
    });
    const refused: string[] = [];
    link.messageHandlers[messageAuth] = () => {
      refused.push(artifact);
    };
    await until(
      `the ${artifact} doc joined`,
      () => link.synced,
      Boolean,
      30_000
    );
    return {
      doc,
      refused,
      leave: () => {
        link.destroy();
        doc.destroy();
      },
    };
  };
  const person = await join();
  const pageHash = person.doc.getMap("meta").get("pageHash");
  if (typeof pageHash !== "string") {
    person.leave();
    throw new Error(`${artifact}: its doc holds no pageHash`);
  }
  const state = person.doc.getMap<ChoiceEntry>("state");
  const at = new Date().toISOString();
  person.doc.transact(() => {
    for (const [choice, pick] of Object.entries(picks)) {
      state.set(
        choice,
        changedEntry(
          state.get(choice),
          {
            choice,
            pageHash,
            options: pick.options,
            ...(pick.note === undefined ? {} : { note: pick.note }),
            ...(pick.value === undefined ? {} : { value: pick.value }),
          },
          at
        )
      );
    }
  });
  const fresh = await join();
  try {
    const kept = fresh.doc.getMap<ChoiceEntry>("state");
    await until(
      `${artifact}: the hub keeps the person's ${Object.keys(picks).length} pick(s)`,
      () =>
        person.refused.length > 0 ||
        Object.keys(picks).every((choice) => kept.has(choice)),
      Boolean,
      30_000
    );
    if (person.refused.length > 0) {
      throw new Error(`${artifact}: the hub refused the person's picks`);
    }
  } finally {
    fresh.leave();
    person.leave();
  }
};

/** A page published by its writer, and the person's picks on it; its artifact's id. */
const publish = async (
  fleet: Fleet,
  writer: string,
  page: SeedPage,
  picks: SeedPicks,
  pictures: string
): Promise<string> => {
  const made = await hub<{ id: string }>(
    fleet,
    "POST",
    `/api/instances/${writer}/artifacts`,
    {
      kind: "page",
      name: page.name,
      does: "pick",
      ask: page.ask,
      program: pageProgram(page, pictures),
    }
  );
  await pickAsThePerson(fleet, writer, made.id, picks);
  return made.id;
};

export interface Seeded {
  artifacts: Record<string, string>;
  projectId: string;
  /** The tasks filed back onto the pricing cards, by card. */
  tasks: Record<string, string>;
  writers: Record<string, string>;
}

/**
 * The project and its three pages on a fleet whose hub, agent and account
 * are up: its writers spawned in it, each page published and picked, the
 * pricing page sent and decided with its tasks.
 */
export async function seedDecisions(
  fleet: Fleet,
  project: { cwd: string; machineId: string; name: string }
): Promise<Seeded> {
  const { id: projectId } = await fleet.api<{ id: string }>("/api/projects", {
    name: project.name,
    machineId: project.machineId,
    cwd: project.cwd,
    caw: false,
  });
  const writers: Record<string, string> = {};
  for (const page of [LANDING, PRICING, ONBOARDING]) {
    writers[page.name] = await fleet.spawn("claude", page.writer, project.cwd, {
      projectId,
    });
  }
  // The look cards' pictures, beside the project.
  const pictures = joinPath(project.cwd, ".seed-pictures");
  const artifacts: Record<string, string> = {
    landing: await publish(
      fleet,
      writers.landing,
      LANDING,
      LANDING_PICKS,
      pictures
    ),
    pricing: await publish(
      fleet,
      writers.pricing,
      PRICING,
      PRICING_PICKS,
      pictures
    ),
    onboarding: await publish(
      fleet,
      writers.onboarding,
      ONBOARDING,
      ONBOARDING_PICKS,
      pictures
    ),
  };
  // The pricing page: I'm done picking, then Make tasks, then its tasks filed.
  await hub(
    fleet,
    "POST",
    `/api/projects/${projectId}/decisions/pricing/send`,
    {}
  );
  await hub(
    fleet,
    "POST",
    `/api/projects/${projectId}/decisions/pricing/tasks`
  );
  const stages = await hub<{ stages: { kind: string | null; name: string }[] }>(
    fleet,
    "GET",
    `/api/projects/${projectId}/stages`
  );
  const done = stages.stages.find((stage) => stage.kind === "done")?.name;
  const tasks: Record<string, string> = {};
  for (const [index, task] of PRICING_TASKS.entries()) {
    const filed = await hub<{ id: string }>(
      fleet,
      "POST",
      `/api/projects/${projectId}/tasks`,
      {
        title: task.title,
        fields: { decided: `pricing#${task.card}` },
        ...(index === 0 && done ? { stage: done } : {}),
      }
    );
    tasks[task.card] = filed.id;
  }
  return { projectId, writers, artifacts, tasks };
}
