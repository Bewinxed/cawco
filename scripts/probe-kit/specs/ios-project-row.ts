/**
 * iOS: a project's row in the rail opens the project's page (owner: "also on
 * the sidebar i need to be able to click on the project to open it, right
 * now i'm only able to do that via rightclick"); its mark is the separate
 * switch that folds its sessions, as a session's mark folds its delegates.
 *
 * A scratch fleet with one project and two sessions, and the built app on an
 * iPhone 16 Pro and an iPad Pro 11-inch (M4), iOS 18.5, each in a
 * mac-slot.sh slot of its own (deleted at the end). On each device:
 *
 * - (a) a tap on the project's name lands on the project route, the row is
 *   selected, and the fold is unchanged (the app's `Rail` log);
 * - (b) a tap on the mark folds the sessions away and back, the route
 *   unchanged: the switch's name and value turn, the session rows go and
 *   come back (the accessibility tree), and the log says the route held;
 * - (c) on the phone, the rail's sheet closes after (a).
 *
 *   bash apps/apple/scripts/build-both.sh ios --compile-only
 *   bun scripts/probe-kit/run.ts ios-project-row
 *
 * `PROBE_DEVICE=iPhone` (or `iPad`) runs one device.
 *
 * The app is this checkout's simulator build (`PROBE_IOS_APP` names another).
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Subprocess } from "bun";
import { freshApp } from "../../lib/apple-app";
import { type MacSim, macSim } from "../../lib/mac-sim";
import { MACHINE, type Seen } from "../../scratch-fleet";
import { type Kit, ROOT, type Spec } from "../kit";

const AXE = "/opt/homebrew/bin/axe";
/** iOS 18.5, the app's oldest target, where axe reaches the simulator from a workspace. */
const RUNTIME = "com.apple.CoreSimulator.SimRuntime.iOS-18-5";
const DEVICES = [
  {
    tag: "iPhone",
    phone: true,
    type: "com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro",
  },
  {
    tag: "iPad",
    phone: false,
    type: "com.apple.CoreSimulator.SimDeviceType.iPad-Pro-11-inch-M4-8GB",
  },
];
const NAME = "Harbour";
const SESSIONS = ["Alpha", "Beta"];
const LOG_HEAD = /^.*\] /;

const pause = (ms: number) => Bun.sleep(ms);

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

interface Node {
  frame?: { x: number; y: number; width: number; height: number };
  label?: string;
  role?: string;
  value?: string;
}

/** The checkout's simulator app, only when it was built from this tree (scripts/lib/apple-app.ts). */
const appPath = () => freshApp(ROOT);

