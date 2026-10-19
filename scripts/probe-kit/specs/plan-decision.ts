/**
 * The plan view's decision page (the owner's "interview me" shape, 2026-10-19):
 * one card, "Which plan do you want?", its three options each drawn live as
 * a component canvas of that way's states file (apps/dashboard/src/lib/
 * cawco/plan/proposal/{OneList,Lanes,CrewFirst}.stories.ts), on a scratch
 * fleet (real hub, agent and sessiond from this checkout; the writer a
 * Claude Code session against the mock model, working in this checkout so
 * the canvases run the dashboard's own toolchain). Read from the engine:
 * the panel frame's DOM, the canvases' frames, the hub's reads.
 *
 *   bun scripts/probe-kit/run.ts plan-decision
 *
 * - each way's canvas is made with its three dials (tile size, line
 *   weight, sweep speed) and every frame of it is drawn, none unnamed;
 * - at 1440 and 390, light and dark: the page draws one card, three
 *   options, one Recommended (Crew first), and each option's embed draws
 *   its own way's live plan (its rows, its variation);
 * - no words or boxes past the panel frame's width;
 * - every way's states draw a step's acknowledgement: a comment sent to
 *   Fable, which carries the step (this session hears it too), the same
 *   comment seen by Fable with its reply, a reworded to-do seen by this
 *   session, the task's attempt;
 * - a pick is kept as the card's state, and a note with it;
 * - the revision made on the pick collapses the card to one line,
 *   "Decided: C · Crew first", and only the picked way's embed stays;
 * - nothing is written to the console as an error.
 *
 * Captures of the page in each leg, and after the collapse, go to
 * `$TMPDIR/caps/` and the clone's `caps/` for a reviewer.
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one step at a time, as a person takes them
import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Frame, Page } from "playwright-core";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, open, ROOT, type Spec, settle } from "../kit";

const PANE =
  ':is([data-slot="preview-pane"], [data-side-surface-class~="preview-pane"])';
const FRAME = `${PANE} iframe[title="Preview"]`;
const CAPS = join(process.env.TMPDIR ?? "/tmp", "caps");
const CLONE_CAPS = join(ROOT, "caps");
const STORIES = "apps/dashboard/src/lib/cawco/plan/proposal";

/** Each way: its option id, its name on the card, its states file, its variation. */
const WAYS = [
  { id: "one-list", label: "A · One list", file: "OneList", variation: "a" },
  { id: "lanes", label: "B · Lanes", file: "Lanes", variation: "b" },
  {
    id: "crew-first",
    label: "C · Crew first",
    file: "CrewFirst",
    variation: "c",
  },
] as const;

/** The values he tunes once a way is picked: the stories' shared args. */
export const DIALS = [
  {
    name: "tileSize",
    label: "Tile size",
    kind: "number",
    min: 14,
    max: 24,
    step: 1,
    unit: "px",
    target: { arg: "tileSize" },
  },
  {
    name: "lineWeight",
    label: "Line weight",
    kind: "number",
    min: 2,
    max: 8,
    step: 1,
    unit: "px",
    target: { arg: "lineWeight" },
  },
  {
    name: "sweepSeconds",
    label: "Sweep speed",
    kind: "number",
    min: 0.6,
    max: 3,
    step: 0.1,
    unit: "s",
    target: { arg: "sweepSeconds" },
  },
];

