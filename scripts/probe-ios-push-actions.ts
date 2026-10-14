#!/usr/bin/env bun
/**
 * iOS push actions probe: from a notification, without opening the app, the
 * owner answers a simple question an agent asked and replies to a session,
 * through the paths the app's own UI uses; a failure leaves a local
 * notification saying what happened.
 *
 *   bun scripts/probe-ios-push-actions.ts [--keep]
 *
 * Run from the repo root, on the Mac or in a shell that reaches it as
 * `ssh mac` (not a CawCo workspace). It:
 *
 *  1. compiles the app (build-both.sh ios --compile-only);
 *  2. stands up a scratch fleet here (scratch-fleet.ts) whose hub pushes to a
 *     stand-in Cawrier this probe serves (`CAWCO_CAWRIER_ORIGIN`), which keeps
 *     each push's body: the hub's real payload, sealed for the simulator;
 *  3. forwards the scratch hub to the Mac's loopback (`ssh -R`), makes an
 *     iPhone 16 Pro simulator on iOS 18.5 (the iOS 27.2 simulator's
 *     notification centre never answers the app; see `SIM_RUNTIME`'s use),
 *     installs the app, streams the app's log from before
 *     its first launch (`log stream`, read for every step after), and runs a
 *     Maestro flow that launches it with `-paywall-env sandbox
 *     -push-probe-register`, waits for iOS's prompt and taps its Allow (the
 *     flow's own tap; Maestro's auto-tap is off). It then waits for the app's own registration of
 *     its pairing and push key with the hub (PushProbe; a simulator has no
 *     purchase for Cawrier);
 *  4. for each case, quits the app, delivers the hub's payload with
 *     `xcrun simctl push <udid> dev.cawco.app <payload.apns>`, and lists
 *     what the notification centre shows;
 *  5. runs the action. A script can't press a notification's action on a
 *     simulator and `UNNotificationResponse` has no public initializer, so
 *     the app is launched with `-push-probe-act <id> <action> [<text>]`, which
 *     builds the `PushNote` the delegate builds from a response and calls the
 *     same `PushActions.perform` the delegate calls;
 *  6. asserts on the scratch hub:
 *     - an option of a one-part question with three options answers it: the
 *       ask leaves /api/pending and the transcript carries the label;
 *     - "Other…" answers a two-option question with the typed words;
 *     - Reply on a failed attempt's push (made by the hub's own push.ts with
 *       the scratch hub's device and session) arrives as a user message;
 *     - the top-level session's finished turn pushes CAWCO_TURN (Open,
 *       Reply) with the reply's first line sealed, Reply on it lands, and
 *       the turn that Reply starts pushes when it ends;
 *     - two turns of one session 3 s apart send two pushes under one
 *       collapse id, the second replacing the first;
 *     - a turn that ends with its session in front in the app (launched with
 *       `-open-session`) pushes nothing: the app marks it looked at;
 *     - a delegate's finished turn pushes nothing;
 *     - a Write permission (a session in default mode) offers Approve, Deny,
 *       Other…, Open; Deny resolves it and the session hears the denial;
 *       Other… denies with the typed words, which the transcript shows;
 *     - a multi-select question, and one with four options, go sealed
 *       without options (Open only);
 *     - a push that lands with the app in front stays in Notification Centre;
 *     - with the hub stopped, Reply leaves the "not sent" local notification
 *       in the push's place, read off the delivered list.
 *
 * The inline buttons of a question are the notification service extension's
 * work. A simulator never hands a `simctl push` to it (Xcode 11.4 release
 * notes, known issue 55822721: "Notification Service Extensions do not work
 * in simulated push notifications"; Xcode 14's: remote notifications "support
 * more features (like Notification Service Extensions) than locally simulated
 * notifications using .apns payload files or the simctl push command"). So
 * "the extension runs for a simctl push" is device-only and SKIPs, unless an
 * `opened` / `not opened` line does follow the push. Then the app runs the
 * extension's opening (CawCoPush `PushOpening.open`, the one function
 * NotificationService calls) on the delivered push, `-push-probe-open <id>`:
 * opened with the key this device registered, its question category
 * registered, and the opened push put back in its place, as iOS shows what
 * the extension hands back. The probe checks the sealed title and the
 * option buttons on what the centre then shows.
 *
 * It stops only what it started: the fleet's processes by PID, the stand-in,
 * the tunnel, the log stream, and the simulator it created (deleted at the
 * end). `--keep` keeps the fleet's sandbox for reading. The Mac needs Maestro
 * (/opt/homebrew/bin/maestro, a fleet tool) and brew's openjdk for it.
 *
 * Prints `PASS <step>` / `FAIL <step>` per check and exits 0 only if every
 * check passed.
 */
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { DbShape, WorkItemRow } from "../packages/hub/src/db";
import type { RegistryShape } from "../packages/hub/src/registry";
import { macSideApp, macSideStale } from "./lib/apple-app";
import { type MacSim, macSim } from "./lib/mac-sim";
import { MACHINE, scratchFleet, until } from "./scratch-fleet";

const keep = process.argv.includes("--keep");
const root = resolve(import.meta.dir, "..");
const home = process.env.HOME ?? "";
const onMac = process.platform === "darwin";
const SSH = ["ssh", "-F", join(home, ".ssh", "config"), "-o", "BatchMode=yes"];
const BUNDLE = "dev.cawco.app";
const BUILT_IOS = /^BUILT iOS$/m;
const BUILT_IOS_18 = /^BUILT iOS 18\.5$/m;
/** The simulator the probe runs on: build-both.sh's 'iOS 18.5' pair. */
const SIM_RUNTIME = "com.apple.CoreSimulator.SimRuntime.iOS-18-5";
const SIM_TYPE = "com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro";
/** A thread's head in `sample`'s call graph, which names its dispatch queue. */
const SAMPLE_THREAD = /\n(?=\s+\d+\s+Thread_)/;
/** The notification centre's queues, and the app's own (NotificationCentre). */
const CENTRE_QUEUE = /usernotifications|notification-centre/i;
/** A notification framework line worth printing: the app's, or a failure. */
const CENTRE_LINE = /CawCo|dev\.cawco\.app|error|fail|invalid|timed? ?out/i;
// Inside the checkout it runs from (git-ignored), so whoever reads the run
// reads the captures beside it.
const out = join(root, ".probe", `ios-push-actions-${Date.now()}`);
await mkdir(out, { recursive: true });
console.log(
  `  at ${(await Bun.$`git -C ${root} log -1 --format=%h\ %s`.text()).trim()}`
);

