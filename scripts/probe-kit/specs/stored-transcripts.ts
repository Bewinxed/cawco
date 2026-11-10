/**
 * A transcript stored on a machine is reached again: one run inside a
 * project's folder there stands in Recent under that project, at the
 * person's last prompt in it, like a session the hub lists; every one is
 * found by Jump's search. Fed with one listing shaped like a real machine's
 * (the Recent bench's, stored-listing.ts: Claude, OpenCode and pi entries as
 * each harness fills them, with the person's last prompt, `wroteAt`).
 *
 * Jump's search, the hub's own (find.ts over a scratch hub database, the
 * machines' listings handed to it as `listStored` answers):
 * (j1) a stored transcript is found by its title, by its folder and by its
 *      machine's name, the ones in no project's folder too;
 * (j2) a transcript behind a session the hub holds is that session's one
 *      result, never a second.
 *
 * Recent (the bench at 1440, grouped by project):
 * (r1) a transcript in a project's folder (a subfolder of one too) stands
 *      under that project, at its place: after the session the person last
 *      wrote to before it, and before the older ones;
 * (r2) one in no project's folder is absent;
 * (r3) one behind a listed session adds no row: that session has its one;
 * (r4) one behind a session pressed Done stays hidden;
 * (r5) a stored row is Your turn, not unread, and offers no Done.
 *
 * Jump on the bench (its find answered by the same hub find):
 * (f1) a stored result stands among the sessions found by name;
 * (f2) a machine whose last listing left a harness out says so there, in
 *      the machine's words, with Try again.
 *
 * One screenshot at 1440 shows a stored row in Recent and a stored result
 * in Jump: `<out>/stored-transcripts-1440.png`.
 *
 *   bun scripts/probe-kit/run.ts stored-transcripts
 */
import { Database } from "bun:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  MINI,
  OBELISK,
  STORED,
  storedListing,
} from "../../../apps/dashboard/src/routes/(app)/motion/recent/stored-listing";
import type { FindAnswer } from "../../../packages/core/src/find";
import type { NeutralSessionInfo } from "../../../packages/core/src/harness";
import { catalogWords } from "../../../packages/core/src/words/catalog";
import { configureWords } from "../../../packages/core/src/words/configure";
import { sidebarWords } from "../../../packages/core/src/words/sidebar";
import { type Kit, open, type Spec, settle } from "../kit";

/** The bench's session ids (its `idOf`): `n` at a uuid's end. */
const idOf = (n: number) =>
  `5e55a0b0-0000-4000-8000-${String(n).padStart(12, "0")}`;
/** The bench's "Checkout returns 404 after payment", a listed session with its transcript stored. */
const CHECKOUT = idOf(3);
/** The bench's "Refund flow edge cases", pressed Done. */
const DONE = idOf(90);
const BENCH = "/motion/recent?rows=40";
const RECENT = '[data-slot="recent"]';

/** The hub's find, over a scratch database holding the bench's two machines and its two sessions with a stored transcript. */
async function hubFind(
  scratch: string,
  listing: Record<string, NeutralSessionInfo[]>
) {
  const dbPath = join(scratch, "hub", "hub.db");
  const { hubInProcess } =
    await import("../../../packages/hub/scripts/hub-in-process");
  const { db } = await hubInProcess(dbPath, join(scratch, "home"));
  const { answerFind, createFind } =
    await import("../../../packages/hub/src/find");
  for (const [machineId, os] of [
    [OBELISK, "linux-x64"],
    [MINI, "darwin-arm64"],
  ] as const) {
    db.upsertAgent({ machineId, hostname: machineId, os, online: true });
  }
  for (const [sessionId, title] of [
    [CHECKOUT, "Checkout returns 404 after payment"],
    [DONE, "Refund flow edge cases"],
  ] as const) {
    db.openInstance({
      id: sessionId,
      machineId: OBELISK,
      cwd: "/srv/storefront" as never,
      sessionId,
      harness: "claude",
      origin: "person",
      title,
      kind: "mainline",
      permissionMode: "bypassPermissions",
      model: "claude-opus-5-5",
    });
  }
  // Its harness session, as the machine's first frame of it writes it.
  const raw = new Database(dbPath);
  for (const id of [CHECKOUT, DONE]) {
    raw.query("UPDATE instances SET session_id = ? WHERE id = ?").run(id, id);
  }
  raw.close();
  const find = createFind({
    db,
    purged: () => new Set(),
    refreshInstances: () => undefined,
    online: () => true,
    needsYou: () => new Set(),
    artifactNeeds: () => ({ needs: [], notices: [] }) as never,
    stageKinds: async () => new Map(),
    tasksWaiting: async () => ({ missing: [], tasks: [] }),
    listStored: async (machineId) => ({
      sessions: listing[machineId] ?? [],
      unanswered: [],
      failed: [],
    }),
    askMachine: async () => ({
      catchingUp: false,
      conversations: [],
      indexedThrough: Date.now(),
      queryMs: 1,
      syncMs: 0,
    }),
  });
  const ask = (q: string, transcripts = false): Promise<FindAnswer> =>
    answerFind(find, { q, transcripts: transcripts ? "1" : "0" }, false, {
      caller: "stored-transcripts",
    });
  // The first find reads each machine's listing in the background, as the
  // hub's does; the names hold its transcripts once it has answered.
  for (let tries = 0; tries < 50; tries += 1) {
    const answer = await ask("webhook");
    if (answer.results.some((r) => r.kind === "conversation")) {
      break;
    }
    await Bun.sleep(100);
  }
  return ask;
}