/** The page: one decision, each way's live canvas over its option. */
export const programOf = (
  ids: Record<(typeof WAYS)[number]["id"], string>
) => `root = Decisions("The plan view", [plan], "One choice: how the side panel shows what a session and its delegates are doing. Each way below is the real panel on the same plan, a booking page with four delegates out; press a step to open it, and switch desk, phone, light and dark in its own frame.")
plan = Decision("plan", "Which plan do you want?", [oneList, lanes, crewFirst], "Recommended: C, because its first row answers whether anything needs you: Fable, waiting on your answer, stands at the top of the stack.", [ways])
ways = Row([oneListShow, lanesShow, crewFirstShow], "start", "start")
oneListShow = Column([Text("A · One list", "label"), Preview("${ids["one-list"]}")])
lanesShow = Column([Text("B · Lanes", "label"), Preview("${ids.lanes}")])
crewFirstShow = Column([Text("C · Crew first", "label"), Preview("${ids["crew-first"]}")])
oneList = Option("one-list", "A · One list", "Everything in one list, each delegate one row under its to-do; edit or comment on a step where it stands. Costs: the longest list when several delegates run.")
lanes = Option("lanes", "B · Lanes", "Which steps wait on which, drawn as lines, the line to a working delegate pulsing. Costs: two lanes take a word's width at 360, most plans need one, a move redraws the lines, and on a phone a step is edited on its own page.")
crewFirst = Option("crew-first", "C · Crew first", "Who needs you and who is working first, each with its progress, over a quiet to-do list. Costs: a delegate shows twice, and its step is edited from its to-do, not from the stack.", true)`;

/** The revision made on a pick: the card becomes one line, and only the picked way's canvas stays, its dials with it. */
export const decidedOf = (
  way: (typeof WAYS)[number],
  id: string
) => `root = Decisions("The plan view", [decided, picked], "Decided. Tune the tile, the line and the sweep in its frame's dials; the build starts from what you set.")
decided = Text("Decided: ${way.label}", "title")
picked = Preview("${id}")`;

const respond = (request: Seen): Reply => ({
  everyMs: 5,
  words: [request.tools ? "ok" : "Plan view"],
});

/** The frame `selector` names on `page`, once it is there; null until then. */
const frameAt = async (page: Page, selector: string): Promise<Frame | null> => {
  const handle = await page
    .locator(selector)
    .first()
    .elementHandle()
    .catch(() => null);
  return (await handle?.contentFrame()) ?? null;
};

/** The panel's frame once its page draws what `ready` names. */
const frameWith = async (page: Page, ready: string): Promise<Frame> =>
  (await until(
    `the panel's frame drawing ${ready}`,
    async () => {
      const frame = await frameAt(page, FRAME);
      const count =
        (await frame
          ?.locator(ready)
          .count()
          .catch(() => 0)) ?? 0;
      return count > 0 ? frame : null;
    },
    Boolean,
    90_000
  )) as Frame;

/** What the card holds: its options, the Recommended tags, the note, the embeds' addresses. */
const cardIn = (frame: Frame) =>
  frame.evaluate(() => {
    const card = document.querySelector("#decision-plan");
    return {
      cards: document.querySelectorAll("article.dp-card").length,
      options: [...(card?.querySelectorAll("[data-option]") ?? [])].map(
        (option) => option.getAttribute("data-option") ?? ""
      ),
      recommended: [...(card?.querySelectorAll("[data-option]") ?? [])]
        .filter((option) => option.querySelector(".dp-tag"))
        .map((option) => option.getAttribute("data-option") ?? ""),
      note: !!card?.querySelector(".dp-note textarea"),
      embeds: [...document.querySelectorAll("iframe")].map((one) => one.src),
      overflow: (() => {
        const width = document.documentElement.clientWidth;
        return {
          scroll: document.documentElement.scrollWidth - width,
          past: [...document.body.querySelectorAll("*")]
            .filter((el) => {
              if (el.closest("cawco-overlay, iframe")) {
                return false;
              }
              const box = el.getBoundingClientRect();
              let clipped = false;
              for (let at = el.parentElement; at; at = at.parentElement) {
                const x = getComputedStyle(at).overflowX;
                if (x !== "visible") {
                  clipped = true;
                  break;
                }
              }
              return box.width > 0 && box.right > width + 1 && !clipped;
            })
            .slice(0, 4)
            .map((el) => `${el.localName}.${el.className}`),
        };
      })(),
      decided:
        document.querySelector('p.text[data-role="title"]')?.textContent ?? "",
    };
  });

