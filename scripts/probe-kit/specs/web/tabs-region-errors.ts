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
import { PREF_VALUE_LIMIT } from "../../../../apps/dashboard/src/lib/cawco/prefs";
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

/** A workspace of one group holding `tabs`, `active` in front, as workspace.svelte.ts stores it. */
const treeOf = (tabs: string[], active: string | null = tabs[0] ?? null) =>
  JSON.stringify({
    v: 1,
    root: { t: "l", id: "pone", tabs, active, opened: null },
    focusedLeaf: "pone",
  });

/** A page (`view`, the desk unless named) with `ids` open as one group's tabs in its localStorage. */
async function tabsPage(
  kit: Kit,
  ids: string[],
  view: "desk" | "phone" = "desk"
) {
  const page = await kit.page(view, { init: [captureErrors, watchHydration] });
  await page.addInitScript((tree) => {
    localStorage.setItem("cawco-workspace", tree);
  }, treeOf(ids));
  return page;
}

/**
 * The server's copies of this browser's prefs (lib/cawco/prefs.ts), as the
 * browser holds them: an http 127.0.0.1 page's are unprefixed. `null`
 * clears one.
 */
async function serverCopies(
  page: Page,
  base: string,
  copies: Record<string, string | null>
) {
  const context = page.context();
  for (const [name, value] of Object.entries(copies)) {
    if (value === null) {
      // biome-ignore lint/performance/noAwaitInLoops: one cookie at a time
      await context.clearCookies({ name });
    } else {
      await context.addCookies([
        { name, value: encodeURIComponent(value), url: base },
      ]);
    }
  }
}

declare global {
  interface Window {
    /** What hydration did to the page the server drew, up to the root layout's mount (`releaseHeldTaps`). */
    probeHydration: HydrationSeen;
  }
}

interface HydrationSeen {
  done: boolean;
  /**
   * Server-drawn parts (`data-slot`, `data-session-tab`) taken out of the
   * page and not put back by the time it has hydrated (a part moved, as the
   * dock moves a pane into its group, is not dropped): `rail ` ahead of one
   * from the rail, `conversation ` ahead of one from the conversation the
   * server paints in a group's pane slot, and where it was.
   */
  dropped: string[];
  /** What is on screen as hydration ends, then at each frame after it that differs: what the reader sees move. */
  frames: (Layout & { frame: number })[];
  /** A tab the server drew rewritten as another: `from → to`. */
  rewritten: string[];
  /** What is on screen at set frames after hydration (0, 10, 60), whether or not it changed. */
  samples: Record<number, Layout>;
  /** The strip's tabs as the first client render left them. */
  strip: string[];
}

/** What the reader sees of the shell: the strip's tabs and box, the rail's, what shares the bar's slot, and the bar's tools. */
interface Layout {
  /** The "+"'s left edge, px; null where there is none. */
  add: number | null;
  /** The number the bar's Machines draws, or "none". */
  count: string;
  /** Where the strip's drawn things stand: the last tab's right edge and the "+"'s left, px. */
  marks: string;
  rail: string;
  slot: string;
  strip: string;
  tabs: number;
  /** The bar's tools group (Files, Jump, Machines, Caw's head). */
  tools: string;
}

/**
 * Installed before the page's own scripts: what hydration changed of what the
 * server drew. A part the parser put in and a script took out before the app
 * mounted, or a tab whose id a script rewrote, is hydration drawing other
 * data than the server did (Svelte repairs a block it finds different
 * silently: if.js and each.js "remove the server-rendered DOM and start
 * over"). It ends where the root layout's onMount calls app.html's
 * `releaseHeldTaps`, once the whole tree has hydrated.
 */
