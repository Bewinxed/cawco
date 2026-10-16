/**
 * The Mac app's preview has the first claim on keys, as the dashboard's
 * iframe has (overlay page.ts `leftToShell`), while its menu bar stays live
 * to the pointer (AppDelegate `canPerformAction`, `byKey`). On a scratch
 * fleet (real hub, agent and sessiond; Claude Code against the mock model) a
 * session shows a page with two fields of the probe's own: in `probe-keep`
 * the page handles ⌘K itself, in `probe-leave` it leaves it alone. The Mac
 * Catalyst probe build (ios-accounts MAC_PROBE_BUILD) runs on the session,
 * its input through Peekaboo's background mode (never the owner's pointer
 * or keys), and everything is read from the app's DEBUG lines and the
 * page's report:
 *
 * 1. With `probe-keep` focused, ⌘K is the page's: the app leaves the key
 *    to it ("key command jumpToSession left to the page"), the page keeps
 *    it, and Jump does not open.
 * 2. With `probe-leave` focused, ⌘K goes to the page too, which hands it
 *    back (`cawco:shortcut`): Jump opens. With Jump's own field holding the
 *    keyboard, ⌘K is the app's again and shuts it.
 * 3. With the page holding the keyboard, a click on Fleet > Jump to
 *    Session… in the menu bar opens Jump: the item stays live, and no key
 *    is left to the page.
 *
 *   bun scripts/probe-kit/run.ts mac-preview-keys
 *
 * Needs the Mac probe build of this tree (scripts/lib/apple-app.ts
 * `macProbeApp`) and the notarized Peekaboo CLI (`brew install
 * openclaw/tap/peekaboo`; Homebrew core's `peekaboo` is a source build
 * without release signing, which "Local in-process commands still work"
 * with but not "normal Bridge and daemon use", peekaboo.sh/install.html).
 * Its `see`, `click` and `press` run as separate processes, and a snapshot
 * belongs to the host that took it ("A stopped producer, no owner, or
 * multiple claimants is a pre-dispatch refusal", peekaboo.sh/commands/
 * click.html), so the run holds one host for all of them: Peekaboo's own
 * build-scoped daemon, on the socket the CLI derives (a custom socket path
 * "remain[s] limited to protocol 1.28", which an exact-window capture
 * refuses, peekaboo.sh/commands/bridge.html), every call pinned to it
 * (`PEEKABOO_BRIDGE_SOCKET`: strict, never the local runtime), started by
 * the run when it is not up and stopped after. That daemon must hold
 * Accessibility, Event Synthesizing and Screen Recording; the run says
 * which it lacks before any input.
 */
import { macProbeApp } from "../../lib/apple-app";
import { until } from "../../scratch-fleet";
import { type Kit, ROOT, type Spec } from "../kit";
import { macApp } from "../mac-app";

const PEEKABOO = "/opt/homebrew/bin/peekaboo";
const JUMP_ITEM = "Fleet > Jump to Session…";
/** The page's report as PreviewController's `probePage` logs it. */
const PAGE_LINE = /^preview page keys=(\d+)\/(\d+) focus=(\S+)/;
const LEFT = "key command jumpToSession left to the page";

