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
 *     iPhone simulator, installs the app and launches it with
 *     `-paywall-env sandbox -push-probe-register`, allows notifications, and
 *     waits for the app's own registration of its pairing and push key with
 *     the hub (PushProbe; a simulator has no purchase for Cawrier);
 *  4. for each case, quits the app, delivers the hub's payload with
 *     `xcrun simctl push <udid> dev.cawco.app <payload.apns>` (the extension
 *     opens it there), and lists what the notification centre shows;
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
 *       Reply) with the reply's first line sealed, and Reply on it lands;
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
 * work. It logs `opened` / `not opened` for every push it is handed; when no
 * such line follows a `simctl push`, the simulator never ran it, and the probe
 * says so (`FAIL the extension runs for a simctl push`) and SKIPs the button
 * check rather than failing it as the code's fault.
 *
 * It stops only what it started: the fleet's processes by PID, the stand-in,
 * the tunnel, and the simulator it created (deleted at the end). `--keep`
 * keeps the fleet's sandbox for reading.
 *
 * Prints `PASS <step>` / `FAIL <step>` per check and exits 0 only if every
 * check passed.
 */
import { basename, join, resolve } from "node:path";
import type { DbShape, WorkItemRow } from "../packages/hub/src/db";
import { MACHINE, scratchFleet, until } from "./scratch-fleet";

const keep = process.argv.includes("--keep");
const root = resolve(import.meta.dir, "..");
const home = process.env.HOME ?? "";
const onMac = process.platform === "darwin";
const SSH = ["ssh", "-F", join(home, ".ssh", "config"), "-o", "BatchMode=yes"];
const AXE = "/opt/homebrew/bin/axe";
const BUNDLE = "dev.cawco.app";
const BUILT_IOS = /^BUILT iOS$/m;
const BUILT_IOS_18 = /^BUILT iOS 18\.5$/m;
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

/** The Mac's clock, as `log show --start` reads it. */
const macNow = async () => (await mac("date '+%Y-%m-%d %H:%M:%S'")).trim();
/** The app's and the extension's push lines since `start`. */
const logSince = (start: string) =>
  mac(
    `xcrun simctl spawn ${udid} log show --start '${start}' --style compact --predicate 'subsystem == "dev.cawco.app" AND (category == "PushProbe" OR category == "Push")' 2>/dev/null || true`
  );
/** Waits for a line matching `pattern` since `start`; the whole log, and the match. */
const awaitLine = async (start: string, pattern: RegExp, ms = 60_000) => {
  let last = "";
  const text = await until(
    `a log line ${pattern}`,
    async () => {
      last = await logSince(start);
      return last;
    },
    (log) => pattern.test(log),
    ms
  ).catch(() => last);
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
  const start = await macNow();
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
  return await logSince(start);
};
/**
 * Whether the notification service extension ran for a delivered push: it
 * logs `push <id> opened:` (or `not opened:`) for every push it is handed,
 * from its own process. No such line means the simulator never handed the
 * push to it, which is not the code failing.
 */
const EXTENSION_RAN = /push \S+ (?:opened|not opened):/;

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
/** What the notification centre shows, as the app lists it. */
const listed = async (): Promise<Listed[]> => {
  const start = await macNow();
  await launch("-push-probe-list");
  const { log } = await awaitLine(start, LISTED_DONE, 30_000);
  return [...log.matchAll(LISTED)].map((m) => ({
    id: m[1],
    category: m[2],
    actions: m[3] ? m[3].split("|") : [],
    kind: m[4],
    request: m[5],
    title: m[6],
  }));
};
/**
 * Runs an action on a delivered notification; the log from its start, and
 * what the notification centre showed after it (the app lists it).
 */
