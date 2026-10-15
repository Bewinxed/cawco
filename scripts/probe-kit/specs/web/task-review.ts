/**
 * The task sheet as a review (TaskSheet and what it draws: the task's
 * result, its attempts, the attempt's transcript), on the built dashboard
 * against a stub hub that answers as the hub does for one project with one
 * task: two attempts (a failed one, then one that finished in a minute with
 * its report), and four outputs handed in, served by the task's outputs
 * route (`/tasks/:taskId/outputs/file?name=`): a post (`post.md`), a
 * schedule (`schedule.json`), an OpenUI mockup (`board.oui`) and a picture
 * (`cover.png`). The owner's pins on the task-review preview (2026-10-15),
 * read from the DOM:
 *
 *  a. No file names: the sheet says none of the outputs' names anywhere,
 *     and lists none.
 *  b. The result leads with the attempt's own report: its headline, then
 *     its words.
 *  c. The post is drawn as text: its words, no front matter.
 *  d. The .json is drawn as what it says: its title, its fields by name, its
 *     posts as a table, never "schedule.json" or a brace.
 *  e. The OpenUI result mounts: the mockup frame draws its parts, no errors.
 *  f. The picture is drawn as a picture.
 *  g. A Try again button, and the attempt's state as "Finished in 1 min".
 *  h. The transcript is the session's own (its rows drawn), with non-zero
 *     padding, and Expand grows it to the sheet's full height in its own
 *     pane: beside the task at 1440 and 1024, over it at 390.
 *  i. Actions and labels differ in role and computed style: a button is a
 *     focusable <button> with an edge and a control's radius; a label is a
 *     span no key reaches, with no edge, a badge's radius and no pointer.
 *
 * Each width (1440, 1024, 390) writes the sheet, and the sheet with its
 * transcript expanded, to the spec's folder for the critique.
 *
 *   bun scripts/probe-kit/run.ts web task-review
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one width at a time, each its own page
// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: each pin is read in order, one assertion after another
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { type Kit, open, type Spec, settle, type View } from "../../kit";
import { photo } from "./oui-mockup/bytes";

const PROJECT = "p-review";
const TASK = "tsk-7";
const SESSION_DONE = "i-attempt-2";
const SESSION_FAILED = "i-attempt-1";
const NOW = Date.now();
const MINUTE = 60_000;
const NEWLINES = /\n/g;

const POST = `---
title: Harbour is live
---
# Harbour is live

Today we open Harbour to everyone. Book a berth in two taps, pay at the quay, and sail.

We built it for the people who keep boats, not for the people who sell them.
`;

const SCHEDULE = {
  title: "Launch week",
  channel: "X",
  starts_at: "2026-10-19",
  posts: [
    { day: "Monday", time: "09:00", text: "Harbour is live." },
    { day: "Wednesday", time: "12:30", text: "How berth booking works." },
    { day: "Friday", time: "17:00", text: "A week on the water." },
  ],
};

const MOCKUP = await readFile(
  join(import.meta.dir, "oui-mockup", "board.oui"),
  "utf8"
);

/** Each output the task names, as the hub serves it: its bytes and type. */
const OUTPUTS: Record<
  string,
  { body: string | Uint8Array<ArrayBuffer>; type: string }
> = {
  "post.md": { body: POST, type: "text/plain; charset=utf-8" },
  "schedule.json": {
    body: JSON.stringify(SCHEDULE, null, 2),
    type: "text/plain; charset=utf-8",
  },
  "board.oui": { body: MOCKUP, type: "text/plain; charset=utf-8" },
  "cover.png": { body: new Uint8Array(photo()), type: "image/png" },
};
const NAMES = Object.keys(OUTPUTS);

const HEADLINE = "Wrote the launch post and planned launch week's three posts.";
const REPORT =
  "The post leads with booking a berth in two taps. The week goes out Monday, Wednesday and Friday, each post under 280 characters.";