async function device(
  kit: Kit,
  base: string,
  projectId: string,
  which: (typeof DEVICES)[number]
): Promise<void> {
  const app = appPath().path;
  let sim: MacSim | undefined;
  let stream: Subprocess | undefined;
  const heard: string[] = [];
  const { tag } = which;
  try {
    sim = await macSim({ runtime: RUNTIME, device: which.type });
    const { udid } = sim;
    console.log(`  ${tag} simulator ${udid}`);
    await sh(`xcrun simctl bootstatus ${udid} -b >/dev/null`);
    await sh(`xcrun simctl install ${udid} "${app}"`);
    const child = Bun.spawn(
      [
        "bash",
        "-c",
        `exec xcrun simctl spawn ${udid} log stream --level debug --style compact --predicate 'subsystem == "dev.cawco.app" AND category == "Rail" AND eventMessage BEGINSWITH "rail project"'`,
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
          if (line.includes("rail project")) {
            heard.push(line.replace(LOG_HEAD, ""));
          }
        }
      }
    })().catch(() => undefined);
    await pause(1500);

    const tree = async (): Promise<Node[]> => {
      const out: Node[] = [];
      const walk = (node: Record<string, unknown>) => {
        out.push({
          label: (node.AXLabel ?? node.label) as string | undefined,
          value: (node.AXValue ?? node.value) as string | undefined,
          role: node.role as string | undefined,
          frame: node.frame as Node["frame"],
        });
        for (const kid of (node.children as
          Record<string, unknown>[] | undefined) ?? []) {
          walk(kid);
        }
      };
      const roots = JSON.parse(
        await sh(`${AXE} describe-ui --udid ${udid}`)
      ) as Record<string, unknown>[];
      for (const root of roots) {
        walk(root);
      }
      return out;
    };
    const tap = async (node: Node | undefined, what: string) => {
      const f = node?.frame;
      if (!f) {
        throw new Error(`${tag}: nothing to tap for ${what}`);
      }
      await sh(
        `${AXE} tap -x ${Math.round(f.x + f.width / 2)} -y ${Math.round(f.y + f.height / 2)} --udid ${udid}`
      );
    };
    const find = (list: Node[], test: (n: Node) => boolean) =>
      list.find((n) => test(n) && (n.frame?.width ?? 0) > 0);
    const isSwitch = (n: Node) =>
      n.label === `Hide ${NAME}'s sessions` ||
      n.label === `Show ${NAME}'s sessions`;
    const sessionRows = (list: Node[]) =>
      list.filter(
        (n) =>
          SESSIONS.some((s) => n.label?.endsWith(`: ${s}`)) &&
          (n.frame?.width ?? 0) > 0
      ).length;
    /** The rail, with the project's switch in it: the phone's from the burger. */
    const rail = async (): Promise<Node[]> => {
      let nodes = await tree();
      if (!find(nodes, isSwitch)) {
        // The phone's burger (BurgerButton), or a wide screen's sidebar toggle.
        const opener = find(
          nodes,
          (n) => n.label === "Open navigation" || n.label === "Show sidebar"
        );
        if (!opener) {
          await writeFile(
            join(kit.out, `${tag}-no-opener.json`),
            JSON.stringify(nodes, null, 2)
          );
        }
        await tap(opener, "the rail's opener");
        await pause(1500);
        nodes = await tree();
      }
      return nodes;
    };

    await sh(
      `xcrun simctl launch --terminate-running-process ${udid} dev.cawco.app -paywall-env sandbox -cawco-hub-url ${base} >/dev/null`
    );
    await pause(8000);
    let nodes = await rail();
    await writeFile(
      join(kit.out, `${tag}-rail.json`),
      JSON.stringify(nodes, null, 2)
    );
    let mark = find(nodes, isSwitch);
    if (
      !kit.check(
        `${tag}: the project's switch is in the rail`,
        !!mark,
        mark?.label ?? "none"
      )
    ) {
      return;
    }
    // Open first, so its sessions are there to stay.
    if (mark?.label === `Show ${NAME}'s sessions`) {
      await tap(mark, "the mark");
      await pause(1200);
      nodes = await tree();
      mark = find(nodes, isSwitch);
    }
    const before = sessionRows(nodes);
    kit.check(
      `${tag}: the switch is named for the project, expanded, its two sessions under it`,
      mark?.label === `Hide ${NAME}'s sessions` &&
        mark?.value === "Expanded" &&
        before === SESSIONS.length,
      `${mark?.label} / ${mark?.value}; ${before} session rows`
    );

    // (a) The name.
    const fromA = heard.length;
    const name = find(nodes, (n) => n.label === NAME);
    await tap(name, "the project's name");
    await pause(1500);
    const afterA = heard.slice(fromA);
    // The shell's destination as the log describes it: `Optional(CawCoScreens.ShellDestination.project("<id>"))`.
    const route = `Optional(CawCoScreens.ShellDestination.project("${projectId}"))`;
    kit.check(
      `${tag} (a): a tap on the name lands on the project route, the row selected, the fold unchanged`,
      afterA.some((l) =>
        l.includes(`rail project ${NAME} row tapped open true`)
      ) &&
        afterA.some((l) =>
          l.includes(
            `rail project ${NAME} selected true open true route ${route}`
          )
        ) &&
        !afterA.some((l) => l.includes("mark tapped")),
      afterA.join(" | ") || "no rail project line"
    );

    // (c) The phone's sheet stepped aside.
    if (which.phone) {
      nodes = await tree();
      kit.check(
        `${tag} (c): the rail's sheet closes after (a)`,
        !find(nodes, isSwitch),
        find(nodes, isSwitch)
          ? "the switch is still on screen"
          : "no switch on screen"
      );
      nodes = await rail();
    } else {
      nodes = await tree();
    }

    // (b) The mark, both ways.
    const fromB = heard.length;
    await tap(find(nodes, isSwitch), "the mark");
    await pause(1200);
    const shut = await tree();
    const shutMark = find(shut, isSwitch);
    await tap(shutMark, "the mark again");
    await pause(1200);
    const back = await tree();
    const backMark = find(back, isSwitch);
    const afterB = heard.slice(fromB);
    await writeFile(
      join(kit.out, `${tag}-fold.json`),
      JSON.stringify({ shut, back }, null, 2)
    );
    kit.check(
      `${tag} (b): a tap on the mark folds the sessions away and back, the route unchanged`,
      shutMark?.label === `Show ${NAME}'s sessions` &&
        shutMark?.value === "Collapsed" &&
        sessionRows(shut) === 0 &&
        backMark?.label === `Hide ${NAME}'s sessions` &&
        backMark?.value === "Expanded" &&
        sessionRows(back) === SESSIONS.length &&
        afterB.some((l) => l.includes(`mark tapped fold route ${route}`)) &&
        afterB.some((l) => l.includes(`mark tapped unfold route ${route}`)) &&
        !afterB.some(
          (l) => l.includes("row tapped") || l.includes("selected false")
        ),
      `shut ${shutMark?.label}/${shutMark?.value} ${sessionRows(shut)} rows; back ${backMark?.label}/${backMark?.value} ${sessionRows(back)} rows; log ${afterB.join(" | ")}`
    );
  } finally {
    await writeFile(join(kit.out, `${tag}-log.txt`), heard.join("\n"));
    stream?.kill();
    await sim?.release();
  }
}

const spec: Spec = {
  name: "ios-project-row",
  async run(kit) {
    const { path: app, problem } = appPath();
    if (
      !kit.check("the app is built from this tree", !problem, problem ?? app)
    ) {
      return;
    }
    const fleet = await kit.fleet((_: Seen) => ({
      everyMs: 20,
      words: ["Ready."],
    }));
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    const project = await fleet.api<{ id: string }>("/api/projects", {
      name: NAME,
      machineId: MACHINE,
      cwd: fleet.repo,
      caw: false,
    });
    for (const title of SESSIONS) {
      // biome-ignore lint/performance/noAwaitInLoops: one session after another
      await fleet.spawn("claude", title, fleet.repo, { projectId: project.id });
    }
    // `PROBE_DEVICE=iPhone` or `iPad`: one device a run.
    const only = process.env.PROBE_DEVICE;
    for (const which of DEVICES.filter((d) => !only || d.tag === only)) {
      // biome-ignore lint/performance/noAwaitInLoops: one simulator after another
      await device(kit, fleet.base, project.id, which);
    }
  },
};
export default spec;
