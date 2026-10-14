/**
 * A shown preview stays servable to every panel that opens it (the owner:
 * "error 500 on the preview", "preview still goe 500 btw"). On a scratch
 * fleet (real hub, agent and sessiond; Claude Code against the mock model,
 * which calls artifact_create as a PROBE-CALL message says) and the built
 * dashboard at the desk, a preview of a server this spec runs on the host is
 * opened in its session's panel, and between loads of the dashboard each of
 * these happens; every load is read by the page's own title in the panel's
 * frame, never by pixels:
 *
 * 1. The panel shows the page (its title) on the first load.
 * 2. The agent restarts (its listeners go with it): the next load shows it.
 * 3. The hub restarts (its in-memory targets go with it, the agent's
 *    listener stays): the next load shows it.
 * 4. The agent and the hub restart together, so no listener survives for
 *    the new hub to find: the next load shows it.
 * 5. The dashboard tab closes, nothing shows the session, and a new tab
 *    opens it: the panel shows the page.
 * 6. The server stops: the pane draws the worded state ("The page's server
 *    stopped answering", Try again), and the agent's journal has one
 *    `[preview] agent listener` line naming the port.
 * 7. The panel's preview is closed (its Close route): a load of its address
 *    answers the worded closed page (404, `cawco-preview-down` closed), never
 *    a bare 404, and the hub's journal says so in one `[preview] hub
 *    listener` line.
 * 8. No hub, agent or dashboard line says "No preview selected".
 *
 * A boundary handover needs a workspace boundary, which needs unprivileged
 * user namespaces: a run inside a workspace (where bwrap is refused) notes
 * it and goes on.
 */
import type { Page } from "playwright-core";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, open, type Spec } from "../kit";

