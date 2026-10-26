/**
 * A project browser starts on the local host from inside a workspace's
 * boundary, the place a scratch fleet's daemon runs when it is started from
 * a workspace. There bwrap runs under the AppArmor `unpriv_bwrap` label,
 * whose user namespaces get no capabilities, so a Chromium that starts its
 * own sandbox dies at once ("No usable sandbox!"). The local host asks the
 * daemon's rule (capabilities.ts `chromiumSandboxed`) and starts without it.
 *
 * It starts the browser the way Take over does (browsers.ts `startBrowser`,
 * the runtime hidden by `DOCKER_HOST=unix:///nonexistent`, so the local
 * host's Chromium runs), with a data dir of its own, and reads:
 *
 * - this process runs under the `unpriv_bwrap` label (otherwise the spec
 *   proves nothing and fails);
 * - the browser goes live on the local host;
 * - Chromium answers on its DevTools port (`/json/version`);
 * - a page opened through DevTools loads and reads its own title.
 *
 * Run inside a workspace:
 *
 *   bun scripts/probe-kit/run.ts browser-in-boundary
 */
// biome-ignore-all lint/performance/noAwaitInLoops: polls one page until its title is in
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BrowserKey } from "../../../packages/core/src/browser";
import type { Kit, Spec } from "../kit";

const KEY: BrowserKey = "project:probe-in-boundary";
const TITLE = "boundary page";

const label = (): string => {
  try {
    return readFileSync("/proc/self/attr/apparmor/current", "utf8").trim();
  } catch {
    return "no AppArmor";
  }
};

const run = async (kit: Kit): Promise<void> => {
  const here = label();
  kit.check(
    `this process runs inside a workspace boundary (${here})`,
    here.includes("unpriv_bwrap"),
    "the spec proves the in-boundary start only under the unpriv_bwrap label"
  );
  const data = await mkdtemp(join(tmpdir(), "cawco-browser-in-boundary-"));
  process.env.XDG_DATA_HOME = data;
  const hidden = process.env.DOCKER_HOST;
  process.env.DOCKER_HOST = "unix:///nonexistent";
  const browsers = await import("../../../packages/agent/src/browser/browsers");
  const { chromiumDir, portsOf, readBrowser } =
    await import("../../../packages/agent/src/browser/state");
  const { CdpLink } =
    await import("../../../packages/agent/src/browser/cdp-takeover");
  try {
    await browsers.browserRuntime(true);
    const start = await browsers.startBrowser({ key: KEY }).then(
      (row) => ({ row, error: undefined as string | undefined }),
      (error: unknown) => ({
        row: undefined,
        error: error instanceof Error ? error.message : String(error),
      })
    );
    const record = await readBrowser(KEY);
    const live =
      start.row?.state === "live" &&
      record?.state === "live" &&
      record.host === "local";
    const log = await Bun.file(join(chromiumDir(KEY), "chromium.log"))
      .text()
      .catch(() => "");
    kit.check(
      `${KEY} live on the local host`,
      live,
      `${start.error ?? `answered ${start.row?.state}`}; record ${record?.state ?? "none"}${record?.why ? `: ${record.why}` : ""}; chromium.log: ${log.slice(-800)}`
    );
    if (!(live && record)) {
      return;
    }
    const devtools = `http://127.0.0.1:${portsOf(record).devtools}`;
    const version = await fetch(`${devtools}/json/version`)
      .then((answer) => answer.json() as Promise<{ Browser?: string }>)
      .catch((error: unknown) => ({ Browser: undefined, error }));
    kit.check(
      `Chromium answers on its DevTools port (${version.Browser ?? "no answer"})`,
      typeof version.Browser === "string",
      JSON.stringify(version)
    );
    const link = await CdpLink.open(devtools);
    try {
      const { targetId } = await link.call("Target.createTarget", {
        url: `data:text/html,<title>${encodeURIComponent(TITLE)}</title>`,
      });
      const session = await link.attach(String(targetId));
      let title = "";
      const until = Date.now() + 10_000;
      while (title !== TITLE && Date.now() < until) {
        const answer = await link.call(
          "Runtime.evaluate",
          { expression: "document.title", returnByValue: true },
          session
        );
        title = String((answer.result as { value?: unknown }).value ?? "");
        if (title !== TITLE) {
          await Bun.sleep(100);
        }
      }
      kit.check(
        `a page loads in it and reads its title ("${title}")`,
        title === TITLE,
        title
      );
    } finally {
      link.close();
    }
  } finally {
    await browsers.removeBrowser(KEY).catch(() => undefined);
    if (hidden === undefined) {
      delete process.env.DOCKER_HOST;
    } else {
      process.env.DOCKER_HOST = hidden;
    }
    await rm(data, { recursive: true, force: true });
  }
};

const spec: Spec = {
  group: "Workspaces and what agents may touch",
  name: "browser-in-boundary",
  run,
};

export default spec;
