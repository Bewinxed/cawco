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
 *   cd ~/.cawco/workspace-cache/xdg/cawco-apple.noindex/<checkout>/apps/apple &&
 *   bash <repo>/apps/apple/scripts/mac-slot.sh build -- xcodebuild \
 *     -project CawCo.xcodeproj -scheme CawCo \
 *     -destination "platform=macOS,variant=Mac Catalyst" \
 *     -derivedDataPath ../../DerivedData-macprobe -skipPackagePluginValidation \
 *     -disableAutomaticPackageResolution \
 *     CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM= \
 *     PROVISIONING_PROFILE_SPECIFIER= CODE_SIGN_ENTITLEMENTS= build
 *
 * then signed again without the App Sandbox, which traps at launch (SIGTRAP,
 * exit 133) inside a workspace's own sandbox boundary:
 *
 *   codesign --force --sign - --entitlements <get-task-allow only> \
 *     ../../DerivedData-macprobe/Build/Products/Debug-maccatalyst/CawCo.app
 */

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Subprocess } from "bun";
import { accountsWords as words } from "../../../packages/core/src/words/accounts";
import {
  CONFIG_GROUPS,
  CONFIG_SECTIONS,
  configureWords,
} from "../../../packages/core/src/words/configure";
import { freshApp, macProbeApp } from "../../lib/apple-app";
import { type MacSim, macSim } from "../../lib/mac-sim";
import { until } from "../../scratch-fleet";
import { type Kit, ROOT, type Spec } from "../kit";
import { words as logWords, type MacApp, macApp, readLines } from "../mac-app";

const IOS_18_5 = "com.apple.CoreSimulator.SimRuntime.iOS-18-5";
/**
 * Where the app runs. `iphone-ax5` is the iPhone at the largest
 * accessibility text size (UIKit's own launch argument), where words that
 * fit at the default size are the first to be cut.
 */
const PLATFORMS: Record<string, { device?: string; launch?: string[] }> = {
  iphone: { device: "iPhone 16 Pro" },
  ipad: { device: "iPad Pro 13-inch (M4)" },
  mac: {},
  "iphone-ax5": {
    device: "iPhone 16 Pro",
    launch: [
      "-UIPreferredContentSizeCategoryName",
      "UICTContentSizeCategoryAccessibilityXXXL",
    ],
  },
};
type Platform = "iphone" | "ipad" | "mac" | "iphone-ax5";
const isPlatform = (one: string): one is Platform => one in PLATFORMS;
/** "hub accounts 2 → 3": the count before the setup's sign-in and after. */
const COUNTS = /hub accounts (\d+) → (\d+)/;
/** A figure's overlapping words, as its probe state counts them. */
const OVERLAPS = /overlaps (\d+)/g;
/** A clock's wash with no words in it, as a figure's probe state counts them. */
const EMPTY_PILLS = /empty pills (\d+)/g;
/** One part of a long message: `step [part 2/5]: |…|` (AccountsProbe `say`). */
const PART = /^(.*?) \[part (\d+)\/(\d+)\]: \|(.*)\|$/;
/** "clipped list: none": what a stage's window cuts, as the probe reads it. */
const CLIPPED = /clipped ([\w-]+): (.*)$/;
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

/**
 * The picker's rows as the hub serves them to the web and the app alike, in
 * its two groups (AccountSetup.svelte `pickGroups`: a sign-in, then a key,
 * each in the hub's order), each as the picker names it (model.svelte.ts
 * `choiceLabel`). Read once the run is over: the hub's list grows as the
 * machine reports what its harnesses serve, after the fleet is up.
 */
async function pickerRows(base: string): Promise<string[]> {
  const served = (await (
    await fetch(`${base}/api/accounts/providers`)
  ).json()) as {
    kind: string;
    name: string;
    provider: string;
    signin: string;
  }[];
  const named = (one: (typeof served)[number]) => {
    if (one.provider !== "anthropic") {
      return one.name;
    }
    return one.kind === "console" ? words.anthropicConsole : words.claude;
  };
  return [
    words.setup.pickSignin,
    ...served.filter((one) => one.signin !== "api-key").map(named),
    words.setup.pickKeys,
    ...served.filter((one) => one.signin === "api-key").map(named),
  ];
}

