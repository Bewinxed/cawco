/**
 * No read's answer leaves the dashboard's store older than the newest frame
 * the hub sent (heard.ts, client.svelte.ts `refresh`). On a scratch fleet, at
 * the desk, read from the page's socket and DOM, never from pixels.
 *
 * The board leg, the worst site the audit found: a session's row is the
 * board snapshot's, then each delta's. The page's connect-time read of
 * `/api/instances` is taken by the hub at once and held in the browser
 * (`page.route`) while the session is renamed; the rename's delta reaches the
 * page, and only then does the held answer land. The page must show the new
 * name: the hub sends a row only when it next changes, so a held answer that
 * put back the old name would stand. A page that makes no such read has
 * nothing to hold, and shows the delta's name.
 */
import type { Page } from "playwright-core";
import { readWithin } from "../../../packages/core/src/bounded";
import type { Reply } from "../../scratch-fleet";
import { until } from "../../scratch-fleet";
import { type Kit, type Spec, settle } from "../kit";

const BEFORE = "Quokka before";
const AFTER = "Quokka after";

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

/** The page's text as it reads now: which of the two names it shows. */
const shown = async (page: Page) => {
  const text = await page.evaluate(() => document.body.innerText);
  return { before: text.includes(BEFORE), after: text.includes(AFTER) };
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
  const base = await fleet.dashboard();

  const session = await fleet.spawn("claude", "Stale answers", fleet.repo);
  const rename = async (title: string) => {
    const response = await fetch(`${fleet.base}/api/instances/${session}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!response.ok) {
      throw new Error(
        `PATCH title: ${response.status} ${await response.text()}`
      );
    }
  };
  await rename(BEFORE);
  await until(
    "the hub's row named before",
    async () =>
      (
        await fleet.api<{ id: string; title?: string }[]>("/api/instances")
      ).find((row) => row.id === session)?.title,
    (title) => title === BEFORE,
    30_000
  );

  const page = await kit.page("desk");
  // Every frame the page's socket receives, as text.
  const frames: string[] = [];
  page.on("websocket", (socket) => {
    socket.on("framereceived", ({ payload }) => {
      frames.push(String(payload));
    });
  });
  // The connect-time read of the board: the hub answers it now, and the
  // browser holds the answer until `release`.
  let reads = 0;
  let taken: () => void = () => undefined;
  const answerTaken = new Promise<void>((done) => {
    taken = done;
  });
  let release: () => void = () => undefined;
  const released = new Promise<void>((done) => {
    release = done;
  });
  let landed = false;
  await page.route(`${base}/api/instances`, async (route) => {
    reads += 1;
    if (reads > 1) {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    taken();
    await released;
    await route.fulfill({ response });
    landed = true;
  });

  await page.goto(`${base}/session/${session}`, {
    waitUntil: "domcontentloaded",
  });
  await until(
    "the board snapshot on the page's socket",
    () =>
      frames.some(
        (text) => text.includes('"kind":"instances"') && text.includes(BEFORE)
      ),
    Boolean,
    60_000
  );
  // A page that reads the board over HTTP does so as the snapshot lands.
  const taking = await readWithin(5000, () => answerTaken);
  const read = taking.kind === "answered";
  kit.note(
    read
      ? "the page read /api/instances on connect: its answer, taken by the hub before the rename, is held"
      : "the page made no read of /api/instances within 5 s of the snapshot: nothing to hold"
  );

  await rename(AFTER);
  await until(
    "the rename's delta on the page's socket",
    () =>
      frames.some(
        (text) => text.includes("instances_delta") && text.includes(AFTER)
      ),
    Boolean,
    30_000
  );
  release();
  if (read) {
    await until("the held answer landed", () => landed, Boolean, 10_000);
  }
  // The answer's adoption, the rail and the tab redrawn after it.
  await Bun.sleep(1000);
  await settle(page);
  const now = await until(
    "a name on the page",
    () => shown(page),
    (names) => names.before || names.after,
    15_000
  ).catch(() => shown(page));
  kit.check(
    "board: a read answered before a delta and landing after it leaves the delta's name standing",
    now.after && !now.before,
    `${JSON.stringify(now)}; /api/instances reads ${reads}${read ? ", the first held past the delta" : ""}`
  );
};

const spec: Spec = { name: "stale-answers", run };
export default spec;
