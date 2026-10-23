/**
 * iOS: a decision page in the app has one Send, the page's own (the owner,
 * on quick-calls-1023: "The app matches the web: one Send on a decision
 * page"). On a scratch fleet (real hub, agent and sessiond; Claude Code
 * against the mock model) and the built app on an iPad simulator of its own,
 * a session in a project makes a decision page and the app, opened on the
 * session, shows it in its preview card. Then:
 *
 * 1. The preview head stands no Send of its own: its `preview head room`
 *    line names no `send`, standing or in More, and the app's own
 *    accessibility tree (axe `describe-ui`, which holds the app's views and
 *    not the page's web content) has no element in the card whose label
 *    starts "Send" (the transcript beside it keeps its composer's).
 *    The page's own Send is found inside the card, under the head, by
 *    reading points down it (`describe-ui --point`).
 * 2. A finger's tap (axe) on an option picks it on the hub; a tap on the
 *    page's foot Send sends the page from inside the app's web view: the hub
 *    stamps the page's `sentAt`, and its journal names the page's Send
 *    through the page's own route (core `SEND_CONTROLS["page-send"]`).
 *
 *   bash apps/apple/scripts/build-both.sh ios --compile-only
 *   bun scripts/probe-kit/run.ts ios-decision-send
 *
 * The app is this checkout's simulator build (`PROBE_IOS_APP` names another).
 */
import { SEND_CONTROLS } from "../../../packages/core/src/comments";
import { artifactToolWords } from "../../../packages/core/src/words/artifact-tools";
import type { ArtifactRead } from "../../../packages/hub/src/artifacts/service";
import { freshApp } from "../../lib/apple-app";
import { macSim } from "../../lib/mac-sim";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, ROOT, type Spec } from "../kit";

const SIM = {
  runtime: "com.apple.CoreSimulator.SimRuntime.iOS-27-2",
  device: "com.apple.CoreSimulator.SimDeviceType.iPad-Pro-13-inch-M4-8GB",
};
const AXE = "/opt/homebrew/bin/axe";
/** axe's tap as a touch down and up: its default style delivers nothing on Xcode 27 (cameroncooke/AXe#71). */
const TAP = `${AXE} tap --tap-style physical`;
const LOG_HEAD = /^.*?\[dev\.cawco\.app:[^\]]*\] /;
/** PreviewController's `preview head room …` line: what stands and what More holds. */
const ROOM = /^preview head room .* shown=(\S*) more=(\S+) badge=\S+$/;
/** The session's split line: the preview card's Close, in the window. */
const CLOSE = /^split .* close=(\d+),(\d+) dividerAt=/;
/** The head room line's width. */
const WIDTH = /^preview head room width=(\d+) /;
const NAME = "checks-cheap";
const TITLE = "Make the checks cheap";
const PROGRAM = `root = Decisions("${TITLE}", [lint])
lint = Decision("lint", "How should lint stop redoing work?", [cache, biome], "Lint runs the whole tree today.")
cache = Option("cache", "Cache the heavy checks", "Three caches cut most of the time.", true, [], "Three caches to keep keyed right.")
biome = Option("biome", "Move the rules into Biome", "One linter instead of two.", false, [], "Two rules have no Biome version.")`;

const respond = (request: Seen): Reply => ({
  everyMs: 5,
  words: [request.tools ? "ok" : "Probe title"],
});

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

interface Box {
  height: number;
  width: number;
  x: number;
  y: number;
}
interface Element {
  frame: Box;
  label: string;
}

/** Every labelled element in `json` (axe's answer), depth first. */
function labelled(json: string): Element[] {
  const found: Element[] = [];
  const walk = (node: Record<string, unknown>) => {
    const label = node.AXLabel ?? node.label;
    const frame = node.frame as Box | undefined;
    if (typeof label === "string" && label && frame && frame.width > 0) {
      found.push({ label, frame });
    }
    for (const kid of (node.children as
      Record<string, unknown>[] | undefined) ?? []) {
      walk(kid);
    }
  };
  const parsed = JSON.parse(json) as unknown;
  for (const root of Array.isArray(parsed) ? parsed : [parsed]) {
    walk(root as Record<string, unknown>);
  }
  return found;
}

