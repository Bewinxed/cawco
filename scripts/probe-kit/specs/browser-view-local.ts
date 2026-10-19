/**
 * The local host's view (Projects spec §5.11; the browser view's "Runtime
 * missing" row: the frames): a scratch fleet whose machine has no container
 * runtime (`DOCKER_HOST=unix:///nonexistent`), so its browser is a local
 * Chromium; a session's browser tool (chrome-devtools-mcp) on its door; the
 * person's view in a headless Chromium on the built dashboard.
 *
 * - While nobody holds the browser the view draws the page in front as a
 *   picture alone (agent cdp-watch.ts), and a press on it reaches nothing
 *   (the page's title, read through the daemon's own DevTools link, stays).
 * - The agent's own DevTools calls through its door, what chrome-devtools-mcp
 *   sends for evaluate_script, take_screenshot and navigate_page
 *   (`Runtime.evaluate`, `Page.captureScreenshot`, `Page.navigate`), answer
 *   while that screencast runs.
 * - After Take over the same press lands on the page; after Hand back the
 *   view watches again and the agent's navigation answers.
 *
 * It needs no container runtime, but the local Chromium's own sandbox needs
 * user namespaces, which a workspace's boundary refuses (`unshare -Ur`:
 * "write failed /proc/self/uid_map: Operation not permitted"; Chromium:
 * "No usable sandbox!"), so it runs on the host, outside every boundary:
 *
 *   bun scripts/probe-kit/run.ts browser-view-local
 */
