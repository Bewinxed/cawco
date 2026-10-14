/**
 * Apple: Configure › Accounts is the app's own, at parity with the web's
 * /config/accounts, and a machine's "Sign in an account…" opens it, not the
 * web. The app's AccountsProbe (DEBUG, `-accounts-probe`) drives each flow
 * through the function its control runs and logs what the views draw beside
 * the hub's word; this spec stands up the hub, launches the app on it and
 * reads that log.
 *
 * Once per platform, each on a scratch fleet of its own (real hub, agent and
 * sessiond on loopback, CAWCO_NO_MDNS): its Claude account signed in on the
 * scratch machine, and two more Claude accounts signed in nowhere. Then:
 *
 * 1. The machine menu's "Sign in an account…" opens the Accounts section, with
 *    no web page over the app.
 * 2. The list: the Claude group, its accounts, Routing.
 * 3. An account renamed and recoloured: Save, and the hub holds it.
 * 4. Sign in on its machine row: the link, then a code that is not one, which
 *    the row answers in the hub's words; sign out where it isn't signed in,
 *    refused on the row.
 * 5. Remove the signed-in account: the question, then the hub's answer.
 * 6. Routing: Spread for your sessions, Fill first in a new order for
 *    delegates, a 20-minute wait: the hub holds each.
 * 7. Add account: Claude's sign-in makes the account; Cancel takes it back.
 * 8. A key provider: the key goes to the machine, its answer on its row.
 * 9. An account removed: the list without it.
 * 10. Nobody signed in on the machine now: its menu offers "Sign in an
 *     account…", and that opens the section.
 *
 * Runs on an iPhone and an iPad simulator on iOS 18.5 (each in a mac-slot.sh
 * slot, deleted at the end) and the Mac Catalyst build. Each stage's window
 * goes to `.probe/config-accounts/<platform>/<stage>.png` (the app PUTs it to
 * a loopback server here: the Mac app's sandbox writes only its container),
 * for a separate screenshot review.
 *
 *   bash apps/apple/scripts/build-both.sh ios
 *   bun scripts/probe-kit/run.ts ios-accounts [iphone|ipad|mac …]
 *
 * MAC_PROBE_BUILD: the Mac run's app. build-both.sh's Catalyst build signs
 * with keys a CawCo workspace never holds, so the probe builds its own,
 * signed ad hoc and without the entitlements a profile grants (push, the
 * shared keychain group), into its own DerivedData, from the tree
 * build-both.sh last synced (the spec runs it only when that sync's stamp
 * is this tree's and it was built after it, scripts/lib/apple-app.ts
 * `macProbeApp`):
 *
 *   cd ~/.cawco/workspace-cache/xdg/cawco-apple/<checkout>/apps/apple &&
 *   bash <repo>/apps/apple/scripts/mac-slot.sh build -- xcodebuild \
 *     -project CawCo.xcodeproj -scheme CawCo \
 *     -destination "platform=macOS,variant=Mac Catalyst" \
 *     -derivedDataPath ../../DerivedData-macprobe -skipPackagePluginValidation \
 *     CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM= \
 *     PROVISIONING_PROFILE_SPECIFIER= CODE_SIGN_ENTITLEMENTS= build
 *
 * then signed again without the App Sandbox, which traps at launch (SIGTRAP,
 * exit 133) inside a workspace's own sandbox boundary:
 *
 *   codesign --force --sign - --entitlements <get-task-allow only> \
 *     ../../DerivedData-macprobe/Build/Products/Debug-maccatalyst/CawCo.app
 */

import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Subprocess } from "bun";
import { freshApp, macProbeApp } from "../../lib/apple-app";
import { type MacSim, macSim } from "../../lib/mac-sim";
import { until } from "../../scratch-fleet";
import { type Kit, ROOT, type Spec } from "../kit";
import { type MacApp, macApp, readLines, words } from "../mac-app";

const IOS_18_5 = "com.apple.CoreSimulator.SimRuntime.iOS-18-5";
const PLATFORMS = {
  iphone: { device: "iPhone 16 Pro" },
  ipad: { device: "iPad Pro 13-inch (M4)" },
  mac: {},
} as const;
type Platform = keyof typeof PLATFORMS;
/** "hub accounts 2 → 3": the count before the setup's sign-in and after. */
const COUNTS = /hub accounts (\d+) → (\d+)/;
/** The Delegates tab with Fill first chosen: its figure plays, the others stand still. */
/** A figure's overlapping words, as its probe state counts them. */
const OVERLAPS = /overlaps (\d+)/g;
const FIGURES = [
  /pinned \d lanes still/,
  /fill \d lanes playing/,
  /spread \d lanes still/,
];
const PROBE_LOG =
  'subsystem == "dev.cawco.app" AND category == "AccountsProbe"';
/** The whole probe's time on one platform, at most. */
const RUN_MS = 8 * 60_000;

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

/**
 * The app to run, only when built from this tree: build-both.sh's
 * simulator build; on the Mac the probe's own Catalyst build
 * (MAC_PROBE_BUILD above), signed ad hoc, since the signed Catalyst build
 * needs keys a workspace never holds.
 */
