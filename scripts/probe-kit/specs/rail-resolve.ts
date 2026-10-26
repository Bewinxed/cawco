/**
 * Resolving or reopening a comment never changes the Comments rail's tab
 * (the owner: "resolving a comment opens the resolved tab in the comments,
 * incorrect ux"). The comment leaves the list in front of him, folding
 * away, and the focus moves to the next comment in the same tab (the one
 * before it when it was last; none when the tab empties, which shows the
 * tab's empty state); J and K walk only the rows he sees.
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model) and the built dashboard, in Chromium and WebKit at 1440 and
 * 390: a page with three open comments, the rail on Open. Resolve the
 * middle row (its Resolve on a desk; its thread's under a finger): the tab
 * stays Open, the list shows two, the focus is on the old third row, and J
 * and K step only between the two. Resolve both: Open's empty state, still
 * on Open. On Resolved, reopen one: the tab stays Resolved.
 *
 *   bun scripts/probe-kit/run.ts rail-resolve
 */
import type { Frame, Page } from "playwright-core";
import type { Pin } from "../../../packages/core/src/comments";
import { commentWords } from "../../../packages/core/src/words/comments";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import {
  COMPOSER,
  type Engine,
  type Kit,
  open,
  type Spec,
  settle,
  VIEWS,
  type View,
} from "../kit";
import { writePagePins } from "../pins";

const COMMAND = /PROBE-CALL:(\d+)/g;
const FRAME = 'iframe[title="Preview"]';
const RAIL = '[data-slot="comment-rail"]';
const PANE = ':is([data-slot="preview-pane"], [data-side-card="preview"])';

const asks = new Map<string, { input: object; name: string }>();
const issued = new Set<string>();
const answered = new Map<string, string>();

const respond = (request: Seen): Reply => {
  const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
  if (!request.tools) {
    return text("Probe title");
  }
  const marker = [...request.all.matchAll(COMMAND)].at(-1)?.[1];
  const ask = marker ? asks.get(marker) : undefined;
  if (!(marker && ask)) {
    return text("ok");
  }
  if (issued.has(marker)) {
    if (!answered.has(marker)) {
      answered.set(marker, request.last);
    }
    return text("done");
  }
  if (request.toolNames.includes(ask.name)) {
    issued.add(marker);
    return { everyMs: 5, words: [], tool: ask };
  }
  return request.toolNames.includes("ToolSearch")
    ? {
        everyMs: 5,
        words: [],
        tool: {
          name: "ToolSearch",
          input: { query: `select:${ask.name}`, max_results: 1 },
        },
      }
    : text(`${ask.name} is not offered`);
};

const pageHtml = (leg: string) => `<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<style>body { margin: 0; font: 18px/1.6 system-ui; } main { padding: 24px; } p { margin: 0 0 32px; }</style></head>
<body data-leg="${leg}"><main>
  <p id="one">The first paragraph, to comment on.</p>
  <p id="two">The second paragraph, to comment on.</p>
  <p id="three">The third paragraph, to comment on.</p>
</main></body></html>`;

interface Fleet {
  base: string;
  call: (tool: string, input: object) => Promise<string>;
  session: string;
}

const setUp = async (kit: Kit): Promise<Fleet> => {
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const session = await fleet.spawn("claude", "Rail", fleet.repo);
  let sent = 0;
  const call = async (tool: string, input: object): Promise<string> => {
    sent += 1;
    const marker = String(sent);
    asks.set(marker, { name: tool, input });
    await fleet.send(session, `PROBE-CALL:${marker}`);
    return (await until(
      `the ${tool} call (${marker})`,
      () => answered.get(marker),
      Boolean,
      180_000
    )) as string;
  };
  return { base: await fleet.dashboard(), call, session };
};

/** The pane's frame once it shows leg `leg`'s page with its doc joined. */
const legFrame = (screen: Page, leg: string) =>
  until(
    "the page in the panel",
    async () => {
      if ((await screen.locator(FRAME).count()) === 0) {
        return null;
      }
      const frame = await (
        await screen.locator(FRAME).first().elementHandle({ timeout: 2000 })
      )?.contentFrame();
      const on = await frame
        ?.evaluate(
          (want) =>
            document.body?.dataset.leg === want &&
            !!(window as unknown as { cawcoArtifact?: unknown }).cawcoArtifact,
          leg
        )
        .catch(() => false);
      return on && frame ? frame : null;
    },
    Boolean,
    60_000
  ) as Promise<Frame>;