/** The page: two fields, each counting the ⌘K it hears; `probe-keep` handles it itself. */
const PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Keys</title>
<style>body{font:16px system-ui;margin:0;padding:24px;display:grid;gap:16px}input{font:16px system-ui;padding:10px;width:260px}</style></head>
<body>
<input id="probe-keep" aria-label="probe-keep">
<input id="probe-leave" aria-label="probe-leave">
<script>
const keys = { seen: 0, kept: 0 };
const commandK = (event) => (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
for (const [id, keep] of [["probe-keep", true], ["probe-leave", false]]) {
  document.getElementById(id).addEventListener("keydown", (event) => {
    if (!commandK(event)) return;
    keys.seen += 1;
    if (keep) { event.preventDefault(); keys.kept += 1; }
  });
}
function report() {
  window.parent.postMessage({ type: "cawco:probe", state: "keys=" + keys.seen + "/" + keys.kept + " focus=" + (document.activeElement?.id || "-"), rects: {} }, "*");
}
report();
</script></body></html>`;

/**
 * Runs Peekaboo with `args`, on the host at `socket` when one is given
 * (`PEEKABOO_BRIDGE_SOCKET`, strict); its stdout, or throws with what it
 * said: its JSON's `error` (and the last of its debug lines) when it wrote
 * JSON, else its own words.
 */
async function peekaboo(args: string[], socket?: string): Promise<string> {
  const env = socket
    ? { ...process.env, PEEKABOO_BRIDGE_SOCKET: socket }
    : process.env;
  const run = await Bun.$`${PEEKABOO} ${args}`.env(env).quiet().nothrow();
  if (run.exitCode !== 0) {
    const said = (run.stdout.toString() || run.stderr.toString()).trim();
    let why = said.slice(-600);
    try {
      const json = JSON.parse(said) as {
        debug_logs?: string[];
        error?: unknown;
      };
      why = JSON.stringify({
        error: json.error,
        last: json.debug_logs?.slice(-4),
      });
    } catch {
      // Not JSON: its own words, their end, where the reason is.
    }
    throw new Error(
      `peekaboo ${args.join(" ")} exited ${run.exitCode}: ${why}`
    );
  }
  return run.stdout.toString();
}

/** The CLI's build-scoped daemon socket, `daemon-<build>.sock`, as `bridge status` lists it among its candidates. */
const BUILD_DAEMON = /\/daemon-[0-9a-f]+\.sock$/;

/** The grants the run's input needs of its host, as `daemon status --json` names them in `data.permissions`. */
const GRANTS = {
  accessibility: "Accessibility",
  postEvent: "Event Synthesizing",
  screenRecording: "Screen Recording",
} as const;

/** The Peekaboo host the run holds: its socket, and whether the run started it. */
interface PeekabooHost {
  socket: string;
  started: boolean;
}

/** `daemon status --json` on `socket`: whether it runs, its pid, and its grants. */
async function daemonOn(socket: string) {
  const status = JSON.parse(
    await peekaboo(["daemon", "status", "--bridge-socket", socket, "--json"])
  ) as {
    data?: {
      permissions?: Partial<Record<keyof typeof GRANTS, boolean>>;
      pid?: number;
      running?: boolean;
    };
  };
  return status.data ?? {};
}

/**
 * The run's one host: the CLI's own build-scoped daemon, up and granted, or
 * why not. A source build of the CLI, no such socket among the candidates,
 * or a missing grant is the run's failure, said before any input.
 */
async function peekabooHost(): Promise<PeekabooHost | string> {
  const bridge = JSON.parse(await peekaboo(["bridge", "status", "--json"])) as {
    data?: {
      candidates?: { socketPath?: string }[];
      client?: { teamIdentifier?: string };
    };
  };
  if (!bridge.data?.client?.teamIdentifier) {
    return `${PEEKABOO} is not release-signed (Homebrew core's source build): it keeps no daemon a later command can reach. Install the notarized CLI: brew install openclaw/tap/peekaboo (peekaboo.sh/install.html)`;
  }
  const socket = bridge.data.candidates
    ?.map((one) => one.socketPath ?? "")
    .find((path) => BUILD_DAEMON.test(path));
  if (!socket) {
    return `bridge status names no build-scoped daemon socket: ${JSON.stringify(bridge.data.candidates)}`;
  }
  const before = await daemonOn(socket);
  if (!before.running) {
    await peekaboo(["daemon", "start", "--bridge-socket", socket, "--json"]);
  }
  const now = await daemonOn(socket);
  const lacks = (Object.keys(GRANTS) as (keyof typeof GRANTS)[])
    .filter((grant) => now.permissions?.[grant] !== true)
    .map((grant) => GRANTS[grant]);
  if (!now.running || lacks.length > 0) {
    if (!before.running) {
      await peekaboo(["daemon", "stop", "--bridge-socket", socket, "--json"]);
    }
    return now.running
      ? `Peekaboo's daemon (pid ${now.pid}, ${socket}) lacks ${lacks.join(", ")}: grant them to it in System Settings > Privacy & Security (peekaboo.sh/permissions.html)`
      : `Peekaboo's daemon did not start on ${socket}`;
  }
  return { socket, started: !before.running };
}

/** One of `see --json`'s `data.ui_elements`: its opaque id and the AX words it is found by (peekaboo.sh/commands/see.html). */
interface SeenElement {
  description?: string | null;
  id: string;
  identifier?: string | null;
  label?: string | null;
  title?: string | null;
}

/**
 * The window server's own list of on-screen windows
 * (`CGWindowListCopyWindowInfo`, on screen only, no desktop elements): each
 * one's owner, CGWindowID, layer and size. Read through JXA; it names no
 * window titles, so it needs no screen-recording grant.
 */