/** The app's own labelled elements (axe `describe-ui`): its views, not a web view's content. */
const elements = async (udid: string) =>
  labelled(await sh(`${AXE} describe-ui --udid ${udid}`));

/**
 * The page's elements as the points down the card read them (`describe-ui
 * --point`, which reaches into the web view): `columns` across, every 16pt
 * from `top` to `bottom`; the first element found for each label.
 */
async function scan(
  udid: string,
  columns: number[],
  top: number,
  bottom: number
): Promise<Element[]> {
  const found = new Map<string, Element>();
  for (let y = top; y <= bottom; y += 16) {
    for (const x of columns) {
      // biome-ignore lint/performance/noAwaitInLoops: one point read after another
      const said = await sh(
        `${AXE} describe-ui --point ${x},${y} --udid ${udid}`
      ).catch(() => "[]");
      for (const one of labelled(said.trim() || "[]")) {
        if (!found.has(one.label)) {
          found.set(one.label, one);
        }
      }
    }
  }
  return [...found.values()];
}

/** A finger's tap at the middle of `box`. */
const tapAt = (udid: string, box: Box) =>
  sh(
    `${TAP} -x ${Math.round(box.x + box.width / 2)} -y ${Math.round(box.y + box.height / 2)} --udid ${udid} >/dev/null`
  );

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
  const dir = `${fleet.sandbox}/devtools`;
  await Bun.$`mkdir -p ${dir} && git init -q -b main ${dir}`.quiet();
  const { id: projectId } = await fleet.api<{ id: string }>("/api/projects", {
    name: "Devtools",
    machineId: MACHINE,
    cwd: dir,
    caw: false,
  });
  const writer = await fleet.spawn("claude", TITLE, dir, { projectId });

  const sim = await macSim(SIM);
  const { udid } = sim;
  const heard: string[] = [];
  const stream = Bun.spawn(
    [
      "bash",
      "-c",
      `exec xcrun simctl spawn ${udid} log stream --level debug --style compact --predicate 'subsystem == "dev.cawco.app" AND category == "Probe"'`,
    ],
    { stdout: "pipe", stderr: "ignore" }
  );
  try {
    await sh(`xcrun simctl bootstatus ${udid} -b >/dev/null`);
    await sh(`xcrun simctl install ${udid} "${app}"`);
    (async () => {
      const decoder = new TextDecoder();
      const reader = stream.stdout.getReader();
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
          if (line.includes("dev.cawco.app")) {
            heard.push(line.replace(LOG_HEAD, ""));
          }
        }
      }
    })().catch(() => undefined);
    await Bun.sleep(1500);
    await sh(
      `xcrun simctl launch --terminate-running-process ${udid} dev.cawco.app -paywall-env sandbox -cawco-hub-url ${fleet.base} -open-session ${writer} -preview-probe >/dev/null`
    );
    await Bun.sleep(4000);
    const made = await fleet.api<{ id: string }>(
      `/api/instances/${writer}/artifacts`,
      {
        kind: "page",
        does: "pick",
        ask: "Pick one option",
        name: NAME,
        program: PROGRAM,
      }
    );
    const read = () =>
      fleet.api<ArtifactRead>(`/api/instances/${writer}/artifacts/${made.id}`);
    await until(
      "the page ready in the app's preview",
      () => heard.find((line) => line === "preview ready"),
      Boolean,
      90_000
    );

    // The card's columns, from its Close and its head's width; read under the head.
    const close = heard.findLast((line) => CLOSE.test(line))?.match(CLOSE);
    const width = Number(
      heard.findLast((line) => WIDTH.test(line))?.match(WIDTH)?.[1] ?? 0
    );
    const right = Number(close?.[1] ?? 0) + 22;
    const left = right - width;
    const top = Number(close?.[2] ?? 0) + 30;
    const columns = [0.25, 0.5, 0.8].map((at) =>
      Math.round(left + (right - left) * at)
    );
    // 1. No Send in the head: none standing, none in More, none in the app's own tree.
    await Bun.sleep(3000);
    const room = heard.findLast((line) => ROOM.test(line));
    const standing = room?.match(ROOM);
    const native = await elements(udid);
    // The preview card's own views: the transcript beside it has the composer's Send.
    const nativeSends = native.filter(
      (one) =>
        one.label.startsWith("Send") &&
        one.frame.x + one.frame.width > left &&
        one.frame.x < right
    );
    kit.check(
      "1: the head stands no Send of its own, standing or in More, and the card's own views offer none",
      !!standing &&
        !(standing[1] ?? "")
          .split(",")
          .some((slot) => slot.startsWith("send:")) &&
        !(standing[2] ?? "").split(",").includes("send") &&
        nativeSends.length === 0,
      `${room ?? "no head room line"}; the card's own Send elements: ${JSON.stringify(nativeSends)}`
    );

    const page = await scan(udid, columns, top, 1340);
    const option = page.find((one) =>
      one.label.startsWith("Cache the heavy checks")
    );
    console.log(
      `  the card's x ${left}-${right}, from y ${top}: ${page.map((one) => one.label.slice(0, 40)).join(" | ")}`
    );
    if (
      !kit.check(
        "1b: the page's option and its own Send stand in the card",
        !!option && page.some((one) => one.label.startsWith("Send")),
        page
          .map(
            (one) =>
              `${one.label.slice(0, 40)}@${Math.round(one.frame.x)},${Math.round(one.frame.y)}`
          )
          .join(" | ") || "nothing read"
      )
    ) {
      return;
    }

    // 2. Pick with a finger, then the page's own Send.
    await tapAt(udid, (option as Element).frame);
    const sendTop = Math.round(
      page.find((one) => one.label.startsWith("Send"))?.frame.y ?? top
    );
    const picked = await until(
      "lint picked on the hub",
      read,
      (now) =>
        (now.decisions ?? []).some(
          (one) => one.id === "lint" && one.answer === "picked"
        ),
      20_000
    ).catch(read);
    const send = await until(
      "the page's Send naming its pick",
      async () =>
        (await scan(udid, columns, sendTop - 32, sendTop + 64)).find((one) =>
          one.label.startsWith("Send 1 pick")
        ),
      Boolean,
      20_000
    ).catch(() => undefined);
    if (send) {
      await tapAt(udid, send.frame);
    }
    const sent = await until(
      "the page's Send on the hub",
      read,
      (now) => now.sentAt !== null,
      20_000
    ).catch(read);
    const route = `POST /__cawco/artifact/${made.id}/send`;
    const want = artifactToolWords.pageSent(
      `${made.id} (page "${NAME}")`,
      SEND_CONTROLS["page-send"],
      route,
      ""
    );
    const journal = (await fleet.logs("hub"))
      .split("\n")
      .filter((line) => line.includes(`[artifacts] ${made.id} `));
    const named = journal.find((one) => one.includes(want));
    console.log(`  hub journal: ${named ?? journal.join(" | ")}`);
    kit.check(
      "2: a finger's pick and the page's own Send in the app's web view: the hub stamps sentAt and its journal names the page's Send through the page's route",
      (picked.decisions ?? []).some(
        (one) => one.id === "lint" && one.answer === "picked"
      ) &&
        !!send &&
        sent.sentAt !== null &&
        !!named,
      `send ${send ? JSON.stringify(send) : "not found"}; sentAt ${sent.sentAt}; journal: ${journal.join(" | ") || "none"}`
    );
  } finally {
    await Bun.write(`${kit.out}/ios-decision-send.log`, heard.join("\n"));
    stream.kill();
    await sim.release();
  }
};

const spec: Spec = { name: "ios-decision-send", run };
export default spec;