/** Names a long list could trip on, as the live catalogue has them. */
const ODD_NAMES = [
  "302.AI",
  "abliteration.ai",
  "AI-ROUTER",
  "AI21 Labs",
  "Fireworks",
  "Fireworks AI",
  "Zhipu 智谱",
  "Ñandú",
  'R&D "Labs"',
  "o1 / mini",
];
/** As many providers as a machine with OpenCode's whole catalogue serves (229 on models.dev, 2026-10-14), and more. */
const CATALOGUE = 240;

/**
 * The scratch machine's pi given a catalogue as long as a real machine's:
 * a key provider for each name, the odd ones among them, added to the pi
 * providers the fleet furnished (its `models.json`, which pi reads again at
 * each beat). The picker's whole list is then hundreds of rows, as on a
 * machine that runs OpenCode, which the scratch fleet does not list.
 */
async function seedCatalogue(home: string): Promise<void> {
  const file = join(home, ".pi", "agent", "models.json");
  const config = JSON.parse(await readFile(file, "utf8")) as {
    providers: Record<string, unknown>;
  };
  for (let index = 0; index < CATALOGUE; index += 1) {
    config.providers[`probe-${String(index).padStart(3, "0")}`] = {
      name:
        index < ODD_NAMES.length
          ? ODD_NAMES[index]
          : `Provider ${CATALOGUE - index}`,
      baseUrl: "http://127.0.0.1:9/v1",
      api: "openai-completions",
      apiKey: "probe-key",
      models: [
        {
          id: "m",
          name: "M",
          reasoning: false,
          input: ["text"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 1000,
          maxTokens: 100,
        },
      ],
    };
  }
  await writeFile(file, JSON.stringify(config));
}

/**
 * A scratch fleet as every run starts from (the app's on each platform, the
 * web's at each width): its Claude account signed in on the scratch machine,
 * two more Claude accounts signed in nowhere, so routing still has two to
 * choose between after the signed-in one is removed, and a catalogue as
 * long as a real machine's.
 */
async function seededFleet(kit: Kit) {
  const fleet = await kit.fleet(() => ({ words: ["Done."], everyMs: 20 }));
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  await seedCatalogue(fleet.home);
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
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
  return fleet;
}

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

  const fleet = await seededFleet(kit);
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
    ...(PLATFORMS[platform].launch ?? []),
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
        device: PLATFORMS[platform].device ?? "iPhone 16 Pro",
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
        const said = logWords(line);
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
  judge(kit, label, lines, captures, await pickerRows(fleet.base));
  console.log(`  ${platform} captures: ${out}`);
}

/** A stage of the web's walk, as the app's capture of the same stage is named. */
type Stage =
  | "list"
  | "editor"
  | "signin-link"
  | "signin-refused"
  | "remove-question"
  | "routing"
  | "routing-fill-first"
  | "setup-provider"
  | "setup-signin"
  | "setup-key"
  | "list-after";

/** The hub's accounts, by the name each goes by now. */
async function accountIds(base: string): Promise<Map<string, string>> {
  const view = (await (await fetch(`${base}/api/accounts`)).json()) as {
    accounts: { email: string | null; id: string; label: string | null }[];
  };
  return new Map(
    view.accounts.map((one) => [one.label ?? one.email ?? one.id, one.id])
  );
}

/**
 * The web's Configure › Accounts walked through the stages the app's probe
 * walks, on a fleet seeded as the app's is, at one width: each stage's page
 * goes to `.probe/config-accounts/web-<view>/<stage>.png`, beside the app's,
 * so a review compares like with like. Every control is found by the words
 * core gives it (`accountsWords`), the ones the page itself reads.
 */
