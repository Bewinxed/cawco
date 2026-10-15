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
 * The project's name, edited where it stands (ProjectViewController
 * `ProjectNameEditor`, read from its `ProjectName` DEBUG lines and the
 * accessibility tree):
 *
 * - (d) the title is a header and a button with the hint "Renames the
 *   project"; a tap on it puts `project-name-field` in its place, holding
 *   the name, all of it selected, with the caret, in the title's type, its
 *   words within a point of where the title's stood;
 * - (e) a new name and Return: the hub's projects hold it and the title
 *   shows it;
 * - (f) a rename the web makes (`PATCH /api/projects/:id`) reaches the open
 *   page live (`projects.changed`);
 * - (g) emptied and Return: "A project needs a name." under it
 *   (`project-name-problem`), the field keeping the caret;
 * - (h) Escape from a hardware keyboard puts the name back with no request.
 *
 * And a tapped push of several things that need you (its `cawco` data
 * `{"kind":"needs"}`, routed as a tap is, `-push-route`):
 *
 * - (k) the route lands and Caw's panel opens (the `Push` and `CawPanel` logs).
 *
 *   bash apps/apple/scripts/build-both.sh ios --compile-only
 *   bun scripts/probe-kit/run.ts ios-project-row
 *
 * `PROBE_DEVICE=iPhone` (or `iPad`) runs one device.
 *
 * The app is this checkout's simulator build (`PROBE_IOS_APP` names another).
 */
// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: the checks are read in order, one after another.
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Subprocess } from "bun";
import { freshApp } from "../../lib/apple-app";
import { type MacSim, macSim } from "../../lib/mac-sim";
import { MACHINE, type Seen, until } from "../../scratch-fleet";
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
const RENAMED = "Harbour Two";
const SESSIONS = ["Alpha", "Beta"];
const LOG_HEAD = /^.*\] /;
const HINT = "Renames the project";
/** HID keyboard codes axe sends: Return, Delete (backspace), Escape. */
const RETURN = 40;
const DELETE = 42;
const ESCAPE = 41;
/** A `name tap label` line's type and words' box. */
const LABEL_LINE =
  /^name tap label font=([\d.]+) text=([\d.-]+),([\d.-]+),[\d.]+,[\d.]+ header=(\w+) button=(\w+) hint=(.+)$/;