/** Each embedded canvas on the page: the variations it draws and how many plan rows. */
const canvasesOn = (page: Page) =>
  Promise.all(
    page
      .frames()
      .filter((one) => one.url().includes("canvas"))
      .map(async (one) =>
        one
          .evaluate(() => ({
            variations: [
              ...new Set(
                [...document.querySelectorAll("[data-variation]")].map(
                  (el) => el.getAttribute("data-variation") ?? ""
                )
              ),
            ],
            rows: document.querySelectorAll('[data-slot="plan-row"]').length,
            acks: [...document.querySelectorAll('[data-slot="ack"]')].map(
              (ack) => ack.textContent?.replace(/\s+/g, " ").trim() ?? ""
            ),
          }))
          .catch(() => ({
            variations: [] as string[],
            rows: 0,
            acks: [] as string[],
          }))
      )
  );

/** The variations drawn across every canvas frame, with plan rows in them. */
const drawnWays = async (page: Page): Promise<string[]> =>
  [
    ...new Set(
      (await canvasesOn(page))
        .filter((one) => one.rows > 0)
        .flatMap((one) => one.variations)
    ),
  ].sort();

const shoot = async (page: Page, name: string) => {
  const file = `plan-decision-${name}.png`;
  await page.screenshot({ path: join(CAPS, file), fullPage: false });
  copyFileSync(join(CAPS, file), join(CLONE_CAPS, file));
};

