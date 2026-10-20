/**
 * iOS: no start is refused for want of a remembered permission mode. Every
 * start with no form of its own opens the app's New Session sheet, prefilled
 * with where it came from, and Start waits for a mode
 * (NewSessionViewController, NewSessionFlow; the web's 813e63fc1).
 *
 * A scratch fleet (real hub, agent and sessiond, Claude Code against the
 * mock model) with a project on its repo and a session in it whose row
 * records no mode (stopped, then the hub's column nulled, as unchosen-defaults 8b does).
 * The built app on an iPhone simulator of its own, installed fresh before
 * each phase, so nothing is remembered. A person (or an agent through
 * MobileBuildMCP's `tap`) drives the app while the spec reads the engine:
 * the sheet's DEBUG probe line (`form: …`, `-form-starts`) and the hub's
 * rows. Each phase prints what to press.
 *
 * A. Fork on the session (its row's menu): the sheet opens as a Fork, on the
 *    session's machine and folder, as a spin-off, on no mode with Start
 *    disabled (A1). Once a mode is picked and Start pressed, the branch
 *    runs on that machine and folder in the mode picked (A2).
 * B. The project's New session: the sheet opens on the project, its
 *    machine and folder, not a spin-off, on no mode with Start disabled
 *    (B1). Once a mode is picked and Start pressed, the session runs on that
 *    machine and folder in the project, in the mode picked (B2).
 * C. The project's Spin off: the sheet opens as a spin-off on the project
 *    (C1).
 *
 *   bash apps/apple/scripts/build-both.sh ios --compile-only
 *   bun scripts/probe-kit/run.ts ios-form-starts
 *
 * The app is this checkout's simulator build (`PROBE_IOS_APP` names another).
 */
import type { Subprocess } from "bun";
import { freshApp } from "../../lib/apple-app";
import { type MacSim, macSim } from "../../lib/mac-sim";
import { MACHINE, type Reply, until } from "../../scratch-fleet";
import { type Kit, ROOT, type Spec } from "../kit";

/** iOS 18.5, the app's oldest target, as the other iOS specs run it. */
const SIM = {
  runtime: "com.apple.CoreSimulator.SimRuntime.iOS-18-5",
  device: "iPhone 16 Pro",
};
const LOG_HEAD = /^.*?\[dev\.cawco\.app:[^\]]*\] /;
/** A person's taps: each phase waits this long for them. */
const DRIVE_MS = 20 * 60_000;
const BUNDLE = "dev.cawco.app";

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

