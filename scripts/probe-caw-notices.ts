#!/usr/bin/env bun
/**
 * Caw's panel notices probe: the production dashboard build, served by its
 * own server (serve.js, socket-activated as its units run it), against a
 * scratch fleet that holds one parked ask, an update that landed, and five
 * logins moved into CawCo, two of them still to sign in on a machine.
 *
 *   bun scripts/probe-caw-notices.ts [--keep]
 *
 * Build the dashboard first (`bun run build` in apps/dashboard). It:
 *
 *  1. stands up a scratch fleet (scratch-fleet.ts) whose machine is a binary
 *     install that landed a nightly with release notes (its update state,
 *     which its agent reports; the install's hub address answers nothing, so
 *     it never fetches or applies a build, and its keeper is left alone),
 *     and a second scratch machine beside it;
 *  2. files five Claude accounts, each signed in on the first machine from
 *     its own credentials and three of them on the second, so the other two
 *     lack a sign-in on an online machine that could use them;
 *  3. with the update the only notice: opens Caw's panel and reads that its
 *     notes stand open by default;
 *  4. parks a Bash permission ask and files the five sign-ins on the first
 *     machine as moved in from its own stores;
 *  5. at 1440×900 and at 390×844 with touch, light and dark: reads one
 *     trailing x, one lead column and one text column for every row, and that
 *     the list fits; opens the notes, scrolls to their middle, and reads that
 *     Hide changes stands inside the list and folds them; saves captures;
 *  6. dismisses one moved login and reads the hub's notices record: only its
 *     id was added; then Clear all, and reads that every notice's id was.
 *
 * Prints `PASS <step>` / `FAIL <step>`, saves the captures to $TMPDIR (or a
 * folder it names), and exits 0 only if every check passed. It stops only
 * what it started, by PID.
 */
import { existsSync } from "node:fs";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { type Browser, chromium, type Page } from "playwright-core";
import {
  ACCOUNT,
  MACHINE,
  type Seen,
  scratchFleet,
  until,
} from "./scratch-fleet";

const keep = process.argv.includes("--keep");
const root = resolve(import.meta.dir, "..");
const out =
  process.env.TMPDIR ?? join(root, ".probe", `caw-notices-${Date.now()}`);
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

/** The second scratch machine's id. */
const SECOND = "scratch-second";
/** The build that landed on the first machine, and its notes. */
const LANDED_VERSION = "0.2.0-nightly.2522+e3cbba1d";
const NOTES = [
  "### New",
  "",
  "- Caw's panel says what each notice is and what to do about it",
  "- Clear all in the Notices head",
  "- Moved logins name their provider and how many machines lack them",
  "- The update's notes fold in its row, open when it stands alone",
  "- Every row of the panel ends on one trailing edge",
  "",
  "### Improved",
  "",
  "- Deny and Approve stand together, tinted by what they do",
  "- An ask leads with its project, and its machine by its mark",
  "- The panel's sections part with a vermillion hairline",
  "- A notice's ✕ is always shown",
  "",
  "### Fixed",
  "",
  '- "Sign in there" pointed at the wrong machine',
  "- Notices hid under the panel's foot",
  "- Hide changes needed a scroll back down",
].join("\n");
/** The runtime version a source checkout reports (core runtime). */
const SOURCE_VERSION = "0.0.0-dev";

/** The five accounts: id, email, hue, the store each moved from, and whether the second machine has it. */
const LOGINS = [
  {
    id: "acct-design",
    email: "design@petralab.test",
    hue: "orange",
    from: "claude",
    second: true,
  },
  {
    id: "acct-ops",
    email: "ops@petralab.test",
    hue: "cyan",
    from: "opencode",
    second: false,
  },
  {
    id: "acct-marketing",
    email: "marketing@petralab.test",
    hue: "green",
    from: "pi",
    second: true,
  },
  {
    id: "acct-studio",
    email: "studio@petralab.test",
    hue: "amber",
    from: "claude",
    second: false,
  },
  {
    id: "acct-rand",
    email: "rand@petralab.test",
    hue: "blue",
    from: "claude",
    second: true,
  },
] as const;