const WINDOWS = `ObjC.import("CoreGraphics");
const list = ObjC.castRefToObject($.CGWindowListCopyWindowInfo(1 | 16, 0));
const out = [];
for (let i = 0; i < list.count; i++) {
  const w = list.objectAtIndex(i);
  const b = w.objectForKey("kCGWindowBounds");
  out.push({ pid: ObjC.unwrap(w.objectForKey("kCGWindowOwnerPID")), id: ObjC.unwrap(w.objectForKey("kCGWindowNumber")), layer: ObjC.unwrap(w.objectForKey("kCGWindowLayer")), area: ObjC.unwrap(b.objectForKey("Width")) * ObjC.unwrap(b.objectForKey("Height")) });
}
JSON.stringify(out);`;

/**
 * The app's window by its CGWindowID, the identity Peekaboo's
 * `--window-id` takes ("the captured process generation, window ID, and
 * bounds must still match", peekaboo.sh/commands/see.html), as the window
 * server lists it: the app's one on-screen window at the normal layer (0),
 * the largest when Catalyst stands helpers beside it.
 */
async function windowOf(pid: number): Promise<string> {
  const run = await Bun.$`osascript -l JavaScript -e ${WINDOWS}`
    .quiet()
    .nothrow();
  if (run.exitCode !== 0) {
    throw new Error(
      `the window server's list: osascript exited ${run.exitCode}: ${run.stderr.toString().trim()}`
    );
  }
  const windows = (
    JSON.parse(run.stdout.toString()) as {
      area: number;
      id: number;
      layer: number;
      pid: number;
    }[]
  ).filter((one) => one.pid === pid);
  const [main] = windows
    .filter((one) => one.layer === 0)
    .sort((a, b) => b.area - a.area);
  if (!main) {
    throw new Error(
      `pid ${pid} has no on-screen window at layer 0: ${JSON.stringify(windows)}`
    );
  }
  return String(main.id);
}

/**
 * A fresh exact-window snapshot of the app's window (`see --window-id …
 * --json`): `data.snapshot_id`, the window, and the element of
 * `data.ui_elements` whose AX words name `field` (the field's aria-label),
 * so a background click lands on it and a background press has its
 * exact-window receipt (peekaboo.sh/commands/press.html).
 */
async function look(socket: string, pid: number, field?: string) {
  const window = await windowOf(pid);
  const seen = JSON.parse(
    await peekaboo(
      ["see", "--window-id", window, "--pid", String(pid), "--json"],
      socket
    )
  ) as { data?: { snapshot_id?: string | null; ui_elements?: SeenElement[] } };
  const element = field
    ? seen.data?.ui_elements?.find((one) =>
        [one.label, one.description, one.title, one.identifier].includes(field)
      )
    : undefined;
  return {
    snapshot: seen.data?.snapshot_id ?? undefined,
    window,
    element: element?.id,
  };
}

const run = async (kit: Kit) => {
  const { path: binary, problem } = macProbeApp(ROOT);
  if (
    !kit.check(
      "the Mac probe build is this tree's",
      !problem,
      problem ?? binary
    )
  ) {
    return;
  }
  // Peekaboo's one host for the run, said before anything starts.
  const host = await peekabooHost();
  if (
    !kit.check(
      "Peekaboo holds one granted host for the run: its build-scoped daemon",
      typeof host !== "string",
      typeof host === "string"
        ? host
        : `${host.socket}${host.started ? " (started by the run)" : ""}`
    ) ||
    typeof host === "string"
  ) {
    return;
  }
  try {
    await keys(kit, binary, host.socket);
  } finally {
    // The daemon the run started goes with it; one already up stays as it was.
    if (host.started) {
      await peekaboo([
        "daemon",
        "stop",
        "--bridge-socket",
        host.socket,
        "--json",
      ]).catch((error) => console.log(`  peekaboo daemon stop: ${error}`));
    }
  }
};