let failures = 0;
const check = (step: string, ok: boolean, detail: string) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${step}: ${detail}`);
  if (!ok) {
    failures += 1;
  }
};
/** A check this run can't judge, said with why; it does not count either way. */
const skip = (step: string, why: string) => {
  console.log(`SKIP ${step}: ${why}`);
};

/** Runs `script` in bash on the Mac; its stdout, or throws with its stderr. */
async function mac(script: string): Promise<string> {
  const child = Bun.spawn(
    onMac ? ["bash", "-s"] : [...SSH, "mac", "bash", "-s"],
    {
      stdin: new TextEncoder().encode(`set -euo pipefail\n${script}\n`),
      stdout: "pipe",
      stderr: "pipe",
    }
  );
  const [text, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) {
    throw new Error(`mac exited ${code}: ${err.trim() || text.trim()}`);
  }
  return text;
}

/**
 * Maestro on the Mac (a fleet tool), with Java from brew's openjdk as its
 * fleet MCP config sets it, and none of its analytics, AI-analysis notice or
 * update check (docs.maestro.dev/maestro-cli/environment-variables).
 * `MAESTRO_OPTS` carries JVM options into Maestro's launcher (Gradle's start
 * script adds them to the `java` line and prints nothing of its own);
 * `--enable-final-field-mutation=ALL-UNNAMED` is what JDK 26's "WARNING:
 * Mutating final fields will be blocked" asks for (JEP 500), so Maestro's
 * own lines are what it prints (as probe-ios-caw-panel.ts runs it).
 */
const MAESTRO =
  'JAVA_HOME="$(/opt/homebrew/bin/brew --prefix openjdk)" MAESTRO_OPTS=--enable-final-field-mutation=ALL-UNNAMED MAESTRO_CLI_NO_ANALYTICS=true MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true MAESTRO_DISABLE_UPDATE_CHECK=true /opt/homebrew/bin/maestro --no-ansi';

/**
 * A port for Maestro's runner, bound free on the Mac's 127.0.0.1 a moment
 * before each Maestro call, which takes it as `--driver-host-port`. Left to
 * itself, `maestro test` picks one with `ServerSocket(0)` (TestCommand
 * .selectPort), which on macOS probes the IPv6 wildcard: a port another
 * process holds on 127.0.0.1 alone (an `ssh -R` tunnel such as this
 * probe's) reads as free there ("a port reported free there can still be
 * taken on IPv4", Maestro's SocketUtils.getFreePort), and Maestro talks to
 * its runner at 127.0.0.1. At 3b7734e0 that is what answered: the flow's
 * first read of its runner, `deviceInfo`, got a body opening with `<` and
 * Maestro stopped before launchApp ("JsonParseException: Unexpected
 * character ('<'" at XCTestDriverClient.deviceInfo), then failed to
 * terminate a runner that was gone (simctl's ESRCH, "found nothing to
 * terminate"). Binding 127.0.0.1 itself sees every holder of the port.
 */
const runnerPort = async () =>
  Number(
    (
      await mac(
        `python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])'`
      )
    ).trim()
  );

/**
 * Runs `steps` (Maestro flow commands) on the probe's simulator under this
 * app's id; whether the flow passed, Maestro's last lines, and all it said.
 */
const flow = async (
  name: string,
  steps: string
): Promise<{ ok: boolean; said: string; all: string }> => {
  const yaml = `appId: ${BUNDLE}\n---\n${steps}`;
  const b64 = Buffer.from(yaml).toString("base64");
  const tail = (text: string) =>
    text.trim().split("\n").slice(-6).join(" / ").slice(0, 400);
  const port = await runnerPort();
  return await mac(`D=$(mktemp -d)
trap 'rm -rf "$D"' EXIT
echo '${b64}' | base64 -D > "$D/${name}.yaml"
${MAESTRO} --device ${udid} --driver-host-port ${port} test "$D/${name}.yaml" 2>&1`).then(
    (text) => ({ ok: true, said: tail(text), all: text.trim() }),
    (error: unknown) => ({
      ok: false,
      said: tail(String(error)),
      all: String(error).trim(),
    })
  );
};

/** The screen as Maestro reads it (`maestro hierarchy`): its JSON, or the failure. */
const hierarchy = async () =>
  mac(
    `${MAESTRO} --device ${udid} --driver-host-port ${await runnerPort()} hierarchy 2>/dev/null`
  ).catch((error: unknown) => `maestro hierarchy failed: ${String(error)}`);

// ── The app's log, streamed from before its first launch ─────────────────
/**
 * Every line `log stream` gave for the app's subsystem (the app and its
 * extension), in order. Read live rather than with `log show`: on the runs
 * at 65f13900 and 10e9336b `log show --start` returned none of the hook's
 * notice lines, though at 65f13900 the prompt the hook asks for right after
 * its "asking" line was on screen. `log stream` hands each message over as
 * it is logged ("Stream activities, log data or trace messages", log(1)).
 */
const appLog: string[] = [];
let logStream: ReturnType<typeof Bun.spawn> | undefined;
let logStreamEnded: string | undefined;
/** What `log stream` prints first: its filter line, or compact style's column heads. */
const LOG_HEADER = /Filtering the log data|^Timestamp/;
/** Where the app's log stands now: what was logged after this is `logSince(it)`. */
const mark = () => appLog.length;
const logSince = (from: number) => appLog.slice(from).join("\n");
/**
 * Starts `log stream` for the app's subsystem on the simulator and waits for
 * its header, the proof it is attached; the header line, or throws.
 */
const streamAppLog = async () => {
  const script = `exec xcrun simctl spawn ${udid} log stream --level debug --style compact --predicate 'subsystem == "dev.cawco.app"'`;
  const child = Bun.spawn(
    onMac ? ["bash", "-c", script] : [...SSH, "mac", script],
    {
      stdout: "pipe",
      stderr: "pipe",
    }
  );
  logStream = child;
  const pump = async (from: ReadableStream<Uint8Array>) => {
    const decoder = new TextDecoder();
    let rest = "";
    for await (const chunk of from) {
      rest += decoder.decode(chunk, { stream: true });
      const lines = rest.split("\n");
      rest = lines.pop() ?? "";
      appLog.push(...lines);
    }
  };
  pump(child.stdout).catch(() => undefined);
  pump(child.stderr).catch(() => undefined);
  child.exited.then((code) => {
    logStreamEnded = `log stream exited ${code}`;
  });
  const header = await until(
    "the app's log stream attached",
    () =>
      appLog.find((line) => LOG_HEADER.test(line)) ??
      (logStreamEnded ? "" : undefined),
    (line) => line !== undefined,
    30_000
  ).catch(() => undefined);
  if (!header) {
    throw new Error(
      `the app's log never streamed: ${logStreamEnded ?? "no header in 30 s"}; it said: ${appLog.slice(0, 5).join(" / ") || "nothing"}`
    );
  }
  return header;
};

// ── What the mock asks, one tool call per marker ─────────────────────────
const tag = crypto.randomUUID().slice(0, 6);
const question = (text: string, labels: string[], multiSelect = false) => ({
  questions: [
    {
      question: text,
      header: "Probe",
      multiSelect,
      options: labels.map((label) => ({
        label,
        description: `Pick ${label}.`,
      })),
    },
  ],
});
const THREE = [
  "Ship the narrow fix",
  "Keep the wide change",
  "Wait for review",
];
const TWO = ["Use the staging hub", "Use the scratch hub"];
const FOUR = ["North", "East", "South", "West"];
const ASKS: Record<string, ReturnType<typeof question>> = {
  [`probe-three ${tag}`]: question("Which change ships today?", THREE),
  [`probe-two ${tag}`]: question("Which hub does the run use?", TWO),
  [`probe-four ${tag}`]: question("Which way does the probe go?", FOUR),
  [`probe-multi ${tag}`]: question(
    "Which checks does the probe run?",
    ["Lint", "Types"],
    true
  ),
};
/** Write calls a session in default permission mode parks for the operator. */
const WRITES: Record<string, string> = {
  [`probe-deny ${tag}`]: `denied-${tag}.txt`,
  [`probe-deny-with ${tag}`]: `redirected-${tag}.txt`,
};
const asked = new Set<string>();
/** Turns the mock answers in words of their own, so each turn's push is told apart. */
const TURN_WORDS: Record<string, string> = {
  [`probe-turn-1 ${tag}`]: "Turn one",
  [`probe-turn-2 ${tag}`]: "Turn two",
  [`probe-looked ${tag}`]: "Looked at",
};
/** The delegate's brief carries this, so its requests are known. */
const DELEGATE_MARK = `probe-delegate ${tag}`;

