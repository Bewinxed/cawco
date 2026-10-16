/**
 * The three ways into a design system (design-system plan §2, slice 2), on
 * a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model) and the built dashboard, read from the hub's answers and the
 * engine, one run each:
 *
 * 1. A design-template project with no design/: a task filed into its
 *    active stage raises one card in Caw's thread, naming what it would
 *    read, Build and Not now drawn under it.
 * 2. Not now writes the project's `design_offers` answer, and a second task
 *    into the active stage raises nothing.
 * 3. Build (another such project) files "Build the design system" in the
 *    first to-do stage, its description naming the design-system skill.
 * 4. A project whose folder has design/ is never asked.
 * 5. On an empty design project's board, with Jev on (a stand-in on
 *    `CAWCO_TYPESAFE_URL`, probe-kit jev-mock.ts), the "Build a design
 *    system" starter Jev offers for a design project with no design/ opens
 *    Caw's panel with its words in his composer, and sends nothing.
 *
 *   bun scripts/probe-kit/run.ts design-offers
 */
// biome-ignore-all lint/performance/noAwaitInLoops: a project's few threads, read one by one
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { jevMock, jevOn } from "../jev-mock";
import { COMPOSER_FIELD, type Kit, open, type Spec, settle } from "../kit";

const respond = (request: Seen): Reply => ({
  everyMs: 5,
  words: [request.tools ? "ok" : "Probe title"],
});

const STARTER = "Build a design system from our site and code";
/** The empty board's starter cards (StarterCards). */
const STARTERS = ".starter-cards .starter";
/** Caw's floating panel (CawFloat). */
const PANEL = "[data-caw-panel]";

interface Stage {
  kind: string;
  name: string;
}
interface Card {
  designOffer?: { projectId: string; sources: string[]; taskId: string };
  noteTitle: string;
}