function watchHydration(): void {
  const seen: HydrationSeen = {
    done: false,
    dropped: [],
    rewritten: [],
    strip: [],
    frames: [],
    samples: {},
  };
  window.probeHydration = seen;
  const PART = "[data-slot], [data-session-tab]";
  const named = (el: Element, from: Element | null) => {
    const tab = el.getAttribute("data-session-tab");
    const part =
      tab === null ? `slot ${el.getAttribute("data-slot")}` : `tab ${tab}`;
    const within = from?.closest("[data-slot]")?.getAttribute("data-slot");
    let whose = "";
    if (from?.closest('[data-slot="rail"]')) {
      whose = "rail ";
    } else if (from?.closest('[data-slot="stack"] > [data-slot="pane"]')) {
      whose = "conversation ";
    }
    return `${whose}${part} in ${within ?? from?.tagName.toLowerCase() ?? "?"}`;
  };
  /** Each part taken out, with where it was, until hydration ends. */
  const removed: { el: Element; from: Element | null }[] = [];
  const box = (el: Element | null) => {
    if (!el) {
      return "none";
    }
    const r = el.getBoundingClientRect();
    const shown = getComputedStyle(el).display;
    return `${shown} ${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`;
  };
  const layout = (): Layout => ({
    tabs: document.querySelectorAll("[data-session-tabs] [data-session-tab]")
      .length,
    strip: box(document.querySelector("[data-session-tabs]")),
    rail: box(document.querySelector('[data-slot="rail"]')),
    slot: [
      ...(document.querySelector('[data-slot="top"] [data-slot="slot"]')
        ?.children ?? []),
    ]
      .map(
        (el) =>
          `${el.getAttribute("data-slot")}${el.hasAttribute("data-lifted") ? " lifted" : ""} ${Math.round(el.getBoundingClientRect().width)}`
      )
      .join(" + "),
    tools: box(document.querySelector('[data-slot="top"] [data-slot="tools"]')),
    count:
      document
        .querySelector('[data-slot="top"] [data-machines] [data-slot="num"]')
        ?.textContent?.trim() ?? "none",
    add: (() => {
      const add = document
        .querySelector("[data-session-tabs] [data-tnew]")
        ?.getBoundingClientRect();
      return add ? Math.round(add.left) : null;
    })(),
    marks: (() => {
      const strip = document.querySelector("[data-session-tabs]");
      const last = [...(strip?.querySelectorAll("[data-session-tab]") ?? [])]
        .at(-1)
        ?.getBoundingClientRect();
      const add = strip?.querySelector("[data-tnew]")?.getBoundingClientRect();
      return `last tab ends ${last ? Math.round(last.right) : "-"}, + at ${add ? Math.round(add.left) : "-"}`;
    })(),
  });
  /** The frames after hydration, each kept where it differs from the one before. */
  const track = (frame: number) => {
    const now = { ...layout(), frame };
    if (frame === 0 || frame === 10 || frame === 60) {
      seen.samples[frame] = now;
    }
    const last = seen.frames.at(-1);
    if (
      !last ||
      last.tabs !== now.tabs ||
      last.strip !== now.strip ||
      last.rail !== now.rail ||
      last.slot !== now.slot ||
      last.marks !== now.marks ||
      last.tools !== now.tools ||
      last.count !== now.count
    ) {
      seen.frames.push(now);
    }
    if (frame < 60) {
      requestAnimationFrame(() => track(frame + 1));
    }
  };
  const note = (records: MutationRecord[]) => {
    for (const record of records) {
      if (record.type === "attributes") {
        const to = (record.target as Element).getAttribute("data-session-tab");
        seen.rewritten.push(`${record.oldValue} → ${to}`);
        continue;
      }
      const from = record.target instanceof Element ? record.target : null;
      for (const node of record.removedNodes) {
        if (!(node instanceof Element)) {
          continue;
        }
        const parts = [
          ...(node.matches(PART) ? [node] : []),
          ...node.querySelectorAll(PART),
        ];
        removed.push(...parts.map((el) => ({ el, from })));
      }
    }
  };
  const watch = new MutationObserver(note);
  watch.observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["data-session-tab"],
    attributeOldValue: true,
  });
  let release: (() => void) | undefined;
  Object.defineProperty(window, "releaseHeldTaps", {
    configurable: true,
    get: () =>
      release &&
      (() => {
        note(watch.takeRecords());
        watch.disconnect();
        seen.dropped = removed
          .filter(({ el }) => !el.isConnected)
          .map(({ el, from }) => named(el, from));
        seen.done = true;
        seen.strip = [
          ...document.querySelectorAll(
            "[data-session-tabs] [data-session-tab]"
          ),
        ].map((el) => el.getAttribute("data-session-tab") ?? "");
        track(0);
        release?.();
      }),
    set: (value: () => void) => {
      release = value;
    },
  });
}

/** The strip's tabs in the page the server sent, before any script ran. */
function servedStrips(page: Page): string[][] {
  const served: string[][] = [];
  page.on("response", async (response) => {
    if (response.request().resourceType() !== "document") {
      return;
    }
    const ids: string[] = [];
    const html = await response.text().catch(() => "");
    await new HTMLRewriter()
      .on("[data-session-tabs] [data-session-tab]", {
        element(el) {
          ids.push(el.getAttribute("data-session-tab") ?? "");
        },
      })
      .transform(new Response(html))
      .text();
    served.push(ids);
  });
  return served;
}

