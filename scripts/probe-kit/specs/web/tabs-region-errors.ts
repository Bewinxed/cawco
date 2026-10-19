/**
 * Nothing stops the tabs region, and an error in it reaches the hub's
 * error log as what was thrown (owner, on nightly 4343's tabs strip replaced
 * by "The tabs stopped after an error": "tf"; the hub logged it twice as
 * `{"message":"[object Object]","stack":""}`).
 *
 * That value was Svelte's own: a hydration mismatch throws its private
 * sentinel `HYDRATION_ERROR`, an empty plain object (svelte constants.js),
 * which top-level `hydrate()` catches to mount the page afresh. Svelte
 * 5.57.1's boundaries caught it first (boundary.js
 * `#hydrate_resolved_content`, then `#handle_error`) and handed it to
 * SvelteKit's `transformError`, so the client `handleError` was given `{}`
 * and the region its failed line (sveltejs/svelte#18840, fixed in 5.57.2 by
 * #18841). A scratch fleet (real hub, agent and sessiond against the mock
 * model) with four sessions open as one group's tabs, the built dashboard
 * on the desk view:
 *
 *  a. the timeline the hub's journal gave: the page connected, the hub
 *     announces an update restart, the window hides and blurs, the hub
 *     stops, the page reloads while it is away (the reload a newer build
 *     asks for) and again the moment it answers, then the window comes back.
 *     No region fails, no error the page sends the hub says
 *     "[object Object]" or "{}", and each load hydrates with no mismatch
 *     (Svelte's `hydration_mismatch` warning unheard): the page as served
 *     is never what alters itself;
 *  b. the mismatch itself: the server-rendered strip altered before it
 *     hydrates (one node more in each tab, as a browser's or an extension's
 *     rewrite of the page does). The tabs region stands with its four tabs,
 *     no region fails, and the hub is sent no `{}`. Where a region did fail,
 *     Try again rebuilds it.
 *
 *   bun scripts/probe-kit/run.ts web tabs-region-errors
 */
import type { Page } from "playwright-core";
import type { Reply } from "../../../scratch-fleet";
import { type Kit, open, type Spec, settle } from "../../kit";

const TABS = 4;
const STRIP = "[data-session-tabs] [data-session-tab]";
const FAILED = "[data-region-failed]";
/** What a thrown value without words of its own read as, before and after hooks.client.ts's 4834a400e. */
const WORDLESS = new Set(["[object Object]", "{}"]);

declare global {
  interface Window {
    /** Every console.error and uncaught value, each written out where it was thrown. */
    probeErrors: { args: unknown[]; kind: string }[];
    /** How many hydration mismatches Svelte has warned of (warnings.js `hydration_mismatch`). */
    probeMismatches: number;
  }
}

/** Installed before the page's own scripts: what each error was, in the page's own words. */
function captureErrors(): void {
  window.probeErrors = [];
  const words = (value: unknown): unknown => {
    if (
      value instanceof Error ||
      Object.prototype.toString.call(value) === "[object Error]"
    ) {
      const error = value as Error;
      return { error: error.name, message: error.message };
    }
    if (typeof value !== "object" || value === null) {
      return String(value);
    }
    let json: string;
    try {
      json = JSON.stringify(value);
    } catch {
      json = "[unserialisable]";
    }
    return {
      ctor: Object.getPrototypeOf(value)?.constructor?.name ?? null,
      json: json.slice(0, 300),
    };
  };
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    window.probeErrors.push({ kind: "console.error", args: args.map(words) });
    original(...args);
  };
  // A production build says a mismatch only as a console warning with its
  // link (`https://svelte.dev/e/hydration_mismatch`), and recovers from it.
  window.probeMismatches = 0;
  const warn = console.warn.bind(console);
  console.warn = (...args: unknown[]) => {
    if (args.some((arg) => String(arg).includes("hydration_mismatch"))) {
      window.probeMismatches += 1;
    }
    warn(...args);
  };
  window.addEventListener("error", (event) =>
    window.probeErrors.push({
      kind: "error",
      args: [words(event.error ?? event.message)],
    })
  );
  window.addEventListener("unhandledrejection", (event) =>
    window.probeErrors.push({
      kind: "unhandledrejection",
      args: [words(event.reason)],
    })
  );
}