// ── The stand-in Cawrier: keeps every push the hub sends ─────────────────
interface Captured {
  collapseId: string;
  pairingId: string;
  payload: {
    aps: { category: string; alert: { title: string; body: string } };
    cawco: Record<string, string | null>;
    e: string;
  };
}
const captured: Captured[] = [];
const cawrier = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/v1/push") {
      captured.push((await request.json()) as Captured);
      return Response.json({ ok: true });
    }
    if (path === "/v1/unenroll") {
      return new Response(null, { status: 204 });
    }
    return new Response("not here", { status: 404 });
  },
});
const cawrierOrigin = `http://127.0.0.1:${cawrier.port}`;

const fleet = await scratchFleet({
  name: "probe-ios-push-actions",
  respond: (seen) => {
    const fresh = (marker: string) =>
      seen.tools && seen.last.includes(marker) && !asked.has(marker);
    for (const [marker, input] of Object.entries(ASKS)) {
      if (fresh(marker) && seen.toolNames.includes("AskUserQuestion")) {
        asked.add(marker);
        return {
          everyMs: 5,
          words: [],
          tool: { name: "AskUserQuestion", input },
        };
      }
    }
    for (const [marker, file] of Object.entries(WRITES)) {
      if (fresh(marker) && seen.toolNames.includes("Write")) {
        asked.add(marker);
        return {
          everyMs: 5,
          words: [],
          tool: {
            name: "Write",
            input: { file_path: join(fleet.workdir, file), content: "probe" },
          },
        };
      }
    }
    for (const [marker, words] of Object.entries(TURN_WORDS)) {
      if (seen.tools && seen.last.includes(marker)) {
        return { everyMs: 20, words: [words] };
      }
    }
    return { everyMs: 20, words: ["ok"] };
  },
});
// The hub reads it at its start: every push goes to the stand-in.
fleet.env.CAWCO_CAWRIER_ORIGIN = cawrierOrigin;
// push.ts reads it as it loads, for the attempt push this probe makes with it.
process.env.CAWCO_CAWRIER_ORIGIN = cawrierOrigin;

let tunnel: ReturnType<typeof Bun.spawn> | undefined;
let sim: MacSim | undefined;
let udid = "";
let hub = "";

/** The sealed alert of a push, opened with the key the device registered. */
const opened = async (
  push: Captured
): Promise<{
  title: string;
  body: string;
  options?: { id: string; label: string }[];
}> => {
  const [device] = fleet.query<{ key: string }>(
    "SELECT key FROM push_devices WHERE pairing_id = ?",
    push.pairingId
  );
  const raw = Buffer.from(push.payload.e, "base64");
  const key = await crypto.subtle.importKey(
    "raw",
    Buffer.from(device?.key ?? "", "base64"),
    "AES-GCM",
    false,
    ["decrypt"]
  );
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: raw.subarray(0, 12), tagLength: 128 },
    key,
    raw.subarray(12)
  );
  return JSON.parse(new TextDecoder().decode(plain));
};

/**
 * Waits for a line matching `pattern` logged after `from`, or until `over()`
 * says nothing more can come; the log since, and the match.
 */
const awaitLine = async (
  from: number,
  pattern: RegExp,
  ms = 60_000,
  over: () => boolean = () => false
) => {
  const text = await until(
    `a log line ${pattern}`,
    () => logSince(from),
    (log) => pattern.test(log) || over(),
    ms
  ).catch(() => logSince(from));
  return { log: text, match: text.match(pattern) };
};
const launch = (args: string) =>
  mac(
    `xcrun simctl launch --terminate-running-process ${udid} ${BUNDLE} -paywall-env sandbox -cawco-hub-url ${hub} ${args} >/dev/null`
  );
const quit = () =>
  mac(`xcrun simctl terminate ${udid} ${BUNDLE} >/dev/null 2>&1 || true`);

/**
 * Delivers `push`'s payload as APNs would: with the app quit, or with it
 * open in front (`foreground`). Returns the extension's lines for it.
 */
const deliver = async (push: Captured, foreground = false) => {
  if (foreground) {
    await launch("");
    await Bun.sleep(4000);
  } else {
    await quit();
  }
  const from = mark();
  const apns = JSON.stringify({
    ...push.payload,
    "Simulator Target Bundle": BUNDLE,
  });
  const b64 = Buffer.from(apns).toString("base64");
  await mac(`F="$(mktemp -t cawco-push).apns"
echo '${b64}' | base64 -D > "$F"
xcrun simctl push ${udid} ${BUNDLE} "$F" >/dev/null
rm -f "$F"`);
  await Bun.sleep(3000);
  return logSince(from);
};
/**
 * Whether the notification service extension ran for a delivered push: it
 * logs `push <id> opened:` (or `not opened:`) for every push it is handed,
 * from its own process. No such line means the simulator never handed the
 * push to it, which is not the code failing.
 */
const EXTENSION_RAN = /push \S+ (?:opened|not opened):/;
/** That line whole: what `PushOpening.open` said of a push. */
const OPENING_LINE = /push \S+ (?:opened|not opened):.*/;
/**
 * Why no such line comes on a simulator: Apple's word that a `simctl push`
 * never reaches the extension, never lifted in a later Xcode.
 */
const NO_SIMULATED_EXTENSION =
  'a simulator does not hand a simctl push to a Notification Service Extension (Xcode 11.4 release notes, known issue 55822721: "Notification Service Extensions do not work in simulated push notifications. The mutable-content key is not honored."; Xcode 14 release notes: remote notifications "support more features (like Notification Service Extensions) than locally simulated notifications using .apns payload files or the simctl push command")';

interface Listed {
  actions: string[];
  category: string;
  id: string;
  kind: string;
  request: string;
  title: string;
}
const LISTED =
  /probe listed (\S+) category=(\S*) actions=\[([^\]]*)\] kind=(\S*) request=(\S*) title=(.*?) body=/g;
const LISTED_DONE = /probe listed done:/;
/**
 * Launches the app with `args`, a hook that ends by listing what the
 * notification centre shows; its log from the launch, and that list.
 */
const listedAfter = async (args: string) => {
  const from = mark();
  await launch(args);
  const { log } = await awaitLine(from, LISTED_DONE, 30_000);
  const shows: Listed[] = [...log.matchAll(LISTED)].map((m) => ({
    id: m[1],
    category: m[2],
    actions: m[3] ? m[3].split("|") : [],
    kind: m[4],
    request: m[5],
    title: m[6],
  }));
  return { log, shows };
};
/** What the notification centre shows, as the app lists it. */
const listed = async (): Promise<Listed[]> =>
  (await listedAfter("-push-probe-list")).shows;
/**
 * The extension's opening (CawCoPush `PushOpening.open`, the function
 * NotificationService calls) run by the app on the delivered push `id`: its
 * category registered and the opened push put back in its place, as iOS does
 * with what the extension hands back. The hook's verdict, the opening's own
 * `opened` / `not opened` line, and what the centre shows after.
 */
const openInApp = async (id: string) => {
  const { log, shows } = await listedAfter(`-push-probe-open ${id}`);
  return {
    verdict:
      log.match(new RegExp(`probe opened ${id}: (.*)`))?.[1] ?? "no verdict",
    line: log.match(OPENING_LINE)?.[0],
    shows,
  };
};
/**
 * Runs an action on a delivered notification; the log from its start, and
 * what the notification centre showed after it (the app lists it).
 */