const attempts = [
  {
    workItemId: "wi-2",
    instanceId: SESSION_DONE,
    state: "done",
    startedAt: NOW - 10 * MINUTE,
    endedAt: NOW - 10 * MINUTE + 65_000,
    endedHow: null,
    headline: HEADLINE,
  },
  {
    workItemId: "wi-1",
    instanceId: SESSION_FAILED,
    state: "failed",
    startedAt: NOW - 40 * MINUTE,
    endedAt: NOW - 37 * MINUTE,
    endedHow: "Attempt failed: the post ran past 280 characters.",
    headline: null,
  },
];

const flags = {
  attempts,
  blockedBy: [],
  lastAttemptFailed: false,
  lastAttemptStopped: false,
  liveAttempt: false,
  queuedStart: false,
  startProblem: null,
};

const summary = {
  ...flags,
  after: [],
  foundIn: null,
  id: TASK,
  kind: "you",
  labels: ["launch"],
  needsYou: true,
  number: 7,
  parent: null,
  path: `tasks/${TASK}-launch-post.md`,
  problem: null,
  rank: "a0",
  related: [],
  stage: "review",
  title: "Write the launch post and its week of posts",
  todos: { done: 2, total: 2 },
  type: "writer",
  createdAt: NOW - 2 * 60 * MINUTE,
  updatedAt: NOW - 9 * MINUTE,
};

const view = {
  ...summary,
  acceptance: "The post reads in under a minute. Each day has one post.",
  checks: [],
  description:
    "The launch post for Harbour, and what goes out each day of launch week.",
  extra: [],
  hash: "0".repeat(64),
  lands: "none",
  outputs: NAMES,
  problems: [],
  result: {
    workItemId: "wi-2",
    at: NOW - 10 * MINUTE + 65_000,
    headline: HEADLINE,
    report: REPORT,
  },
  sections: [],
  todos: [
    {
      depth: 0,
      done: true,
      id: "td-1",
      path: "1",
      promoted: null,
      proposed: false,
      text: "Draft the post",
    },
    {
      depth: 0,
      done: true,
      id: "td-2",
      path: "2",
      promoted: null,
      proposed: false,
      text: "Plan the week",
    },
  ],
};

const stages = {
  moves: [{ from: "*", to: "*", who: ["you"] }],
  problems: [],
  source: "file",
  stages: [
    { name: "todo", kind: "todo", hooks: {} },
    { name: "review", kind: "you", hooks: {} },
    { name: "done", kind: "done", hooks: {} },
  ],
  starters: [],
  template: null,
  views: [],
};

const project = {
  appleGate: false,
  caw: false,
  createdAt: new Date(NOW - 24 * 60 * MINUTE).toISOString(),
  id: PROJECT,
  name: "Harbour",
  places: [],
  primaryPlaceId: null,
  remote: null,
  review: false,
};

const library = {
  assets: [],
  css: "",
  design: { system: "cawco", assets: [], specimens: [] },
  fonts: [],
  hash: "stub",
  prompt: "",
  roles: {},
  templates: {},
};

const block = (id: string, type: string, content: string, step: number) => ({
  id,
  instanceId: SESSION_DONE,
  type,
  content,
  timestamp: new Date(NOW - 10 * MINUTE + step * 10_000).toISOString(),
});

const transcript = {
  blocks: [
    block(
      "b1",
      "user",
      "Write the launch post for Harbour and plan its week of posts.",
      0
    ),
    block(
      "b2",
      "assistant",
      "I'll draft the post first, then lay the week out day by day.",
      1
    ),
    block(
      "b3",
      "assistant",
      "The post is written and the week is planned: three posts, Monday, Wednesday and Friday.",
      5
    ),
  ],
  branches: [],
  cursor: null,
  seq: 0,
  where: { cwd: "/w", harness: "claude", machineId: "m-1", sessionKey: "k-1" },
};