/** The fleet, the Mac app and the three checks, every input through the run's Peekaboo host at `socket`. */
const keys = async (kit: Kit, binary: string, socket: string) => {
  const fleet = await kit.fleet(() => ({ everyMs: 10, words: ["ok"] }));
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const session = await fleet.spawn("claude", "Keys", fleet.repo);
  await fleet.api(`/api/instances/${session}/artifacts`, {
    kind: "page",
    name: "keys",
    html: PAGE,
  });
  const app = await macApp(
    binary,
    [
      "-paywall-env",
      "sandbox",
      "-cawco-hub-url",
      fleet.base,
      "-open-session",
      session,
      "-preview-probe",
    ],
    'subsystem == "dev.cawco.app" AND category == "Probe"'
  );
  try {
    const said = (from: number) => app.lines.slice(from);
    const report = (
      from: number,
      test: (m: RegExpMatchArray) => boolean,
      ms: number
    ) =>
      until(
        "the page's report",
        () =>
          said(from)
            .map((line) => line.match(PAGE_LINE))
            .findLast((m) => !!m && test(m)),
        Boolean,
        ms
      ).catch(() => undefined);
    const ready = await until(
      "the page ready in the Mac app",
      () => app.lines.some((line) => line.endsWith("preview ready")),
      Boolean,
      120_000
    ).catch(() => false);
    if (
      !kit.check(
        "the page stands in the Mac app's panel",
        ready,
        said(0).slice(-5).join(" | ")
      )
    ) {
      return;
    }
    /** A background click on `field`, then its report with that focus. */
    const focus = async (field: string) => {
      const at = await look(socket, app.pid, field);
      if (!(at.element && at.snapshot)) {
        throw new Error(
          `no ${field} in Peekaboo's snapshot (${JSON.stringify(at)})`
        );
      }
      await peekaboo(
        [
          "click",
          "--on",
          at.element,
          "--snapshot",
          at.snapshot,
          "--pid",
          String(app.pid),
        ],
        socket
      );
      return report(0, (m) => m[3] === field, 15_000);
    };
    /** ⌘K to the app's window, in the background, on a fresh exact-window snapshot. */
    const commandK = async () => {
      const at = await look(socket, app.pid);
      if (!at.snapshot) {
        throw new Error(
          `no snapshot of window ${at.window} from Peekaboo (${JSON.stringify(at)})`
        );
      }
      // An exact-window selector and its fresh snapshot: the receipt a background press needs.
      await peekaboo(
        ["press", "cmd+k", "--window-id", at.window, "--snapshot", at.snapshot],
        socket
      );
      await Bun.sleep(1500);
    };

    // 1. Kept by the page.
    const kept = await focus("probe-keep");
    let mark = app.lines.length;
    await commandK();
    const afterKept = await report(
      mark,
      (m) => Number(m[2]) > Number(kept?.[2] ?? 0),
      10_000
    );
    kit.check(
      "1: with probe-keep focused, ⌘K is the page's: the app leaves the key to it, the page keeps it, Jump stays shut",
      said(mark).includes(LEFT) &&
        !!afterKept &&
        !said(mark).includes("shell jump open"),
      `${afterKept?.[0] ?? "no report"}; ${
        said(mark)
          .filter(
            (l) => l.startsWith("key command") || l.startsWith("shell jump")
          )
          .join(" | ") || "nothing said"
      }`
    );

    // 2. Left to the shell by the page.
    await focus("probe-leave");
    mark = app.lines.length;
    await commandK();
    kit.check(
      "2: with probe-leave focused, ⌘K goes to the page, which hands it back: Jump opens",
      said(mark).includes(LEFT) &&
        said(mark).includes("preview shortcut jump") &&
        said(mark).includes("shell jump open"),
      said(mark)
        .filter(
          (l) =>
            l.startsWith("key command") ||
            l.startsWith("preview shortcut") ||
            l.startsWith("shell jump")
        )
        .join(" | ") || "nothing said"
    );
    mark = app.lines.length;
    await commandK();
    kit.check(
      "2: with Jump's own field holding the keyboard, ⌘K is the app's again and shuts it",
      said(mark).includes("shell jump close") && !said(mark).includes(LEFT),
      said(mark)
        .filter(
          (l) => l.startsWith("key command") || l.startsWith("shell jump")
        )
        .join(" | ") || "nothing said"
    );

    // 3. The menu bar stays live to the pointer while the page holds the keyboard.
    await focus("probe-leave");
    mark = app.lines.length;
    await peekaboo(
      ["menu", "click", "--pid", String(app.pid), "--path", JUMP_ITEM],
      socket
    );
    await Bun.sleep(1500);
    kit.check(
      `3: with the page holding the keyboard, a click on ${JUMP_ITEM} opens Jump: the menu bar's item stays live`,
      said(mark).includes("shell jump open") && !said(mark).includes(LEFT),
      said(mark)
        .filter(
          (l) => l.startsWith("key command") || l.startsWith("shell jump")
        )
        .join(" | ") || "nothing said"
    );
  } finally {
    await app.stop();
  }
};

const spec: Spec = { name: "mac-preview-keys", run };

export default spec;