const act = async (id: string, action: string, text?: string) => {
  const from = mark();
  await launch(
    `-push-probe-act ${id} ${action}${text === undefined ? "" : ` '${text}'`}`
  );
  const ran = await awaitLine(
    from,
    new RegExp(`probe acted ${id} ${action}: handled`),
    60_000
  );
  const done = await awaitLine(from, AFTER_DONE, 30_000);
  const after = [...done.log.matchAll(AFTER)].map((m) => ({
    id: m[1],
    category: m[2],
    body: m[3],
  }));
  return { ...ran, after };
};
const AFTER =
  /probe after (\S+) category=(\S*) actions=\[[^\]]*\] kind=\S* request=\S* title=.*? body=(.*)/g;
const AFTER_DONE = /probe after done:/;

const pendingHas = async (requestId: string) =>
  JSON.stringify(await fleet.api<unknown[]>("/api/pending")).includes(
    requestId
  );
const transcriptHas = async (instanceId: string, words: string) =>
  JSON.stringify(
    await fleet.api<unknown>(`/api/instances/${instanceId}/transcript`)
  ).includes(words);

/**
 * Sends the session `marker`, which the mock answers with that marker's
 * question or Write, and returns the push the hub sent for the parked ask.
 */
const askAndCapture = async (instanceId: string, marker: string) => {
  await fleet.send(instanceId, `${marker}: ask me.`);
  const text = WRITES[marker] ?? ASKS[marker].questions[0].question;
  const parked = await until(
    `${marker} parked`,
    () => fleet.api<{ requestId?: string }[]>("/api/pending"),
    (list) => list.some((entry) => JSON.stringify(entry).includes(text)),
    180_000
  );
  const requestId =
    parked.find((entry) => JSON.stringify(entry).includes(text))?.requestId ??
    "";
  const push = await until(
    `the hub's push for ${marker}`,
    () => captured.find((p) => p.payload.cawco.requestId === requestId),
    (found) => found !== undefined,
    30_000
  );
  return { requestId, push: push as Captured };
};