async function sh(script: string): Promise<string> {
  const child = Bun.spawn(["bash", "-s"], {
    stdin: new TextEncoder().encode(`set -euo pipefail\n${script}\n`),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [text, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) {
    throw new Error(`exited ${code}: ${err.trim() || text.trim()}`);
  }
  return text;
}

/** The sheet's probe line, read into its fields. */
interface Form {
  crumb: string;
  cwd: string;
  machines: string;
  mode: string;
  project: string;
  spinOff: string;
  start: string;
}
/** Start's state on the line: `enabled` or `disabled`. */
const START = /· start "[^"]*" (\w+)/;
const FIELD = (name: string) => new RegExp(`· ${name} ([^·]*?)(?: ·|$)`);
const formOf = (line: string): Form | undefined => {
  if (!line.startsWith("form: ")) {
    return;
  }
  const read = (name: string) => line.match(FIELD(name))?.[1]?.trim() ?? "";
  return {
    crumb: read("crumb").replaceAll('"', ""),
    cwd: read("cwd"),
    machines: read("machines"),
    mode: read("mode"),
    project: read("project"),
    spinOff: read("spinOff"),
    start: line.match(START)?.[1] ?? "",
  };
};

interface Row {
  cwd: string | null;
  id: string;
  machine_id: string;
  permission_mode: string | null;
  project_id: string | null;
  status: string;
}

const run = async (kit: Kit) => {
  const { path: app, problem } = freshApp(ROOT);
  if (!kit.check("the app is built from this tree", !problem, problem ?? app)) {
    return;
  }
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const { id: projectId } = await fleet.api<{ id: string }>("/api/projects", {
    name: "Form starts",
    machineId: MACHINE,
    cwd: fleet.repo,
    caw: false,
  });
  const source = await fleet.spawn("claude", "Fork source", fleet.repo, {
    projectId,
  });
  await fleet.send(source, "hello");
  await until(
    "the source's conversation",
    () =>
      fleet.query<{ session_id: string | null }>(
        "SELECT session_id FROM instances WHERE id = ?",
        source
      )[0]?.session_id,
    Boolean,
    120_000
  );
  // Stopped first, as unchosen-defaults 8b does: a live session's machine
  // reports its mode again, over the column nulled here.
  await fleet.stopSession(source);
  await until(
    "the source stopped",
    () => fleet.instance(source),
    (row) => row?.status === "stopped",
    60_000
  );
  // The hub serves its rows from memory: it is down while the column is
  // nulled, and reads the row back as it starts (send-once.ts's restart).
  await fleet.stop("hub");
  await fleet.stop("agent");
  fleet.write(
    "UPDATE instances SET permission_mode = NULL WHERE id = ?",
    source
  );
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.launch("agent");
  await fleet.agentUp();
  const rows = () =>
    fleet.query<Row>(
      "SELECT id, machine_id, cwd, permission_mode, project_id, status FROM instances"
    );
  const before = new Set(rows().map((row) => row.id));
  console.log(
    `  hub ${fleet.base}; machine ${MACHINE}; repo ${fleet.repo}; project ${projectId}; source ${source} (no mode)`
  );

  let sim: MacSim | undefined;
  let stream: Subprocess | undefined;
  const heard: string[] = [];
  const forms = () =>
    heard.map(formOf).filter((form): form is Form => form !== undefined);
  try {
    sim = await macSim(SIM);
    const { udid } = sim;
    console.log(`  simulator ${udid}`);
    await sh(`xcrun simctl bootstatus ${udid} -b >/dev/null`);
    const child = Bun.spawn(
      [
        "bash",
        "-c",
        `exec xcrun simctl spawn ${udid} log stream --level debug --style compact --predicate 'subsystem == "${BUNDLE}" AND category == "Probe"'`,
      ],
      { stdout: "pipe", stderr: "ignore" }
    );
    stream = child;
    (async () => {
      const decoder = new TextDecoder();
      const reader = child.stdout.getReader();
      let rest = "";
      for (;;) {
        // biome-ignore lint/performance/noAwaitInLoops: the stream is read in order
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        rest += decoder.decode(value, { stream: true });
        const split = rest.split("\n");
        rest = split.pop() ?? "";
        for (const line of split) {
          if (line.includes(BUNDLE)) {
            heard.push(line.replace(LOG_HEAD, ""));
          }
        }
      }
    })().catch(() => undefined);

    /** A fresh install: nothing remembered, no mode among it. */
    const fresh = async () => {
      await sh(
        `xcrun simctl terminate ${udid} ${BUNDLE} >/dev/null 2>&1 || true; xcrun simctl uninstall ${udid} ${BUNDLE} >/dev/null 2>&1 || true`
      );
      await sh(`xcrun simctl install ${udid} "${app}"`);
      await sh(
        `xcrun simctl launch ${udid} ${BUNDLE} -paywall-env sandbox -cawco-hub-url ${fleet.base} -form-starts >/dev/null`
      );
    };
    const opened = async (
      label: string,
      from: number,
      want: (form: Form) => boolean
    ) =>
      until(
        label,
        () => forms().slice(from).find(want),
        Boolean,
        DRIVE_MS
      ).catch(() => forms().slice(from).at(-1));
    const started = (label: string, want: (row: Row) => boolean) =>
      until(
        label,
        () => rows().find((row) => !before.has(row.id) && want(row)),
        (row) => row?.status === "running",
        DRIVE_MS
      ).catch(() => rows().find((row) => !before.has(row.id) && want(row)));

    // A. Fork on a session whose row records no mode.
    await fresh();
    console.log(
      `DRIVE A: fresh install. Open the navigation; "Fork source" (stopped) in project "Form starts", its menu: Fork. Then pick a mode and Start.`
    );
    const a = forms().length;
    const fork = await opened(
      "the Fork's sheet",
      a,
      (form) => form.crumb === "Sessions · Fork"
    );
    kit.check(
      "A1: Fork on a session with no recorded mode opens the New Session sheet as a Fork, on its machine and folder, as a spin-off, on no mode, Start disabled",
      fork?.crumb === "Sessions · Fork" &&
        fork.machines === MACHINE &&
        fork.cwd === fleet.repo &&
        fork.spinOff === "true" &&
        fork.mode === "-" &&
        fork.start === "disabled",
      JSON.stringify(fork ?? null)
    );
    const branch = await started(
      "the branch",
      (row) => row.machine_id === MACHINE && row.cwd !== null
    );
    const picked = forms()
      .slice(a)
      .findLast(
        (form) => form.crumb === "Sessions · Fork" && form.mode !== "-"
      );
    kit.check(
      "A2: with a mode picked, Start runs the branch on the source's machine in the mode picked",
      branch?.status === "running" &&
        branch.machine_id === MACHINE &&
        !!picked &&
        branch.permission_mode === picked.mode,
      `branch ${JSON.stringify(branch ?? null)}; picked ${picked?.mode ?? "none"}`
    );
    if (branch) {
      before.add(branch.id);
    }

    // B. The project's New session, on a fresh install again.
    await fresh();
    console.log(
      `DRIVE B: fresh install. Open project "Form starts": New session. Then pick a mode and Start.`
    );
    const b = forms().length;
    const made = await opened(
      "New session's sheet",
      b,
      (form) => form.crumb === "Sessions · New" && form.project === projectId
    );
    kit.check(
      "B1: the project's New session opens the sheet on the project, its machine and folder, not a spin-off, on no mode, Start disabled",
      made?.crumb === "Sessions · New" &&
        made.project === projectId &&
        made.machines === MACHINE &&
        made.cwd === fleet.repo &&
        made.spinOff === "false" &&
        made.mode === "-" &&
        made.start === "disabled",
      JSON.stringify(made ?? null)
    );
    const session = await started(
      "the new session",
      (row) => row.machine_id === MACHINE && row.cwd === fleet.repo
    );
    const chose = forms()
      .slice(b)
      .findLast((form) => form.crumb === "Sessions · New" && form.mode !== "-");
    kit.check(
      "B2: with a mode picked, Start runs the session on that machine and folder, in the project, in the mode picked",
      session?.status === "running" &&
        session.cwd === fleet.repo &&
        session.project_id === projectId &&
        !!chose &&
        session.permission_mode === chose.mode,
      `session ${JSON.stringify(session ?? null)}; picked ${chose?.mode ?? "none"}`
    );

    // C. The project's Spin off.
    console.log(`DRIVE C: on the project's page: Spin off. Then Cancel.`);
    const c = forms().length;
    const spun = await opened(
      "Spin off's sheet",
      c,
      (form) => form.spinOff === "true" && form.project === projectId
    );
    kit.check(
      "C1: the project's Spin off opens the sheet on the project as a spin-off",
      spun?.crumb === "Sessions · New" &&
        spun.project === projectId &&
        spun.machines === MACHINE &&
        spun.spinOff === "true",
      JSON.stringify(spun ?? null)
    );
  } finally {
    stream?.kill();
    await sim?.release();
  }
};

const spec: Spec = { name: "ios-form-starts", run };
export default spec;