const appPath = (platform: Platform) =>
  platform === "mac" ? macProbeApp(ROOT) : freshApp(ROOT);

async function probe(kit: Kit, platform: Platform): Promise<void> {
  const label = (what: string) => `${platform}: ${what}`;
  const { path: app, problem } = appPath(platform);
  if (
    !kit.check(
      label("the app is built from this tree"),
      !problem,
      problem ?? app
    )
  ) {
    return;
  }

  const fleet = await kit.fleet(() => ({ words: ["Done."], everyMs: 20 }));
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  // Two Claude accounts signed in nowhere, so routing still has two to
  // choose between after the signed-in one is removed.
  for (const [name, hue] of [
    ["Second", "green"],
    ["Third", "rose"],
  ] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: each goes last in the order
    const made = await fleet.api<{ id: string }>("/api/accounts", {
      provider: "anthropic",
      kind: "subscription",
      hue,
    });
    await fetch(`${fleet.base}/api/accounts/${made.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: name }),
    });
  }

  const out = join(ROOT, ".probe", "config-accounts", platform);
  // This run's captures only: an earlier run's never stand in for one that didn't arrive.
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  const captures: string[] = [];
  const shots = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const name = new URL(request.url).pathname.slice(1);
      if (request.method !== "PUT" || !name.endsWith(".png")) {
        return new Response(null, { status: 404 });
      }
      await writeFile(
        join(out, name),
        new Uint8Array(await request.arrayBuffer())
      );
      captures.push(join(out, name));
      return new Response(null, { status: 201 });
    },
  });
  const args = [
    "-paywall-env",
    "sandbox",
    "-cawco-hub-url",
    fleet.base,
    "-accounts-probe",
    "-accounts-probe-capture",
    `http://127.0.0.1:${shots.port}/`,
  ];

  let lines: string[] = [];
  let sim: MacSim | undefined;
  let stream: Subprocess<"ignore", "pipe", "ignore"> | undefined;
  let mac: MacApp | undefined;
  try {
    if (platform === "mac") {
      // The host's log carries the simulators' apps too: the kit reads this app's own.
      mac = await macApp(app, args, PROBE_LOG);
      ({ lines } = mac);
      console.log(`  mac app pid ${mac.pid}`);
    } else {
      sim = await macSim({
        runtime: IOS_18_5,
        device: PLATFORMS[platform].device,
      });
      const { udid } = sim;
      console.log(`  ${platform} simulator ${udid}`);
      // Booted is not ready: SpringBoard refuses a launch until boot finishes.
      await sh(`xcrun simctl bootstatus ${udid} -b >/dev/null`);
      await sh(`xcrun simctl install ${udid} "${app}"`);
      stream = Bun.spawn(
        [
          "xcrun",
          "simctl",
          "spawn",
          udid,
          "log",
          "stream",
          "--level",
          "debug",
          "--style",
          "compact",
          "--predicate",
          PROBE_LOG,
        ],
        { stdin: "ignore", stdout: "pipe", stderr: "ignore" }
      );
      // That simulator's own log: no other app's lines reach it.
      const into = lines;
      readLines(stream, (line) => {
        const said = words(line);
        if (said !== undefined) {
          into.push(said);
        }
      });
      await Bun.sleep(1500);
      await until(
        label("the app launched"),
        () =>
          sh(
            `xcrun simctl launch --terminate-running-process ${udid} dev.cawco.app ${args.join(" ")} >/dev/null`
          ).then(() => true),
        Boolean,
        60_000
      );
    }
    await until(
      label("the probe finished"),
      () =>
        lines.find(
          (line) =>
            line.includes("accounts probe: done") ||
            line.includes("start: the hub's accounts were never read") ||
            line.includes("no Accounts section on screen")
        ),
      Boolean,
      RUN_MS
    ).catch(() => undefined);
  } finally {
    await mac?.stop();
    stream?.kill();
    await sim?.release();
    shots.stop(true);
  }

  await writeFile(join(kit.out, `${platform}.log`), `${lines.join("\n")}\n`);
  judge(kit, label, lines, captures);
  console.log(`  ${platform} captures: ${out}`);
}

/** What one platform's run said, checked step by step against the hub's word. */
function judge(
  kit: Kit,
  label: (what: string) => string,
  lines: string[],
  captures: string[]
): void {
  const said = (step: string) =>
    lines
      .find(
        (line) => line.includes(` ${step}: `) || line.startsWith(`${step}: `)
      )
      ?.split(`${step}: `)
      .slice(1)
      .join(`${step}: `);
  const show = (step: string) => said(step) ?? "(not logged)";

  kit.check(
    label("the probe ran to its end"),
    lines.some((line) => line.includes("accounts probe: done")),
    lines.at(-1)
  );
  kit.check(
    label(
      "the machine menu's item opens the native Accounts section, no web page"
    ),
    lines.some((line) =>
      line.includes(
        "machine menu: opened the Accounts section natively; web pages over the app: 0"
      )
    ),
    lines.filter((line) => line.includes("machine menu")).join(" | ")
  );
  kit.check(
    label(
      'a machine nobody is signed in on offers "Sign in an account…", which opens the section'
    ),
    show("machine menu signed out").includes(
      "Sign in an account… — Nobody is signed in on"
    ) &&
      show("machine menu signed out opened") ===
        "the Accounts section, natively",
    `${show("machine menu signed out")} || ${show("machine menu signed out opened")}`
  );
  kit.check(
    label("the list shows the Claude group, its three accounts and Routing"),
    ["Claude", "Probe", "Second", "Third", "[Routing]"].every((word) =>
      show("list").includes(word)
    ),
    show("list")
  );
  kit.check(
    label("Save answers in place and the hub holds the new name and colour"),
    show("editor saved").includes("hub: label Probe second hue violet"),
    show("editor saved")
  );
  kit.check(
    label(
      "Sign in on the machine's row asks the hub, and its answer stands on the row"
    ),
    said("sign in link") !== undefined &&
      !show("sign in link").includes("Opening"),
    show("sign in link")
  );
  kit.check(
    label("a code that is not one is refused on the row, in words"),
    said("sign in code refused") === undefined
      ? show("sign in link").includes("panel:")
      : show("sign in code refused").includes("panel:") &&
          !show("sign in code refused").includes("Checking"),
    `${show("sign in link")} || ${show("sign in code refused")}`
  );
  kit.check(
    label("Sign out runs on its row, then the hub's answer stands there"),
    show("sign out running").includes("Signing out…") &&
      !show("sign out answered").includes("Signing out") &&
      (show("sign out answered").includes("refused: ") ||
        show("sign out answered").endsWith("hub: signed-out")),
    `${show("sign out running")} || ${show("sign out answered")}`
  );
  kit.check(
    label("Remove asks first, naming what it reaches"),
    show("remove asks").includes("question: 'Remove Probe?'") &&
      show("remove asks").includes("confirm 'Remove account'") &&
      show("remove asks").includes("is signed in to it"),
    show("remove asks")
  );
  kit.check(
    label("Remove's answer lands where it was asked"),
    show("remove answered").includes(
      "editor closed | hub still has it: false"
    ) ||
      (show("remove answered").includes("refused '") &&
        show("remove answered").includes("hub still has it: true")),
    show("remove answered")
  );
  // The chosen card's figure plays, the others hold their last frame; the
  // at-limit figure plays under its numbers. Under reduced motion all stand still.
  kit.check(
    label(
      "each strategy card holds its figure; the chosen one plays, the at-limit one plays"
    ),
    FIGURES.every((one) => one.test(show("routing dirty"))) &&
      show("routing dirty").includes("limit figure limit 2 lanes playing"),
    show("routing dirty")
  );
  // Each figure's words, as laid out: a clock, a name, a blocked word or a
  // caption standing on another is the overprinting this reads (geometry, not ink).
  const overlaps = [...show("routing dirty").matchAll(OVERLAPS)].map((m) =>
    Number(m[1])
  );
  kit.check(
    label("no figure's words stand on each other"),
    overlaps.length === 5 && overlaps.every((n) => n === 0),
    show("routing dirty")
  );
  kit.check(
    label(
      "Save routing: the hub holds Spread, Fill first, a 20-minute wait and the new order"
    ),
    show("routing saved").includes("[Saved") &&
      show("routing saved").includes(
        'hub: yours spread delegates fill-first wait 20 order ["Third"'
      ),
    show("routing saved")
  );
  const counts = COUNTS.exec(show("setup signing in"));
  const before = Number(counts?.[1] ?? Number.NaN);
  kit.check(
    label("Add account: the first sign-in makes the account"),
    !show("setup signing in").startsWith("created nothing") &&
      Number(counts?.[2]) === before + 1,
    show("setup signing in")
  );
  kit.check(
    label("Cancel takes back the account no machine signed in"),
    show("setup cancelled") === `closed | hub accounts ${before}`,
    show("setup cancelled")
  );
  kit.check(
    label("a key goes to the machine and its answer stands on its row"),
    said("key sent") !== undefined && !show("key sent").includes("Sending"),
    `${show("key step")} || ${show("key sent")}`
  );
  kit.check(
    label("an account removed leaves the list"),
    show("remove second answered").includes("editor closed") &&
      !show("remove second answered")
        .split("list: ")[1]
        ?.includes("Probe second"),
    show("remove second answered")
  );
  kit.check(
    label("every stage's capture arrived"),
    captures.length >= 10,
    captures.join(", ")
  );
}

const spec: Spec = {
  name: "ios-accounts",
  async run(kit) {
    const named = process.argv
      .slice(3)
      .filter((one): one is Platform => one in PLATFORMS);
    // One platform at a time, never two runs at once: each reads its app's log.
    for (const platform of named.length > 0
      ? named
      : (Object.keys(PLATFORMS) as Platform[])) {
      // biome-ignore lint/performance/noAwaitInLoops: one simulator slot and one fleet at a time
      await probe(kit, platform);
    }
  },
};
export default spec;