try {
  // ── 1. Compile ─────────────────────────────────────────────────────────
  const build = Bun.spawn(
    ["bash", "apps/apple/scripts/build-both.sh", "ios", "--compile-only"],
    { cwd: root, stdout: "pipe", stderr: "inherit" }
  );
  const built = await new Response(build.stdout).text();
  process.stdout.write(built);
  const code = await build.exited;
  const compiled =
    code === 0 && BUILT_IOS.test(built) && BUILT_IOS_18.test(built);
  check(
    "compile",
    compiled,
    code === 0 ? "BUILT iOS and BUILT iOS 18.5" : `build-both.sh exited ${code}`
  );
  if (!compiled) {
    throw new Error("the app did not compile");
  }
  const top = (
    await Bun.$`git -C ${root} rev-parse --show-toplevel`.text()
  ).trim();
  // On this Mac, build-both.sh's one build root (lib/apple-app.ts); over SSH, the Mac's ~/build.
  const app = macSideApp(top);
  const stale = await macSideStale(top, mac);
  check("the app is built from this tree", !stale, stale ?? app);
  if (stale) {
    throw new Error(stale);
  }

  // ── 2. The fleet ───────────────────────────────────────────────────────
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const id = await fleet.spawn("claude", "Push actions probe");

  // ── 3. The tunnel and the simulator ────────────────────────────────────
  const port = Number(new URL(fleet.base).port);
  if (!onMac) {
    tunnel = Bun.spawn(
      [
        ...SSH,
        "-N",
        "-o",
        "ExitOnForwardFailure=yes",
        "-R",
        `127.0.0.1:${port}:127.0.0.1:${port}`,
        "mac",
      ],
      { stdout: "ignore", stderr: "inherit" }
    );
  }
  await until(
    "the scratch hub answering on the Mac",
    () => mac(`curl -sf http://127.0.0.1:${port}/health >/dev/null && echo up`),
    (text) => text.trim() === "up",
    30_000
  );
  hub = `http://127.0.0.1:${port}`;
  // iOS 18.5, the runtime build-both.sh launches the app on beside the
  // newest (its 'iOS 18.5' pair). On the iOS 27.2 simulator the notification
  // centre answers this app nothing: usernotificationsd accepts the
  // connection, passes its entitlement check and logs "Forwarding
  // getNotificationSettings: dev.cawco.app" to SpringBoard's notification
  // service, whose store maps only com.apple.* apps, and no reply comes. The
  // app's first synchronous call (removePendingNotificationRequests) then
  // parks in xpc_connection_send_message_with_reply_sync for good (runs at
  // 2aa48ace, db520abc and 4b4bc2d5), so iOS never asks.
  sim = await macSim({
    runtime: SIM_RUNTIME,
    device: SIM_TYPE,
    ssh: !onMac,
  });
  ({ udid } = sim);
  console.log(`  simulator ${udid} (${SIM_RUNTIME})`);
  // One boot, the slot's. The double boot that set SpringBoard's AX switch
  // (IgnoreAXServerEntitlements) was for axe, a host-side reader SpringBoard
  // refuses from iOS 26.5; Maestro reads and taps from its XCTest runner, an
  // app on the simulator, so nothing is switched.
  await mac(`xcrun simctl install ${udid} "${app}"`);
  check(
    "the app's log streams from the simulator",
    true,
    (await streamAppLog()).trim()
  );

  // ── The real path: iOS asks, Maestro allows, APNs gives a token, the
  // app registers its pairing and push key with the hub (PushProbe). ──────
  // The flow launches the app (one `simctl launch`, the process whose log
  // streams: Maestro.launchApp stops it through the runner, then
  // IOSDriver.launchApp; at a0570c26 one "probe register: started" and the
  // same pid to the end). Maestro launches it after its runner is up, so
  // the runner app never comes to the front over the prompt. It waits
  // for the prompt's "Allow" and taps it itself. Maestro's own tap is not
  // relied on: its runner taps Allow only when ViewHierarchyHandler's
  // RunningApp.getForegroundApp() returns SpringBoard; when no app reads as
  // `.runningForeground` (the app sits inactive behind SpringBoard's alert)
  // it returns nil, and the handler hands back SpringBoard's tree, Allow
  // and all, without calling SystemPermissionHelper (Maestro cli-2.11.0;
  // issue #2331, iOS 18.0: "the notification popup is not clicked"). That
  // is the run at a0570c26: the prompt shown at once ("Show notification
  // user authorization prompt" 0.1 s after the ask), an optional wait for
  // "Allow" that passed, and Allow still on screen 75 s later in the same
  // process. So notifications are `unset` in the runner, which makes its
  // helper do nothing (PermissionButtonFinder: `.unset` →
  // `.noActionRequired`) and runs nothing on the simulator (neither
  // applesimutils nor simctl knows the key); `all`, launchApp's default,
  // would set notifications to allow and race the flow's tap. A text
  // selector matches the whole label (Filters.textMatches, Regex.matches),
  // so "Allow" is not "Don’t Allow". Its `arguments` reach the app as
  // `-key value`, and a boolean's key as written (Maestro
  // IOSLaunchArguments.toIOSLaunchArguments). The app's own "probe
  // authorization:" line is the verdict.
  const registerFrom = mark();
  const registerAt = Date.now();
  const crashMark = (await mac("mktemp -t cawco-probe-mark")).trim();
  let allowance: { ok: boolean; said: string; all: string } | undefined;
  const allowing = flow(
    "allow-notifications",
    `- launchApp:
    appId: ${BUNDLE}
    permissions:
      notifications: unset
    arguments:
      paywall-env: sandbox
      cawco-hub-url: "${hub}"
      "-push-probe-register": true
- extendedWaitUntil:
    visible:
      text: "Allow"
    timeout: 90000
- tapOn:
    text: "Allow"
- extendedWaitUntil:
    notVisible:
      text: "Allow"
    timeout: 15000
`
  ).then((result) => {
    allowance = result;
    // Maestro's own account of the flow, every command and its outcome.
    console.log("  Maestro (allow-notifications):");
    for (const line of result.all.split("\n")) {
      console.log(`    ${line.slice(0, 240)}`);
    }
    return result;
  });
  const flowFailed = () => allowance?.ok === false;
  // Maestro's first flow on a fresh simulator installs and starts its runner first.
  const started = await awaitLine(
    registerFrom,
    /probe register: started.*/,
    240_000,
    flowFailed
  );
  const front = started.log.match(/probe register: in front .*/)?.[0];
  check(
    "the app's register hook runs",
    started.match !== null,
    started.match
      ? `${started.match[0]}${front ? `; ${front}` : ""}`
      : `no "probe register: started" line ${Math.round((Date.now() - registerAt) / 1000)} s after the flow began; Maestro: ${allowance ? `${allowance.ok ? "passed" : "failed"}: ${allowance.said}` : "still running"}`
  );
  // The hook asks from a window in front, and says iOS's word before it asks.
  const asking = started.match
    ? await awaitLine(
        registerFrom,
        /probe register: asking for notifications(.*)/,
        60_000
      )
    : started;
  const hookLines = (log: string) =>
    log.split("\n").filter((line) => line.includes(":PushProbe]"));
  check(
    "the app asks for notifications",
    asking.match !== null,
    asking.match
      ? `PushProbe's register hook called requestAuthorization${asking.match[1]}`
      : `no "probe register: asking" line; the hook's last: ${hookLines(asking.log).at(-1)?.slice(0, 200) ?? "none"}`
  );
  // Past the hook's 45 s "no answer" line, which says iOS's word then.
  const authorized = started.match
    ? await awaitLine(
        registerFrom,
        /probe authorization: (.*)/,
        75_000,
        flowFailed
      )
    : started;
  const unanswered = authorized.log.match(
    /probe register: no answer 45 s after asking.*/
  )?.[0];
  const allowed = authorized.match?.[1]?.trim() === "allowed";
  // The flow ends once Allow is tapped and gone, or when a step fails.
  const allowedBy = await allowing;
  if (!allowed) {
    const shot = join(out, "permission-prompt.png");
    const png = await mac(`F=$(mktemp -d)
xcrun simctl io ${udid} screenshot "$F/s.png" >/dev/null 2>&1
base64 < "$F/s.png"
rm -rf "$F"`).catch(() => "");
    if (png) {
      await Bun.write(shot, Buffer.from(png.replace(/\s/g, ""), "base64"));
    }
    console.log(
      `  the screen when it wasn't allowed: ${png ? shot : "no capture"}`
    );
    // What Maestro read there: whether the prompt's buttons were in its tree.
    const tree = await hierarchy();
    const labels = [
      ...tree.matchAll(/"(?:accessibilityText|text|title)"\s*:\s*"([^"]+)"/g),
    ]
      .map((m) => m[1])
      .slice(0, 30);
    console.log(
      `  what Maestro read there: ${labels.length ? labels.join(" | ") : tree.slice(0, 200)}`
    );
    // Every line the app logged since the flow began, whole: where the hook stopped.
    const logFile = join(out, "register-log.txt");
    await Bun.write(logFile, logSince(registerFrom));
    console.log(`  the app's lines since the flow began: ${logFile}`);
    for (const line of logSince(registerFrom)
      .split("\n")
      .filter((l) => l.includes(":PushProbe]") || l.includes(":Push]"))
      .slice(-20)) {
      console.log(`    ${line.slice(0, 240)}`);
    }
    if (logStreamEnded) {
      console.log(`  the app's log stream: ${logStreamEnded}`);
    }
    // Whether the app is still running, and any crash report since the flow
    // began: the simulator's processes are the Mac's, and their reports land
    // in the Mac's own DiagnosticReports.
    const running = await mac(
      `xcrun simctl spawn ${udid} launchctl list | grep 'UIKitApplication:${BUNDLE}' || echo "not in launchctl list"`
    ).catch((error: unknown) => `launchctl list failed: ${String(error)}`);
    console.log(`  the app's process (pid status label): ${running.trim()}`);
    const crashes = await mac(
      `find "$HOME/Library/Logs/DiagnosticReports" -maxdepth 1 -name 'CawCo*' -newer '${crashMark}' 2>/dev/null || true`
    ).catch(() => "");
    console.log(
      `  CawCo crash reports since the flow began: ${crashes.trim().split("\n").filter(Boolean).join(", ") || "none"}`
    );
    // Which side went quiet when the notification centre answered nothing.
    // The centre runs every completion and delegate call on one serial
    // `…UNUserNotificationServiceConnection.call-out` queue: a thread on it
    // in the sample is a callout that never returned, and its stack says
    // whose; no thread on it, with the app's own `dev.cawco.notification-centre`
    // queue idle too, is a daemon that never replied. A simulator app is a
    // Mac process, so the Mac's `sample` reads it.
    const pid = running.trim().split(/\s+/)[0] ?? "";
    if (/^\d+$/.test(pid)) {
      const sampled = await mac(`F=$(mktemp -t cawco-sample)
/usr/bin/sample ${pid} 2 -mayDie -file "$F" >/dev/null 2>&1 || true
cat "$F"
rm -f "$F"`).catch((error: unknown) => `sample failed: ${String(error)}`);
      const sampleFile = join(out, "app-sample.txt");
      await Bun.write(sampleFile, sampled);
      const queues = sampled
        .split(SAMPLE_THREAD)
        .filter((block) => CENTRE_QUEUE.test(block.split("\n")[0] ?? ""));
      console.log(
        `  the app's threads (sample of pid ${pid}): ${sampleFile}; on the centre's queues and the app's notification queue: ${queues.length || "none"}`
      );
      for (const block of queues) {
        for (const line of block.split("\n").slice(0, 30)) {
          console.log(`    ${line.slice(0, 200)}`);
        }
      }
    } else {
      console.log(`  the app's threads: no pid to sample (${running.trim()})`);
    }
    // The notification framework's own lines, in the app and in its daemon.
    const centreLog = await mac(
      `xcrun simctl spawn ${udid} log show --last 6m --info --debug --style compact --predicate 'subsystem BEGINSWITH[c] "com.apple.usernotifications" OR process BEGINSWITH[c] "usernotifications"'`
    ).catch((error: unknown) => `log show failed: ${String(error)}`);
    const centreFile = join(out, "notifications-log.txt");
    await Bun.write(centreFile, centreLog);
    const centreLines = centreLog
      .split("\n")
      .filter((line) => CENTRE_LINE.test(line));
    console.log(
      `  the notification framework's and its daemon's lines: ${centreFile}; ${centreLines.length} name the app or an error, the last 30:`
    );
    for (const line of centreLines.slice(-30)) {
      console.log(`    ${line.slice(0, 240)}`);
    }
  }
  await mac(`rm -f '${crashMark}'`).catch(() => undefined);
  check(
    "notifications allowed through the prompt",
    allowed,
    `Maestro ${allowedBy.ok ? "passed" : "failed"} (${allowedBy.said || "no output"}); app: ${authorized.match?.[1]?.trim() ?? unanswered ?? "no authorization line"}`
  );
  if (!started.match) {
    throw new Error("the app's register hook never ran");
  }
  const registered = await awaitLine(
    registerFrom,
    /probe registered: (.*)/,
    60_000
  );
  const token = registered.log.match(/probe token: (\S+)/)?.[1];
  check(
    "APNs gives the simulator a token",
    token !== undefined,
    token
      ? `token ${token}`
      : `no token line; the app said: ${registered.match?.[1]?.trim() ?? "nothing"}`
  );
  const devices = await fleet
    .api<{ devices: { id: string; platform: string }[] }>("/api/push")
    .catch(() => ({ devices: [] }));
  check(
    "the app registers its push key with the hub",
    registered.match?.[1]?.trim() === "ok" && devices.devices.length === 1,
    `app: ${registered.match?.[1]?.trim() ?? "no registration line"}; hub devices: ${devices.devices.map((d) => `${d.id} ${d.platform}`).join(", ") || "none"}`
  );
  if (devices.devices.length === 0) {
    throw new Error("no device registered with the hub");
  }

  // ── 4. An option answers a one-part question with three options ────────
  {
    const marker = `probe-three ${tag}`;
    const { requestId, push } = await askAndCapture(id, marker);
    const sealed = await opened(push);
    check(
      "the hub seals the three options",
      push.payload.aps.category === "CAWCO_QUESTION" &&
        JSON.stringify(sealed.options?.map((o) => o.label)) ===
          JSON.stringify(THREE),
      `aps.category ${push.payload.aps.category}; sealed options ${JSON.stringify(sealed.options)}`
    );
    const extension = await deliver(push);
    const delivered = (await listed()).find((n) => n.request === requestId);
    // The buttons are the extension's work. A simulator never runs it for a
    // simctl push (Apple, NO_SIMULATED_EXTENSION), so there its opening runs
    // from the app on the delivered push: the same function, the same
    // registration, the opened push put back where iOS would show it.
    // Only iOS calling `didReceive` stays device-only.
    const extensionRan = EXTENSION_RAN.test(extension);
    if (extensionRan) {
      check(
        "the extension runs for a simctl push",
        true,
        extension.match(EXTENSION_RAN)?.[0] ?? ""
      );
    } else {
      skip(
        "the extension runs for a simctl push",
        `device-only: ${NO_SIMULATED_EXTENSION}; no \`opened\` / \`not opened\` line followed this push either`
      );
    }
    const opening =
      !extensionRan && delivered ? await openInApp(delivered.id) : undefined;
    if (opening) {
      check(
        "the extension's opening opens the hub's sealed push with this device's key (run from the app)",
        opening.verdict.startsWith("opened, category CAWCO_QUESTION.") &&
          /push \S+ opened:/.test(opening.line ?? ""),
        `verdict: ${opening.verdict}; ${opening.line ?? "no opened line"}`
      );
    }
    const shown = opening
      ? opening.shows.find((n) => n.request === requestId)
      : delivered;
    const step = opening
      ? "the extension's opening gives the push the sealed title, an action per option and Other… (run from the app)"
      : "the extension gives the push the sealed title, an action per option and Other…";
    check(
      step,
      shown?.category.startsWith("CAWCO_QUESTION.") === true &&
        JSON.stringify(shown.actions) ===
          JSON.stringify([...THREE, "Other…"]) &&
        shown.title === sealed.title,
      shown
        ? `category ${shown.category}, actions [${shown.actions.join(" | ")}], title "${shown.title}" (sealed "${sealed.title}")`
        : "the push is not in the notification centre"
    );
    if (shown) {
      const ran = await act(shown.id, "ANSWER_1");
      const gone = await until(
        "the ask off /api/pending",
        async () => !(await pendingHas(requestId)),
        Boolean,
        30_000
      ).catch(() => false);
      const said = await until(
        "the answer in the transcript",
        () => transcriptHas(id, THREE[1]),
        Boolean,
        30_000
      ).catch(() => false);
      check(
        `option "${THREE[1]}" answers the question`,
        gone && said,
        `${ran.match ? "action ran" : "no action line"}; pending cleared ${gone}; transcript has the label ${said}; ${ran.log.match(/answer \S+: \S+/)?.[0] ?? "no answer line"}`
      );
    }
  }

  // ── 5. "Other…" answers with the operator's words ──────────────────────
  {
    const marker = `probe-two ${tag}`;
    const words = `Use the probe hub ${tag}`;
    const { requestId, push } = await askAndCapture(id, marker);
    await deliver(push);
    const shown = (await listed()).find((n) => n.request === requestId);
    if (shown) {
      const ran = await act(shown.id, "ANSWER_OTHER", words);
      const gone = await until(
        "the ask off /api/pending",
        async () => !(await pendingHas(requestId)),
        Boolean,
        30_000
      ).catch(() => false);
      const said = await until(
        "the typed answer in the transcript",
        () => transcriptHas(id, words),
        Boolean,
        30_000
      ).catch(() => false);
      check(
        "Other… answers with the typed words",
        gone && said,
        `${ran.match ? "action ran" : "no action line"}; pending cleared ${gone}; transcript has "${words}" ${said}; actions shown [${shown.actions.join(" | ")}]`
      );
    } else {
      check(
        "Other… answers with the typed words",
        false,
        "the push is not in the notification centre"
      );
    }
  }

  // ── 6. Reply on a failed attempt's push arrives as a user message ──────
  const { createPush } = await import("../packages/hub/src/push");
  const { createNotifications } = await import(
    "../packages/hub/src/notifications"
  );
  const { makeLifetime } = await import("../packages/hub/src/lifetime");
  const deviceRows = () =>
    fleet
      .query<{
        pairing_id: string;
        secret: string;
        key: string;
        name: string;
        quiet: number;
      }>("SELECT pairing_id, secret, key, name, quiet FROM push_devices")
      .map((row) => ({
        pairingId: row.pairing_id,
        secret: row.secret,
        key: row.key,
        name: row.name,
        quiet: Boolean(row.quiet),
      }));
  // The hub's own push.ts over the scratch hub's device and session: the
  // parts of the database the attempt push and its gate (notifications.ts)
  // read. Nothing was cleared, so every push carries no cleared ids.
  const db = {
    push: {
      devices: deviceRows,
      noteResult: () => undefined,
      dropDevice: () => false,
    },
    notifications: {
      sent: () => undefined,
      sentAt: () => new Map<string, Date>(),
      clear: () => [],
      clearedSince: () => [],
      prune: () => undefined,
    },
    getInstancesByIds: (ids: string[]) =>
      ids.map((instanceId) => ({
        id: instanceId,
        machineId: MACHINE,
        title: "Push actions probe",
        titleSource: "owner",
        harness: "claude",
      })),
    listAgents: () => [],
    project: () => undefined,
    projectAttempts: () => [],
  } as unknown as DbShape;
  const lifetime = makeLifetime();
  // No client beats presence here, so the gate sends every offer, and a
  // clear (none happen) has nobody to broadcast to.
  const notifications = createNotifications({
    db,
    lifetime,
    registry: { broadcastTyped: () => undefined } as unknown as RegistryShape,
  });
  const attemptPush = createPush({
    db,
    lifetime,
    notifications,
    task: () => Promise.resolve({ kind: "you", title: `Probe task ${tag}` }),
  });
  attemptPush.itemEnded({
    id: `probe-item-${tag}`,
    instanceId: id,
    projectId: `probe-project-${tag}`,
    taskId: `probe-task-${tag}`,
    state: "failed",
  } as WorkItemRow);
  const attempt = await until(
    "the attempt push",
    () => captured.find((p) => p.payload.cawco.kind === "attempt"),
    (found) => found !== undefined,
    30_000
  );
  lifetime.close();
  check(
    "the attempt push names its session and machine",
    attempt.payload.aps.category === "CAWCO_ATTEMPT" &&
      attempt.payload.cawco.instanceId === id &&
      attempt.payload.cawco.machineId === MACHINE,
    `aps.category ${attempt.payload.aps.category}, cawco ${JSON.stringify(attempt.payload.cawco)}`
  );
  await deliver(attempt);
  const attemptShown = (await listed()).find((n) => n.kind === "attempt");
  check(
    "the attempt push offers Reply",
    attemptShown?.actions.includes("Reply") === true,
    attemptShown
      ? `category ${attemptShown.category}, actions [${attemptShown.actions.join(" | ")}]`
      : "the push is not in the notification centre"
  );
  // The turn the reply starts ends with the mock's "ok": that end is the
  // top-level session's finished turn, pushed after the hub's look grace.
  const turnsBefore = captured.length;
  if (attemptShown) {
    const reply = `probe reply ${tag}`;
    const ran = await act(attemptShown.id, "REPLY", reply);
    const arrived = await until(
      "the reply in the transcript",
      () => transcriptHas(id, reply),
      Boolean,
      60_000
    ).catch(() => false);
    check(
      "Reply arrives as the operator's message",
      arrived,
      `${ran.match ? "action ran" : "no action line"}; transcript has "${reply}" ${arrived}; ${ran.log.match(/reply to \S+: .*/)?.[0] ?? "no reply line"}`
    );
  }

  // ── 7. A top-level session's finished turn pushes, with Reply ──────────
  const turn = await until(
    "the finished turn's push",
    () =>
      captured
        .slice(turnsBefore)
        .find(
          (p) =>
            p.payload.cawco.kind === "turn" && p.payload.cawco.instanceId === id
        ),
    (found) => found !== undefined,
    60_000
  ).catch(() => undefined);
  const turnSealed = turn ? await opened(turn) : undefined;
  check(
    "a finished turn of a top-level session pushes CAWCO_TURN",
    turn?.payload.aps.category === "CAWCO_TURN" &&
      turn.payload.cawco.machineId === MACHINE &&
      turnSealed?.body === "ok",
    turn
      ? `aps.category ${turn.payload.aps.category}, collapse ${turn.collapseId}, cawco ${JSON.stringify(turn.payload.cawco)}, sealed body "${turnSealed?.body}"`
      : "no turn push for the session within 60 s of its turn's end"
  );
  if (turn) {
    await deliver(turn);
    const shown = (await listed()).find(
      (n) => n.kind === "turn" && n.category === "CAWCO_TURN"
    );
    check(
      "the turn push offers Open and Reply",
      JSON.stringify(shown?.actions) === JSON.stringify(["Open", "Reply"]),
      shown
        ? `actions [${shown.actions.join(" | ")}]`
        : "the push is not in the notification centre"
    );
    if (shown) {
      const words = `probe turn reply ${tag}`;
      const replyFrom = captured.length;
      const ran = await act(shown.id, "REPLY", words);
      const arrived = await until(
        "the turn reply in the transcript",
        () => transcriptHas(id, words),
        Boolean,
        60_000
      ).catch(() => false);
      check(
        "Reply on the turn push lands in the transcript",
        arrived,
        `${ran.match ? "action ran" : "no action line"}; transcript has "${words}" ${arrived}`
      );
      // The turn that Reply started ends with the mock's "ok" and pushes
      // after the hub's look grace. At 78cd11f5 that push landed after 7b
      // had begun counting and read as 7b's first ("ok", then "Turn one").
      const replyTurn = await until(
        "the push of the turn Reply started",
        () =>
          captured
            .slice(replyFrom)
            .find(
              (p) =>
                p.payload.cawco.kind === "turn" &&
                p.payload.cawco.instanceId === id
            ),
        (found) => found !== undefined,
        60_000
      ).catch(() => undefined);
      check(
        "the turn Reply started pushes when it ends",
        replyTurn !== undefined &&
          (await opened(replyTurn as Captured)).body === "ok",
        replyTurn
          ? `sealed body "${(await opened(replyTurn as Captured)).body}", collapse ${(replyTurn as Captured).collapseId}`
          : "no turn push within 60 s of the reply"
      );
    }
  }

  // ── 7b. Two turns 3 s apart: two pushes, the second replacing the first ─
  {
    await quit();
    const from = captured.length;
    await fleet.send(id, `probe-turn-1 ${tag}: say turn one.`);
    await until(
      "turn one in the transcript",
      () => transcriptHas(id, "Turn one"),
      Boolean,
      60_000
    ).catch(() => false);
    await Bun.sleep(3000);
    await fleet.send(id, `probe-turn-2 ${tag}: say turn two.`);
    const turns = await until(
      "both turns' pushes",
      () =>
        captured
          .slice(from)
          .filter(
            (p) =>
              p.payload.cawco.kind === "turn" &&
              p.payload.cawco.instanceId === id
          ),
      (list) => list.length >= 2,
      60_000
    ).catch(() =>
      captured
        .slice(from)
        .filter(
          (p) =>
            p.payload.cawco.kind === "turn" && p.payload.cawco.instanceId === id
        )
    );
    const bodies = await Promise.all(
      turns.map(async (p) => (await opened(p)).body)
    );
    check(
      "two turns 3 s apart send two pushes, the second replacing the first",
      turns.length === 2 &&
        bodies[0] === "Turn one" &&
        bodies[1] === "Turn two" &&
        turns[0].collapseId === turns[1].collapseId,
      `${turns.length} pushes: ${turns.map((p, at) => `"${bodies[at]}" collapse ${p.collapseId}`).join(", ") || "none"} (one collapse id is APNs' replace)`
    );
  }

  // ── 7c. A session open in front in the app: its turn pushes nothing ────
  {
    const lookFrom = mark();
    await launch(`-open-session ${id}`);
    // The session's composer (ComposerView's "steer-message") is on screen.
    const inFront = (
      await flow(
        "session-in-front",
        `- extendedWaitUntil:
    visible:
      id: "steer-message"
    timeout: 120000
`
      )
    ).ok;
    const from = captured.length;
    const sent = Date.now();
    await fleet.send(id, `probe-looked ${tag}: say looked at.`);
    const said = await until(
      "the looked-at turn in the transcript",
      () => transcriptHas(id, "Looked at"),
      Boolean,
      60_000
    ).catch(() => false);
    // The hub's look grace, and more.
    await Bun.sleep(12_000);
    const pushed = captured
      .slice(from)
      .filter(
        (p) =>
          p.payload.cawco.kind === "turn" && p.payload.cawco.instanceId === id
      );
    const [seen] = fleet.query<{ seen_at: number | null }>(
      "SELECT seen_at FROM instances WHERE id = ?",
      id
    );
    if (inFront && said) {
      check(
        "a turn that ends with its session in front in the app pushes nothing",
        pushed.length === 0,
        `${pushed.length} turn pushes; the hub's seen_at ${seen?.seen_at ?? "null"} (${seen?.seen_at && seen.seen_at >= sent ? "marked after the send" : "not marked since the send"}); the app's looks: ${
          [...logSince(lookFrom).matchAll(/seen look \S+: .*/g)]
            .map((m) => m[0])
            .join(" / ") || "none"
        }`
      );
    } else {
      check(
        "a turn that ends with its session in front in the app pushes nothing",
        false,
        `nothing to judge: session in front ${inFront}, turn ended ${said}`
      );
    }
    await quit();
  }

  // ── 8. A delegate's finished turn pushes nothing ───────────────────────
  {
    // The bare origin's HEAD names `main`, the branch pushed to it: a
    // workspace is cut from the branch origin names as its HEAD (agent
    // clone.ts `remoteDefault`, `ls-remote --symref origin HEAD`). Made
    // without `-b`, its HEAD named git's default `master`, which was never
    // pushed: "origin does not name a default branch for its HEAD".
    const origin = join(fleet.workdir, "..", "probe-origin.git");
    await Bun.$`git -C ${fleet.workdir} init -q -b main && git -C ${fleet.workdir} -c user.name=probe -c user.email=probe@localhost commit -q --allow-empty -m seed && git init -q --bare -b main ${origin} && git -C ${fleet.workdir} remote add origin ${origin} && git -C ${fleet.workdir} push -q origin HEAD:main`.quiet();
    const made = await fetch(`${fleet.base}/api/work-items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        parentInstanceId: id,
        title: "Probe delegate",
        prompt: `Say ok. ${DELEGATE_MARK}`,
        checks: [{ name: "Nothing to check here", command: "true" }],
      }),
    });
    const madeText = await made.text();
    const delegate = await until(
      "the delegate's session",
      () =>
        fleet.query<{ id: string }>(
          "SELECT id FROM instances WHERE parent_instance_id = ?",
          id
        )[0],
      (row) => row !== undefined,
      120_000
    ).catch(() => undefined);
    const answeredDelegate = await until(
      "the delegate's turn",
      () => fleet.seen.some((s) => s.tools && s.all.includes(DELEGATE_MARK)),
      Boolean,
      180_000
    ).catch(() => false);
    // Its turn's end, the hub's look grace, and the send to the stand-in.
    await Bun.sleep(15_000);
    const pushed = captured.filter(
      (p) => delegate && p.payload.cawco.instanceId === delegate.id
    );
    if (delegate && answeredDelegate) {
      check(
        "a delegate's finished turn pushes nothing",
        pushed.length === 0,
        `delegate ${delegate.id}: ${pushed.length} pushes${pushed.length ? ` (${pushed.map((p) => p.payload.aps.category).join(", ")})` : ""}`
      );
    } else {
      check(
        "a delegate's finished turn pushes nothing",
        false,
        `no delegate turn to judge: POST /api/work-items ${made.status} ${madeText.slice(0, 200)}; session ${delegate?.id ?? "none"}; turn answered ${answeredDelegate}`
      );
    }
  }

  // ── 9. A permission: Deny, and Other… denying with the typed words ─────
  const asker = await fleet.spawn(
    "claude",
    "Push permissions probe",
    undefined,
    { permissionMode: "default" }
  );
  {
    const { requestId, push } = await askAndCapture(asker, `probe-deny ${tag}`);
    await deliver(push);
    const shown = (await listed()).find((n) => n.request === requestId);
    check(
      "a permission push offers Approve, Deny, Other…, Open",
      push.payload.aps.category === "CAWCO_PERMISSION" &&
        JSON.stringify(shown?.actions) ===
          JSON.stringify(["Approve", "Deny", "Other…", "Open"]),
      `aps.category ${push.payload.aps.category}; actions [${shown?.actions.join(" | ") ?? "not in the notification centre"}]`
    );
    if (shown) {
      const ran = await act(shown.id, "DENY");
      const gone = await until(
        "the denied ask off /api/pending",
        async () => !(await pendingHas(requestId)),
        Boolean,
        30_000
      ).catch(() => false);
      const heard = await until(
        "the denial in the transcript",
        () => transcriptHas(asker, "User denied permission"),
        Boolean,
        30_000
      ).catch(() => false);
      check(
        "Deny resolves the ask and the session hears it",
        gone && heard,
        `${ran.match ? "action ran" : "no action line"}; pending cleared ${gone}; transcript has "User denied permission" ${heard}; ${ran.log.match(/deny \S+: \S+/)?.[0] ?? "no deny line"}`
      );
    }
  }
  {
    const words = `Write it to notes-${tag}.md instead`;
    const { requestId, push } = await askAndCapture(
      asker,
      `probe-deny-with ${tag}`
    );
    await deliver(push);
    const shown = (await listed()).find((n) => n.request === requestId);
    if (shown) {
      const ran = await act(shown.id, "DENY_WITH", words);
      const gone = await until(
        "the redirected ask off /api/pending",
        async () => !(await pendingHas(requestId)),
        Boolean,
        30_000
      ).catch(() => false);
      const heard = await until(
        "the typed denial in the transcript",
        () => transcriptHas(asker, words),
        Boolean,
        30_000
      ).catch(() => false);
      check(
        "Other… denies with the typed words, and the transcript shows them",
        gone && heard,
        `${ran.match ? "action ran" : "no action line"}; pending cleared ${gone}; transcript has "${words}" ${heard}`
      );
    } else {
      check(
        "Other… denies with the typed words, and the transcript shows them",
        false,
        "the push is not in the notification centre"
      );
    }
  }

  // ── 10. A multi-select question is opened to be answered ───────────────
  {
    const { push } = await askAndCapture(asker, `probe-multi ${tag}`);
    const sealed = await opened(push);
    check(
      "a multi-select question goes without options",
      push.payload.aps.category === "CAWCO_QUESTION" &&
        sealed.options === undefined,
      `aps.category ${push.payload.aps.category}; sealed options ${JSON.stringify(sealed.options)}`
    );
  }

  // ── 11. Four options: Open only; and a push that lands in front is kept ─
  {
    const { requestId, push } = await askAndCapture(id, `probe-four ${tag}`);
    const sealed = await opened(push);
    check(
      "a four-option question goes without options",
      push.payload.aps.category === "CAWCO_QUESTION" &&
        sealed.options === undefined,
      `aps.category ${push.payload.aps.category}; sealed options ${JSON.stringify(sealed.options)}`
    );
    await deliver(push, true);
    const shown = (await listed()).find((n) => n.request === requestId);
    check(
      "a push received with the app in front stays in Notification Centre",
      shown !== undefined,
      shown
        ? `listed: ${shown.id} category ${shown.category}`
        : "not among the delivered notifications after it showed in front"
    );
  }

  // ── 12. The hub stopped: Reply says it wasn't sent ─────────────────────
  if (attemptShown) {
    await fleet.stop("hub");
    const words = `probe offline ${tag}`;
    const ran = await act(attemptShown.id, "REPLY", words);
    const notice = ran.after.find((n) => n.id === attemptShown.id);
    check(
      "with the hub stopped, Reply leaves a not-sent notification",
      notice?.body.includes("reply not sent") === true &&
        notice.body.includes(words) &&
        notice.category === "CAWCO_ATTEMPT",
      notice
        ? `delivered ${notice.id}, category ${notice.category}: ${notice.body}`
        : `${ran.match ? "action ran" : "no action line"}; nothing delivered in the push's place`
    );
  }
} catch (error) {
  check("probe", false, error instanceof Error ? error.message : String(error));
} finally {
  logStream?.kill();
  await sim?.release();
  tunnel?.kill();
  await cawrier.stop(true);
  await fleet.close();
  await fleet.clean(keep || failures > 0);
}

console.log(failures === 0 ? "ALL PASS" : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