const act = async (id: string, action: string, text?: string) => {
  const start = await macNow();
  await launch(
    `-push-probe-act ${id} ${action}${text === undefined ? "" : ` '${text}'`}`
  );
  const ran = await awaitLine(
    start,
    new RegExp(`probe acted ${id} ${action}: handled`),
    60_000
  );
  const done = await awaitLine(start, AFTER_DONE, 30_000);
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
  const name = top === join(home, "cockpit") ? "main" : basename(top);
  const base = onMac
    ? join(
        process.env.XDG_CACHE_HOME ?? join(home, "Library", "Caches"),
        "cawco-apple"
      )
    : "$HOME/build/cawco-apple";
  const app = `${base}/${name}/DerivedData/Build/Products/Debug-iphonesimulator/CawCo.app`;

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
  udid = (
    await mac(`read -r RUNTIME TYPE < <(xcrun simctl list devices available -j | python3 -c '
import json, re, sys
best = None
for runtime, devices in json.load(sys.stdin)["devices"].items():
    m = re.search(r"\\.iOS-(\\d+)-(\\d+)$", runtime)
    if not m:
        continue
    for d in devices:
        pro = re.fullmatch(r"iPhone (\\d+) Pro", d["name"])
        if pro:
            key = (int(m[1]), int(m[2]), int(pro[1]))
            if best is None or key > best[0]:
                best = (key, runtime, d["deviceTypeIdentifier"])
if best is None:
    sys.exit("no iPhone Pro simulator")
print(best[1], best[2])
')
xcrun simctl create "CawCo probe push actions" "$TYPE" "$RUNTIME"`)
  ).trim();
  console.log(`  simulator ${udid}`);
  await mac(`xcrun simctl boot ${udid}
xcrun simctl bootstatus ${udid} -b >/dev/null
xcrun simctl install ${udid} "${app}"`);

  // The app registers its pairing and key with the hub; iOS asks first.
  const registerStart = await macNow();
  await launch("-push-probe-register");
  const allow = await until(
    "the notifications prompt's Allow",
    async () => {
      const nodes = JSON.parse(
        await mac(`${AXE} describe-ui --udid ${udid}`)
      ) as unknown;
      const found: { x: number; y: number }[] = [];
      const walk = (at: unknown) => {
        if (Array.isArray(at)) {
          for (const child of at) {
            walk(child);
          }
          return;
        }
        if (!at || typeof at !== "object") {
          return;
        }
        const o = at as Record<string, unknown>;
        const frame = o.frame as
          | { x: number; y: number; width: number; height: number }
          | undefined;
        if ((o.AXLabel ?? o.label) === "Allow" && frame) {
          found.push({
            x: frame.x + frame.width / 2,
            y: frame.y + frame.height / 2,
          });
        }
        walk(o.children);
      };
      walk(nodes);
      return found[0];
    },
    (point) => point !== undefined,
    30_000
  ).catch(() => undefined);
  if (allow) {
    await mac(
      `${AXE} tap -x ${Math.round(allow.x)} -y ${Math.round(allow.y)} --udid ${udid}`
    );
  }
  const registered = await awaitLine(
    registerStart,
    /probe registered: (.*)/,
    60_000
  );
  const devices = await fleet
    .api<{ devices: { id: string; platform: string }[] }>("/api/push")
    .catch(() => ({ devices: [] }));
  check(
    "the app registers its push key with the hub",
    registered.match?.[1]?.trim() === "ok" && devices.devices.length === 1,
    `app: ${registered.match?.[1]?.trim() ?? "no registration line"} (Allow ${allow ? "tapped" : "not shown"}); hub devices: ${devices.devices.map((d) => `${d.id} ${d.platform}`).join(", ") || "none"}`
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
    const shown = (await listed()).find((n) => n.request === requestId);
    // The buttons are the extension's work: whether it ran at all decides
    // whether a wrong category is the code's failure or the simulator's.
    const extensionRan = EXTENSION_RAN.test(extension);
    check(
      "the extension runs for a simctl push",
      extensionRan,
      extensionRan
        ? (extension.match(EXTENSION_RAN)?.[0] ?? "")
        : "no `opened` / `not opened` line from NotificationService: this simulator did not hand the push to the extension"
    );
    const step = "the extension gives the push an action per option and Other…";
    const detail = shown
      ? `category ${shown.category}, actions [${shown.actions.join(" | ")}], title "${shown.title}" (sealed "${sealed.title}"); extension: ${extension.match(/question push answers inline: .*/)?.[0] ?? "no inline line"}`
      : "the push is not in the notification centre";
    if (extensionRan) {
      check(
        step,
        shown?.category.startsWith("CAWCO_QUESTION.") === true &&
          JSON.stringify(shown.actions) ===
            JSON.stringify([...THREE, "Other…"]),
        detail
      );
    } else {
      skip(step, `the extension never ran (above); ${detail}`);
    }
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
  // parts of the database the attempt push reads.
  const db = {
    push: {
      devices: deviceRows,
      noteResult: () => undefined,
      dropDevice: () => false,
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
  const attemptPush = createPush({
    db,
    task: () => Promise.resolve({ kind: "you", title: `Probe task ${tag}` }),
  });
  attemptPush.itemEnded({
    id: `probe-item-${tag}`,
    instanceId: id,
    projectId: `probe-project-${tag}`,
    taskId: `probe-task-${tag}`,
    state: "failed",
  } as WorkItemRow);
  const attempt = (await until(
    "the attempt push",
    () => captured.find((p) => p.payload.cawco.kind === "attempt"),
    (found) => found !== undefined,
    30_000
  )) as Captured;
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
    await launch(`-open-session ${id}`);
    const inFront = await until(
      "the session in front in the app",
      async () =>
        (await mac(`${AXE} describe-ui --udid ${udid}`)).includes(
          "steer-message"
        ),
      Boolean,
      120_000
    ).catch(() => false);
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
        `${pushed.length} turn pushes; the hub's seen_at ${seen?.seen_at ?? "null"} (${seen?.seen_at && seen.seen_at >= sent ? "marked after the send" : "not marked since the send"})`
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
    const origin = join(fleet.workdir, "..", "probe-origin.git");
    await Bun.$`git -C ${fleet.workdir} init -q && git -C ${fleet.workdir} -c user.name=probe -c user.email=probe@localhost commit -q --allow-empty -m seed && git init -q --bare ${origin} && git -C ${fleet.workdir} remote add origin ${origin} && git -C ${fleet.workdir} push -q origin HEAD:main`.quiet();
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
  if (udid) {
    await mac(`xcrun simctl terminate ${udid} ${BUNDLE} >/dev/null 2>&1 || true
xcrun simctl shutdown ${udid} >/dev/null 2>&1 || true
xcrun simctl delete ${udid}`).catch((error) =>
      console.log(`  simulator cleanup: ${error}`)
    );
  }
  tunnel?.kill();
  await cawrier.stop(true);
  await fleet.close();
  await fleet.clean(keep || failures > 0);
}

console.log(failures === 0 ? "ALL PASS" : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