/** The window leaving and coming back as a switch to another one does it. */
const away = (page: Page, hidden: boolean) =>
  page.evaluate((hide) => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => (hide ? "hidden" : "visible"),
    });
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => hide,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event(hide ? "blur" : "focus"));
  }, hidden);

/** The page's state: failed regions, its tabs, and the errors heard since the last read. */
const readPage = (page: Page) =>
  page.evaluate(
    ({ failed, strip }) => ({
      failed: [...document.querySelectorAll(failed)].map((el) =>
        el.getAttribute("data-region-failed")
      ),
      tabs: document.querySelectorAll(strip).length,
      errors: window.probeErrors.splice(0),
      mismatches: window.probeMismatches,
    }),
    { failed: FAILED, strip: STRIP }
  );

/** Every error report the page sends the hub (hooks.client.ts `report`), as sent. */
function hubReports(page: Page): { message: string; stack: string }[] {
  const sent: { message: string; stack: string }[] = [];
  page.on("request", (request) => {
    if (!request.url().endsWith("/api/dashboard-errors")) {
      return;
    }
    try {
      const body = JSON.parse(request.postData() ?? "{}") as {
        message?: string;
        stack?: string;
      };
      sent.push({ message: body.message ?? "", stack: body.stack ?? "" });
    } catch {
      sent.push({ message: request.postData() ?? "", stack: "" });
    }
  });
  return sent;
}

/** A desk page with `ids` open as one group's tabs. */
async function tabsPage(kit: Kit, ids: string[]) {
  const page = await kit.page("desk", { init: [captureErrors] });
  await page.addInitScript((tabs) => {
    localStorage.setItem(
      "cawco-workspace",
      JSON.stringify({
        v: 1,
        root: { t: "l", id: "pone", tabs, active: tabs[0], opened: null },
        focusedLeaf: "pone",
      })
    );
  }, ids);
  return page;
}

/** Waits for the strip to stand with every tab, or a region to fail. */
const stripOrFailure = (page: Page) =>
  page
    .waitForFunction(
      ({ failed, strip, count }) =>
        document.querySelector(failed) !== null ||
        document.querySelectorAll(strip).length === count,
      { failed: FAILED, strip: STRIP, count: TABS },
      { timeout: 60_000 }
    )
    .catch(() => undefined);

/** Holds a read to the invariant: no region failed, no wordless error, the strip whole. */
function checkRead(
  kit: Kit,
  step: string,
  read: Awaited<ReturnType<typeof readPage>>,
  /** Whether the strip is drawn yet: not while the hub is away. */
  strip = true
) {
  kit.check(
    `${step}: no region stopped`,
    read.failed.length === 0,
    `failed: ${read.failed.join(", ")}; errors: ${JSON.stringify(read.errors).slice(0, 600)}`
  );
  if (!strip) {
    return;
  }
  kit.check(
    `${step}: the strip stands with its ${TABS} tabs`,
    read.tabs === TABS,
    `${read.tabs} tab(s)`
  );
}

/** The page as served hydrates whole: Svelte warned of no mismatch on this load. */
function checkHydrated(
  kit: Kit,
  step: string,
  read: Awaited<ReturnType<typeof readPage>>
) {
  kit.check(
    `${step}: the page as served hydrates with no mismatch`,
    read.mismatches === 0,
    `${read.mismatches} hydration_mismatch warning(s)`
  );
}

/** Every report sent the hub says what was thrown: never "[object Object]" or "{}". */
function checkReports(
  kit: Kit,
  step: string,
  sent: { message: string; stack: string }[]
) {
  const wordless = sent.filter((one) => WORDLESS.has(one.message));
  kit.check(
    `${step}: every error the hub is sent says what was thrown`,
    wordless.length === 0,
    `${sent.length} sent: ${JSON.stringify(sent).slice(0, 600)}`
  );
}

/** Where a region failed, Try again rebuilds it whole. */
async function tryAgain(kit: Kit, step: string, page: Page) {
  const failed = await page.locator(FAILED).count();
  if (failed === 0) {
    return;
  }
  await page
    .locator(`${FAILED} button`, { hasText: "Try again" })
    .first()
    .click();
  await stripOrFailure(page);
  await settle(page, 500);
  const after = await readPage(page);
  kit.check(
    `${step}: Try again rebuilds the tabs`,
    after.failed.length === 0 && after.tabs === TABS,
    `failed: ${after.failed.join(", ")}; ${after.tabs} tab(s); errors: ${JSON.stringify(after.errors).slice(0, 400)}`
  );
}

