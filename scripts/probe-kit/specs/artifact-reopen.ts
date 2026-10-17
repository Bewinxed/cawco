/**
 * An artifact a session showed opens again from its row in the transcript
 * after the panel was closed (owner: "there's no way for me to open
 * previews right now if the're previously lcosed?"). On a scratch fleet, at
 * the desk (1440), read from the page's DOM and the hub's answers, never
 * from pixels:
 *
 * 1. With the session's page open, the session shows page A then page B;
 *    the panel shows B.
 * 2. The panel's Close closes it: no preview pane, the hub shows nothing.
 * 3. Pressing A's tool row opens the panel on A: the pane's frame reads A's
 *    heading, and the hub says A is shown.
 * 4. Pressing B's tool row switches the open panel to B, the same way.
 * 5. After a reload (rows read back from the stored transcript) and Close,
 *    A's row opens the panel on A again.
 */
import type { Page } from "playwright-core";
import type { Reply, Seen } from "../../scratch-fleet";
import { until } from "../../scratch-fleet";
import { type Kit, open, type Spec, settle } from "../kit";

const CREATE = "mcp__cawco__artifact_create";
const COMMAND = /PROBE-CALL:(\d+)/g;
const ANSWERED_ID = /"id":"([0-9a-f-]{36})"/;
const PANE =
  ':is([data-slot="preview-pane"], [data-side-surface-class~="preview-pane"])';

const pageOf = (heading: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${heading}</title></head><body><h1>${heading}</h1></body></html>`;

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

/** What the panel shows now: whether its pane is there, and its frame's heading. */
const panel = async (page: Page) => {
  const panes = await page.locator(PANE).count();
  const heading = panes
    ? await page
        .frameLocator(`${PANE} iframe[title="Preview"]`)
        .locator("h1")
        .textContent({ timeout: 1000 })
        .catch(() => null)
    : null;
  return { panes, heading };
};

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const session = await fleet.spawn("claude", "Reopen", fleet.repo);

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
  const shownOnHub = async (id: string) =>
    (await fleet.api<{ shown: boolean }>(`/api/artifacts/${id}`)).shown;

  const base = await fleet.dashboard();
  const page = await kit.page("desk");
  // The panel's menu comes with the first artifact: the session's pane is the page's readiness.
  await open(page, `${base}/session/${session}`, '[data-slot="pane"]');

  // 1. A, then B, shown while the page is open.
  const a = (
    await call(CREATE, { kind: "page", name: "alpha", html: pageOf("Alpha") })
  ).match(ANSWERED_ID)?.[1];
  const b = (
    await call(CREATE, { kind: "page", name: "beta", html: pageOf("Beta") })
  ).match(ANSWERED_ID)?.[1];
  if (!(a && b)) {
    kit.check("1: artifact_create answers both ids", false, `${a} ${b}`);
    return;
  }
  const first = await until(
    "the panel showing Beta",
    () => panel(page),
    (now) => now.heading === "Beta",
    30_000
  ).catch(() => panel(page));
  kit.check(
    "1: the panel shows the newest artifact",
    first.panes === 1 && first.heading === "Beta",
    JSON.stringify(first)
  );

  // 2. The person closes the panel.
  await settle(page);
  await page.locator(`${PANE} [data-slot="close"]`).click();
  const closed = await until(
    "the panel gone",
    () => panel(page),
    (now) => now.panes === 0,
    10_000
  ).catch(() => panel(page));
  const closedOnHub = (await shownOnHub(a)) || (await shownOnHub(b));
  kit.check(
    "2: Close takes the pane away and the hub shows nothing",
    closed.panes === 0 && !closedOnHub,
    `${JSON.stringify(closed)}; hub shows one: ${closedOnHub}`
  );
  await settle(page);
  // A closed artifact's card reads as pressable: drawn whole, never faded as a disabled control is.
  const cards = await page
    .locator(".preview-tool")
    .evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).opacity));
  kit.check(
    "2: with the panel closed every artifact card is drawn at full opacity",
    cards.length === 2 && cards.every((opacity) => opacity === "1"),
    JSON.stringify(cards)
  );

  /** Presses `id`'s tool row; what the panel and the hub show after. */
  const press = async (id: string, heading: string) => {
    const row = page.locator(
      `.preview-tool[data-artifact="${id}"] button.artifact-open`
    );
    const rows = await row.count();
    if (rows !== 1) {
      return { rows, now: await panel(page), hub: false };
    }
    await row.scrollIntoViewIfNeeded();
    await row.click();
    const now = await until(
      `the panel showing ${heading}`,
      () => panel(page),
      (shown) => shown.panes === 1 && shown.heading === heading,
      15_000
    ).catch(() => panel(page));
    const hub = await until(
      `the hub showing ${heading}`,
      () => shownOnHub(id),
      Boolean,
      10_000
    ).catch(() => false);
    await settle(page);
    return { rows, now, hub };
  };

  // 3. A's row opens the closed panel on A.
  const reopened = await press(a, "Alpha");
  kit.check(
    "3: pressing A's tool row with the panel closed opens it on A",
    reopened.rows === 1 &&
      reopened.now.panes === 1 &&
      reopened.now.heading === "Alpha" &&
      reopened.hub,
    JSON.stringify(reopened)
  );

  // 4. B's row switches the open panel to B.
  const switched = await press(b, "Beta");
  kit.check(
    "4: pressing B's tool row switches the open panel to B",
    switched.rows === 1 &&
      switched.now.panes === 1 &&
      switched.now.heading === "Beta" &&
      switched.hub,
    JSON.stringify(switched)
  );

  // 5. Rows read back from the stored transcript: a reload, Close, then A's row.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(`${PANE} [data-slot="close"]`);
  await settle(page);
  await page.locator(`${PANE} [data-slot="close"]`).click();
  await until(
    "the panel gone after the reload",
    () => panel(page),
    (now) => now.panes === 0,
    10_000
  ).catch(() => undefined);
  await settle(page);
  const stored = await press(a, "Alpha");
  kit.check(
    "5: after a reload and Close, A's row from the stored transcript opens the panel on A",
    stored.rows === 1 &&
      stored.now.panes === 1 &&
      stored.now.heading === "Alpha" &&
      stored.hub,
    JSON.stringify(stored)
  );
};

const spec: Spec = { name: "artifact-reopen", run };
export default spec;