async function web(kit: Kit, view: "desk" | "phone"): Promise<void> {
  const label = (what: string) => `web ${view}: ${what}`;
  const fleet = await seededFleet(kit);
  const base = await fleet.dashboard();
  const page = await kit.page(view);
  // A sign-in link opens a tab of its own: the walk stays on the dashboard.
  page.context().on("page", (opened) => {
    if (opened !== page) {
      opened.close().catch(() => undefined);
    }
  });
  const out = join(ROOT, ".probe", "config-accounts", `web-${view}`);
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  const captured: string[] = [];
  const capture = async (stage: Stage) => {
    const path = join(out, `${stage}.png`);
    await page.screenshot({ path });
    captured.push(path);
  };
  const button = (name: string) =>
    page.getByRole("button", { name, exact: true });
  /** A button that can be pressed: an editor's skeleton keeps its disabled Save while it fades. */
  const enabled = (name: string) =>
    page.getByRole("button", { name, exact: true, disabled: false });
  const editorOf = async (name: string) => {
    const id = (await accountIds(fleet.base)).get(name);
    await page.goto(`${base}/config/accounts/${id}`);
    await page.getByLabel(words.editor.nickname).waitFor();
  };
  /** Remove: the footer's on a wide page, the header's ⋯ under 640px (EditorFooter.svelte). */
  const askRemove = async (name: string) => {
    if (view === "phone") {
      await button(configureWords.more).click();
      await page.getByRole("menuitem", { name: words.editor.remove }).click();
    } else {
      await button(words.editor.remove).click();
    }
    await page.getByText(words.editor.removeTitle(name)).first().waitFor();
  };
  /** The question's own Remove (AskHere's region, named by its title), not the footer's. */
  const confirmRemove = async (name: string) => {
    const question = page.getByRole("region", {
      name: words.editor.removeTitle(name),
      exact: true,
    });
    await question
      .getByRole("button", { name: words.editor.remove, exact: true })
      .click();
    const left = await page
      .waitForURL(`${base}/config/accounts`, { timeout: 60_000 })
      .then(
        () => true,
        () => false
      );
    if (!left) {
      // The question's refusal, in the hub's words, is why it stayed.
      const said = (await question.allInnerTexts()).join(" / ");
      throw new Error(
        `Remove stayed on ${page.url()}: ${said || "the question went"}`
      );
    }
  };
  /**
   * The link the machine's login printed, or its refusal where the link
   * would stand (`problem`, the panel's or the setup row's): either is the
   * machine's answer, and the walk goes on past a refusal.
   */
  const linkOrRefusal = async (where: string, problem: string) => {
    const link = page.getByRole("link", { name: words.signin.openLink });
    await link.or(page.locator(problem)).first().waitFor({ timeout: 60_000 });
    const opened = await link.first().isVisible();
    kit.check(
      label(`${where}: the machine's login answers its sign-in link`),
      opened,
      opened ? "link" : await page.locator(problem).first().innerText()
    );
    return opened;
  };

  try {
    await page.goto(`${base}/config/accounts`);
    await page.getByText("Third").first().waitFor();
    await capture("list");

    // The second account: renamed and recoloured, then its machine's sign-in.
    await editorOf("Second");
    await capture("editor");
    await page.getByLabel(words.editor.nickname).fill("Probe second");
    await page.getByRole("radio", { name: "Violet", exact: true }).click();
    await enabled(words.editor.save).click();
    await button(configureWords.saved).waitFor({ timeout: 30_000 });
    // The row's trigger is named for what it does where ("Sign in X on obelisk").
    await page
      .getByRole("button", {
        name: words.machines.signInOn(
          words.machines.signIn,
          "Probe second",
          ""
        ),
      })
      .first()
      .click();
    await button(words.signin.openLink).click();
    if (
      await linkOrRefusal(
        "the account's row",
        '[data-slot="panel"] [data-slot="error"]'
      )
    ) {
      await capture("signin-link");
      await page.getByLabel(words.signin.codeLabel).fill("not-a-real-code");
      await button(words.signin.done).click();
      // Refused at once (the machine's login would wait on a part of a code
      // for a minute), in core's words, under the field.
      const answered = page.locator(
        '[data-slot="panel"] :is([data-slot="error"], [data-slot="warn"], [data-slot="got"])'
      );
      await answered.first().waitFor({ timeout: 30_000 });
      const refusal = (await answered.first().innerText()).trim();
      kit.check(
        label("a code that is not one is refused under the field, in words"),
        refusal === words.signin.notWhole &&
          (await page
            .locator('[data-slot="panel"] [data-slot="error"]')
            .count()) > 0,
        refusal
      );
      await capture("signin-refused");
    }
    await page.keyboard.press("Escape");

    // The signed-in account: Remove asks first.
    await editorOf("Probe");
    await askRemove("Probe");
    await capture("remove-question");
    await confirmRemove("Probe");

    // Routing: Spread for your sessions, Fill first for delegates.
    await page.goto(`${base}/config/accounts/anthropic/routing`);
    // A card in its tab's own cards: a tab's change slides the next pane in
    // while the last one leaves, so both stand for a moment.
    const card = (group: string, id: string) => {
      const strategy = words.strategies.find((one) => one.id === id);
      return page
        .getByRole("radiogroup", { name: group, exact: true })
        .getByRole("radio", {
          name: words.routingEditor.card(
            strategy?.label ?? id,
            strategy?.line ?? ""
          ),
          exact: true,
        });
    };
    const { yours, delegates } = words.routingEditor;
    await card(yours, "spread").waitFor();
    await capture("routing");
    await card(yours, "spread").click();
    await page.getByRole("tab").filter({ hasText: delegates }).click();
    await card(delegates, "fill-first").click();
    await page.getByText(words.routingEditor.order).waitFor();
    await capture("routing-fill-first");
    await enabled(words.routingEditor.save).click();
    await page.waitForURL(`${base}/config/accounts`, { timeout: 60_000 });

    // Add account: Claude's sign-in makes the account; Cancel takes it back.
    await page.goto(`${base}/config/accounts/new`);
    await button(words.claude).waitFor();
    await capture("setup-provider");
    // The web's picker, its group heads and rows' names in the page's order.
    checkPicker(
      kit,
      label,
      await page
        .locator(
          'h3[data-slot="ghead"], [data-slot="choices"] [data-slot="plabel"]'
        )
        .allTextContents(),
      await pickerRows(fleet.base)
    );
    await button(words.claude).click();
    await button(words.setup.signIn).first().click();
    await linkOrRefusal("the setup's row", '[data-slot="row-problem"]');
    await capture("setup-signin");
    await button(configureWords.cancel).click();
    await page.waitForURL(`${base}/config/accounts`, { timeout: 60_000 });

    // A key provider the scratch machine runs, its key sent.
    await page.goto(`${base}/config/accounts/new`);
    await page.getByText(words.setup.pickKeys).waitFor();
    const keys = page
      .locator("section", { hasText: words.setup.pickKeys })
      .locator(
        'ul[aria-labelledby="pick-keys"] [data-choice]:not([aria-disabled="true"])'
      );
    if ((await keys.count()) > 0) {
      await keys.first().click();
      await page
        .getByLabel(words.key.label, { exact: true })
        .fill("sk-probe-not-a-key");
      await button(words.key.send).click();
      await page
        .locator('[data-slot="keys"] :is([data-slot="ok"], [data-slot="bad"])')
        .first()
        .waitFor({ timeout: 60_000 });
      await capture("setup-key");
      await button(configureWords.cancel).click();
      await page.waitForURL(`${base}/config/accounts`, { timeout: 60_000 });
    }

    // The renamed account removed: the list without it.
    await editorOf("Probe second");
    await askRemove("Probe second");
    await confirmRemove("Probe second");
    await page.getByText("Third").first().waitFor();
    await capture("list-after");
  } catch (error) {
    kit.check(
      label("the walk ran to its end"),
      false,
      `${error instanceof Error ? error.message : String(error)} (captured: ${captured.length})`
    );
    return;
  }
  kit.check(
    label("every stage's capture was taken"),
    captured.length >= 10,
    captured.join(", ")
  );
  console.log(`  web ${view} captures: ${out}`);
}

