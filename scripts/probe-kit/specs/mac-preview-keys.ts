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
 * `macProbeApp`), and Peekaboo's accessibility and screen-recording grants.
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

/** Runs Peekaboo with `args`; its stdout, or throws with what it said. */
async function peekaboo(args: string[]): Promise<string> {
  const run = await Bun.$`${PEEKABOO} ${args}`.quiet().nothrow();
  if (run.exitCode !== 0) {
    throw new Error(
      `peekaboo ${args.join(" ")} exited ${run.exitCode}: ${(run.stderr.toString() || run.stdout.toString()).trim().slice(0, 400)}`
    );
  }
  return run.stdout.toString();
}

/** One of `see --json`'s `data.ui_elements`: its opaque id and the AX words it is found by (peekaboo.sh/commands/see.html). */
interface SeenElement {
  description?: string | null;
  id: string;
  identifier?: string | null;
  label?: string | null;
  title?: string | null;
}

/** The app's window, as `window list --json` names it (`window_id`, peekaboo.sh/quickstart.html). */
async function windowOf(pid: number): Promise<string> {
  const listed = JSON.parse(
    await peekaboo(["window", "list", "--pid", String(pid), "--json"])
  ) as { data?: { windows?: { window_id?: number | string }[] } };
  const id = listed.data?.windows?.[0]?.window_id;
  if (id === undefined) {
    throw new Error(
      `no window_id for pid ${pid}: ${JSON.stringify(listed).slice(0, 300)}`
    );
  }
  return String(id);
}

/**
 * A fresh exact-window snapshot of the app's window (`see --window-id …
 * --json`): `data.snapshot_id`, the window, and the element of
 * `data.ui_elements` whose AX words name `field` (the field's aria-label),
 * so a background click lands on it and a background press has its
 * exact-window receipt (peekaboo.sh/commands/press.html).
 */
async function look(pid: number, field?: string) {
  const window = await windowOf(pid);
  const seen = JSON.parse(
    await peekaboo([
      "see",
      "--window-id",
      window,
      "--pid",
      String(pid),
      "--json",
    ])
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
      const at = await look(app.pid, field);
      if (!(at.element && at.snapshot)) {
        throw new Error(
          `no ${field} in Peekaboo's snapshot (${JSON.stringify(at)})`
        );
      }
      await peekaboo([
        "click",
        "--on",
        at.element,
        "--snapshot",
        at.snapshot,
        "--pid",
        String(app.pid),
      ]);
      return report(0, (m) => m[3] === field, 15_000);
    };
    /** ⌘K to the app's window, in the background, on a fresh exact-window snapshot. */
    const commandK = async () => {
      const at = await look(app.pid);
      if (!at.snapshot) {
        throw new Error(
          `no snapshot of window ${at.window} from Peekaboo (${JSON.stringify(at)})`
        );
      }
      // An exact-window selector and its fresh snapshot: the receipt a background press needs.
      await peekaboo([
        "press",
        "cmd+k",
        "--window-id",
        at.window,
        "--snapshot",
        at.snapshot,
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
    await peekaboo([
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