/** The hub's answer to one read, or null: the stub does not serve it. */
function answer(method: string, url: URL, body: string): Response | null {
  const at = url.pathname;
  const base = `/api/projects/${PROJECT}`;
  const reads: Record<string, () => unknown> = {
    "GET /api/projects": () => [project],
    "GET /api/agents": () => [],
    [`GET ${base}/tasks`]: () => ({
      problems: [],
      stagesProblems: [],
      tasks: [summary],
      tracker: "cawco",
    }),
    [`GET ${base}/stages`]: () => stages,
    [`GET ${base}/tasks/${TASK}`]: () => view,
    [`GET ${base}/mockups/library`]: () => library,
    [`POST ${base}/mockups/check`]: () => ({
      components: [],
      source: (JSON.parse(body) as { source: string }).source,
    }),
    [`GET /api/instances/${SESSION_DONE}/transcript`]: () => transcript,
    [`GET /api/instances/${SESSION_FAILED}/transcript`]: () => ({
      ...transcript,
      blocks: [],
    }),
  };
  if (method === "GET" && at === `${base}/tasks/${TASK}/outputs/file`) {
    const output = OUTPUTS[url.searchParams.get("name") ?? ""];
    return output
      ? new Response(output.body, { headers: { "content-type": output.type } })
      : null;
  }
  const read = reads[`${method} ${at}`];
  return read ? Response.json(read()) : null;
}

/** A hub that answers the reads the project page and its task sheet make. */
function stubHub(unserved: Set<string>) {
  return Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      const body = request.method === "GET" ? "" : await request.text();
      const answered = answer(request.method, url, body);
      if (!answered) {
        unserved.add(`${request.method} ${url.pathname}`);
        return Response.json("The stub hub serves no such read.", {
          status: 404,
        });
      }
      return answered;
    },
  });
}

const SHEET = ".task-sheet";

/** Everything a width reads before and after the transcript is expanded. */
const readSheet = (page: Page) =>
  page.evaluate((names) => {
    const sheet = document.querySelector<HTMLElement>(".task-sheet");
    const text = sheet?.innerText ?? "";
    const part = (kind: string) =>
      sheet?.querySelector<HTMLElement>(`[data-result-kind='${kind}']`);
    const data = part("data")?.querySelector<HTMLElement>("[data-result-data]");
    const frame = part("mockup")?.querySelector<HTMLElement>(
      "[data-mockup-frame]"
    );
    const picture = part("picture")?.querySelector("img");
    const report = sheet?.querySelector<HTMLElement>("[data-task-report]");
    const pane = sheet?.querySelector<HTMLElement>("[data-task-transcript]");
    const tr = pane?.querySelector<HTMLElement>(".tr");
    const trStyle = tr ? getComputedStyle(tr) : null;
    // Any list one of whose items names an output's file.
    const fileLists = [...(sheet?.querySelectorAll("ul, ol") ?? [])].filter(
      (list) =>
        [...list.querySelectorAll("li")].some((item) =>
          names.some((name) => item.textContent?.includes(name))
        )
    ).length;
    const style = (el: Element | null | undefined) => {
      if (!el) {
        return null;
      }
      const s = getComputedStyle(el);
      return {
        tag: el.tagName,
        role: el.getAttribute("role"),
        focusable: (el as HTMLElement).tabIndex >= 0,
        border: Number.parseFloat(s.borderTopWidth),
        radius: Number.parseFloat(s.borderTopLeftRadius),
        cursor: s.cursor,
      };
    };
    return {
      names: names.filter((name) => text.includes(name)),
      fileLists,
      report: report?.innerText ?? "",
      doc: {
        text: part("document")?.innerText ?? "",
        paragraphs: part("document")?.querySelectorAll("p").length ?? 0,
      },
      data: {
        text: data?.innerText ?? "",
        headers: [...(data?.querySelectorAll("th") ?? [])].map((th) =>
          th.textContent?.trim()
        ),
      },
      mockup: {
        mounted: Boolean(frame),
        parts: frame?.querySelectorAll("[data-mk]").length ?? 0,
        errors: Number(frame?.dataset.mockupErrors ?? -1),
      },
      picture: {
        width: picture?.naturalWidth ?? 0,
        drawn: picture?.getBoundingClientRect().width ?? 0,
      },
      tryAgain: style(sheet?.querySelector("[data-try-again]")),
      tryAgainText:
        sheet?.querySelector("[data-try-again]")?.textContent?.trim() ?? "",
      status:
        sheet?.querySelector("[data-attempt-status]")?.textContent?.trim() ??
        "",
      expand: style(sheet?.querySelector("[data-transcript-expand]")),
      labels: [
        ...(sheet?.querySelectorAll("[data-label], [data-attempt-status]") ??
          []),
      ].map(style),
      transcript: {
        drawn: pane?.innerText.includes("lay the week out day by day") ?? false,
        paddingStart: trStyle
          ? Number.parseFloat(trStyle.paddingInlineStart)
          : 0,
        paddingEnd: trStyle ? Number.parseFloat(trStyle.paddingInlineEnd) : 0,
        height: pane?.getBoundingClientRect().height ?? 0,
        width: pane?.getBoundingClientRect().width ?? 0,
        expanded: pane?.dataset.expanded === "true",
      },
      sheet: {
        height: sheet?.getBoundingClientRect().height ?? 0,
        width: sheet?.getBoundingClientRect().width ?? 0,
      },
      // Result table cells whose words run past their cell.
      clipped: [
        ...(sheet?.querySelectorAll<HTMLElement>(
          "[data-result-kind] td, [data-result-kind] th"
        ) ?? []),
      ]
        .filter((cell) => cell.scrollWidth > cell.clientWidth + 1)
        .map((cell) => cell.textContent?.trim() ?? ""),
      // Result tables wider than their place (they scroll sideways).
      wideTables: [
        ...(sheet?.querySelectorAll<HTMLElement>(
          "[data-result-kind] [data-slot='table-container']"
        ) ?? []),
      ]
        .filter((box) => box.scrollWidth > box.clientWidth + 1)
        .map((box) => `${box.scrollWidth}/${box.clientWidth}px`),
      reviewShown: (() => {
        const review = sheet?.querySelector<HTMLElement>(".review");
        return review ? getComputedStyle(review).display !== "none" : false;
      })(),
    };
  }, NAMES);