/** What the page should come to once it has its own answers, and what hydration may take out. */
interface Expected {
  /** The strip once the page has restored the tree it keeps. */
  kept: string[];
  /**
   * The phone's hidden rail is the one block the first render drops
   * (Shell.svelte, "One rail"): the server draws it hidden, and a phone
   * never hydrates it.
   */
  railDropped?: boolean;
}

/** Holds a load to the invariant: hydration drew what the server drew, and nothing stopped. */
async function checkFirstRender(
  kit: Kit,
  step: string,
  page: Page,
  served: string[][],
  expected: Expected
) {
  await page.waitForFunction(() => window.probeHydration.done, null, {
    timeout: 60_000,
  });
  await settle(page, 1000);
  const drawn = await page.evaluate(() => window.probeHydration);
  const server = served.at(-1) ?? [];
  kit.check(
    `${step}: the first client render draws the strip the server drew`,
    drawn.rewritten.length === 0 &&
      JSON.stringify(drawn.strip) === JSON.stringify(server),
    `served ${server.length} tab(s), first render ${drawn.strip.length}; rewritten: ${drawn.rewritten.slice(0, 4).join(", ") || "none"}`
  );
  // The conversation the server paints in a group's pane slot is its
  // stand-in until the live pane docks there (PaneLeaf.svelte, `{#if
  // !browser}`): the pane's, not the shell's or the strip's.
  const railParts = drawn.dropped.filter((part) => part.startsWith("rail "));
  const conversation = drawn.dropped.filter((part) =>
    part.startsWith("conversation ")
  );
  const shell = drawn.dropped.filter(
    (part) => !(part.startsWith("rail ") || part.startsWith("conversation "))
  );
  if (expected.railDropped) {
    kit.check(
      `${step}: of the shell, hydration takes out only the hidden rail`,
      shell.length === 0 && railParts.length > 0,
      `rail: ${railParts.length} part(s); else: ${shell.slice(0, 12).join(", ") || "none"}`
    );
  } else {
    kit.check(
      `${step}: hydration takes out nothing the server drew of the shell`,
      shell.length === 0 && railParts.length === 0,
      [...railParts, ...shell].slice(0, 12).join(", ") || "none"
    );
  }
  kit.note(
    `${step}: the server's conversation stand-in, replaced by the live pane: ${conversation.length} part(s)`
  );
  kit.note(
    `${step}: on screen as hydration ends, then each frame that differs: ${drawn.frames
      .map(
        (f) =>
          `#${f.frame} ${f.tabs} tab(s), strip ${f.strip}, ${f.marks}, rail ${f.rail}, slot [${f.slot}], tools ${f.tools}, machines ${f.count}`
      )
      .join(" | ")}`
  );
  const settled = await page.evaluate(
    (strip) =>
      [...document.querySelectorAll(strip)].map(
        (el) => el.getAttribute("data-session-tab") ?? ""
      ),
    STRIP
  );
  kit.check(
    `${step}: once mounted, the strip is the one this browser keeps`,
    JSON.stringify(settled) === JSON.stringify(expected.kept),
    `${settled.length} tab(s), kept ${expected.kept.length}; first differs at ${settled.findIndex((id, i) => id !== expected.kept[i])}`
  );
  const read = await readPage(page);
  kit.check(
    `${step}: Svelte warns of no mismatch`,
    read.mismatches === 0,
    `${read.mismatches} hydration_mismatch warning(s)`
  );
  checkRead(kit, step, read, false);
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
    .locator(FAILED)
    .getByRole("button", { name: "Try again", exact: true })
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

    /** One load of `at` on a page whose server copies are `copies`, held to the invariant. */
    const firstRender = async (
      step: string,
      page: Page,
      copies: Record<string, string | null>,
      expected: Expected,
      at = url
    ) => {
      const served = servedStrips(page);
      await serverCopies(page, base, copies);
      await open(page, at, "body", 120_000);
      await checkFirstRender(kit, step, page, served, expected);
      return served;
    };

    // ---- (h) the control: the server's copy is the page's ----
    {
      const page = await tabsPage(kit, ids);
      await firstRender(
        "(h) a copy in step",
        page,
        { "cawco-workspace": treeOf(ids) },
        { kept: ids }
      );
      await page.close();
    }

    // ---- (c) the server's copy behind: another window's write, or one not yet sent ----
    // Both windows share localStorage and the cookie, and the copy follows
    // localStorage 300ms later (workspace.svelte.ts KEEP_AFTER_MS); a
    // dashboard on another port of this host shares the cookie alone.
    {
      const behind = [...ids].reverse();
      const page = await tabsPage(kit, behind);
      await firstRender(
        "(c) a copy behind",
        page,
        { "cawco-workspace": treeOf(ids) },
        { kept: behind }
      );
      await page.close();
    }

    /** The copy the page asks the server to keep next, and what the server answered. */
    const nextCopy = (page: Page) =>
      page
        .waitForResponse((r) => new URL(r.url()).pathname === "/prefs", {
          timeout: 30_000,
        })
        .then(async (response) => ({
          status: response.status(),
          sent: JSON.parse(response.request().postData() ?? "{}") as Record<
            string,
            string | null
          >,
        }));
    /** The server's copies this browser holds now. */
    const heldCopies = async (page: Page) =>
      Object.fromEntries(
        (await page.context().cookies(base)).map((c) => [c.name, c.value])
      );

    // ---- (d) a strip too long for the server's copy ----
    // As many tabs as take the tree past what a cookie keeps (prefs.ts
    // PREF_VALUE_LIMIT), the URL's first and the real three last.
    {
      const step = "(d) a strip past the cookie";
      const many = [ids[0]];
      while (
        encodeURIComponent(treeOf([...many, ...ids.slice(1)])).length <=
        PREF_VALUE_LIMIT
      ) {
        many.push(crypto.randomUUID());
      }
      many.push(...ids.slice(1));
      kit.note(
        `${step}: ${many.length} tabs, ${encodeURIComponent(treeOf(many)).length} bytes encoded, over ${PREF_VALUE_LIMIT}`
      );
      const page = await tabsPage(kit, many);
      await firstRender(
        `${step}, loaded`,
        page,
        { "cawco-workspace": treeOf(ids) },
        { kept: many }
      );
      // A tab chosen: the page sends its copy, which is too long.
      const sending = nextCopy(page);
      await page.locator(`[data-session-tab="${ids[1]}"]`).first().click();
      const copy = await sending;
      const cookies = await heldCopies(page);
      kit.check(
        `${step}: a copy too long is sent as none, and the server keeps none`,
        copy.status === 200 &&
          copy.sent["cawco-workspace"] === null &&
          !("cawco-workspace" in cookies),
        `POST /prefs ${copy.status}, sent ${JSON.stringify(copy.sent).slice(0, 120)}; cookies held: ${Object.keys(cookies).join(", ")}`
      );
      // The next load, after the page has sent what it could.
      const served = servedStrips(page);
      await page.reload({ waitUntil: "domcontentloaded" });
      await checkFirstRender(kit, `${step}, reloaded`, page, served, {
        kept: many,
      });
      const server = served.at(-1) ?? [];
      kit.check(
        `${step}: the server is given the whole strip, or none of it`,
        JSON.stringify(server) === JSON.stringify(many) ||
          JSON.stringify(server) === JSON.stringify([ids[1]]),
        `served ${server.length} of ${many.length} tab(s)`
      );
      await page.close();
    }

    // ---- (i) addresses too long for the server's copy, the tree in step ----
    // A stored conversation's tab is addressed by its machine and folder
    // (workspace.svelte.ts ctx); as many as take them past a cookie.
    {
      const step = "(i) addresses past the cookie";
      const ctx: Record<
        string,
        { machine: string; cwd: string; harness: string }
      > = {};
      while (
        encodeURIComponent(JSON.stringify(ctx)).length <= PREF_VALUE_LIMIT
      ) {
        ctx[crypto.randomUUID()] = {
          machine: "scratch-fleet",
          cwd: `/home/probe/projects/${crypto.randomUUID()}`,
          harness: "claude",
        };
      }
      kit.note(
        `${step}: ${Object.keys(ctx).length} addresses, ${encodeURIComponent(JSON.stringify(ctx)).length} bytes encoded`
      );
      const page = await kit.page("desk", {
        init: [captureErrors, watchHydration],
      });
      await page.addInitScript(
        (tree) => localStorage.setItem("cawco-workspace", tree),
        JSON.stringify({ ...JSON.parse(treeOf(ids)), ctx })
      );
      await firstRender(
        `${step}, loaded`,
        page,
        { "cawco-workspace": treeOf(ids) },
        { kept: ids }
      );
      const sending = nextCopy(page);
      await page.locator(`[data-session-tab="${ids[1]}"]`).first().click();
      const copy = await sending;
      const cookies = await heldCopies(page);
      kit.check(
        `${step}: the tree is kept and the addresses, too long, are kept as none`,
        copy.status === 200 &&
          typeof copy.sent["cawco-workspace"] === "string" &&
          copy.sent["cawco-workspace-ctx"] === null &&
          "cawco-workspace" in cookies &&
          !("cawco-workspace-ctx" in cookies),
        `POST /prefs ${copy.status}; cookies held: ${Object.keys(cookies).join(", ")}`
      );
      const served = servedStrips(page);
      await page.reload({ waitUntil: "domcontentloaded" });
      await checkFirstRender(kit, `${step}, reloaded`, page, served, {
        kept: ids,
      });
      await page.close();
    }

    // ---- (e) no copy: expired, or never sent here ----
    {
      const page = await tabsPage(kit, ids);
      await firstRender(
        "(e) no copy",
        page,
        { "cawco-workspace": null },
        { kept: ids },
        `${base}/session/${ids[2]}`
      );
      await page.close();
    }

    // ---- (f) a wide window, the copy saying narrow (another window's) ----
    {
      const page = await tabsPage(kit, ids);
      await firstRender(
        "(f) wide, copy narrow",
        page,
        { "cawco-workspace": treeOf(ids), "cawco-narrow": "1" },
        { kept: ids }
      );
      await page.close();
    }

    // ---- (g) a phone, the copy saying wide ----
    {
      const step = "(g) phone, copy wide";
      const copies = { "cawco-workspace": treeOf(ids), "cawco-narrow": "0" };
      // The page as served, no script run: its rail is drawn and hidden.
      const bare = await kit.page("phone");
      await bare.route(
        (u) => u.pathname === new URL(url).pathname,
        async (route) => {
          const response = await route.fetch();
          // The body's scripts: the head's make the viewport (app.html).
          const html = new HTMLRewriter()
            .on("body script", {
              element(el) {
                el.remove();
              },
            })
            .transform(await response.text());
          await route.fulfill({ response, body: html });
        }
      );
      await serverCopies(bare, base, copies);
      await bare.goto(url, { waitUntil: "load" });
      const rail = await bare.evaluate(() => {
        const el = document.querySelector('[data-slot="rail"]');
        return el
          ? {
              display: getComputedStyle(el).display,
              parts: el.querySelectorAll("[data-slot]").length,
              width: window.innerWidth,
            }
          : null;
      });
      kit.check(
        `${step}: the served rail is drawn hidden (display none) at the phone's width`,
        rail !== null && rail.display === "none" && rail.parts > 0,
        JSON.stringify(rail)
      );
      await bare.close();
      const page = await tabsPage(kit, ids, "phone");
      await firstRender(step, page, copies, { kept: ids, railDropped: true });
      await page.close();
    }

    // ---- (j) a strip past the bar's width: the bar holds still after the first paint ----
    // As many tabs as overflow the strip, the server's copy the page's, so
    // nothing the page keeps differs; what the hub says after the paint (the
    // machines) must not move the bar's tools or the strip's "+".
    {
      const step = "(j) the bar from the first paint";
      const wide = [
        ids[0],
        ...Array.from({ length: 30 }, () => crypto.randomUUID()),
        ...ids.slice(1),
      ];
      const page = await tabsPage(kit, wide);
      await firstRender(
        step,
        page,
        { "cawco-workspace": treeOf(wide) },
        { kept: wide }
      );
      await page.waitForFunction(
        () => window.probeHydration.samples[60] !== undefined,
        null,
        { timeout: 30_000 }
      );
      const { samples } = await page.evaluate(() => window.probeHydration);
      const [first, tenth, last] = [samples[0], samples[10], samples[60]];
      const machines = (await (
        await fetch(`${fleet.base}/api/agents`)
      ).json()) as unknown[];
      kit.check(
        `${step}: the strip overflows, its "+" pinned at its end`,
        first.add !== null && first.add > 1000,
        `"+" at ${first.add}`
      );
      kit.check(
        `${step}: the bar's tools stand where they were drawn, at #10 and #60`,
        first.tools === tenth.tools && first.tools === last.tools,
        `#0 ${first.tools}, #10 ${tenth.tools}, #60 ${last.tools}`
      );
      kit.check(
        `${step}: the strip's "+" stands where it was drawn, at #10 and #60`,
        first.add === tenth.add && first.add === last.add,
        `#0 ${first.add}, #10 ${tenth.add}, #60 ${last.add}`
      );
      const live = await page.evaluate(
        () =>
          document
            .querySelector(
              '[data-slot="top"] [data-machines] [data-slot="num"]'
            )
            ?.textContent?.trim() ?? "none"
      );
      kit.check(
        `${step}: Machines counts the hub's machines from the first paint, and once the socket answers`,
        first.count === String(machines.length) &&
          live === String(machines.length),
        `the hub has ${machines.length}; drawn ${first.count} at #0, ${live} once settled`
      );
      await page.close();
    }
  },
};

export default spec;