import { homedir } from "node:os";
import { join } from "node:path";
import type { BrowserKey } from "../../../packages/core/src/browser";
import { MACHINE, type Reply, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";
import { COMPOSER, open } from "../kit";
import {
  attachTo,
  doorOf,
  evaluate,
  post,
  privileged,
  rawAt,
} from "./browser-view-live";

const MCP_VERSION = "1.11.0";
/** A page whose title says whether a press reached it. */
const TAP_PAGE =
  "data:text/html,<title>untapped</title><button style='position:fixed;inset:0' onclick=\"document.title='tapped'\">tap</button>";

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

/** The page's title in the local browser of `key`, read through the daemon's own DevTools link. */
const titleOf = async (key: BrowserKey): Promise<string | undefined> => {
  const daemon = await privileged(key);
  try {
    const page = await attachTo(daemon, "data:");
    return (await evaluate(daemon, page.session, "document.title"))?.value as
      string | undefined;
  } finally {
    daemon.socket.close();
  }
};

/** The local host's view: the page in front a picture alone, then the person's. */
const localLeg = async (
  kit: Kit,
  fleet: KitFleet,
  base: string,
  L: string,
  key: BrowserKey
): Promise<void> => {
  const door = await doorOf(fleet.env.HOME as string, L);
  const agent = await rawAt(door.url, { Authorization: door.authorization });
  const tap = await agent.send("Target.createTarget", { url: TAP_PAGE });
  // A browser that never started closes its door: said here with the
  // machine's own why, not as a frame that never draws.
  if (!tap.result?.targetId) {
    // The machine tells the hub the failed start a moment after the door closes.
    const settled = await until(
      "the hub lists the failed start",
      async () =>
        (
          await fleet.api<{ key: string; state: string; why?: string }[]>(
            "/api/browsers"
          )
        ).find((row) => row.key === key),
      (row) => !!row && row.state !== "starting",
      15_000
    ).catch(() => undefined);
    kit.check(
      `local: the agent's door opens a page in the local browser (the machine says: ${settled?.why ?? "nothing within 15 s"})`,
      false,
      `${tap.error?.message ?? JSON.stringify(tap)}; the hub lists ${JSON.stringify(settled)}`
    );
    agent.socket.close();
    return;
  }
  const tapped = await agent.send("Target.attachToTarget", {
    targetId: tap.result.targetId as string,
    flatten: true,
  });
  const tapSession = tapped.result?.sessionId as string;
  const listed = await fleet.api<{ id: string; kind: string }[]>(
    `/api/instances/${L}/artifacts`
  );
  const artifact = listed.find((one) => one.kind === "browser");
  if (!artifact) {
    kit.check("local: the session lists its browser artifact", false, "");
    return;
  }
  await post(fleet, `/api/instances/${L}/artifacts/${artifact.id}/show`, {});
  const page = await kit.page("desk");
  page.setDefaultTimeout(120_000);
  await open(page, `${base}/session/${L}`, COMPOSER, 120_000);
  const frame = page.locator('[data-slot="browser-frame"]');
  await page.waitForFunction(
    () =>
      (document.querySelector<HTMLImageElement>('[data-slot="browser-frame"]')
        ?.naturalWidth ?? 0) > 0
  );
  await frame.click();
  await Bun.sleep(1500);
  const watched = await titleOf(key);
  kit.check(
    `local: while nobody holds it the view draws the page's frames, and a press on them reaches nothing (title "${watched}")`,
    watched === "untapped",
    String(watched)
  );
  // The agent's own calls through its door, the screencast running.
  const evaluated = await evaluate(agent, tapSession, "document.title");
  const shot = await agent.send(
    "Page.captureScreenshot",
    { format: "png" },
    tapSession
  );
  kit.check(
    `local: while the view's screencast runs the agent's calls answer: evaluate "${evaluated?.value}", a screenshot of ${String(shot.result?.data ?? "").length} base64 chars`,
    evaluated?.value === "untapped" &&
      String(shot.result?.data ?? "").length > 1000,
    JSON.stringify({ evaluated, error: shot.error })
  );
  await page.locator('[data-slot="take-over"]').click();
  await page.locator('[data-slot="hand-back"]').waitFor();
  await page.waitForFunction(
    () =>
      (document.querySelector<HTMLImageElement>('[data-slot="browser-frame"]')
        ?.naturalWidth ?? 0) > 0
  );
  await frame.click();
  const held = await until(
    "the press lands once the person holds it",
    () => titleOf(key),
    (title) => title === "tapped",
    15_000
  ).catch(() => undefined);
  kit.check(
    `local: after Take over the same press lands on the page (title "${held}")`,
    held === "tapped",
    String(held)
  );
  await page.locator('[data-slot="hand-back"]').click();
  await page.locator('[data-slot="take-over"]').waitFor();
  // Handed back, the view watches again; the agent's navigation answers.
  const agentAgain = await rawAt(door.url, {
    Authorization: door.authorization,
  });
  const again = await attachTo(agentAgain, "data:");
  const navigated = await agentAgain.send(
    "Page.navigate",
    { url: "https://example.com/" },
    again.session
  );
  const landed = await until(
    "the agent's navigation landed",
    () => evaluate(agentAgain, again.session, "document.title"),
    (read) => read?.value === "Example Domain",
    30_000
  ).catch(() => undefined);
  kit.check(
    `local: the agent's navigation answers while the view watches (frame ${navigated.result?.frameId ? "navigated" : navigated.error?.message}, title "${landed?.value}")`,
    !!navigated.result?.frameId && landed?.value === "Example Domain",
    JSON.stringify({ navigated, landed })
  );
  await page.close();
  agent.socket.close();
  agentAgain.socket.close();
};

const run = async (kit: Kit): Promise<void> => {
  const realHome = homedir();
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent", [], {
    DOCKER_HOST: "unix:///nonexistent",
    PLAYWRIGHT_BROWSERS_PATH:
      process.env.PLAYWRIGHT_BROWSERS_PATH ??
      join(
        realHome,
        process.platform === "darwin" ? "Library/Caches" : ".cache",
        "ms-playwright"
      ),
  });
  await fleet.agentUp();
  await fleet.accountSignedIn();
  process.env.XDG_DATA_HOME = fleet.env.XDG_DATA_HOME as string;
  const base = await fleet.dashboard();
  const put = await fetch(`${fleet.base}/api/fleet/mcp/chrome-devtools`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      config: {
        command: "npx",
        args: [
          "-y",
          `chrome-devtools-mcp@${MCP_VERSION}`,
          "--no-usage-statistics",
        ],
      },
      enabled: true,
    }),
  });
  kit.check("the fleet runs chrome-devtools-mcp", put.ok, String(put.status));
  await until(
    "the machine applied the fleet's chrome-devtools",
    () =>
      fleet
        .query<{ fleet: string | null }>("SELECT fleet FROM agents")
        .map((agentRow) => agentRow.fleet ?? "")
        .find((text) => text.includes("chrome-devtools")),
    (text) =>
      (JSON.parse(text) as { mcp?: Record<string, { state?: string }> }).mcp?.[
        "chrome-devtools"
      ]?.state === "applied",
    180_000
  );
  const L = await fleet.spawn("claude", "View local", fleet.workdir, {
    permissionMode: "default",
  });
  await localLeg(kit, fleet, base, L, `machine:${MACHINE}`);
};

const spec: Spec = {
  name: "browser-view-local",
  run,
};

export default spec;