const ASK = "notices-probe-ask";
const respond = (request: Seen) =>
  request.tools && request.last.includes(ASK)
    ? {
        everyMs: 5,
        words: [],
        tool: {
          name: "Bash",
          input: { command: `touch ${ASK}.txt`, description: "Make a file" },
        },
      }
    : { everyMs: 10, words: ["Done."] };
const fleet = await scratchFleet({ name: "probe-caw-notices", respond });

/** A Claude account's own dir under `home`, signed in with a fake login as `email`. */
async function claudeAccount(home: string, id: string, email: string) {
  const dir = join(home, ".cawco", "accounts", id, "claude");
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, ".credentials.json"),
    JSON.stringify({
      claudeAiOauth: {
        accessToken: `sk-ant-oat01-fake-${id}`,
        refreshToken: `sk-ant-ort01-fake-${id}`,
        expiresAt: Date.now() + 365 * 24 * 60 * 60_000,
        scopes: ["user:inference", "user:profile"],
        subscriptionType: "max",
      },
    })
  );
  await writeFile(
    join(dir, ".claude.json"),
    JSON.stringify({
      hasCompletedOnboarding: true,
      oauthAccount: {
        emailAddress: email,
        organizationName: "Petra Lab",
        accountUuid: crypto.randomUUID(),
        organizationUuid: "00000000-0000-4000-8000-0000000000aa",
      },
    })
  );
}

const procs: ReturnType<typeof Bun.spawn>[] = [];
let browser: Browser | undefined;
/** The second machine's runtime dir, beside the sandbox as the first's is. */
let runtime2: string | undefined;

/** The hub's record of acknowledged notice ids. */
const seenIds = async (): Promise<string[]> =>
  JSON.parse(
    await readFile(
      join(fleet.sandbox, "hub", "notices-seen.json"),
      "utf8"
    ).catch(() => "[]")
  ) as string[];

/** Opens Caw's panel on a fresh page and waits for it to stand open. */
async function openPanel(page: Page, base: string): Promise<void> {
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-needs-caw]", { timeout: 60_000 });
  // The fleet is read once the board's snapshot is in: the notices count rides his label.
  await page.waitForFunction(
    () =>
      document
        .querySelector("[data-needs-caw]")
        ?.getAttribute("aria-label")
        ?.includes("notice") === true,
    undefined,
    { timeout: 60_000 }
  );
  await page.click("[data-needs-caw]");
  await page.waitForSelector(".caw-pop[data-shown] .list", { timeout: 30_000 });
  await page.waitForTimeout(900);
}

/** The panel's grid and fit, read from the rendered rows. */
const readGrid = (page: Page) =>
  page.evaluate(() => {
    const pop = document.querySelector(".caw-pop") as HTMLElement;
    const shown = (e: Element) => {
      const box = e.getBoundingClientRect();
      return box.height > 0 && !e.closest("[inert]");
    };
    const all = (s: string) => [...pop.querySelectorAll(s)].filter(shown);
    const r = (e: Element) => e.getBoundingClientRect();
    const x = (n: number) => Math.round(n * 100) / 100;
    const trailing = [
      ...all(".row .wait").map((e, i) => [`ask ${i + 1} time`, r(e).right]),
      ...all(".peers .approve").map((e) => ["Approve", r(e).right]),
      ...all(".head .clear").map((e) => ["Clear all", r(e).right]),
      ...all(".notice .x").map((e) => [
        `✕ ${e.getAttribute("aria-label")}`,
        r(e).right,
      ]),
      ...all(".actions > button:last-child").map((e) => [
        `update ${e.textContent?.trim()}`,
        r(e).right,
      ]),
      ...all(".todo").map((e) => [`link ${e.textContent?.trim()}`, r(e).right]),
      ...all(".more button").map((e) => ["fold toggle", r(e).right]),
    ].map(([what, at]) => [what as string, x(at as number)] as const);
    const rows = [
      ...all(".section > .head").map((h) => ({
        row: `head ${h.querySelector(".title")?.textContent}`,
        lead: x(r(h.querySelector(".glyph") as Element).left),
        text: x(r(h.querySelector(".title") as Element).left),
      })),
      ...all(".row").map((row) => ({
        row: `ask ${row.querySelector(".name")?.textContent}`,
        lead: x(r(row.querySelector(".lead") as Element).left),
        text: x(r(row.querySelector(".name") as Element).left),
      })),
      ...all(".notice").map((n) => ({
        row: `notice ${n.getAttribute("aria-label")}`,
        lead: x(r(n.querySelector(".lead") as Element).left),
        text: x(r(n.querySelector(".body") as Element).left),
      })),
    ];
    const list = pop.querySelector(".list") as HTMLElement;
    const xs = trailing.map(([, at]) => at);
    const deny = pop.querySelector(".peers .deny");
    const approve = pop.querySelector(".peers .approve");
    return {
      trailing,
      spread: x(Math.max(...xs) - Math.min(...xs)),
      leads: [...new Set(rows.map((row) => row.lead))],
      texts: [...new Set(rows.map((row) => row.text))],
      rows,
      fit: { scrollHeight: list.scrollHeight, clientHeight: list.clientHeight },
      peers:
        deny && approve
          ? {
              gap: x(r(approve).left - r(deny).right),
              denyBg: getComputedStyle(deny).backgroundColor,
              approveBg: getComputedStyle(approve).backgroundColor,
            }
          : null,
      separator: getComputedStyle(
        pop.querySelector(".section + .section") ?? pop
      ).borderTopColor,
      ask: [...pop.querySelectorAll(".where")].map((w) =>
        (w as HTMLElement).innerText.replace(/\s+/g, " ").trim()
      ),
    };
  });