/**
 * A run's log with each long message whole again: the probe says one over
 * unified logging's cap (just under 1 KB, cut with "<…>") in parts, as
 * `step [part i/n]: |…|` (AccountsProbe `say`), consecutive, since it says
 * them one after another on the main actor.
 */
function whole(lines: string[]): string[] {
  const out: string[] = [];
  let open: { head: string; of: number; parts: string[] } | undefined;
  for (const line of lines) {
    const part = PART.exec(line);
    if (!part) {
      out.push(line);
      continue;
    }
    const [, head = "", at = "", of = "", text = ""] = part;
    if (at === "1") {
      open = { head, of: Number(of), parts: [] };
    }
    if (!open || open.head !== head) {
      continue;
    }
    open.parts.push(text);
    if (open.parts.length === open.of) {
      out.push(`${open.head}: ${open.parts.join("")}`);
      open = undefined;
    }
  }
  return out;
}

/** The picker's rows as the app said them (`setup picker`, a JSON array), or none. */
function pickerSaid(said: string): string[] {
  try {
    const rows: unknown = JSON.parse(said);
    return Array.isArray(rows) ? rows.map(String) : [];
  } catch {
    return [];
  }
}

/**
 * The picker offers what the hub's /api/accounts/providers answers, in its
 * groups and order, row for row; the detail names where they first part
 * (the row, and each side's entry there) and each side's length.
 */
