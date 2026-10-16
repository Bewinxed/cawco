/**
 * Three decision pages in a scratch fleet's project, as sessions publish
 * them (the decision-page skill's kit markup, built by the hub), for the
 * Decisions tab's preview (run.ts) and the probes that seed a project with
 * them (probe-kit specs/web/safari-blurs.ts):
 *
 * - **landing** — "Landing page hero", 12 cards, 5 picked and 2 noted: the
 *   tab says `5 of 12 picked · 2 notes`.
 * - **pricing** — "Price the hosted plan", 6 cards, sent and decided: one
 *   left open, notes, a dial, a card with a mockup, a recommendation turned
 *   down, and three tasks filed back onto its cards (`decided`).
 * - **onboarding** — "Shape onboarding", 5 cards, 2 picked, drawn as a
 *   graph by `decisions/decisions.json` with the landing's cards beside it.
 *
 * Card and option ids are dashed, so no word of the page's prose is one:
 * the probe asserts no element's text holds a card id.
 */
import type { Fleet } from "../scratch-fleet";

export interface SeedOption {
  id: string;
  label: string;
  line: string;
  recommended?: boolean;
}

export interface SeedCard {
  id: string;
  /** A mockup placed in the card (its root `.mk mk-<id>`). */
  mockup?: string;
  options: SeedOption[];
  question: string;
  why: string;
}