const spec: Spec = {
  name: "plan-decision",
  run: async (kit: Kit) => {
    mkdirSync(CAPS, { recursive: true });
    mkdirSync(CLONE_CAPS, { recursive: true });
    const fleet = await kit.fleet(respond);
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    const base = await fleet.dashboard();
    const writer = await fleet.spawn("claude", "Plan view", ROOT);
    const make = <T>(body: object) =>
      fleet.api<T>(`/api/instances/${writer}/artifacts`, body);

    // Each way's canvas, with its dials.
    const ids = {} as Record<(typeof WAYS)[number]["id"], string>;
    for (const way of WAYS) {
      const made = await make<{
        id: string;
        render?: {
          frames?: string[];
          unnamed?: string[];
          pageErrors?: unknown[];
        };
      }>({
        kind: "component",
        name: `plan-${way.id}`,
        file: `${STORIES}/${way.file}.stories.ts`,
        about: `${way.label}: the plan on the desk card, on the phone sheet, and live. Dials: tile size, line weight, sweep speed.`,
        dials: DIALS,
      });
      ids[way.id] = made.id;
      const frames = made.render?.frames ?? [];
      kit.check(
        `${way.label}: its canvas is made with its dials, and all ${frames.length} frames are drawn, none unnamed`,
        frames.length >= 6 &&
          frames.every((line) => line.includes("drawn")) &&
          (made.render?.unnamed?.length ?? 0) === 0 &&
          (made.render?.pageErrors?.length ?? 0) === 0,
        JSON.stringify(made.render).slice(0, 600)
      );
    }

    const page = await make<{ decisions?: string[]; id: string }>({
      kind: "page",
      name: "plan-view",
      program: programOf(ids),
    });
    kit.check(
      "the decision page publishes from its program, naming its one decision",
      JSON.stringify(page.decisions) === JSON.stringify(["plan"]),
      JSON.stringify(page)
    );
    const read = () =>
      fleet.api<{
        state: Record<string, { note?: string; options: string[] }>;
      }>(`/api/instances/${writer}/artifacts/${page.id}`);

    for (const view of ["desk", "phone"] as const) {
      for (const theme of ["light", "dark"] as const) {
        const leg = `${view === "desk" ? 1440 : 390} ${theme}`;
        const shown = await kit.page(view, { theme });
        const said: string[] = [];
        shown.on("pageerror", (error) => said.push(String(error)));
        shown.on("console", (message) => {
          if (message.type() === "error") {
            said.push(message.text());
          }
        });
        await open(shown, `${base}/session/${writer}`, '[data-slot="pane"]');
        const frame = await frameWith(shown, "#decision-plan");
        const ways = await until(
          `${leg}: each way's canvas drawing its plan`,
          () => drawnWays(shown),
          (drawn) => drawn.join(",") === "a,b,c",
          120_000
        ).catch(() => [] as string[]);
        await settle(shown, 400);
        const card = await cardIn(frame);
        kit.check(
          `${leg}: one card, three options, one Recommended (Crew first), a note field`,
          card.cards === 1 &&
            card.options.join(",") === "one-list,lanes,crew-first" &&
            card.recommended.join(",") === "crew-first" &&
            card.note,
          JSON.stringify(card)
        );
        kit.check(
          `${leg}: each option's embed draws its own way's live plan (${ways.join(", ")})`,
          ways.join(",") === "a,b,c",
          JSON.stringify(await canvasesOn(shown))
        );
        const acks = (await canvasesOn(shown)).flatMap((one) => one.acks);
        const told = (words: string) =>
          acks.filter((ack) => ack.includes(words)).length;
        kit.check(
          `${leg}: every way draws a step's acknowledgement: sent to Fable (${told("sent to Fable")}), seen by Fable with its reply (${told("Seen by Fable")}), a reworded to-do seen by this session (${told("Seen by this session")})`,
          told("sent to Fable") >= 3 &&
            told("Seen by Fable") >= 3 &&
            acks.some((ack) => ack.includes("closed_days only")) &&
            told("Seen by this session") >= 3,
          JSON.stringify(acks.slice(0, 6))
        );
        kit.check(
          `${leg}: nothing past the panel frame's width`,
          card.overflow.scroll <= 0 && card.overflow.past.length === 0,
          JSON.stringify(card.overflow)
        );
        await shoot(shown, `${view}-${theme}`);
        kit.check(
          `${leg}: no console errors`,
          said.length === 0,
          said.slice(0, 4).join(" | ")
        );
        await shown.close();
      }
    }

    // A pick and its note, as the person makes them on the desk.
    const desk = await kit.page("desk", { theme: "light" });
    const said: string[] = [];
    desk.on("pageerror", (error) => said.push(String(error)));
    await open(desk, `${base}/session/${writer}`, '[data-slot="pane"]');
    const frame = await frameWith(desk, "#decision-plan");
    await frame.locator('[data-option="crew-first"]').click();
    await frame
      .locator("#decision-plan .dp-note textarea")
      .fill("Keep the counts on the heads.");
    const picked = await until(
      "the pick and its note kept",
      read,
      (now) =>
        (now.state.plan?.options ?? []).join(",") === "crew-first" &&
        (now.state.plan?.note ?? "").includes("counts"),
      20_000
    ).catch(() => null);
    kit.check(
      "a pick is kept as the card's state, and its note with it",
      !!picked,
      JSON.stringify((await read()).state)
    );

    // The revision made on that pick: the card collapses to one line.
    const way = WAYS.find((one) => one.id === "crew-first") ?? WAYS[2];
    await fleet.api(
      `/api/instances/${writer}/artifacts/${page.id}/statements`,
      { statements: decidedOf(way, ids["crew-first"]) }
    );
    const after = await until(
      "the card collapsed",
      async () => cardIn(await frameWith(desk, "body")),
      (now) => now.cards === 0 && now.decided.includes("Decided"),
      30_000
    ).catch(() => null);
    const left = await until(
      "only the picked way's canvas left",
      () => drawnWays(desk),
      (drawn) => drawn.join(",") === "c",
      60_000
    ).catch(() => [] as string[]);
    kit.check(
      `a pick collapses the card to "Decided: C · Crew first", only its canvas left (${left.join(",")})`,
      !!after &&
        after.decided.includes("Decided: C · Crew first") &&
        left.join(",") === "c",
      JSON.stringify(after)
    );
    await shoot(desk, "decided-desk-light");
    kit.check(
      "the pick's desk: no page errors",
      said.length === 0,
      said.join(" | ")
    );
    kit.note(`captures in ${CAPS} and ${CLONE_CAPS}`);
  },
};

export default spec;