/** Three open comments, one on each paragraph, written as the page writes them. */
const threePins = async (frame: Frame) => {
  const at = Date.now();
  const pins: Pin[] = ["one", "two", "three"].map((id, i) => {
    const when = new Date(at + i * 1000).toISOString();
    const pinId = crypto.randomUUID();
    return {
      id: pinId,
      number: i + 1,
      kind: "comment",
      anchor: { selector: `#${id}`, source: null, text: `The ${id}` },
      at: when,
      by: "person",
      elements: [],
      title: `Paragraph ${id}`,
      thread: [
        { id: crypto.randomUUID(), by: "person", text: `On ${id}.`, at: when },
      ],
    };
  });
  await writePagePins(frame, ...pins);
};

/** The rail as it stands: its tab, its rows in order (each by its pill's number), the focused one, and its empty line. */
const railNow = (screen: Page) =>
  screen.evaluate((rail) => {
    const root = document.querySelector(rail);
    const rows = [...(root?.querySelectorAll("[data-pin-row]") ?? [])]
      // A row folding away stands until its fold ends: what he sees is the rest.
      .filter((row) => !row.closest("li")?.getAnimations().length)
      .map((row) => Number(row.getAttribute("data-pin-row")));
    return {
      tab:
        root
          ?.querySelector('[role="tab"][aria-selected="true"]')
          ?.textContent?.trim() ?? null,
      rows,
      focused: Number(
        root
          ?.querySelector("[data-pin-row][data-focused]")
          ?.getAttribute("data-pin-row") ?? 0
      ),
      empty:
        root
          ?.querySelector('[data-slot="pin-list-empty"]')
          ?.textContent?.trim() ?? null,
    };
  }, RAIL);

/** The rail open, on tab `tab`. */
const railOn = async (screen: Page, tab: string) => {
  const toggle = screen.locator(`${PANE} button[data-slot="comments"]`);
  if (
    (await toggle.getAttribute("aria-expanded").catch(() => null)) !== "true"
  ) {
    await toggle.click().catch(() => undefined);
  }
  await screen.locator(RAIL).waitFor({ timeout: 10_000 });
  await screen
    .locator(`${RAIL} [role="tab"]`)
    .filter({ hasText: tab })
    .first()
    .click()
    .catch(() => undefined);
  await settle(screen, 400);
};

/**
 * Pin `n`'s row resolved (or reopened) as a person does there: on a desk,
 * the row's own Resolve; under a finger, which has none, its thread's head.
 * Its row is focused first, as his press on it focuses it.
 */
const toggleResolve = async (screen: Page, n: number, touch: boolean) => {
  const row = screen.locator(`${RAIL} [data-pin-row="${n}"]`);
  if (touch) {
    await row.click();
    const card = screen.locator(`[data-slot="pin-card"][data-pin-card="${n}"]`);
    await card.waitFor({ timeout: 10_000 });
    await card
      .getByRole("button", {
        name: new RegExp(`^(${commentWords.resolve}|${commentWords.reopen})$`),
      })
      .first()
      .click();
    await settle(screen, 400);
    await card
      .getByRole("button", { name: commentWords.close, exact: true })
      .click()
      .catch(() => undefined);
    await card
      .waitFor({ state: "detached", timeout: 5000 })
      .catch(() => undefined);
  } else {
    await row.click();
    const card = screen.locator(`[data-slot="pin-card"][data-pin-card="${n}"]`);
    await card.waitFor({ timeout: 10_000 }).catch(() => undefined);
    await card
      .getByRole("button", { name: commentWords.close, exact: true })
      .click()
      .catch(() => undefined);
    await row.hover();
    await screen
      .locator(`${RAIL} li:has([data-pin-row="${n}"])`)
      .getByRole("button", {
        name: new RegExp(`^(${commentWords.resolve}|${commentWords.reopen})$`),
      })
      .first()
      .click();
  }
  await settle(screen, 600);
};

interface Leg {
  engine: Engine;
  view: View;
}

const LEGS: Leg[] = [
  { engine: "chromium", view: "desk" },
  { engine: "chromium", view: "phone" },
  { engine: "webkit", view: "desk" },
  { engine: "webkit", view: "phone" },
];