function checkPicker(
  kit: Kit,
  label: (what: string) => string,
  drawn: string[],
  hub: string[]
): void {
  const apart = firstApart(drawn, hub);
  kit.check(
    label("Add account offers every provider the hub serves, in its order"),
    hub.length > 2 && apart === -1,
    `drawn ${drawn.length} rows, hub ${hub.length}; ${
      apart === -1
        ? "row for row the same"
        : `first apart at ${apart}: drawn ${JSON.stringify(drawn[apart] ?? "(none)")}, hub ${JSON.stringify(hub[apart] ?? "(none)")}`
    }`
  );
}

/** Where two lists first part, or -1 when they hold the same rows in the same order. */
function firstApart(app: string[], hub: string[]): number {
  const length = Math.max(app.length, hub.length);
  for (let at = 0; at < length; at += 1) {
    if (app[at] !== hub[at]) {
      return at;
    }
  }
  return -1;
}

/** A run's log, read by step: what it said there, or undefined / "(not logged)". */
function reader(lines: string[]) {
  const said = (step: string) =>
    lines
      .find(
        (line) => line.includes(` ${step}: `) || line.startsWith(`${step}: `)
      )
      ?.split(`${step}: `)
      .slice(1)
      .join(`${step}: `);
  const show = (step: string) => said(step) ?? "(not logged)";
  return { said, show };
}

/**
 * The app's Configure as the web's: the list's groups and sections, the
 * badge's rule, the picker's providers, the controls the web has (the
 * nickname field, Remove, the steps, switches), the refusal under a code
 * that is not one, and rows that stand where the web's do.
 */