const CREATE = "mcp__cawco__artifact_create";
const COMMAND = /PROBE-CALL:(\d+)/g;
const ANSWERED_ID = /"id":"([0-9a-f-]{36})"/;
const FRAME = 'iframe[title="Preview"]';
const TITLE = "Survives probe page";
const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${TITLE}</title></head><body><h1>Still here</h1></body></html>`;

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

/** The title of the page the panel's current frame holds, once it is the probe page's; else the last one read. */
const paneTitle = async (page: Page): Promise<string> => {
  let last = "no frame";
  const read = async () => {
    const handles = await page.locator(FRAME).elementHandles();
    for (const handle of handles.reverse()) {
      // biome-ignore lint/performance/noAwaitInLoops: the newest frame first, one at a time
      const frame = await handle.contentFrame();
      const title = (await frame?.title().catch(() => "")) ?? "";
      // The proxy's own page names the hop that failed, and why.
      const said = await frame
        ?.evaluate(() =>
          [...document.querySelectorAll("meta[name^=cawco-preview-]")]
            .map(
              (m) => `${m.getAttribute("name")}=${m.getAttribute("content")}`
            )
            .join(" ")
        )
        .catch(() => "");
      last = `${title || "an untitled frame"}${said ? ` [${said}]` : ""}`;
      if (title === TITLE) {
        return title;
      }
    }
    return null;
  };
  return (await until("the preview's title in the panel", read, Boolean, 90_000)
    .then(() => TITLE)
    .catch(() => last)) as string;
};

const run = async (kit: Kit) => {
  try {
    await Bun.$`bwrap --unshare-user --unshare-net --ro-bind / / --dev /dev --proc /proc true`.quiet();
  } catch (error) {
    kit.note(
      `boundary handover not run here: ${(error as { stderr?: Buffer }).stderr?.toString().trim() ?? String(error)}`
    );
  }
  const app = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () =>
      new Response(PAGE, { headers: { "content-type": "text/html" } }),
  });
  const port = app.port as number;

  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const session = await fleet.spawn("claude", "Survives", fleet.repo);

  asks.set("1", {
    name: CREATE,
    input: { kind: "preview", name: "survives", port },
  });
  await fleet.send(session, "PROBE-CALL:1");
  const made = (await until(
    "artifact_create's answer",
    () => answered.get("1"),
    Boolean,
    180_000
  )) as string;
  if (!ANSWERED_ID.test(made)) {
    kit.check("artifact_create answers an id", false, made.slice(0, 300));
    return;
  }

  const base = await fleet.dashboard();
  const where = `${base}/session/${session}`;
  let tab = await kit.page("desk");
  await open(tab, where, FRAME);
  const first = await paneTitle(tab);
  kit.check("1: the panel shows the page", first === TITLE, first);

  const load = async (step: string, label: string) => {
    await tab.reload({ waitUntil: "domcontentloaded" });
    await tab.waitForSelector(FRAME, { timeout: 60_000 });
    const title = await paneTitle(tab);
    const shown = kit.check(
      `${step}: ${label}, the next load shows the page`,
      title === TITLE,
      title
    );
    if (!shown) {
      for (const role of ["hub", "agent"] as const) {
        // biome-ignore lint/performance/noAwaitInLoops: one journal at a time
        const lines = await fleet
          .logs(role)
          .then((text) =>
            text
              .split("\n")
              .filter((line) => line.includes("preview"))
              .slice(-8)
              .join(" | ")
          )
          .catch((error: Error) => `unreadable: ${error.message}`);
        kit.note(`${step}: the ${role}'s preview lines: ${lines || "none"}`);
      }
    }
  };

  // 2. The agent restarts: its listener goes with it.
  await fleet.stop("agent");
  fleet.launch("agent");
  await fleet.agentUp();
  await load("2", "after the agent restarts");

  // 3. The hub restarts: its targets in memory go, the agent's listener stays.
  await fleet.stop("hub");
  fleet.launch("hub");
  await fleet.hubUp();
  await fleet.agentUp();
  await load("3", "after the hub restarts");

  // 4. Both at once: no listener is left for the new hub to find.
  await fleet.stop("agent");
  await fleet.stop("hub");
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.launch("agent");
  await fleet.agentUp();
  await load("4", "after the agent and the hub restart together");

  // 5. Nothing shows the session, then a new tab opens it.
  await tab.context().close();
  await Bun.sleep(3000);
  tab = await kit.page("desk");
  await open(tab, where, FRAME);
  const reopened = await paneTitle(tab);
  kit.check(
    "5: with no dashboard open in between, a new tab's panel shows the page",
    reopened === TITLE,
    reopened
  );

  // 6. The server stops: the worded state, and the agent's one line.
  await app.stop(true);
  await tab.reload({ waitUntil: "domcontentloaded" });
  const down = await tab
    .locator(".preview-pane .down[role=alert]")
    .textContent({ timeout: 60_000 })
    .catch(() => null);
  const agentLog = await fleet.logs("agent");
  const agentLine = agentLog
    .split("\n")
    .find(
      (line) =>
        line.includes(
          `[preview] agent listener: preview of ${session} failed:`
        ) && line.includes(`port ${port}`)
    );
  kit.check(
    "6: a stopped server draws the worded state with Try again, and the agent logs one line naming the port",
    !!down?.includes("The page's server stopped answering") &&
      down.includes("Try again") &&
      !!agentLine,
    `pane: ${JSON.stringify(down?.replace(/\s+/g, " ").trim())}; log: ${agentLine ?? "none"}`
  );

  // 7. Closed: a load of its address answers the worded closed page.
  const closed = await fetch(`${fleet.base}/api/instances/${session}/preview`, {
    method: "DELETE",
  });
  const after = await fetch(`${base}/preview/${session}/gone/`);
  const body = await after.text();
  const hubLog = await fleet.logs("hub");
  const hubLine = hubLog
    .split("\n")
    .find((line) =>
      line.includes(
        `[preview] hub listener: preview of ${session} failed: its session shows no preview`
      )
    );
  kit.check(
    "7: a closed preview's address answers the worded closed page, and the hub logs one line",
    closed.ok &&
      after.status === 404 &&
      body.includes('<meta name="cawco-preview-down" content="closed">') &&
      body.includes("This preview is closed") &&
      !!hubLine,
    `close ${closed.status}; load ${after.status}; ${body.slice(0, 160)}; log: ${hubLine ?? "none"}`
  );

  // 8. The old answer is gone from every hop.
  const old = [hubLog, agentLog].some((text) =>
    text.includes("No preview selected")
  );
  kit.check("8: no journal says 'No preview selected'", !old);
};

const spec: Spec = { name: "preview-survives", run };
export default spec;