const respond = (): Reply => ({ everyMs: 20, words: ["Ready."] });

const spec: Spec = {
  name: "tabs-region-errors",
  async run(kit) {
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
    const ids: string[] = [];
    for (const n of [1, 2, 3, 4]) {
      // biome-ignore lint/performance/noAwaitInLoops: one spawn at a time
      ids.push(await fleet.spawn("claude", `Tabs ${n}`));
    }
    const url = `${base}/session/${ids[0]}`;

    // ---- (a) the journal's timeline: restarts, a hidden window, reloads ----
    {
      const step = "(a) restart";
      const page = await tabsPage(kit, ids);
      const sent = hubReports(page);
      await open(page, url, STRIP, 120_000);
      await stripOrFailure(page);
      await settle(page, 1000);
      const loaded = await readPage(page);
      checkRead(kit, `${step}, loaded`, loaded);
      checkHydrated(kit, `${step}, loaded`, loaded);
      /** The hub's machine says it installs: the hub tells the page it restarts. */
      const announce = () =>
        fetch(`${fleet.base}/api/binary-updates/machines/scratch-fleet/state`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            phase: "installing",
            hostsHub: true,
            installedVersion: "0.0.1",
            availableVersion: "9.9.9-probe",
            channel: "stable",
          }),
        }).then((r) => r.status);
      kit.note(`${step}: the update announced, PUT ${await announce()}`);
      await away(page, true);
      await fleet.stop("hub");
      // The reload a newer build asks for, made while the hub is away.
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForTimeout(3000);
      const reloadedAway = await readPage(page);
      checkRead(
        kit,
        `${step}, reloaded while the hub is away`,
        reloadedAway,
        false
      );
      checkHydrated(
        kit,
        `${step}, reloaded while the hub is away`,
        reloadedAway
      );
      fleet.launch("hub");
      await fleet.hubUp();
      await stripOrFailure(page);
      await page.waitForTimeout(3000);
      checkRead(kit, `${step}, the hub back`, await readPage(page));
      // The second restart, and a reload the moment the hub answers.
      kit.note(`${step}: announced again, PUT ${await announce()}`);
      await away(page, true);
      await fleet.stop("hub");
      fleet.launch("hub");
      await fleet.hubUp();
      await page.reload({ waitUntil: "domcontentloaded" });
      await away(page, false);
      await stripOrFailure(page);
      await page.waitForTimeout(4000);
      const reloadedBack = await readPage(page);
      checkRead(kit, `${step}, reloaded as the hub answers`, reloadedBack);
      checkHydrated(kit, `${step}, reloaded as the hub answers`, reloadedBack);
      await tryAgain(kit, step, page);
      checkReports(kit, step, sent);
      await page.close();
    }

    // ---- (b) the server-rendered strip altered before it hydrates ----
    {
      const step = "(b) altered strip";
      const page = await tabsPage(kit, ids);
      const sent = hubReports(page);
      let altered = 0;
      await page.route(
        (u) => u.pathname === new URL(url).pathname,
        async (route) => {
          const response = await route.fetch();
          const html = new HTMLRewriter()
            .on('[data-session-tabs] [data-slot="tab"]', {
              element(el) {
                altered += 1;
                el.append("<span data-probe-extra></span>", { html: true });
              },
            })
            .transform(await response.text());
          await route.fulfill({ response, body: html });
        }
      );
      await open(page, url, STRIP, 120_000);
      await stripOrFailure(page);
      await settle(page, 1000);
      kit.check(
        `${step}: the served strip was altered before it hydrated`,
        altered > 0,
        `${altered} tab(s) given a node more`
      );
      const read = await readPage(page);
      // The same warning (a)'s loads are read for, heard here: (a)'s zero
      // is a mismatch the reader would have caught.
      kit.check(
        `${step}: Svelte warned of the mismatch`,
        read.mismatches > 0,
        `${read.mismatches} hydration_mismatch warning(s)`
      );
      checkRead(kit, step, read);
      await tryAgain(kit, step, page);
      checkReports(kit, step, sent);
      await page.close();
    }
  },
};

export default spec;
