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
 * page's report, never from pixels:
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
 * `macProbeApp`) and the Peekaboo CLI (`brew install
 * openclaw/tap/peekaboo`). Every call runs in the CLI's own process
 * (`--no-remote`: "checks only the current local process",
 * peekaboo.sh/commands/click.html), never a daemon or app host, so macOS
 * weighs each against the grants of the process responsible for the run: a
 * CawCo session's is the agent (`dev.cawco.agent`), an SSH shell's
 * sshd-keygen-wrapper. Nothing takes a picture, so the run needs no Screen
 * Recording: a field takes the keyboard by a background query click, which
 * on a focusable text field "uses the field's writable `AXFocused`
 * attribute" (click.html); ⌘K is a background press on the app's exact
 * window ("Send a chord to one already-focused exact window without
 * activating it", peekaboo.sh/commands/press.html), as real key events
 * (`synthOnly`), since the page's claim on keys is what is proven; the menu
 * item is an Accessibility press. So the run asks Accessibility and Event
 * Synthesizing of its responsible process, and says which it lacks before
 * any input. Peekaboo keeps its state in the run's own scratch folder
 * (`PEEKABOO_CONFIG_DIR`), gone with the run.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
 * Runs Peekaboo in its own process with `args`, its state in `home`; its
 * stdout, or throws with what it said: its JSON's `error` (and the last of
 * its debug lines) when it wrote JSON, else its own words.
 */
async function peekaboo(home: string, args: string[]): Promise<string> {
  const env = { ...process.env, PEEKABOO_CONFIG_DIR: home };
  const run = await Bun.$`${PEEKABOO} ${args} --no-remote --json`
    .env(env)
    .quiet()
    .nothrow();
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

/**
 * The grants the run's input uses, by the names `permissions status` gives
 * them: Accessibility for the field's focus and the menu item's press,
 * Event Synthesizing for ⌘K's key events.
 */
const GRANTS = ["Accessibility", "Event Synthesizing"];

/**
 * The grants of `GRANTS` the run's responsible process lacks, as Peekaboo
 * finds them in its own process (`permissions status --no-remote`).
 */
async function lacking(home: string): Promise<string[]> {
  const status = JSON.parse(
    await peekaboo(home, ["permissions", "status"])
  ) as {
    data?: { permissions?: { isGranted?: boolean; name?: string }[] };
  };
  const granted = new Set(
    (status.data?.permissions ?? [])
      .filter((one) => one.isGranted === true)
      .map((one) => one.name)
  );
  return GRANTS.filter((grant) => !granted.has(grant));
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
 * The app's window by its CGWindowID, the exact window Peekaboo's
 * `--window-id` takes ("An exact window selector enables receipt-pinned
 * background press", peekaboo.sh/commands/press.html), as the window
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
  const home = await mkdtemp(join(tmpdir(), "mac-preview-keys-peekaboo-"));
  try {
    // The grants the input uses, said before anything starts.
    const lacks = await lacking(home);
    if (
      !kit.check(
        "the run's responsible process holds what its input uses: Accessibility and Event Synthesizing",
        lacks.length === 0,
        lacks.length === 0
          ? "granted"
          : `lacks ${lacks.join(", ")}: macOS weighs Peekaboo's own process against the process responsible for the run (a CawCo session's agent, an SSH shell's sshd-keygen-wrapper); run it from a shell whose responsible process holds them`
      )
    ) {
      return;
    }
    await keys(kit, binary, home);
  } finally {
    await rm(home, { force: true, recursive: true });
  }
};

/** The fleet, the Mac app and the three checks, every input through Peekaboo in its own process, its state in `home`. */
const keys = async (kit: Kit, binary: string, home: string) => {
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
    /**
     * A background query click on `field` (its aria-label) in the app's
     * window: the field's `AXFocused`, no pointer. Then its report with that
     * focus.
     */
    const focus = async (field: string) => {
      await peekaboo(home, [
        "click",
        field,
        "--pid",
        String(app.pid),
        "--window-id",
        await windowOf(app.pid),
      ]);
      return report(0, (m) => m[3] === field, 15_000);
    };
    /** ⌘K as key events to the app's exact window, in the background. */
    const commandK = async () => {
      await peekaboo(home, [
        "press",
        "cmd+k",
        "--window-id",
        await windowOf(app.pid),
        "--input-strategy",
        "synthOnly",
      ]);
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
    await peekaboo(home, [
      "menu",
      "click",
      "--pid",
      String(app.pid),
      "--path",
      JUMP_ITEM,
    ]);
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