/** A stored transcript's title as the listing gives it. */
const titleOf = (
  listing: Record<string, NeutralSessionInfo[]>,
  machineId: string,
  sessionId: string
): string =>
  listing[machineId]?.find((info) => info.sessionId === sessionId)?.summary ??
  "";

/** The stored conversations among an answer's results, by session id. */
const storedIn = (answer: FindAnswer): string[] =>
  answer.results.flatMap((r) =>
    r.kind === "conversation" && r.instanceId === null && r.sessionId
      ? [r.sessionId]
      : []
  );

async function search(kit: Kit, ask: (q: string) => Promise<FindAnswer>) {
  const { check } = kit;
  for (const [q, want, by] of [
    ["webhook", STORED.inStorefront, "its title"],
    ["Carousel captions", STORED.inSocials, "its title (OpenCode's)"],
    ["cockpit-1a2b3c4d", STORED.inWorkspace, "its folder, in no project"],
    ["Downloads", STORED.inDownloads, "its folder, in no project (pi's)"],
  ] as const) {
    const answer = await ask(q);
    check(
      `j1: “${q}” finds the stored transcript by ${by}`,
      storedIn(answer).includes(want),
      JSON.stringify(answer.results.map((r) => r.title))
    );
  }
  const mini = await ask("mac-mini");
  check(
    "j1: “mac-mini” finds both transcripts stored on that machine, by its name",
    storedIn(mini).includes(STORED.inPaperwork) &&
      storedIn(mini).includes(STORED.inDownloads),
    JSON.stringify(mini.results.map((r) => `${r.kind}:${r.title}`))
  );
  const checkout = await ask("Checkout returns 404");
  const its = checkout.results.filter(
    (r) => r.kind === "conversation" && r.sessionId === CHECKOUT
  );
  check(
    "j2: a transcript behind a session the hub holds is that session's one result",
    its.length === 1 &&
      its[0]?.kind === "conversation" &&
      its[0].instanceId === CHECKOUT,
    JSON.stringify(its)
  );
}

/** Recent's rows as drawn, in order: what each is, its group's path, its title. */
function readRecent(list: string) {
  const out: {
    archivable: boolean;
    group: string | null;
    key: string;
    text: string;
  }[] = [];
  let group: string | null = null;
  for (const li of document.querySelectorAll<HTMLElement>(
    `${list} li[data-slot="sidebar-menu-sub-item"]`
  )) {
    const path = li.getAttribute("data-recent-group");
    if (path) {
      group = path;
      continue;
    }
    const session = li.getAttribute("data-session-row");
    const stored = li.getAttribute("data-stored-row");
    if (!(session || stored)) {
      continue;
    }
    out.push({
      key: session ? `session:${session}` : `stored:${stored}`,
      group,
      text: (li.textContent ?? "").replace(/\s+/gu, " ").trim(),
      archivable: li.querySelector("[data-archivable]") !== null,
    });
  }
  return out;
}

