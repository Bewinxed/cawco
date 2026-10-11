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
 *  5. at 1440×900 and at 390×844 with touch, light and dark: reads the panel
 *     by eye (caw-panel-ink): every row's last control's rightmost painted
 *     pixel on one x within 1px, Approve in the done pair and Deny in the
 *     fail pair, every meta line at 4.5:1 or more, the needs-you dot drawn
 *     whole; at both widths the ask's 16px marks and its project in label
 *     type and strong ink, the moved logins' head apart from its entries,
 *     one lead column and one text column for every row, and that the list
 *     fits and never scrolls sideways; opens the notes and reads Configure
 *     update behaviour's words on the title's column and the trailing edge
 *     again, scrolls to their middle, and reads that Hide changes stands
 *     inside the list and folds them; saves captures;
 *  5b. opens the ask's session from its row, at 1440 and at 390 with touch,
 *     and reads the transcript's permission card: Approve and Deny apart
 *     (32px at least), one untinted fill, Approve outlined 1px in the done
 *     ink and Deny in the fail ink, and neither changing under the pointer;
 *  5c. Peek, desktop and iPad, not phones: at 1440 a home row's Peek is
 *     hidden at rest and shown on hover, and opens the peek with the
 *     session's tail, its Approve and Deny apart, untinted, outlined in the
 *     done and fail inks, labels in ink-strong, still under the pointer;
 *     Peek on the panel's Needs-you row opens it and closes the panel; at
 *     1024×1366 with touch the row's Peek shows without hover and opens, and
 *     the panel's row offers it; at 390 with touch there is none;
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
import { CLAUDE_JSON_NAME } from "../packages/core/src/claude-dirs";
import { panelReport } from "./caw-panel-ink";
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
/** A session that keeps working while it is peeked: a word a second. */
const WORK = "notices-probe-work";
const respond = (request: Seen) => {
  if (request.tools && request.last.includes(ASK)) {
    return {
      everyMs: 5,
      words: [],
      tool: {
        name: "Bash",
        input: { command: `touch ${ASK}.txt`, description: "Make a file" },
      },
    };
  }
  if (request.tools && request.last.includes(WORK)) {
    return {
      everyMs: 1000,
      words: Array.from({ length: 1200 }, (_, i) => `step ${i}. `),
    };
  }
  return { everyMs: 10, words: ["Done."] };
};
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
    join(dir, CLAUDE_JSON_NAME),
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
    const deny = pop.querySelector(".peers .deny");
    const approve = pop.querySelector(".peers .approve");
    return {
      leads: [...new Set(rows.map((row) => row.lead))],
      texts: [...new Set(rows.map((row) => row.text))],
      rows,
      fit: {
        scrollHeight: list.scrollHeight,
        clientHeight: list.clientHeight,
        scrollWidth: list.scrollWidth,
        clientWidth: list.clientWidth,
      },
      peersGap: deny && approve ? x(r(approve).left - r(deny).right) : null,
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
      const eye = await panelReport(page);
      const at = `${width}, ${scheme}`;
      check(
        `one trailing edge by ink (${at})`,
        eye.inkSpread <= 1,
        `spread ${eye.inkSpread}px; ${eye.trailing
          .map((one) => `${one.what}: ink ${one.ink} (box ${one.box})`)
          .join("; ")}`
      );
      check(
        `Approve in the done pair, Deny in the fail pair (${at})`,
        eye.peers !== null &&
          eye.peers.approve === eye.peers.done &&
          eye.peers.deny === eye.peers.fail,
        JSON.stringify(eye.peers)
      );
      const metas = eye.contrast.filter((one) => one.role === "meta");
      check(
        `every meta line ≥ 4.5:1 (${at})`,
        metas.length > 0 && metas.every((one) => one.ratio >= 4.5),
        metas
          .map((one) => `"${one.text}" ${one.ratio} (painted ${one.seen})`)
          .join("; ")
      );
      check(
        `the needs-you dot draws whole (${at})`,
        eye.dot?.whole === true,
        JSON.stringify(eye.dot)
      );
      if (scheme === "light") {
        console.log(`  ${width} grid: ${JSON.stringify(grid)}`);
        check(
          `the ask's marks at 16px (${width})`,
          eye.marks.length > 0 &&
            eye.marks.every((one) => one.width >= 14 && one.height >= 14),
          eye.marks
            .map((one) => `${one.what} ${one.width}×${one.height}`)
            .join(", ")
        );
        const project = await page.evaluate(() => {
          const name = document.querySelector(
            ".caw-pop .where > .project .project-name"
          );
          if (!name) {
            return null;
          }
          const strong = document.createElement("span");
          strong.style.color = "var(--ink-strong)";
          name.append(strong);
          const style = getComputedStyle(name);
          const ink = getComputedStyle(strong).color;
          strong.remove();
          return {
            leads: name.closest(".where")?.firstElementChild?.contains(name),
            font: `${style.fontWeight} ${style.fontSize}`,
            color: style.color,
            strong: ink,
          };
        });
        check(
          `the ask's project leads in label type and strong ink (${width})`,
          project?.leads === true &&
            project.font === "500 13px" &&
            project.color === project.strong,
          JSON.stringify(project)
        );
        const groupLead = await page.evaluate(() => {
          const head = document.querySelector(
            ".caw-pop .group > .notice > .lead"
          );
          const glyph = head?.querySelector(".glyph > svg");
          const entries = [
            ...document.querySelectorAll(
              ".caw-pop .group .entries .notice > .lead"
            ),
          ];
          return {
            headTile: head?.querySelector(".tile") !== null,
            glyph: glyph
              ? {
                  size: `${glyph.getBoundingClientRect().width}×${glyph.getBoundingClientRect().height}`,
                  color: getComputedStyle(glyph).color,
                }
              : null,
            entriesWithTile: entries.filter((e) => e.querySelector(".tile"))
              .length,
            entries: entries.length,
          };
        });
        check(
          `moved logins: the head is led by the group glyph, not a tile (${width})`,
          groupLead.headTile === false &&
            groupLead.glyph !== null &&
            groupLead.entries > 0 &&
            groupLead.entriesWithTile === groupLead.entries,
          JSON.stringify(groupLead)
        );
        check(
          `moved logins: the head apart from its entries (${width})`,
          eye.moved !== null &&
            eye.moved.explainerToFirst !== null &&
            eye.moved.explainerToFirst >
              Math.max(...eye.moved.betweenEntries) + 4,
          JSON.stringify(eye.moved)
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
          `the list fits, and never scrolls sideways (${width})`,
          grid.fit.scrollHeight <= grid.fit.clientHeight &&
            grid.fit.scrollWidth <= grid.fit.clientWidth,
          JSON.stringify(grid.fit)
        );
      }
      await page.screenshot({
        path: join(out, `caw-notices-${scheme}-${width}.png`),
      });

      // The notes open: Configure update behaviour's words on the title's
      // column, and every trailing control still on one edge by ink.
      await page.click(".caw-pop .actions .toggle");
      // The pointer leaves the toggle, so its hover fill is not read as ink.
      await page.mouse.move(1, 1);
      await page.waitForTimeout(700);
      const open = await panelReport(page);
      const title = open.columns.find((one) => one.what === "update title");
      const configure = open.columns.find((one) =>
        one.what.startsWith("Configure")
      );
      check(
        `Configure update behaviour on the text column (${at})`,
        typeof title?.ink === "number" &&
          typeof configure?.ink === "number" &&
          Math.abs(configure.ink - title.ink) <= 1,
        `title ink x ${title?.ink}, Configure ink x ${configure?.ink} (box ${configure?.box})`
      );
      check(
        `one trailing edge by ink, notes open (${at})`,
        open.inkSpread <= 1,
        `spread ${open.inkSpread}px; ${open.trailing
          .map((one) => `${one.what}: ink ${one.ink}`)
          .join("; ")}`
      );
      // Scrolled to the notes' middle: Hide changes stays in reach.
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

  // ── 5b. The transcript's permission card: apart, outlined in its tints ─
  for (const [width, shape] of [
    ["1440", desk],
    ["390", phone],
  ] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one width at a time, each its own page
    const context = await browser.newContext(shape);
    const page = await context.newPage();
    await openPanel(page, base);
    await page.click(".caw-pop .row .cover");
    await page.waitForSelector(".choice .approve", { timeout: 60_000 });
    await page.waitForTimeout(600);
    const read = () =>
      page.evaluate(() => {
        const approve = document.querySelector(".choice .approve") as Element;
        const deny = document.querySelector(".choice .deny") as Element;
        const inkOf = (token: string) => {
          const swatch = document.createElement("span");
          swatch.style.color = `var(${token})`;
          document.body.append(swatch);
          const ink = getComputedStyle(swatch).color;
          swatch.remove();
          return ink;
        };
        const side = (e: Element) => {
          const s = getComputedStyle(e);
          return {
            border: `${s.borderTopWidth} ${s.borderTopColor}`,
            fill: s.backgroundColor,
            label: s.color,
          };
        };
        return {
          approve: side(approve),
          deny: side(deny),
          done: inkOf("--status-done-ink"),
          fail: inkOf("--status-fail-ink"),
          strong: inkOf("--ink-strong"),
          gap:
            Math.round(
              (deny.getBoundingClientRect().left -
                approve.getBoundingClientRect().right) *
                100
            ) / 100,
          row:
            Math.round(
              (deny.getBoundingClientRect().right -
                approve.getBoundingClientRect().left) *
                100
            ) / 100,
        };
      });
    const card = await read();
    check(
      `transcript card: apart, outlined in done and fail inks (${width})`,
      card.approve.border === `1px ${card.done}` &&
        card.deny.border === `1px ${card.fail}` &&
        card.approve.fill === card.deny.fill &&
        card.gap >= 32,
      JSON.stringify(card)
    );
    check(
      `transcript card: both labels in ink-strong (${width})`,
      card.approve.label === card.strong && card.deny.label === card.strong,
      `Approve ${card.approve.label}, Deny ${card.deny.label}, ink-strong ${card.strong}`
    );
    if (width === "1440") {
      await page.hover(".choice .approve");
      await page.waitForTimeout(300);
      const hovered = await read();
      check(
        "transcript card: neither peer changes under the pointer (1440)",
        hovered.approve.fill === card.approve.fill &&
          hovered.approve.border === card.approve.border,
        `rest ${JSON.stringify(card.approve)} → hovered ${JSON.stringify(hovered.approve)}`
      );
    }
    await page.screenshot({
      path: join(out, `caw-notices-transcript-card-${width}.png`),
    });
    await context.close();
  }

  // ── 5c. Peek: desktop and iPad, not phones ────────────────────────────
  const tablet = {
    viewport: { width: 1024, height: 1366 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  };
  /** The home's first session row that offers Peek, once the board is in. */
  const rowPeek = ".item[data-peek] button.peek";
  /**
   * A Peek button: shown or not, its box, its touch area, its glyph's size,
   * and its ink's contrast on what is painted under it (non-text, 3:1):
   * the glyph's full-ink arrow, and its duotone half at 50%.
   */
  const readPeekButton = (tab: Page, selector = rowPeek) =>
    tab.evaluate((at) => {
      const button = document.querySelector(at);
      if (!button) {
        return null;
      }
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext("2d", {
        willReadFrequently: true,
      }) as CanvasRenderingContext2D;
      const rgba = (css: string) => {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = "#000";
        ctx.fillStyle = css;
        ctx.fillRect(0, 0, 1, 1);
        const [r = 0, g = 0, b = 0, a = 0] = ctx.getImageData(0, 0, 1, 1).data;
        return [r, g, b, a / 255];
      };
      const mix = (top: number[], under: number[]) =>
        [0, 1, 2].map(
          (c) =>
            (top[c] ?? 0) * (top[3] ?? 1) +
            (under[c] ?? 0) * (1 - (top[3] ?? 1))
        );
      // The fills under the button, outermost first, over the page.
      const fills: number[][] = [];
      for (let el: Element | null = button; el; el = el.parentElement) {
        const fill = rgba(getComputedStyle(el).backgroundColor);
        if (fill[3] > 0) {
          fills.unshift(fill);
        }
      }
      const ground = fills.reduce(
        (under, top) => mix(top, under),
        [255, 255, 255]
      );
      const lum = (rgb: number[]) =>
        rgb
          .map((v) => {
            const s = v / 255;
            return s <= 0.040_45 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
          })
          .reduce(
            (sum, c, i) => sum + c * ([0.2126, 0.7152, 0.0722][i] ?? 0),
            0
          );
      const ratio = (a: number[], b: number[]) => {
        const [hi = 0, lo = 0] = [lum(a), lum(b)].sort((x, y) => y - x);
        return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
      };
      const s = getComputedStyle(button);
      const ink = rgba(s.color);
      const r = button.getBoundingClientRect();
      const glyph = button.querySelector("svg")?.getBoundingClientRect();
      const hit = getComputedStyle(button, "::after");
      return {
        label: button.getAttribute("aria-label"),
        opacity: s.opacity,
        display: s.display,
        size: `${Math.round(r.width)}×${Math.round(r.height)}`,
        hit: `${hit.inset}`,
        glyph: glyph ? `${glyph.width}×${glyph.height}` : null,
        ink: s.color,
        contrast: ratio(mix(ink, ground), ground),
        contrastHalf: ratio(
          mix([ink[0] ?? 0, ink[1] ?? 0, ink[2] ?? 0, 0.5], ground),
          ground
        ),
      };
    }, selector);
  /** A kit tooltip in the page, open or leaving. */
  const tooltips = (tab: Page) =>
    tab.evaluate(
      () =>
        document.querySelectorAll(
          '[data-slot="tooltip-content"], [role="tooltip"]'
        ).length
    );
  /** The open peek: its title, what its tail says, and its answer row. */
  const readPeek = (tab: Page) =>
    tab.evaluate(() => {
      const sheet = document.querySelector(".peek-sheet");
      if (!sheet) {
        return null;
      }
      const approve = sheet.querySelector(".choice .approve");
      const deny = sheet.querySelector(".choice .deny");
      const inkOf = (token: string) => {
        const swatch = document.createElement("span");
        swatch.style.color = `var(${token})`;
        document.body.append(swatch);
        const ink = getComputedStyle(swatch).color;
        swatch.remove();
        return ink;
      };
      const side = (e: Element | null) => {
        if (!e) {
          return null;
        }
        const s = getComputedStyle(e);
        return {
          border: `${s.borderTopWidth} ${s.borderTopColor}`,
          fill: s.backgroundColor,
          label: s.color,
        };
      };
      return {
        direction: sheet.getAttribute("data-vaul-drawer-direction"),
        title: sheet.querySelector("h2")?.textContent?.trim(),
        text: (sheet as HTMLElement).innerText.replace(/\s+/g, " ").trim(),
        approve: side(approve),
        deny: side(deny),
        done: inkOf("--status-done-ink"),
        fail: inkOf("--status-fail-ink"),
        strong: inkOf("--ink-strong"),
        gap:
          approve && deny
            ? Math.round(
                (approve.getBoundingClientRect().left -
                  deny.getBoundingClientRect().right) *
                  100
              ) / 100
            : null,
      };
    });
  /** The peek stands open on `title`, its tail saying `said`. */
  const peekShows = async (
    tab: Page,
    at: string,
    title: string,
    said: string
  ) => {
    await tab.waitForFunction(
      (words) =>
        document.querySelector(".peek-sheet")?.textContent?.includes(words) ===
        true,
      said,
      { timeout: 60_000 }
    );
    await tab.waitForTimeout(700);
    const peek = await readPeek(tab);
    check(
      `peek opens with the session's tail (${at})`,
      peek !== null && peek.title === title && peek.text.includes(said),
      JSON.stringify({
        direction: peek?.direction,
        title: peek?.title,
        tail: peek?.text.slice(-160),
      })
    );
    return peek;
  };
  /** The ask's peek: its tail, and its Approve/Deny in The Peer Rule's apart form. */
  const peekOpens = async (tab: Page, at: string) => {
    await tab.waitForSelector(".peek-sheet .choice .approve", {
      timeout: 60_000,
    });
    const peek = await peekShows(tab, at, "Fix tray chip overflow", ASK);
    check(
      `peek's Approve/Deny: apart, untinted, outlined in done and fail inks, one label ink (${at})`,
      Boolean(
        peek?.approve &&
          peek.deny &&
          peek.approve.border === `1px ${peek.done}` &&
          peek.deny.border === `1px ${peek.fail}` &&
          peek.approve.fill === peek.deny.fill &&
          peek.approve.label === peek.strong &&
          peek.deny.label === peek.strong &&
          (peek.gap ?? 0) >= 32
      ),
      JSON.stringify({
        approve: peek?.approve,
        deny: peek?.deny,
        done: peek?.done,
        fail: peek?.fail,
        strong: peek?.strong,
        gap: peek?.gap,
      })
    );
    return peek;
  };

  // A session at work, so the home's Working list has a row to peek (the
  // parked ask is in neither Working nor Finished).
  const WORK_TITLE = "Tidy the rail's ages";
  const workSession = await fleet.spawn("claude", WORK_TITLE, fleet.workdir, {
    permissionMode: "default",
  });
  await fleet.send(workSession, `${WORK}: keep going.`);
  // And one that has finished, so Finished lists an archivable row.
  const DONE_TITLE = "Name the ages column";
  const doneSession = await fleet.spawn("claude", DONE_TITLE, fleet.workdir, {
    permissionMode: "default",
  });
  await fleet.send(doneSession, "Say done.");

  {
    // A desk: Peek rises on a row's hover, and opens the peek.
    const context = await browser.newContext(desk);
    const page = await context.newPage();
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(rowPeek, { state: "attached", timeout: 60_000 });
    await page.mouse.move(1, 1);
    await page.waitForTimeout(400);
    const rest = await readPeekButton(page);
    await page.hover(".item[data-peek] > a.row");
    await page.waitForTimeout(400);
    const hovered = await readPeekButton(page);
    check(
      "row Peek hidden at rest, shown on hover (1440)",
      rest?.opacity === "0" && hovered?.opacity === "1",
      `rest ${JSON.stringify(rest)} → hovered ${JSON.stringify(hovered)}`
    );
    await page.screenshot({ path: join(out, "peek-row-hover-1440.png") });
    await page.click(rowPeek);
    await peekShows(page, "row, 1440", WORK_TITLE, "step ");
    await page.mouse.move(1, 1);
    await page.screenshot({ path: join(out, "peek-open-row-1440.png") });

    // From Caw's panel: Peek on the Needs-you row opens the peek, the panel closes.
    await openPanel(page, base);
    await page.screenshot({ path: join(out, "peek-panel-row-1440.png") });
    await page.click(".caw-pop .row .end button.peek");
    const peek = await peekOpens(page, "panel, 1440");
    const panelGone = await page.evaluate(
      () => document.querySelector(".caw-pop[data-shown]") === null
    );
    check("Peek from the panel closes the panel (1440)", panelGone, "");
    if (peek?.approve) {
      await page.hover(".peek-sheet .choice .approve");
      await page.waitForTimeout(300);
      const under = await readPeek(page);
      check(
        "peek's peers: neither changes under the pointer (1440)",
        under?.approve?.fill === peek.approve.fill &&
          under?.approve?.border === peek.approve.border,
        `rest ${JSON.stringify(peek.approve)} → hovered ${JSON.stringify(under?.approve)}`
      );
    }
    await page.mouse.move(1, 1);
    await page.screenshot({ path: join(out, "peek-open-ask-1440.png") });

    // A finished row is archivable: on hover Archive and Peek both rise,
    // Archive a step left of Peek.
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page
      .getByRole("tab", { name: /^Finished/ })
      .first()
      .click();
    const archivable = ".item[data-archivable][data-peek]";
    await page.waitForSelector(archivable, {
      state: "attached",
      timeout: 120_000,
    });
    await page.hover(`${archivable} > a.row`);
    await page.waitForTimeout(400);
    const pair = await page.evaluate((at) => {
      const item = document.querySelector(at) as Element;
      const one = (selector: string) => {
        const e = item.querySelector(selector) as Element;
        const r = e.getBoundingClientRect();
        return {
          opacity: getComputedStyle(e).opacity,
          left: Math.round(r.left * 100) / 100,
          right: Math.round(r.right * 100) / 100,
        };
      };
      return {
        title: item.querySelector(".title")?.textContent?.trim(),
        archive: one("button.archive"),
        peek: one("button.peek"),
      };
    }, archivable);
    check(
      "archivable row: Archive and Peek both on hover, Archive left of Peek (1440)",
      pair.archive.opacity === "1" &&
        pair.peek.opacity === "1" &&
        pair.archive.right < pair.peek.left,
      JSON.stringify(pair)
    );
    await page.screenshot({
      path: join(out, "peek-row-hover-archive-1440.png"),
    });
    await context.close();
  }

  {
    // An iPad: Peek always shown on the row, with 44px to touch, and opens.
    const context = await browser.newContext(tablet);
    const page = await context.newPage();
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(rowPeek, { state: "attached", timeout: 60_000 });
    await page.waitForTimeout(600);
    const shown = await readPeekButton(page);
    check(
      "row Peek shown without hover (1024×1366 touch)",
      shown?.opacity === "1" && shown.display !== "none",
      JSON.stringify(shown)
    );
    check(
      "row Peek's glyph at the touch size, its ink ≥ 3:1 on the row (1024×1366 touch)",
      shown?.glyph === "20×20" && (shown?.contrast ?? 0) >= 3,
      `glyph ${shown?.glyph}, ink ${shown?.ink}, contrast ${shown?.contrast}:1 (duotone half ${shown?.contrastHalf}:1)`
    );
    await page.screenshot({ path: join(out, "peek-row-1024.png") });
    await page.tap(rowPeek);
    await peekShows(page, "row, 1024×1366 touch", WORK_TITLE, "step ");
    await page.waitForTimeout(1200);
    const rowTips = await tooltips(page);
    check(
      "no tooltip after Peek opens from a row (1024×1366 touch)",
      rowTips === 0,
      `${rowTips} tooltip elements`
    );
    await page.screenshot({ path: join(out, "peek-open-1024.png") });
    await openPanel(page, base);
    const panelButton = ".caw-pop .row .end button.peek";
    const panel = await readPeekButton(page, panelButton);
    check(
      "the panel's Needs-you row offers Peek at the touch size, ≥ 3:1 (1024×1366 touch)",
      panel !== null && panel.glyph === "20×20" && panel.contrast >= 3,
      `glyph ${panel?.glyph}, ink ${panel?.ink}, contrast ${panel?.contrast}:1 (duotone half ${panel?.contrastHalf}:1)`
    );
    await page.screenshot({ path: join(out, "peek-panel-row-1024.png") });
    await page.tap(panelButton);
    await peekOpens(page, "panel, 1024×1366 touch");
    await page.waitForTimeout(1200);
    const panelTips = await tooltips(page);
    check(
      "no tooltip after Peek opens from the panel (1024×1366 touch)",
      panelTips === 0,
      `${panelTips} tooltip elements`
    );
    await context.close();
  }

  {
    // A phone: no Peek anywhere.
    const context = await browser.newContext(phone);
    const page = await context.newPage();
    await openPanel(page, base);
    const counts = await page.evaluate(() => ({
      rows: document.querySelectorAll(".item").length,
      asks: document.querySelectorAll(".caw-pop .row").length,
      peeks: document.querySelectorAll("button.peek, [aria-label^='Peek ']")
        .length,
      sheet: document.querySelector(".peek-sheet") !== null,
    }));
    check(
      "no Peek on a phone, rows or panel (390 touch)",
      counts.asks === 1 && counts.peeks === 0 && !counts.sheet,
      JSON.stringify(counts)
    );
    await page.screenshot({ path: join(out, "peek-none-390.png") });
    await context.close();
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
