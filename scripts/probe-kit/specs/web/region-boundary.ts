/**
 * The `/` menu with commands that share a name, and a part of the page that
 * fails while it renders, on the built dashboard against a scratch fleet
 * with two Claude sessions open as tabs of one group (desk). Owner: "when i
 * type slash and try to type something the whole page goes like this 500":
 * the session listed a name twice and the menu's keyed rows threw.
 *
 * 1. The hub's answer to the menu's `supportedCommands` is rewritten on the
 *    socket to carry two unmarked `probe-twin` rows, and a `probe-own` pair
 *    whose second row Claude Code marks its own (`builtin`, the one `/name`
 *    runs). Typing `/probe`: each name is one row, `probe-own` reads the
 *    marked row's words, no console error, no page error, no failure line,
 *    no 500.
 * 2. With the DEBUG fault `composer-menu` set (debug-fault.ts), typing `/`
 *    throws inside the composer's menu: the composer stands as its failure
 *    line and the error is reported to `/api/dashboard-errors`; the
 *    transcript, the sidebar and the tabs still stand, and a click on the
 *    other tab opens it. Nothing outside the composer reads the error as
 *    the route's (region-held.ts): the bar is as it was before the fault,
 *    its tab strip on the desk (tabs hosted in the bar), and on the tablet
 *    (tabs in the group, the bar's crumb shown) its crumb naming the
 *    session, never "Error".
 * 3. The route's own error still reads as one: an unknown path's bar says
 *    "Not found".
 */
import type { Page, WebSocketRoute } from "playwright-core";
import { MACHINE } from "../../../scratch-fleet";
import { open, type Spec, settle, type View } from "../../kit";

const FIELD = 'textarea[aria-controls="composer-menu"]';
const TWIN = "probe-twin";
const OWN = "probe-own";
const OWN_WORDS = "The one Claude Code runs";
/** Every socket the page opens: the hub's is the one that answers. */
const ANY_SOCKET = /.*/;

/** The injected rows: what a session holding two commands by one name lists. */
const INJECTED = [
  { name: TWIN, description: "The first copy", argumentHint: "" },
  { name: TWIN, description: "The second copy", argumentHint: "" },
  { name: OWN, description: "A skill by a built-in's name", argumentHint: "" },
  {
    name: OWN,
    description: OWN_WORDS,
    argumentHint: "",
    builtin: true,
  },
];

/** A hub frame answering `supportedCommands`, with the injected rows added. */
function rewrite(message: string | Buffer): string | Buffer {
  if (typeof message !== "string") {
    return message;
  }
  let parsed: {
    verb?: string;
    payload?: { kind?: string; result?: unknown };
  };
  try {
    parsed = JSON.parse(message);
  } catch {
    return message;
  }
  const result = parsed.payload?.result;
  const commands =
    parsed.verb === "frames" &&
    parsed.payload?.kind === "control_result" &&
    Array.isArray(result) &&
    result.length > 0 &&
    result.every(
      (row) =>
        typeof row?.name === "string" && typeof row?.argumentHint === "string"
    );
  if (!(commands && parsed.payload)) {
    return message;
  }
  parsed.payload.result = [...(result as object[]), ...INJECTED];
  return JSON.stringify(parsed);
}

/** Every socket through the page, the hub's `supportedCommands` answers rewritten. */
const relay = (ws: WebSocketRoute) => {
  const server = ws.connectToServer();
  ws.onMessage((message) => server.send(message));
  server.onMessage((message) => ws.send(rewrite(message)));
};

/** What went wrong on the page: console errors, uncaught errors, error reports. */
function watch(page: Page) {
  const seen = {
    console: [] as string[],
    page: [] as string[],
    reports: [] as string[],
  };
  page.on("console", (message) => {
    if (message.type() === "error") {
      seen.console.push(message.text().slice(0, 300));
    }
  });
  page.on("pageerror", (error) => seen.page.push(error.message.slice(0, 300)));
  page.on("request", (request) => {
    if (request.url().endsWith("/api/dashboard-errors")) {
      seen.reports.push((request.postData() ?? "").slice(0, 300));
    }
  });
  return seen;
}