try {
  // ── 1. The fleet, the landed update, the second machine ───────────────
  const binary = join(fleet.home, ".local", "share", "cawco", "binary");
  await mkdir(binary, { recursive: true });
  // A binary install whose hub answers nothing: the updater reports this
  // state and does nothing else. Its keeper failed this build before, so it
  // never hands the scratch keeper over.
  await writeFile(
    join(binary, "installation.json"),
    JSON.stringify({
      hubUrl: "http://127.0.0.1:9",
      installedVersion: SOURCE_VERSION,
      role: "agent",
      root: binary,
    })
  );
  const landedAt = Date.now() - 60_000;
  await writeFile(
    join(binary, "update-state.json"),
    JSON.stringify({
      channel: "nightly",
      installedVersion: SOURCE_VERSION,
      hostsHub: false,
      phase: "installed",
      updatedAt: landedAt,
      keeperFailedVersion: SOURCE_VERSION,
      sessiondVersion: SOURCE_VERSION,
      landed: {
        at: landedAt,
        outcome: "installed",
        version: LANDED_VERSION,
        notes: NOTES,
      },
    })
  );
  for (const login of LOGINS) {
    // biome-ignore lint/performance/noAwaitInLoops: five small files
    await claudeAccount(fleet.home, login.id, login.email);
  }

  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  for (const [order, one] of LOGINS.entries()) {
    fleet.write(
      "INSERT OR IGNORE INTO accounts (id, provider, kind, label, hue, \"order\", never_backup, created_at) VALUES (?, 'anthropic', 'console', NULL, ?, ?, 0, ?)",
      one.id,
      one.hue,
      order + 1,
      Date.now()
    );
  }
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  await until(
    "the five accounts signed in on the first machine",
    () =>
      fleet.query<{ n: number }>(
        "SELECT count(*) AS n FROM account_signins WHERE machine_id = ? AND state = 'signed-in' AND account_id LIKE 'acct-%' AND account_id != ?",
        MACHINE,
        ACCOUNT
      )[0]?.n,
    (n) => n === LOGINS.length,
    240_000
  );

  // The second machine: its own home, keeper and agent, with three of the accounts.
  const home2 = join(fleet.sandbox, "home2");
  await mkdir(join(home2, ".config", "cawco"), { recursive: true });
  await writeFile(
    join(home2, ".config", "cawco", "config.json"),
    JSON.stringify({ hubUrl: fleet.base })
  );
  for (const login of LOGINS.filter((one) => one.second)) {
    // biome-ignore lint/performance/noAwaitInLoops: three small files
    await claudeAccount(home2, login.id, login.email);
  }
  runtime2 = await mkdtemp(
    join(
      process.env.XDG_CACHE_HOME ?? join(process.env.HOME ?? "/tmp", ".cache"),
      "sf2-"
    )
  );
  await chmod(runtime2, 0o700);
  // Its own MCP gateway port: the first machine's agent holds the fleet's.
  const lease = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response(null),
  });
  const mcpPort2 = String(lease.port);
  await lease.stop(true);
  const env2 = {
    ...fleet.env,
    HOME: home2,
    XDG_CONFIG_HOME: join(home2, ".config"),
    XDG_DATA_HOME: join(home2, ".local", "share"),
    XDG_CACHE_HOME: join(home2, ".cache"),
    XDG_STATE_HOME: join(home2, ".local", "state"),
    XDG_RUNTIME_DIR: runtime2,
    CAWCO_MACHINE_ID: SECOND,
    CAWCO_MCP_PORT: mcpPort2,
    CAWCO_SESSIOND_ENDPOINT: join(fleet.sandbox, "sessiond2.sock"),
  };
  for (const [role, entry] of [
    ["sessiond2", "packages/sessiond/src/main.ts"],
    ["agent2", "packages/agent/src/cli.ts"],
  ] as const) {
    const child = Bun.spawn([process.execPath, entry], {
      cwd: root,
      env: env2,
      stdout: Bun.file(join(fleet.sandbox, `${role}.log`)),
      stderr: Bun.file(join(fleet.sandbox, `${role}.err`)),
    });
    procs.push(child);
    console.log(`… ${role} started, pid ${child.pid}`);
    if (role === "sessiond2") {
      // biome-ignore lint/performance/noAwaitInLoops: the keeper first, then its agent
      await until(
        "the second keeper listening",
        () => existsSync(env2.CAWCO_SESSIOND_ENDPOINT),
        Boolean,
        30_000
      );
    }
  }
  await until(
    "three accounts signed in on the second machine",
    () =>
      fleet.query<{ n: number }>(
        "SELECT count(*) AS n FROM account_signins WHERE machine_id = ? AND state = 'signed-in' AND account_id LIKE 'acct-%' AND account_id != ?",
        SECOND,
        ACCOUNT
      )[0]?.n,
    (n) => n === LOGINS.filter((one) => one.second).length,
    240_000
  );
  const agents =
    await fleet.api<{ machineId: string; status: string }[]>("/api/agents");
  check(
    "two machines online",
    [MACHINE, SECOND].every((id) =>
      agents.some((row) => row.machineId === id && row.status === "online")
    ),
    agents.map((row) => `${row.machineId} ${row.status}`).join(", ")
  );

  // ── The production dashboard, served as its unit serves it ────────────
  const port = Number(new URL(fleet.base).port) + 7;
  const base = `http://127.0.0.1:${port}`;
  const dashboard = Bun.spawn(
    [
      "systemd-socket-activate",
      "-l",
      `127.0.0.1:${port}`,
      // The name the unit's socket gives it (service.ts `FileDescriptorName`), which serve.js collects.
      "--fdname=dashboard",
      "-E",
      `CAWCO_HUB_URL=${fleet.base}`,
      "-E",
      `CAWCO_PREVIEW_PORT=${fleet.env.CAWCO_PREVIEW_PORT}`,
      "node",
      "serve.js",
    ],
    {
      cwd: join(root, "apps", "dashboard"),
      env: { ...process.env, CAWCO_HUB_URL: fleet.base },
      stdout: Bun.file(join(fleet.sandbox, "dashboard.log")),
      stderr: Bun.file(join(fleet.sandbox, "dashboard.err")),
    }
  );
  procs.push(dashboard);
  console.log(
    `… dashboard (production build) on ${base}, pid ${dashboard.pid}`
  );
  await until(
    "the dashboard answering",
    () => fetch(base).then((r) => r.ok),
    Boolean,
    60_000
  );

  browser = await chromium.launch();
  const desk = { viewport: { width: 1440, height: 900 } };
  const phone = {
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  };

  // ── 3. The update alone: its notes stand open ─────────────────────────
  for (const [width, shape] of [
    ["1440", desk],
    ["390", phone],
  ] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one width at a time, each its own page
    const context = await browser.newContext(shape);
    const page = await context.newPage();
    await openPanel(page, base);
    const alone = await page.evaluate(() => {
      const fold = document.querySelector("#update-notes");
      const toggle = document.querySelector(".actions .toggle");
      return {
        notices: document.querySelectorAll(".caw-pop .notices > li").length,
        asks: document.querySelectorAll(".caw-pop .row").length,
        open: fold?.hasAttribute("data-open") ?? false,
        height: Math.round(fold?.getBoundingClientRect().height ?? 0),
        toggle: toggle?.textContent?.trim(),
      };
    });
    check(
      `open by default when alone (${width})`,
      alone.notices === 1 && alone.asks === 0 && alone.open && alone.height > 0,
      JSON.stringify(alone)
    );
    await page.screenshot({
      path: join(out, `caw-notices-alone-${width}.png`),
    });
    await context.close();
  }

  // ── 4. The ask and the moved logins ───────────────────────────────────
  const askSession = await fleet.spawn(
    "claude",
    "Fix tray chip overflow",
    fleet.workdir,
    {
      permissionMode: "default",
    }
  );
  await fleet.send(askSession, `${ASK}: make a file.`);
  await until(
    "the hub parking the Bash permission ask",
    async () => JSON.stringify(await fleet.api<unknown>("/api/pending")),
    (text) => text.includes(askSession),
    180_000
  );
  for (const [at, one] of LOGINS.entries()) {
    fleet.write(
      "UPDATE account_signins SET moved_at = ?, moved_from = ? WHERE account_id = ? AND machine_id = ?",
      Date.now() - at * 60_000,
      one.from,
      one.id,
      MACHINE
    );
  }
  // The hub's accounts signal reaches the dashboards with the next change it makes.
  const accounts = await fleet.api<{
    signins: { accountId: string; machineId: string; movedAt: number | null }[];
  }>("/api/accounts");
  const movedIds = accounts.signins
    .filter((one) => one.movedAt !== null && one.machineId === MACHINE)
    .map(
      (one) => `moved-login:${one.accountId}:${one.machineId}:${one.movedAt}`
    );
  check(
    "hub serves five moved logins",
    movedIds.length === 5,
    movedIds.join(", ")
  );

  // ── 5. Both widths, both themes ───────────────────────────────────────
  for (const scheme of ["light", "dark"] as const) {
    for (const [width, shape] of [
      ["1440", desk],
      ["390", phone],
    ] as const) {
      // biome-ignore lint/performance/noAwaitInLoops: one width and theme at a time, each its own page
      const context = await browser.newContext({
        ...shape,
        colorScheme: scheme,
      });
      const page = await context.newPage();
      await openPanel(page, base);
      const grid = await readGrid(page);
      if (scheme === "light") {
        console.log(`  ${width} grid: ${JSON.stringify(grid)}`);
        check(
          `one trailing edge (${width})`,
          grid.spread <= 0.5,
          grid.trailing.map(([w, at]) => `${w} ${at}`).join("; ")
        );
        check(
          `one lead column (${width})`,
          grid.leads.length === 1,
          `x ${grid.leads.join(", ")}`
        );
        check(
          `one text column (${width})`,
          grid.texts.length === 1,
          `x ${grid.texts.join(", ")}`
        );
        check(
          `the list fits (${width})`,
          grid.fit.scrollHeight <= grid.fit.clientHeight,
          `${grid.fit.scrollHeight} ≤ ${grid.fit.clientHeight}`
        );
      }
      await page.screenshot({
        path: join(out, `caw-notices-${scheme}-${width}.png`),
      });

      // The notes open, scrolled to their middle: Hide changes stays in reach.
      await page.click(".caw-pop .actions .toggle");
      await page.waitForTimeout(700);
      await page.evaluate(() => {
        const list = document.querySelector(".caw-pop .list") as HTMLElement;
        const notes = document.querySelector("#update-notes") as HTMLElement;
        const l = list.getBoundingClientRect();
        const n = notes.getBoundingClientRect();
        list.scrollTop += n.top + n.height / 2 - (l.top + l.height / 2);
      });
      await page.waitForTimeout(500);
      const held = await page.evaluate(() => {
        const list = (
          document.querySelector(".caw-pop .list") as HTMLElement
        ).getBoundingClientRect();
        const toggle = (
          document.querySelector(".caw-pop .actions .toggle") as HTMLElement
        ).getBoundingClientRect();
        const footer = document.querySelector(
          ".caw-pop .actions"
        ) as HTMLElement;
        const row = (
          footer.parentElement as HTMLElement
        ).getBoundingClientRect();
        return {
          list: [Math.round(list.top), Math.round(list.bottom)],
          toggle: [Math.round(toggle.top), Math.round(toggle.bottom)],
          inside:
            toggle.top >= list.top - 0.5 && toggle.bottom <= list.bottom + 0.5,
          /** The row runs on past the list's foot: the footer must be held there. */
          rowPastFoot: row.bottom > list.bottom + 0.5,
          stuck: footer.hasAttribute("data-stuck"),
          scrollTop: Math.round(
            (document.querySelector(".caw-pop .list") as HTMLElement).scrollTop
          ),
        };
      });
      await page.screenshot({
        path: join(out, `caw-notices-${scheme}-${width}-notes-open.png`),
      });
      await page.click(".caw-pop .actions .toggle");
      await page.waitForTimeout(700);
      const folded = await page.evaluate(() => {
        const fold = document.querySelector("#update-notes");
        return {
          open: fold?.hasAttribute("data-open") ?? true,
          height: Math.round(fold?.getBoundingClientRect().height ?? -1),
        };
      });
      check(
        `sticky Hide changes (${width}, ${scheme})`,
        held.inside &&
          held.stuck === held.rowPastFoot &&
          !folded.open &&
          folded.height === 0,
        `${JSON.stringify(held)} → folded ${JSON.stringify(folded)}`
      );
      await context.close();
    }
  }

  // ── 6. One dismissal, then Clear all, on the hub's record ─────────────
  const context = await browser.newContext(desk);
  const page = await context.newPage();
  await openPanel(page, base);
  const before = await seenIds();
  const entry = page.locator(".caw-pop .group .entries li").first();
  const name = (await entry.locator(".name").textContent())?.trim() ?? "";
  await entry.locator(".x").click();
  await until(
    "the dismissal on the hub",
    seenIds,
    (ids) => ids.length > before.length,
    15_000
  );
  const afterOne = await seenIds();
  const addedOne = afterOne.filter((id) => !before.includes(id));
  const login = LOGINS.find((one) => one.email === name);
  check(
    "dismissing one moved login acknowledges only its id",
    addedOne.length === 1 &&
      login !== undefined &&
      addedOne[0]?.startsWith(`moved-login:${login.id}:${MACHINE}:`) === true,
    `${name}: added ${JSON.stringify(addedOne)}`
  );
  await page.waitForTimeout(600);
  const headNow = (
    await page.locator(".caw-pop .group .head").textContent()
  )?.trim();
  check(
    "the group counts four",
    headNow === "4 logins moved into CawCo",
    `${headNow}`
  );
  await page.getByRole("button", { name: /^Clear all/ }).click();
  await until(
    "Clear all on the hub",
    seenIds,
    (ids) => ids.length >= afterOne.length + 5,
    15_000
  );
  const afterAll = await seenIds();
  const addedAll = afterAll.filter((id) => !afterOne.includes(id));
  const expected = [
    ...movedIds.filter((id) => !addedOne.includes(id)),
    `landed:${MACHINE}:${landedAt}`,
  ];
  check(
    "Clear all acknowledges every notice's id",
    expected.every((id) => addedAll.includes(id)) &&
      addedAll.length === expected.length,
    `added ${JSON.stringify(addedAll)}`
  );
  await page.waitForTimeout(800);
  const left = await page.evaluate(() => ({
    notices: document.querySelector("#caw-notices") !== null,
    asks: document.querySelectorAll(".caw-pop .row").length,
  }));
  check(
    "Notices leaves; the ask stays",
    !left.notices && left.asks === 1,
    JSON.stringify(left)
  );
  await context.close();
} catch (error) {
  failures += 1;
  console.log(`FAIL probe: ${error instanceof Error ? error.message : error}`);
} finally {
  await browser?.close().catch(() => undefined);
  for (const child of procs.reverse()) {
    // biome-ignore lint/performance/noAwaitInLoops: stopped one at a time, by PID
    await fleet.killTree(child.pid, "SIGTERM");
  }
  await fleet.close();
  await fleet.clean(keep || failures > 0);
  if (runtime2 && !(keep || failures > 0)) {
    await rm(runtime2, { recursive: true, force: true });
  }
}
console.log(`captures in ${out}`);
process.exit(failures === 0 ? 0 : 1);