/** The desk's reading of every pin but the transcript's expansion. */
async function pins(kit: Kit, page: Page) {
  const before = await readSheet(page);
  kit.check(
    "a. the sheet names none of the outputs' files",
    before.names.length === 0,
    before.names.join(", ")
  );
  kit.check(
    "a. no list of file names",
    before.fileLists === 0,
    `${before.fileLists} lists`
  );
  kit.check(
    "b. the result leads with the attempt's report: its headline, then its words",
    before.report.includes(HEADLINE) &&
      before.report.includes("booking a berth in two taps"),
    before.report.slice(0, 140).replace(NEWLINES, " / ")
  );
  kit.check(
    "c. the post is drawn as text, no front matter",
    before.doc.text.includes("Book a berth in two taps") &&
      before.doc.paragraphs >= 2 &&
      !before.doc.text.includes("title:") &&
      !before.doc.text.includes("---"),
    before.doc.text.slice(0, 120).replace(NEWLINES, " / ")
  );
  kit.check(
    "d. the .json is drawn as what it says",
    before.data.text.includes("Launch week") &&
      before.data.text.includes("Channel") &&
      before.data.text.includes("Wednesday") &&
      ["Day", "Time", "Text"].every((h) => before.data.headers.includes(h)) &&
      !before.data.text.includes("schedule.json") &&
      !before.data.text.includes("{"),
    `${before.data.headers.join("|")} · ${before.data.text.slice(0, 80).replace(NEWLINES, " / ")}`
  );
  kit.check(
    "e. the OpenUI result mounts and draws its parts",
    before.mockup.mounted &&
      before.mockup.parts > 0 &&
      before.mockup.errors === 0,
    JSON.stringify(before.mockup)
  );
  kit.check(
    "f. the picture is drawn as a picture",
    before.picture.width > 0 && before.picture.drawn > 0,
    `${before.picture.width}px wide, drawn ${before.picture.drawn.toFixed(0)}px`
  );
  // By its accessible name: its label and its pending wording ("Starting…")
  // stand in one cell, so its text holds both.
  const named = await page
    .locator(SHEET)
    .getByRole("button", { name: "Try again", exact: true })
    .count();
  kit.check(
    "g. a Try again button",
    before.tryAgain?.tag === "BUTTON" && named === 1,
    `${named} button named "Try again"; its text "${before.tryAgainText}"`
  );
  kit.check(
    'g. the attempt says "Finished in 1 min"',
    before.status.startsWith("Finished in 1 min"),
    before.status
  );
  kit.check(
    "h. the transcript draws the session's rows with non-zero padding",
    before.transcript.drawn &&
      before.transcript.paddingStart > 0 &&
      before.transcript.paddingEnd > 0,
    `padding ${before.transcript.paddingStart}/${before.transcript.paddingEnd}px`
  );
  const labels = before.labels.filter((each) => each !== null);
  const buttons = [before.tryAgain, before.expand].filter(
    (each) => each !== null
  );
  const buttonsAre = buttons.every(
    (b) => b.tag === "BUTTON" && b.focusable && b.border > 0
  );
  const labelsAre =
    labels.length > 0 &&
    labels.every(
      (l) =>
        l.tag === "SPAN" &&
        l.role === null &&
        !l.focusable &&
        l.border === 0 &&
        l.cursor !== "pointer" &&
        buttons.every((b) => b.radius !== l.radius)
    );
  kit.check(
    "i. actions are buttons and labels are not, by role and computed style",
    buttons.length === 2 && buttonsAre && labelsAre,
    `buttons ${JSON.stringify(buttons)} · labels ${JSON.stringify(labels.slice(0, 2))} (${labels.length})`
  );
  return before;
}