const legChecks = async (kit: Kit, fleet: Fleet, leg: Leg) => {
  const name = `${leg.engine} ${VIEWS[leg.view].width}`;
  const key = `${leg.engine}-${leg.view}`.toLowerCase();
  const { touch } = VIEWS[leg.view];
  const screen = await kit.page(leg.view, { engine: leg.engine });
  const said: string[] = [];
  screen.on("pageerror", (error) => said.push(`pageerror: ${error.message}`));
  screen.on("console", (message) => {
    if (message.type() === "error") {
      said.push(`error: ${message.text()}`);
    }
  });
  try {
    await open(screen, `${fleet.base}/session/${fleet.session}`, COMPOSER);
    await fleet.call("mcp__cawco__artifact_create", {
      kind: "page",
      does: "judge",
      ask: "Comment on the paragraphs",
      name: `rail-${key}`,
      html: pageHtml(key),
    });
    const frame = await legFrame(screen, key);
    await threePins(frame);
    await railOn(screen, commentWords.open);
    const start = await until(
      "three open rows",
      () => railNow(screen),
      (now) => now.rows.length === 3,
      15_000
    ).catch(() => railNow(screen));
    const [, middle, third] = start.rows;
    await toggleResolve(screen, middle as number, touch);
    const after = await until(
      "the middle row gone",
      () => railNow(screen),
      (now) => now.rows.length === 2,
      5000
    ).catch(() => railNow(screen));
    kit.check(
      `${name}: resolving the middle comment keeps the rail on ${commentWords.open}, the list shows two, and the focus is on the old third row`,
      !!after.tab?.startsWith(commentWords.open) &&
        after.rows.length === 2 &&
        !after.rows.includes(middle as number) &&
        after.focused === third,
      JSON.stringify({ start, after })
    );
    // J and K walk the rows he sees: never the resolved one.
    const walked: number[] = [];
    // The keys go to the pane: its focused row holds the keyboard's focus, as a Tab onto it does.
    await screen
      .locator(`${RAIL} [data-pin-row][data-focused]`)
      .focus()
      .catch(() => undefined);
    for (const step of ["j", "k", "j", "k"]) {
      // biome-ignore lint/performance/noAwaitInLoops: one key, then the next, each read
      await screen.keyboard.press(step);
      await settle(screen, 200);
      walked.push((await railNow(screen)).focused);
    }
    const shown = (await railNow(screen)).rows;
    kit.check(
      `${name}: J and K walk only the rows he sees, never the resolved comment's`,
      walked.every((n) => shown.includes(n)) &&
        new Set(walked).size === shown.length,
      JSON.stringify({ walked, shown })
    );
    for (const n of [...shown]) {
      // biome-ignore lint/performance/noAwaitInLoops: one comment resolved at a time
      await toggleResolve(screen, n, touch);
    }
    const emptied = await until(
      "Open emptied",
      () => railNow(screen),
      (now) => now.rows.length === 0,
      5000
    ).catch(() => railNow(screen));
    kit.check(
      `${name}: resolving the last ones leaves the rail on ${commentWords.open}, showing its empty state ("${commentWords.noneOpen}")`,
      !!emptied.tab?.startsWith(commentWords.open) &&
        emptied.rows.length === 0 &&
        !!emptied.empty?.includes(commentWords.noneOpen),
      JSON.stringify(emptied)
    );
    await railOn(screen, commentWords.resolved);
    const resolved = await railNow(screen);
    const back = resolved.rows[0] as number;
    await toggleResolve(screen, back, touch);
    const reopened = await until(
      "the reopened row gone from Resolved",
      () => railNow(screen),
      (now) => !now.rows.includes(back),
      5000
    ).catch(() => railNow(screen));
    kit.check(
      `${name}: reopening a comment from ${commentWords.resolved} keeps the rail on ${commentWords.resolved}, the comment gone from its list`,
      !!reopened.tab?.startsWith(commentWords.resolved) &&
        !reopened.rows.includes(back) &&
        reopened.rows.length === resolved.rows.length - 1,
      JSON.stringify({ resolved, reopened })
    );
  } finally {
    kit.check(
      `${name}: the pages said no error`,
      said.length === 0,
      said.slice(0, 6).join(" | ") || "none"
    );
    await screen.close();
  }
};

const run = async (kit: Kit) => {
  const fleet = await setUp(kit);
  for (const leg of LEGS) {
    // biome-ignore lint/performance/noAwaitInLoops: one leg, then the next, on the one fleet
    await legChecks(kit, fleet, leg);
  }
};

const spec: Spec = {
  group: "Previews, pages and comments",
  name: "rail-resolve",
  run,
};
export default spec;