async function recent(
  kit: Kit,
  bench: string,
  listing: Record<string, NeutralSessionInfo[]>,
  ask: (q: string, transcripts?: boolean) => Promise<FindAnswer>
) {
  const { check } = kit;
  const page = await kit.page("desk");
  // Grouped by project alone, so a row's place among its project's is the order it reads in.
  await page.addInitScript(() => {
    localStorage.setItem(
      "cawco-recent-groups",
      JSON.stringify(["project", null, null])
    );
  });
  // Jump's finds, answered by the hub's find over the same listing.
  await page.route("**/api/find?**", async (route) => {
    const url = new URL(route.request().url());
    const answer = await ask(
      url.searchParams.get("q") ?? "",
      url.searchParams.get("transcripts") !== "0"
    );
    await route.fulfill({ json: answer });
  });
  await page.route("**/api/find/waiting**", (route) =>
    route.fulfill({ json: { days: 14, items: [] } })
  );
  await open(page, `${bench}${BENCH}`, `${RECENT} [data-stored-row]`);
  await settle(page);
  const rows = await page.evaluate(readRecent, RECENT);
  const keys = rows.map((one) => one.key);
  const where = (key: string) => rows.find((one) => one.key === key);

  const storefront = `stored:${OBELISK}:${STORED.inStorefront}`;
  const at = keys.indexOf(storefront);
  const inGroup = rows.filter((one) => one.group === where(storefront)?.group);
  const place = inGroup.findIndex((one) => one.key === storefront);
  check(
    "r1: the Claude transcript run in storefront's folder stands under storefront, right after “Checkout returns 404 after payment” (its last prompt 25 min ago, the transcript's 50) and before the older rows",
    at >= 0 &&
      where(storefront)?.group === "project:p-storefront" &&
      inGroup[place - 1]?.key === `session:${CHECKOUT}` &&
      place < inGroup.length - 1,
    JSON.stringify(inGroup.map((one) => one.text.slice(0, 40)))
  );
  check(
    "r1: the OpenCode transcript in a subfolder of socials' stands under socials, and the pi one under Paperwork",
    where(`stored:${OBELISK}:${STORED.inSocials}`)?.group ===
      "project:p-socials" &&
      where(`stored:${MINI}:${STORED.inPaperwork}`)?.group ===
        "project:p-paperwork",
    JSON.stringify(rows.filter((one) => one.key.startsWith("stored:")))
  );
  check(
    "r2: the transcripts in no project's folder (a workspace checkout, ~/Downloads) are absent",
    !keys.some(
      (key) =>
        key.includes(STORED.inWorkspace) || key.includes(STORED.inDownloads)
    ),
    JSON.stringify(keys)
  );
  check(
    "r3: the transcript behind “Checkout returns 404 after payment” adds no row: the session has its one",
    keys.filter((key) => key.includes(CHECKOUT)).length === 1 &&
      keys.includes(`session:${CHECKOUT}`),
    JSON.stringify(keys.filter((key) => key.includes(CHECKOUT)))
  );
  check(
    "r4: the transcript behind the session pressed Done stays hidden",
    !keys.some((key) => key.includes(DONE)),
    JSON.stringify(keys.filter((key) => key.includes(DONE)))
  );
  const stood = where(storefront);
  check(
    "r5: a stored row says Your turn, at the quiet weight, and offers no Done",
    !!stood &&
      stood.text.includes(sidebarWords.yourTurn) &&
      !stood.archivable &&
      (await page
        .locator(
          `${RECENT} li[data-stored-row="${OBELISK}:${STORED.inStorefront}"] [data-slot="title"]`
        )
        .first()
        .evaluate((el) => Number(getComputedStyle(el).fontWeight) <= 400)),
    JSON.stringify(stood)
  );

  // A machine whose last listing left a harness out: online, its OpenCode
  // not listed in time.
  const words = catalogWords.harnessDidntAnswer("OpenCode", OBELISK, 10);
  await page.evaluate(
    ({ machine, sessions, said }) => {
      const debug = (
        globalThis as unknown as {
          __cawcoDebug: {
            standCatalog: (m: string, s: unknown[], l: string[]) => void;
            state: { machines: { machineId: string; status: string }[] };
          };
        }
      ).__cawcoDebug;
      debug.state.machines = debug.state.machines.map((one) =>
        one.machineId === machine ? { ...one, status: "online" } : one
      );
      debug.standCatalog(machine, sessions, [said]);
    },
    {
      machine: OBELISK,
      sessions: listing[OBELISK],
      said: words,
    }
  );
  await page.keyboard.press("ControlOrMeta+k");
  const field = page.locator('[data-slot="finder-field"] input').first();
  await field.waitFor();
  await field.fill("webhook");
  const result = page
    .locator("[data-find-row]")
    .filter({ hasText: titleOf(listing, OBELISK, STORED.inStorefront) })
    .first();
  await result.waitFor({ timeout: 10_000 });
  await settle(page);
  check(
    "f1: Jump finds the stored transcript among the sessions found by name",
    await result.isVisible()
  );
  const fault = page.locator(`[data-catalog-left-out="${OBELISK}"]`);
  const faultText = (await fault.count()) > 0 ? await fault.innerText() : "";
  check(
    "f2: the machine whose listing left OpenCode out says so beside the results, in its words, with Try again",
    faultText.includes(words) && faultText.includes(configureWords.tryAgain),
    faultText
  );
  const shot = join(kit.out, "stored-transcripts-1440.png");
  await page.screenshot({ path: shot });
  kit.note(`the screenshot at 1440: ${shot}`);
  await page.context().close();
}

export default {
  group: "The hub and machines",
  name: "stored-transcripts",
  ownProcess:
    "it builds the hub's find on a scratch database (hub-in-process.ts), whose config the hub's modules read once as they load",
  run: async (kit: Kit) => {
    const scratch = await mkdtemp(
      join(process.env.TMPDIR ?? tmpdir(), "stored-transcripts-")
    );
    try {
      const listing = storedListing(Date.now(), CHECKOUT, DONE);
      const ask = await hubFind(scratch, listing);
      await search(kit, ask);
      const bench = await kit.bench();
      await recent(kit, bench, listing, ask);
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  },
} satisfies Spec;