/** The menu's rows as the engine has them: label and detail. */
const menuRows = () =>
  [...document.querySelectorAll("#composer-menu .e-label")].map((label) => ({
    label: label.textContent?.trim() ?? "",
    detail:
      label.parentElement?.querySelector(".e-detail")?.textContent?.trim() ??
      "",
  }));

/** The bar as the engine has it: its crumb's words, and the tabs it hosts. */
const barOf = () => ({
  crumb:
    document
      .querySelector("header.top span.crumb")
      ?.textContent?.replace(/\s+/g, " ")
      .trim() ?? null,
  tabs: document.querySelectorAll("header.top .slot-tabs [data-session-tab]")
    .length,
});

/** Whether the page went to SvelteKit's error page: its words, and no composer field. */
const fiveHundred = (field: string) =>
  document.body.innerText.includes("Internal Error") &&
  !document.querySelector(field);

const spec: Spec = {
  name: "region-boundary",
  async run(kit) {
    const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["Ready."] }));
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    const project = await fleet.api<{ id: string }>("/api/projects", {
      name: "Boundary",
      machineId: MACHINE,
      cwd: fleet.repo,
      caw: false,
    });
    const first = await fleet.spawn("claude", "Slash menu", fleet.repo, {
      projectId: project.id,
    });
    const second = await fleet.spawn("claude", "Other tab", fleet.repo, {
      projectId: project.id,
    });
    // A transcript to stand: a session nothing was said in shows its empty state.
    for (const id of [first, second]) {
      // biome-ignore lint/performance/noAwaitInLoops: one session at a time
      await fleet.send(id, "Hello.");
    }
    const base = await fleet.dashboard();
    const ws = {
      v: 1,
      root: { t: "l", id: "probe-leaf", tabs: [first, second], active: first },
      focusedLeaf: "probe-leaf",
      ctx: {},
    };

    const openSession = async (view: View, fault: string | null) => {
      const page = await kit.page(view);
      page.setDefaultTimeout(60_000);
      await page.context().addCookies([
        {
          name: "cawco-workspace",
          value: encodeURIComponent(JSON.stringify(ws)),
          url: base,
        },
      ]);
      await page.context().addInitScript(
        ({ w, f }) => {
          localStorage.setItem("cawco-workspace", JSON.stringify(w));
          if (f) {
            localStorage.setItem("cawco-debug-fault", f);
          }
        },
        { w: ws, f: fault }
      );
      await page.routeWebSocket(ANY_SOCKET, relay);
      const seen = watch(page);
      await open(page, `${base}/session/${first}`, FIELD);
      await settle(page, 600);
      return { page, seen };
    };

    // 1. Two commands by one name.
    {
      const { page, seen } = await openSession("desk", null);
      await page.click(FIELD);
      await page.keyboard.type("/");
      // The menu, or the part that stopped drawing it: a failure is read
      // below with what stood, never waited out.
      await page.waitForSelector("#composer-menu, [data-region-failed]");
      await page.keyboard.type("probe");
      const rows = await page
        .waitForFunction(
          ([twin, own]) => {
            const labels = [
              ...document.querySelectorAll("#composer-menu .e-label"),
            ].map((one) => one.textContent?.trim());
            return labels.includes(`/${twin}`) && labels.includes(`/${own}`);
          },
          [TWIN, OWN],
          { timeout: 30_000 }
        )
        .then(() => page.evaluate(menuRows))
        .catch(() => page.evaluate(menuRows));
      await page.waitForTimeout(800);
      const twins = rows.filter((row) => row.label === `/${TWIN}`);
      const owns = rows.filter((row) => row.label === `/${OWN}`);
      kit.check(
        "the menu opens with each shared name once",
        twins.length === 1 && owns.length === 1,
        JSON.stringify(rows)
      );
      kit.check(
        "the name Claude Code marks its own reads the marked row's words",
        owns[0]?.detail.includes(OWN_WORDS) ?? false,
        owns[0]?.detail
      );
      const failed = await page.evaluate(() =>
        [...document.querySelectorAll("[data-region-failed]")].map((el) =>
          el.getAttribute("data-region-failed")
        )
      );
      const down = await page.evaluate(fiveHundred, FIELD);
      const fields = await page.locator(FIELD).count();
      kit.check(
        "no console error, no page error, no failure line, no 500",
        seen.console.length === 0 &&
          seen.page.length === 0 &&
          seen.reports.length === 0 &&
          failed.length === 0 &&
          !down &&
          fields >= 1,
        JSON.stringify({ ...seen, failed, down, fields })
      );
      await page.close();
    }

    // 2. A render error inside the composer's menu, where the bar hosts the
    // tabs (desk) and where it shows its crumb (tablet).
    for (const view of ["desk", "tablet"] as View[]) {
      // biome-ignore lint/performance/noAwaitInLoops: one view at a time
      const { page, seen } = await openSession(view, "composer-menu");
      const barBefore = await page.evaluate(barOf);
      await page.click(FIELD);
      await page.keyboard.type("/");
      await page.waitForSelector('[data-region-failed="composer"]', {
        timeout: 15_000,
      });
      await page.waitForTimeout(800);
      const after = await page.evaluate(
        ({ first: one, second: two }) => ({
          failed: [...document.querySelectorAll("[data-region-failed]")].map(
            (el) => el.getAttribute("data-region-failed")
          ),
          line:
            document
              .querySelector('[data-region-failed="composer"]')
              ?.textContent?.replace(/\s+/g, " ")
              .trim() ?? "",
          field: document.querySelectorAll(
            'textarea[aria-controls="composer-menu"]'
          ).length,
          transcript: Boolean(
            document.querySelector(`[data-pane="${one}"] [role="log"]`)
          ),
          sidebar:
            document.querySelector("aside.rail")?.textContent?.trim().length ??
            0,
          tabs: [one, two].every((id) =>
            document.querySelector(`[data-session-tab="${id}"]`)
          ),
          error: document.body.innerText.includes("Internal Error"),
        }),
        { first, second }
      );
      const barAfter = await page.evaluate(barOf);
      kit.check(
        `the composer stands as its failure line, and only the composer (${view})`,
        JSON.stringify(after.failed) === JSON.stringify(["composer"]) &&
          after.field === 0 &&
          after.line.includes("The composer stopped after an error") &&
          after.line.includes("Try again"),
        JSON.stringify(after)
      );
      kit.check(
        `the transcript, the sidebar and both tabs still stand, no 500 (${view})`,
        after.transcript && after.sidebar > 0 && after.tabs && !after.error,
        JSON.stringify(after)
      );
      kit.check(
        view === "desk"
          ? "the bar is as before the fault: its tab strip still shows both tabs, no crumb (desk)"
          : "the bar is as before the fault: its crumb still names the session, never Error (tablet)",
        JSON.stringify(barAfter) === JSON.stringify(barBefore) &&
          (view === "desk"
            ? barAfter.tabs === 2 && barAfter.crumb === null
            : Boolean(barAfter.crumb) &&
              !["Error", "Not found"].includes(barAfter.crumb ?? "")),
        JSON.stringify({ before: barBefore, after: barAfter })
      );
      kit.check(
        `the error is reported to /api/dashboard-errors once, as thrown, and logged whole, not swallowed (${view})`,
        seen.reports.length === 1 &&
          seen.reports[0].includes("cawco-debug-fault") &&
          seen.console.some((line) => line.includes("cawco-debug-fault")) &&
          seen.console.some((line) => line.includes("the composer stopped")),
        JSON.stringify(seen)
      );
      await page.click(`[data-session-tab="${second}"]`);
      const moved = await page
        .waitForURL(`**/session/${second}`, { timeout: 15_000 })
        .then(() => true)
        .catch(() => false);
      kit.check(
        `a click on the other tab opens it (${view})`,
        moved,
        page.url()
      );
      await page.close();
    }

    // 3. The route's own error still reads as one: a path nothing answers.
    {
      const page = await kit.page("tablet");
      await open(page, `${base}/no-such-page`, "header.top span.crumb");
      await settle(page, 600);
      const bar = await page.evaluate(barOf);
      kit.check(
        "a route's own error still names itself in the bar (tablet, unknown path)",
        bar.crumb === "Not found",
        JSON.stringify(bar)
      );
      await page.close();
    }
  },
};
export default spec;
