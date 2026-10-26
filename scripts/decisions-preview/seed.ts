/**
 * Three decision pages in a scratch fleet's project, as sessions publish
 * them (programs over the decision library, as the decision-page skill
 * writes them; the hub serves each in its host page), for the
 * Decisions tab's preview (run.ts) and the probes that seed a project with
 * them (probe-kit specs/web/safari-blurs.ts):
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
import { readWithin } from "../../packages/core/src/bounded";
import type { Fleet } from "../scratch-fleet";

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
  options: SeedOption[];
  question: string;
  /** The Section it stands in, by title. */
  section?: string;
  why: string;
}

export interface SeedPage {
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

export const LANDING: SeedPage = {
  name: "landing",
  title: "Landing page hero",
  writer: "Orchestrate the landing",
  ask: "Pick what the landing page leads with",
  cards: [
    {
      id: "hero-lead",
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
      question: "Caw's pose in the hero",
      why: "He stands beside the headline.",
      options: [
        option("pose-ready", "Ready", "Upright, looking at the reader.", true),
        option("pose-working", "Working", "Head down over the board."),
      ],
    },
    {
      id: "hero-motion",
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
      question: "Which theme leads?",
      why: "The page follows the reader's system today.",
      options: [
        option("theme-dark", "Dark", "The board at night."),
        option("theme-light", "Light", "The board by day.", true),
      ],
    },
    {
      id: "name-harness",
      question: "Name the harnesses?",
      why: "Claude Code, OpenCode and pi run today.",
      options: [
        option("names-yes", "Name them", "Logos under the hero.", true),
        option("names-no", "Leave them out", "Agents, unnamed."),
      ],
    },
    {
      id: "film-length",
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
      question: "The headline's face",
      why: "The wordmark is Nunito.",
      options: [
        option("face-nunito", "Nunito", "The wordmark's own.", true),
        option("face-figtree", "Figtree", "The product's body face."),
      ],
    },
    {
      id: "page-voice",
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
export const LANDING_PICKS: Record<
  string,
  { note?: string; options: string[] }
> = {
  "hero-lead": { options: ["lead-fleet"], note: "fits the phone first" },
  "head-words": { options: ["words-board"] },
  "main-act": { options: ["act-install"], note: "the install is the product" },
  "caw-pose": { options: ["pose-ready"] },
  "hero-motion": { options: ["motion-loop"] },
};

export const PRICING: SeedPage = {
  name: "pricing",
  title: "Price the hosted plan",
  writer: "Price the hosted plan",
  ask: "Pick how the hosted hub is priced",
  cards: [
    {
      id: "plan-shape",
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
      question: "Pricing in the top bar?",
      why: "The top bar holds four links today.",
      options: [
        option("bar-yes", "In the top bar", "Pricing beside Docs."),
        option("bar-footer", "In the footer", "Out of the way.", true),
      ],
    },
    {
      id: "spend-cap",
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
export const PRICING_PICKS: Record<
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

export const ONBOARDING: SeedPage = {
  name: "onboarding",
  title: "Shape onboarding",
  writer: "Shape onboarding",
  ask: "Pick the first ten minutes after the install",
  cards: [
    {
      id: "first-screen",
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
      section: "The first ten minutes",
      after: ["first-project"],
      question: "How does Caw say hello?",
      why: "He is the project's lead.",
      options: [
        option("intro-line", "One line", "Over the empty board.", true),
        option("intro-card", "A card", "What he does, in three lines."),
      ],
    },
  ],
};

export const ONBOARDING_PICKS: Record<
  string,
  { note?: string; options: string[] }
> = {
  "first-screen": { options: ["first-board"] },
  "join-second": { options: ["join-now"], note: "the fleet is the point" },
};

const say = (text: string): string => JSON.stringify(text);

/**
 * The page as a session writes it: a program over the decision library,
 * each card a Decision (its diagram, `after` and Section as written), its
 * options in order, the recommended one marked.
 */
export const pageProgram = (page: SeedPage): string => {
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
      lines.push(
        `${statement} = Option(${say(each.id)}, ${say(each.label)}, ${say(each.line)}, ${each.recommended ? "true" : "false"}, [], ${say(cost)})`
      );
      return statement;
    });
    const media = card.diagram
      ? `[Diagram(${say(card.diagram)}, "How it would look")]`
      : "null";
    const after = card.after ? `, ${JSON.stringify(card.after)}` : "";
    lines.push(
      `${name} = Decision(${say(card.id)}, ${say(card.question)}, [${options.join(", ")}], ${say(card.why)}${card.diagram || after ? `, ${media}` : ""}${after})`
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
    default: {
      const unhandled: never = read;
      throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
    }
  }
};

/** A page published by its writer, and the picks it holds; its artifact's id. */
const publish = async (
  fleet: Fleet,
  writer: string,
  page: SeedPage,
  picks: Record<string, { note?: string; options: string[]; value?: unknown }>
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
      program: pageProgram(page),
    }
  );
  await hub(fleet, "PATCH", `/api/instances/${writer}/artifacts/${made.id}`, {
    patch: Object.entries(picks).map(([key, value]) => ({
      op: "add",
      path: `/${key}`,
      value,
    })),
  });
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
  const artifacts: Record<string, string> = {
    landing: await publish(fleet, writers.landing, LANDING, LANDING_PICKS),
    pricing: await publish(fleet, writers.pricing, PRICING, PRICING_PICKS),
    onboarding: await publish(
      fleet,
      writers.onboarding,
      ONBOARDING,
      ONBOARDING_PICKS
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