const run = async (kit: Kit) => {
  // Jev answers each starters question with its first ask; it is on only
  // for 5, so 1 to 4 run as they always have.
  const jev = jevMock();
  const fleet = await kit.fleet(respond);
  fleet.env.CAWCO_TYPESAFE_URL = jev.url;
  fleet.env.CAWCO_STARTERS_PACE = "1500/5000";
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();

  const home = fleet.env.HOME as string;
  await writeFile(
    join(home, ".gitconfig"),
    "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
  );
  /** A design-template project on a folder of its own, Caw on. */
  const project = async (name: string) => {
    const src = join(fleet.sandbox, name);
    await mkdir(src, { recursive: true });
    await Bun.$`git init -q -b main && echo ${name} > README.md && git add -A && git commit -qm 'First commit'`
      .cwd(src)
      .env({ ...process.env, HOME: home })
      .quiet();
    return fleet.api<{ id: string; name: string }>("/api/projects", {
      name,
      machineId: MACHINE,
      cwd: src,
      caw: true,
      template: "design",
    });
  };
  const stagesOf = async (id: string) =>
    (await fleet.api<{ stages: Stage[] }>(`/api/projects/${id}/stages`)).stages;
  const fileActive = async (id: string, title: string) => {
    const active = (await stagesOf(id)).find((s) => s.kind === "active");
    return fleet.api<{ id: string }>(`/api/projects/${id}/tasks`, {
      title,
      stage: active?.name,
    });
  };
  /** Every design-offer card in the project's threads. */
  const cards = async (id: string): Promise<Card[]> => {
    const threads = await fleet.api<{ id: string }[]>(
      `/api/projects/${id}/threads`
    );
    const found: Card[] = [];
    for (const thread of threads) {
      const read = await fleet.api<{
        messages: (Card & { author: string })[];
      }>(`/api/projects/${id}/threads/${thread.id}`);
      found.push(
        ...read.messages.filter((m) => m.author === "event" && m.designOffer)
      );
    }
    return found;
  };
  const offerState = async (id: string) => {
    const answered = await fetch(
      `${fleet.base}/api/projects/${id}/design-offer`
    );
    return {
      status: answered.status,
      body: answered.ok
        ? ((await answered.json()) as {
            answer: string;
            builtTaskId: string | null;
          })
        : null,
    };
  };
  const post = async (path: string) => {
    const answered = await fetch(`${fleet.base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    return (await answered.json()) as {
      answer: string;
      builtTaskId: string | null;
    };
  };
  const quietly = (ms: number) => new Promise((done) => setTimeout(done, ms));

  // ── 1. a design task enters the active stage: one card ──────────────
  const harbour = await project("harbour");
  const first = await fileActive(harbour.id, "Design the onboarding flow");
  const raised = await until(
    "the design-offer card in Caw's thread",
    () => cards(harbour.id),
    (found) => found.length > 0,
    60_000
  );
  const base = await fleet.dashboard();
  const desk = await kit.page("desk");
  const threads = await fleet.api<{ id: string }[]>(
    `/api/projects/${harbour.id}/threads`
  );
  let drawn = { build: false, notNow: false, labels: [] as string[] };
  for (const thread of threads) {
    await open(
      desk,
      `${base}/session/thread:${thread.id}`,
      () => document.body.innerText.length > 0
    );
    await settle(desk, 600);
    const at = desk.locator(`[data-design-offer='${harbour.id}']`);
    if ((await at.count()) > 0) {
      // The card reads where the offer stands from the hub once drawn.
      await at
        .locator("button")
        .first()
        .waitFor({ timeout: 15_000 })
        .catch(() => undefined);
      // By accessible name: a button keeps its pending words in the DOM.
      const named = (name: string) =>
        at.getByRole("button", { name, exact: true }).count();
      drawn = {
        build: (await named("Build")) === 1,
        notNow: (await named("Not now")) === 1,
        labels: await at
          .locator("button")
          .evaluateAll((buttons) =>
            buttons.map((button) => button.textContent?.trim() ?? "")
          ),
      };
      await desk.screenshot({ path: join(kit.out, "offer-card.png") });
      break;
    }
  }
  const [card] = raised;
  kit.check(
    "1: a design task entering the active stage raises one card in Caw's thread, naming its sources, with Build and Not now",
    raised.length === 1 &&
      card?.designOffer?.taskId === first.id &&
      (card?.designOffer?.sources ?? []).includes(
        "the repository's styles and components"
      ) &&
      (card?.noteTitle ?? "").includes("This work needs a design system") &&
      drawn.build &&
      drawn.notNow,
    `drawn ${JSON.stringify(drawn)}; ${raised.length} card(s); “${card?.noteTitle}”; ${JSON.stringify(card?.designOffer)}`
  );

  // ── 2. Not now is recorded; a second task raises nothing ────────────
  const dismissed = await post(
    `/api/projects/${harbour.id}/design-offer/dismiss`
  );
  await fileActive(harbour.id, "Design the settings screen");
  await quietly(4000);
  const after = await cards(harbour.id);
  const row = await offerState(harbour.id);
  kit.check(
    "2: Not now writes the project's answer, and a second task into the active stage raises nothing",
    dismissed.answer === "dismissed" &&
      row.body?.answer === "dismissed" &&
      after.length === 1,
    `answered ${dismissed.answer}; stands ${row.status} ${row.body?.answer}; ${after.length} card(s)`
  );

  // ── 3. Build files the task, the skill named ────────────────────────
  const kestrel = await project("kestrel");
  await fileActive(kestrel.id, "Design the home screen");
  await until(
    "Kestrel's card",
    () => cards(kestrel.id),
    (found) => found.length === 1,
    60_000
  );
  const built = await post(`/api/projects/${kestrel.id}/design-offer/build`);
  const task = built.builtTaskId
    ? await fleet.api<{ description: string; stage: string; title: string }>(
        `/api/projects/${kestrel.id}/tasks/${built.builtTaskId}`
      )
    : undefined;
  const todo = (await stagesOf(kestrel.id)).find((s) => s.kind === "todo");
  kit.check(
    "3: Build files “Build the design system” in the first to-do stage, its description naming the design-system skill",
    built.answer === "built" &&
      task?.title === "Build the design system" &&
      task.stage === todo?.name &&
      task.description.includes("design-system skill"),
    `answered ${built.answer}; ${built.builtTaskId} “${task?.title}” in ${task?.stage} (first to-do ${todo?.name}); “${task?.description.slice(0, 160)}”`
  );

  // ── 4. a project with design/ is never asked ────────────────────────
  const plover = await project("plover");
  const wrote = await fetch(
    `${fleet.base}/api/projects/${plover.id}/folder/file`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        path: "design/DESIGN.md",
        content: "# Plover design system\n",
      }),
    }
  );
  await fileActive(plover.id, "Design the profile screen");
  await quietly(4000);
  const never = await cards(plover.id);
  const none = await offerState(plover.id);
  kit.check(
    "4: a project whose folder has design/ is never asked",
    wrote.ok && never.length === 0 && none.status === 404,
    `folder write ${wrote.status}; ${never.length} card(s); offer ${none.status}`
  );

  // ── 5. the starter puts its words in the field, sends nothing ───────
  await jevOn(fleet.base);
  const wren = await project("wren");
  await until(
    "Wren's starters",
    async () =>
      (
        await fleet.api<{ starters: { text: string }[] }>(
          `/api/projects/${wren.id}/stages`
        )
      ).starters,
    (starters) => starters.length > 0,
    60_000
  );
  const threadCount = async () =>
    (await fleet.api<{ id: string }[]>(`/api/projects/${wren.id}/threads`))
      .length;
  await open(desk, `${base}/project/${wren.id}`, STARTERS);
  await settle(desk);
  const shown = await desk
    .locator(STARTERS)
    .evaluateAll((cardsShown) =>
      cardsShown.map(
        (shownCard) =>
          shownCard.querySelector(".starter-text")?.textContent?.trim() ?? ""
      )
    );
  const before = await threadCount();
  // A board starter opens Caw's panel with its words in his composer.
  await desk.locator(STARTERS, { hasText: STARTER }).click();
  await desk
    .waitForSelector(`${PANEL} ${COMPOSER_FIELD}`, { timeout: 15_000 })
    .catch(() => undefined);
  // Long enough for a send the press must not have made to reach the hub.
  await desk.waitForTimeout(1500);
  const value = await desk.evaluate(
    (field) => document.querySelector(field)?.textContent?.trim() ?? "",
    `${PANEL} ${COMPOSER_FIELD}`
  );
  await desk.screenshot({ path: join(kit.out, "starter.png") });
  kit.check(
    "5: the design starter opens Caw's panel with its words in his composer, and sends nothing",
    shown.includes(STARTER) &&
      value === STARTER &&
      (await threadCount()) === before,
    `starters ${shown.join(" | ")}; field “${value}”; threads ${before} → ${await threadCount()}`
  );
  jev.stop();
};

export default { name: "design-offers", run } satisfies Spec;