async function width(kit: Kit, base: string, at: View) {
  const page = await kit.page(at);
  await open(
    page,
    `${base}/project/${PROJECT}?task=${TASK}`,
    () =>
      Boolean(
        document.querySelector(
          ".task-sheet [data-result-kind='mockup'] [data-mockup-frame]"
        ) &&
        document.querySelector(
          ".task-sheet [data-result-kind='picture'] img"
        ) &&
        document.querySelector(".task-sheet [data-task-transcript] .tr") &&
        document
          .querySelector(".task-sheet [data-task-transcript]")
          ?.textContent?.includes("lay the week out day by day")
      ),
    90_000
  );
  await settle(page);
  await page.screenshot({ path: join(kit.out, `${at}-sheet.png`) });
  const before = at === "desk" ? await pins(kit, page) : await readSheet(page);
  kit.check(
    `d. ${at}: every result table cell holds its words`,
    before.clipped.length === 0 && before.wideTables.length === 0,
    [...before.clipped, ...before.wideTables].join(" | ")
  );

  await page.click(`${SHEET} [data-transcript-expand]`);
  await page.waitForSelector(
    `${SHEET} [data-task-transcript][data-expanded='true'] .tr`
  );
  await settle(page);
  const after = await readSheet(page);
  await page.screenshot({ path: join(kit.out, `${at}-expanded.png`) });
  const full = Math.abs(after.transcript.height - after.sheet.height) <= 2;
  const besides = at === "phone" ? !after.reviewShown : after.reviewShown;
  kit.check(
    `h. ${at}: Expand grows the transcript to the sheet's full height in its own pane`,
    after.transcript.expanded &&
      after.transcript.height > before.transcript.height &&
      full &&
      besides &&
      after.transcript.paddingStart > 0,
    `${before.transcript.height.toFixed(0)} → ${after.transcript.height.toFixed(0)}px of ${after.sheet.height.toFixed(0)}, ${after.transcript.width.toFixed(0)}px wide, review ${after.reviewShown ? "beside it" : "under it"}`
  );
}

const run = async (kit: Kit) => {
  const unserved = new Set<string>();
  const hub = stubHub(unserved);
  try {
    const base = await kit.builtFor(`http://127.0.0.1:${hub.port}`);
    for (const at of ["desk", "tablet", "phone"] as const) {
      await width(kit, base, at);
    }
    kit.note(
      `the stub hub refused: ${[...unserved].sort().join(", ") || "nothing"}`
    );
    kit.note(`captures in ${kit.out}`);
  } finally {
    await hub.stop(true);
  }
};

export default { name: "task-review", run } satisfies Spec;