export interface SeedPage {
  cards: SeedCard[];
  /** The hero's one sentence. */
  lede: string;
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
  lede: "What the landing page leads with, before the first section is built.",
  cards: [
    {
      id: "hero-lead",
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
  lede: "How the hosted hub is priced before the waitlist opens.",
  cards: [
    {
      id: "plan-shape",
      question: "What shape is the plan?",
      why: "Today the hub is self-hosted only.",
      mockup: "plan-card",
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
export const PRICING_TASKS = [
  { card: "plan-shape", title: "Bill by machine joined" },
  { card: "trial-length", title: "Run the trial for a month" },
  { card: "spend-cap", title: "Cap spend on the project page" },
];

export const ONBOARDING: SeedPage = {
  name: "onboarding",
  title: "Shape onboarding",
  writer: "Shape onboarding",
  lede: "The first ten minutes after the install.",
  cards: [
    {
      id: "first-screen",
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
      question: "When does the second machine join?",
      why: "One machine is a session, two is a fleet.",
      options: [
        option("join-now", "Right away", "A code on the first screen.", true),
        option("join-later", "Later", "From the machines list."),
      ],
    },
    {
      id: "first-project",
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

/** `decisions/decisions.json`: the onboarding's cards and two of the landing's, in two groups. */
export const GRAPH = {
  cards: [
    {
      id: "first-screen",
      name: "First screen",
      page: "onboarding",
      x: 0,
      y: 0,
    },
    {
      id: "join-second",
      name: "Second machine",
      page: "onboarding",
      x: 200,
      y: 0,
    },
    {
      id: "first-project",
      name: "First project",
      page: "onboarding",
      x: 0,
      y: 96,
    },
    {
      id: "phone-pair",
      name: "Pair the phone",
      page: "onboarding",
      x: 200,
      y: 96,
    },
    {
      id: "caw-intro",
      name: "Caw says hello",
      page: "onboarding",
      x: 100,
      y: 192,
    },
    { id: "hero-lead", name: "Hero", page: "landing", x: 0, y: 352 },
    { id: "main-act", name: "Primary action", page: "landing", x: 200, y: 352 },
  ],
  edges: [
    ["first-screen", "join-second"],
    ["first-screen", "first-project"],
    ["join-second", "phone-pair"],
    ["first-project", "caw-intro"],
    ["caw-intro", "hero-lead"],
    ["hero-lead", "main-act"],
  ],
  groups: [
    {
      id: "first-ten",
      name: "The first ten minutes",
      cards: [
        "first-screen",
        "join-second",
        "first-project",
        "phone-pair",
        "caw-intro",
      ],
    },
    { id: "the-hero", name: "The hero", cards: ["hero-lead", "main-act"] },
  ],
};

const htmlText = (text: string): string =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** A small mockup for a card, to the kit's contract: one root, styles under it, tokens only. */
const mockupOf = (id: string): string =>
  `<style>.mk-${id}{display:grid;gap:var(--space-2);padding:var(--space-3);border-radius:var(--radius-lg);background:var(--surface-raised)}.mk-${id} .pc-row{display:flex;justify-content:space-between;font-size:var(--text-label);color:var(--ink-strong)}.mk-${id} .pc-muted{color:var(--ink-muted)}</style><div class="mk mk-${id}" role="img" aria-label="A plan card priced by machine"><div class="pc-row"><span>obelisk</span><span class="pc-muted">1 machine</span></div><div class="pc-row"><span>macbook</span><span class="pc-muted">1 machine</span></div></div>`;

/** The page as a session writes it from the kit's page.html: hero, cards, send. */
export const pageHtml = (page: SeedPage): string => {
  const cards = page.cards
    .map((card) => {
      const options = card.options
        .map(
          (each) =>
            `<button class="dp-opt" type="button" data-option="${each.id}"><b>${htmlText(each.label)}</b><span>${htmlText(each.line)}</span>${each.recommended ? '<span class="dp-tag">Recommended</span>' : ""}</button>`
        )
        .join("");
      const shown = card.mockup
        ? `<div class="dp-show solo"><figure class="dp-pane"><figcaption>How it would look</figcaption>${mockupOf(card.mockup)}</figure></div>`
        : "";
      return `<article class="dp-card" id="${card.id}"><header><h2>${htmlText(card.question)}</h2><span class="dp-state" data-dp-state="${card.id}">Not picked</span></header><p class="dp-why">${htmlText(card.why)}</p>${shown}<div class="dp-opts" data-cawco-choice="${card.id}" role="group" aria-label="${htmlText(card.question)}">${options}</div><label class="dp-note">Note<textarea data-dp-note="${card.id}" rows="1" placeholder="Anything to add"></textarea></label></article>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${htmlText(page.title)}</title>
<style>{{KIT_CSS}}</style>
</head>
<body>
<main class="dp">
  <header class="dp-hero">
    <span><img class="caw-l" src="caw/light-ready.webp" alt="Caw" width="72" height="72"><img class="caw-d" src="caw/dark-ready.webp" alt="" width="72" height="72"></span>
    <div><h1>${htmlText(page.title)}</h1><p>${htmlText(page.lede)}</p></div>
    <div class="dp-meter" aria-live="polite"><span><b data-dp-count>0</b> of <span data-dp-total>0</span> picked</span><span class="dp-bar"><i data-dp-fill></i></span></div>
  </header>
  <p class="dp-offline" data-dp-offline hidden>Picks are kept only when CawCo shows this page: publish it with artifact_create.</p>
${cards}
  <footer class="dp-done"><span data-dp-sent></span><button class="dp-send" type="button" data-dp-send>Send picks</button></footer>
</main>
<script>{{KIT_JS}}</script>
</body>
</html>
`;
};

/** A JSON request to the fleet's hub; its answer, or its refusal thrown. */
const hub = async <T>(
  fleet: Fleet,
  method: string,
  path: string,
  body?: unknown
): Promise<T> => {
  const response = await fetch(`${fleet.base}${path}`, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${path}: ${response.status} ${text}`);
  }
  return (text ? JSON.parse(text) : null) as T;
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
    { kind: "page", name: page.name, html: pageHtml(page) }
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
 * pricing page sent and decided with its tasks, the graph written.
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
    // biome-ignore lint/performance/noAwaitInLoops: one session at a time keeps the scratch machine small
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
  await hub(fleet, "PUT", `/api/projects/${projectId}/folder/file`, {
    path: "decisions/decisions.json",
    content: `${JSON.stringify(GRAPH, null, 2)}\n`,
    message: "decisions: the onboarding graph",
  });
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
    // biome-ignore lint/performance/noAwaitInLoops: each task is a commit in the project's folder, in order
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