function judgeParity(
  kit: Kit,
  label: (what: string) => string,
  lines: string[],
  providers: string[]
): void {
  const { show } = reader(lines);
  // The refusal is the flow's problem, and the panel draws it: its words stand on the row.
  const [rowSaid, problemSaid = ""] = show("sign in code refused").split(
    " | problem: "
  );
  kit.check(
    label("a code that is not one is refused on the row, in words"),
    problemSaid.trim() === words.signin.notWhole &&
      rowSaid.includes(words.signin.notWhole) &&
      !rowSaid.includes(words.signin.checking),
    show("sign in code refused")
  );
  // Configure's list is the web's: every group, each with its sections in order.
  const nav = show("configure nav");
  const groupsDrawn = CONFIG_GROUPS.map((group) => {
    const labels = CONFIG_SECTIONS.filter(
      (section) => section.group === group
    ).map((section) => section.label);
    return nav.includes(`${group}: ${labels.join(", ")}`);
  });
  kit.check(
    label("Configure lists every group with its sections, in the web's order"),
    groupsDrawn.every(Boolean),
    nav
  );
  // The rail's badge follows the web's rule from the same data: of three
  // accounts, the two signed in nowhere.
  kit.check(
    label("Accounts' row counts three and flags the two signed in nowhere"),
    show("list row") === "count 3 badge 2",
    show("list row")
  );
  checkPicker(kit, label, pickerSaid(show("setup picker")), providers);
  kit.check(
    label("the editor's header holds the nickname in a field you type in"),
    show("editor").includes("field 'Second'"),
    show("editor")
  );
  kit.check(
    label(
      "a group's rows stand one under another, each as tall as its words, groups space6 apart"
    ),
    show("list gaps") === "none" && show("list after gaps") === "none",
    `${show("list gaps")} || ${show("list after gaps")}`
  );
  kit.check(
    label("the account's editor offers Remove account"),
    show("editor remove").includes(words.editor.remove),
    show("editor remove")
  );
  kit.check(
    label("the setup's rail names every step"),
    [
      words.setup.steps.provider,
      words.setup.steps.signIn,
      words.setup.steps.nameIt,
    ].every((step) => show("setup steps").includes(step)),
    show("setup steps")
  );
  kit.check(
    label("on/off settings are switches, as on the web"),
    show("switches") !== "(not logged)" &&
      !show("switches").includes("checkbox") &&
      show("switches").includes("sliding"),
    show("switches")
  );
}

/** What one platform's run said, checked step by step against the hub's word. */
function judge(
  kit: Kit,
  label: (what: string) => string,
  logged: string[],
  captures: string[],
  providers: string[]
): void {
  const lines = whole(logged);
  const { said, show } = reader(lines);
  judgeParity(kit, label, lines, providers);

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
  const pills = [...show("routing dirty").matchAll(EMPTY_PILLS)].map((m) =>
    Number(m[1])
  );
  kit.check(
    label("no clock's wash stands empty"),
    pills.length === 5 && pills.every((n) => n === 0),
    show("routing dirty")
  );
  // Every stage's window as the probe measured it: no words cut without an
  // ellipsis, none taller than their box, nothing past the safe edge.
  const cut = lines
    .map((line) => CLIPPED.exec(line))
    .filter((match): match is RegExpExecArray => match !== null);
  kit.check(
    label("no stage cuts a word or runs past the window's edge"),
    cut.length >= 10 && cut.every((match) => match[2] === "none"),
    cut
      .filter((match) => match[2] !== "none")
      .map((match) => `${match[1]}: ${match[2]}`)
      .join(" || ") || `${cut.length} stages measured`
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

const WEB_VIEWS = { "web-desk": "desk", "web-phone": "phone" } as const;
type WebRun = keyof typeof WEB_VIEWS;

const spec: Spec = {
  name: "ios-accounts",
  async run(kit) {
    const args = process.argv.slice(3);
    const named = args.filter(isPlatform);
    const webs = args.filter((one): one is WebRun => one in WEB_VIEWS);
    const everything = named.length === 0 && webs.length === 0;
    // One platform at a time, never two runs at once: each reads its app's log.
    for (const platform of everything
      ? (Object.keys(PLATFORMS) as Platform[])
      : named) {
      // biome-ignore lint/performance/noAwaitInLoops: one simulator slot and one fleet at a time
      await probe(kit, platform);
    }
    for (const run of everything
      ? (Object.keys(WEB_VIEWS) as WebRun[])
      : webs) {
      // biome-ignore lint/performance/noAwaitInLoops: one fleet at a time
      await web(kit, WEB_VIEWS[run]);
    }
  },
};
export default spec;