/** A `name field` line: what it holds, selected, the caret, its type, its words' box. */
const FIELD_LINE =
  /^name field id=(\S+) text="(.*)" selected=(\w+) first=(\w+) font=([\d.]+) text-box=([\d.-]+),([\d.-]+),[\d.]+,[\d.]+$/;

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
  /** Its accessibility hint. */
  help?: string;
  /** Its accessibility identifier. */
  id?: string;
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
  /** The app's other lines: the name's edit (`name …`), the push's route, Caw's panel. */
  const said: string[] = [];
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
        `exec xcrun simctl spawn ${udid} log stream --level debug --style compact --predicate 'subsystem == "dev.cawco.app" AND ((category == "Rail" AND eventMessage BEGINSWITH "rail project") OR category == "ProjectName" OR category == "Push" OR category == "CawPanel")'`,
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
          } else if (line.includes("dev.cawco.app")) {
            said.push(line.replace(LOG_HEAD, ""));
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
          help: node.help as string | undefined,
          id: node.AXUniqueId as string | undefined,
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
    }

    // (d)–(h) The project's name, edited where it stands.
    const key = (code: number) => sh(`${AXE} key ${code} --udid ${udid}`);
    const typed = (words: string) =>
      sh(`${AXE} type '${words}' --udid ${udid}`);
    const hubName = async () =>
      (
        (await (await fetch(`${base}/api/projects`)).json()) as {
          id: string;
          name: string;
        }[]
      ).find((one) => one.id === projectId)?.name;
    /** The name's lines since `from`. */
    const lines = (from: number) =>
      said.slice(from).filter((line) => line.startsWith("name "));
    /** The first of the name's lines since `from` that `test` passes, waited for. */
    const awaitLine = (
      from: number,
      test: (line: string) => boolean,
      ms = 10_000
    ) =>
      until("the name's line", () => lines(from).find(test), Boolean, ms).catch(
        () => undefined
      );
    const titleOf = (list: Node[]) => find(list, (n) => n.help === HINT);

    // (d) The tap: the field in the title's place.
    const fromD = said.length;
    const title = titleOf(await tree());
    await tap(title, "the project's title");
    const fieldLine = await awaitLine(fromD, (l) =>
      l.startsWith("name field ")
    );
    const tapLine = lines(fromD).find((l) => l.startsWith("name tap label "));
    const label = tapLine ? LABEL_LINE.exec(tapLine) : null;
    const field = fieldLine ? FIELD_LINE.exec(fieldLine) : null;
    const fieldNode = find(await tree(), (n) => n.id === "project-name-field");
    kit.check(
      `${tag} (d) 7: VoiceOver reads the title as a header and a button, hint "${HINT}"`,
      title?.label === NAME &&
        title.help === HINT &&
        label?.[4] === "true" &&
        label?.[5] === "true" &&
        label?.[6] === HINT,
      `${tapLine ?? "no tap line"}; tree: ${JSON.stringify(title)}`
    );
    const dx = Math.abs(Number(field?.[6]) - Number(label?.[2]));
    const dy = Math.abs(Number(field?.[7]) - Number(label?.[3]));
    kit.check(
      `${tag} (d) 2: a tap puts project-name-field in the title's place, holding the name, selected, with the caret, in the title's type, its words within 1pt of the title's`,
      field?.[1] === "project-name-field" &&
        field[2] === NAME &&
        field[3] === "true" &&
        field[4] === "true" &&
        field[5] === label?.[1] &&
        dx <= 1 &&
        dy <= 1 &&
        !!fieldNode,
      `${tapLine ?? "no tap line"} | ${fieldLine ?? "no field line"}; dx ${dx.toFixed(1)} dy ${dy.toFixed(1)}; tree: ${JSON.stringify(fieldNode)}`
    );

    // (e) A new name and Return.
    const fromE = said.length;
    await typed(RENAMED);
    await key(RETURN);
    const shows = await awaitLine(fromE, (l) => l === `name shows ${RENAMED}`);
    await pause(800);
    const renamed = await hubName();
    const afterE = titleOf(await tree());
    kit.check(
      `${tag} (e) 3: a new name and Return: the hub's projects hold it and the title shows it`,
      renamed === RENAMED && !!shows && afterE?.label === RENAMED,
      `hub ${renamed}; title ${afterE?.label}; ${lines(fromE).join(" | ")}`
    );

    // (f) The web renames it back, as its head does.
    const fromF = said.length;
    const patched = await fetch(`${base}/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: NAME }),
    });
    const live = await awaitLine(fromF, (l) => l === `name shows ${NAME}`);
    await pause(800);
    const afterF = titleOf(await tree());
    kit.check(
      `${tag} (f) 6: a web rename reaches the open project page live`,
      patched.ok &&
        !!live &&
        afterF?.label === NAME &&
        !lines(fromF).some((l) => l.startsWith("name commit")),
      `PATCH ${patched.status}; title ${afterF?.label}; ${lines(fromF).join(" | ")}`
    );

    // (g) Emptied and Return: the hub's refusal under it, the caret kept.
    const fromG = said.length;
    await tap(afterF, "the project's title again");
    await awaitLine(fromG, (l) => l.startsWith("name field "));
    await key(DELETE);
    await key(RETURN);
    const refused = await awaitLine(fromG, (l) =>
      l.startsWith("name refused ")
    );
    await pause(800);
    const problem = find(await tree(), (n) => n.id === "project-name-problem");
    const unchanged = await hubName();
    kit.check(
      `${tag} (g) 4: emptied and Return: "A project needs a name." under it (project-name-problem), the caret kept`,
      refused ===
        'name refused "A project needs a name." shown=true id=project-name-problem first=true' &&
        lines(fromG).includes('name commit ""') &&
        problem?.label === "A project needs a name." &&
        unchanged === NAME,
      `${lines(fromG).join(" | ")}; tree: ${JSON.stringify(problem)}; hub ${unchanged}`
    );
    // Escape leaves the refused edit, the name back.
    await key(ESCAPE);
    await awaitLine(fromG, (l) => l === "name close");

    // (h) Escape from the keyboard: the name back, no request.
    const fromH = said.length;
    await tap(titleOf(await tree()), "the project's title once more");
    await awaitLine(fromH, (l) => l.startsWith("name field "));
    await typed("Scratch");
    await key(ESCAPE);
    const closed = await awaitLine(fromH, (l) => l === "name close");
    await pause(800);
    const afterH = titleOf(await tree());
    const kept = await hubName();
    kit.check(
      `${tag} (h) 5: Escape from a hardware keyboard puts the name back with no request`,
      !!closed &&
        lines(fromH).includes("name escape") &&
        !lines(fromH).some((l) => l.startsWith("name commit")) &&
        kept === NAME &&
        afterH?.label === NAME,
      `${lines(fromH).join(" | ")}; hub ${kept}; title ${afterH?.label}`
    );

    nodes = which.phone ? await rail() : await tree();

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

    // (k) A tapped push of several things that need you, at launch.
    const fromK = said.length;
    await sh(
      `xcrun simctl launch --terminate-running-process ${udid} dev.cawco.app -paywall-env sandbox -cawco-hub-url ${base} -push-route 'push:{"kind":"needs"}' >/dev/null`
    );
    const landed = await until(
      "the needs route landing",
      () => said.slice(fromK).find((l) => l === "route needs landed"),
      Boolean,
      60_000
    ).catch(() => undefined);
    await pause(1500);
    const sinceK = said.slice(fromK);
    kit.check(
      `${tag} (k): a tapped push of {"kind":"needs"} lands its route and opens Caw's panel`,
      !!landed && sinceK.includes("panel open: true"),
      sinceK
        .filter((l) => l.startsWith("route") || l.startsWith("panel"))
        .join(" | ") || "no route or panel line"
    );
  } finally {
    await writeFile(
      join(kit.out, `${tag}-log.txt`),
      [...heard, ...said].join("\n")
    );
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
