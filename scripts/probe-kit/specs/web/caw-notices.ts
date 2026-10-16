/**
 * Caw's panel and its notices on the built dashboard against a scratch fleet
 * whose machine is a binary install that landed a nightly with notes, with a
 * second machine beside it, five Claude accounts (all signed in on the
 * first, three on the second), a parked Bash ask, and the five sign-ins
 * moved into CawCo.
 *
 * The update alone: its notes stand open by default (engine). Then, on the
 * desk and the phone, light and dark:
 *  - one trailing edge: every row's last control's rightmost painted pixel
 *    on one x within 1px, notes folded and open (ink: the edge is drawn in
 *    ink, not boxes);
 *  - Approve in the done pair, Deny in the fail pair; every meta line at
 *    4.5:1 on what it is painted on, with every ancestor's opacity
 *    (engine: computed colours);
 *  - the needs-you dot drawn whole (ink);
 *  - in light: the ask's marks at 16px, its project leading in label type
 *    and strong ink, the moved logins' head led by the group glyph and apart
 *    from its entries, one lead column, one text column, a list that fits
 *    and never scrolls sideways (geometry, engine);
 *  - the notes open: Configure update behaviour on the title's column (ink),
 *    Hide changes held in the list and folding them (geometry).
 * The ask's transcript card, desk and phone: Approve and Deny 32px apart, one
 * untinted fill, outlined 1px in the done and fail inks, labels in
 * ink-strong, neither changing under the pointer (engine). Peek: a desk row's
 * hidden at rest and shown on hover, opening the session's tail; the panel's
 * row's opening the ask's peek and closing the panel, its peers as the
 * card's; an archivable row's Archive and Peek both on hover, Archive first;
 * on an iPad shown without hover at the touch size, ink 3:1, opening with no
 * tooltip left; on a phone none. Dismissing one moved login acknowledges
 * only its id, the group counts four, Clear all acknowledges every notice's
 * id, Notices leaves and the ask stays (the hub's record).
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
import { join } from "node:path";
import type { Page } from "playwright-core";
import { CLAUDE_JSON_NAME } from "../../../../packages/core/src/claude-dirs";
import { ACCOUNT, MACHINE, type Seen, until } from "../../../scratch-fleet";
import { spread } from "../../geom";
import {
  capture,
  dx,
  dy,
  inkSpan,
  off,
  px,
  type Raster,
  type Rgb,
} from "../../ink";
import {
  type Kit,
  type KitFleet,
  open,
  ROOT,
  type Spec,
  THEMES,
  type View,
} from "../../kit";

const SECOND = "scratch-second";
const FINISHED_TAB = /^Finished/;
const CLEAR_ALL = /^Clear all/;
const LANDED_VERSION = "0.2.0-nightly.2522+e3cbba1d";
const SOURCE_VERSION = "0.0.0-dev";
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
const WORK = "notices-probe-work";
const WORK_TITLE = "Tidy the rail's ages";
const DONE_TITLE = "Name the ages column";
const ROW_PEEK = ".item[data-peek] button.peek";
const PANEL_PEEK = ".caw-pop .row .end button.peek";

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

/** The fleet: a landed nightly on the first machine, five accounts, a second machine with three. */
async function stage(
  fleet: KitFleet,
  children: Bun.Subprocess[],
  dirs: string[]
) {
  const binary = join(fleet.home, ".local", "share", "cawco", "binary");
  await mkdir(binary, { recursive: true });
  // A binary install whose hub answers nothing: the updater reports this
  // state and does nothing else; its keeper failed this build before.
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
  const signedIn = (machine: string) =>
    fleet.query<{ n: number }>(
      "SELECT count(*) AS n FROM account_signins WHERE machine_id = ? AND state = 'signed-in' AND account_id LIKE 'acct-%' AND account_id != ?",
      machine,
      ACCOUNT
    )[0]?.n;
  await until(
    "the five accounts signed in on the first machine",
    () => signedIn(MACHINE),
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
  const runtime2 = await mkdtemp(
    join(
      process.env.XDG_CACHE_HOME ?? join(process.env.HOME ?? "/tmp", ".cache"),
      "sf2-"
    )
  );
  dirs.push(runtime2);
  await chmod(runtime2, 0o700);
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
    children.push(
      Bun.spawn([process.execPath, entry], {
        cwd: ROOT,
        env: env2,
        stdout: Bun.file(join(fleet.sandbox, `${role}.log`)),
        stderr: Bun.file(join(fleet.sandbox, `${role}.err`)),
      })
    );
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
    () => signedIn(SECOND),
    (n) => n === 3,
    240_000
  );
  return landedAt;
}

/** Opens Caw's panel on `page` and waits for it to stand open. */
async function openPanel(page: Page, base: string) {
  await open(page, base, "[data-needs-caw]");
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

/**
 * The panel as the engine lays it out: every row's last control in plain
 * view (its box, whether its fill is its ink), the surface, the list, the
 * peers' fills against the done and fail pairs, every run of words' role
 * and its ink's contrast on what it is painted on, the ask's marks, the
 * moved logins' gaps, the columns and the needs-you dot's box.
 */
function panelOf() {
  const pop = document.querySelector(".caw-pop") as HTMLElement;
  const list = pop.querySelector(".list") as HTMLElement;
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d", {
    willReadFrequently: true,
  }) as CanvasRenderingContext2D;
  const rgba = (css: string): number[] => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "#000";
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const [r = 0, g = 0, b = 0, a = 0] = ctx.getImageData(0, 0, 1, 1).data;
    return a ? [r, g, b, a / 255] : [0, 0, 0, 0];
  };
  const drawn = (e: Element) =>
    e.getBoundingClientRect().height > 0 &&
    !e.closest("[inert]") &&
    getComputedStyle(e).visibility !== "hidden";
  const shown = (s: string) => [...pop.querySelectorAll(s)].filter(drawn);
  const fade =
    Number.parseFloat(getComputedStyle(list).getPropertyValue("--fade-len")) ||
    40;
  const inView = (e: Element) => {
    const r = e.getBoundingClientRect();
    const view = list.getBoundingClientRect();
    const stuck = pop.querySelector(".actions[data-stuck]");
    const more = list.scrollTop + list.clientHeight < list.scrollHeight - 1;
    const top = view.top + (list.scrollTop > 0 ? fade : 0);
    let bottom = view.bottom - (more && !stuck ? fade : 0);
    if (stuck && !stuck.contains(e)) {
      bottom = stuck.getBoundingClientRect().top - fade;
    }
    return drawn(e) && r.top >= top && r.bottom <= bottom;
  };
  const box = (e: Element) => {
    const r = e.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  };
  const label = (e: Element) =>
    (e.getAttribute("aria-label") ?? e.textContent ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 40);
  const pick = (s: string, what: (e: Element) => string) =>
    shown(s)
      .filter(inView)
      .map((e) => ({
        what: what(e),
        box: box(e),
        filled: (rgba(getComputedStyle(e).backgroundColor)[3] ?? 0) > 0,
      }));
  const fillOf = (token: string) => {
    const swatch = document.createElement("span");
    swatch.style.background = `var(${token})`;
    pop.append(swatch);
    const fill = getComputedStyle(swatch).backgroundColor;
    swatch.remove();
    return fill;
  };
  const deny = pop.querySelector(".peers .deny");
  const approve = pop.querySelector(".peers .approve");
  const surface = rgba(getComputedStyle(pop).backgroundColor);
  const mix = (top: number[], under: number[]) =>
    [0, 1, 2].map(
      (c) =>
        (top[c] ?? 0) * (top[3] ?? 1) + (under[c] ?? 0) * (1 - (top[3] ?? 1))
    );
  const ground = (el: Element) => {
    const fills: number[][] = [];
    for (let up: Element | null = el; up && up !== pop; up = up.parentElement) {
      const fill = rgba(getComputedStyle(up).backgroundColor);
      if ((fill[3] ?? 0) > 0) {
        fills.unshift(fill);
      }
    }
    return fills.reduce((under, top) => mix(top, under), surface.slice(0, 3));
  };
  const opacity = (el: Element) => {
    let o = 1;
    for (let up: Element | null = el; up; up = up.parentElement) {
      o *= Number(getComputedStyle(up).opacity);
    }
    return o;
  };
  const lum = (rgb: number[]) =>
    rgb
      .map((v) => {
        const s = v / 255;
        return s <= 0.040_45 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      })
      .reduce((sum, c, i) => sum + c * ([0.2126, 0.7152, 0.0722][i] ?? 0), 0);
  const owners = new Set<Element>();
  const walker = document.createTreeWalker(pop, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const el = node.parentElement;
    if (
      el &&
      node.textContent?.trim() &&
      !el.closest(".sr-only") &&
      drawn(el)
    ) {
      owners.add(el);
    }
  }
  const metas = [...owners].flatMap((el) => {
    const s = getComputedStyle(el);
    // A meta run at label weight is still meta: the size names the role.
    if (Number.parseFloat(s.fontSize) !== 12) {
      return [];
    }
    const ink = rgba(s.color);
    const under = ground(el);
    const painted = mix(
      [ink[0] ?? 0, ink[1] ?? 0, ink[2] ?? 0, (ink[3] ?? 1) * opacity(el)],
      under
    );
    const [hi = 0, lo = 0] = [lum(painted), lum(under)].sort((a, b) => b - a);
    return [
      {
        text: label(el),
        ratio: Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100,
      },
    ];
  });
  const type = (e: Element) => {
    const s = getComputedStyle(e);
    return `${s.fontWeight} ${s.fontSize}/${s.lineHeight} ${s.color}`;
  };
  const [group] = shown(".group:has(.explainer)");
  const explainer = group?.querySelector(".explainer");
  const bodies = shown(".group:has(.explainer) .entries .notice > .body").map(
    (b) => b.getBoundingClientRect()
  );
  const [dot] = shown(".row .lead .dot:not(.ping)");
  return {
    surface: surface.slice(0, 3) as [number, number, number],
    list: box(list),
    trailing: [
      ...pick(".row:not([data-peek]) .wait", (e) => `time ${label(e)}`),
      ...pick(".row .end .peek", (e) => `peek ${label(e)}`),
      ...pick(".peers .approve", () => "Approve"),
      ...pick(".head .clear", () => "Clear all"),
      ...pick(".notice > .end .x", (e) => `✕ ${label(e)}`),
      ...pick(".actions > :last-child", (e) => `footer ${label(e)}`),
      ...pick(".todo", (e) => `link ${label(e)}`),
      ...pick(".done", (e) => `done ${label(e)}`),
      ...pick(".more button", () => "fold toggle"),
    ],
    columns: [
      ...pick(".notice .card > .title", () => "update title"),
      ...pick(".actions > .settings", () => "Configure update behaviour"),
    ],
    peers:
      deny && approve
        ? {
            deny: getComputedStyle(deny).backgroundColor,
            approve: getComputedStyle(approve).backgroundColor,
            fail: fillOf("--status-fail-bg"),
            done: fillOf("--status-done-bg"),
          }
        : null,
    metas,
    marks: [
      ...shown(".where .project .mark").map((e) => ({ what: "project", e })),
      ...shown(".where .machine .mark").map((e) => ({ what: "machine", e })),
    ].map(({ what, e }) => ({
      what,
      width: e.getBoundingClientRect().width,
      height: e.getBoundingClientRect().height,
    })),
    moved:
      group && explainer
        ? {
            head: type(group.querySelector(".head") as Element),
            explainerToFirst: bodies[0]
              ? bodies[0].top - explainer.getBoundingClientRect().bottom
              : null,
            betweenEntries: bodies
              .slice(1)
              .map((b, i) => b.top - (bodies[i]?.bottom ?? b.top)),
          }
        : null,
    dot: dot ? box(dot) : null,
  };
}
type Panel = ReturnType<typeof panelOf>;

/** Where each control's ink stands: its rightmost painted pixel, read in its box's middle half, 8px past its sides inside the list. */
function trailingInk(r: Raster, p: Panel) {
  return p.trailing.map(({ what, box, filled }) => {
    const quarter = (box.bottom - box.top) / 4;
    const span = inkSpan(
      r,
      {
        left: Math.max(p.list.left, box.left - 8),
        right: Math.min(p.list.right, box.right + 8),
        top: box.top + quarter,
        bottom: box.bottom - quarter,
      },
      p.surface,
      filled
    );
    return { what, ink: span?.right ?? null };
  });
}

/** The dot drawn whole: its ink, where it stands out of its tile, reaching its box's top and trailing side. */
function dotWhole(r: Raster, p: Panel) {
  const b = p.dot;
  if (!b) {
    return { whole: false, detail: "no dot" };
  }
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  for (
    let y = Math.floor(dy(r, b.top - 1));
    y < Math.ceil(dy(r, b.top + (b.bottom - b.top) / 2));
    y += 1
  ) {
    for (
      let x = Math.floor(dx(r, b.left));
      x < Math.floor(dx(r, b.right + 1));
      x += 1
    ) {
      if (off(px(r, x, y), p.surface as Rgb) >= 24) {
        top = Math.min(top, y / r.scale + r.y);
        right = Math.max(right, (x + 1) / r.scale + r.x);
      }
    }
  }
  return {
    whole: top <= b.top + 1 && right >= b.right - 1,
    detail: `box top ${b.top.toFixed(1)} right ${b.right.toFixed(1)}; ink top ${top.toFixed(1)} right ${right.toFixed(1)}`,
  };
}

/** A pair of answer buttons under `scope`: borders, fills, labels, the inks, the gap. */
const peersIn = (page: Page, scope: string) =>
  page.evaluate((s) => {
    const root = document.querySelector(s);
    const approve = root?.querySelector(".choice .approve");
    const deny = root?.querySelector(".choice .deny");
    if (!(approve && deny)) {
      return null;
    }
    const inkOf = (token: string) => {
      const swatch = document.createElement("span");
      swatch.style.color = `var(${token})`;
      document.body.append(swatch);
      const ink = getComputedStyle(swatch).color;
      swatch.remove();
      return ink;
    };
    const side = (e: Element) => {
      const st = getComputedStyle(e);
      return {
        border: `${st.borderTopWidth} ${st.borderTopColor}`,
        fill: st.backgroundColor,
        label: st.color,
      };
    };
    const a = approve.getBoundingClientRect();
    const d = deny.getBoundingClientRect();
    return {
      approve: side(approve),
      deny: side(deny),
      done: inkOf("--status-done-ink"),
      fail: inkOf("--status-fail-ink"),
      strong: inkOf("--ink-strong"),
      gap: Math.max(d.left - a.right, a.left - d.right),
    };
  }, scope);
type Peers = NonNullable<Awaited<ReturnType<typeof peersIn>>>;
const peersRight = (p: Peers | null) =>
  !!p &&
  p.approve.border === `1px ${p.done}` &&
  p.deny.border === `1px ${p.fail}` &&
  p.approve.fill === p.deny.fill &&
  p.approve.label === p.strong &&
  p.deny.label === p.strong &&
  p.gap >= 32;

/** A Peek button: opacity, display, glyph size and its ink's contrast on the fills under it. */
const peekButton = (page: Page, sel: string) =>
  page.evaluate((s) => {
    const button = document.querySelector(s);
    if (!button) {
      return null;
    }
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 1;
    const ctx = c.getContext("2d", {
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
        (k) =>
          (top[k] ?? 0) * (top[3] ?? 1) + (under[k] ?? 0) * (1 - (top[3] ?? 1))
      );
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
          const t = v / 255;
          return t <= 0.040_45 ? t / 12.92 : ((t + 0.055) / 1.055) ** 2.4;
        })
        .reduce((sum, x, i) => sum + x * ([0.2126, 0.7152, 0.0722][i] ?? 0), 0);
    const [hi = 0, lo = 0] = [
      lum(mix(rgba(getComputedStyle(button).color), ground)),
      lum(ground),
    ].sort((a, b) => b - a);
    const glyph = button.querySelector("svg")?.getBoundingClientRect();
    return {
      opacity: getComputedStyle(button).opacity,
      display: getComputedStyle(button).display,
      glyph: glyph ? `${glyph.width}×${glyph.height}` : null,
      contrast: Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100,
    };
  }, sel);

const tooltips = (page: Page) =>
  page.evaluate(
    () =>
      document.querySelectorAll(
        '[data-slot="tooltip-content"], [role="tooltip"]'
      ).length
  );

/** The peek opens on `title`, its tail saying `said`. */
async function peekShows(
  kit: Kit,
  page: Page,
  at: string,
  title: string,
  said: string
) {
  await page.waitForFunction(
    (w) =>
      document.querySelector(".peek-sheet")?.textContent?.includes(w) === true,
    said,
    { timeout: 60_000 }
  );
  await page.waitForTimeout(700);
  const read = await page.evaluate(() => {
    const sheet = document.querySelector(".peek-sheet") as HTMLElement | null;
    return sheet
      ? {
          title: sheet.querySelector("h2")?.textContent?.trim(),
          text: sheet.innerText.replace(/\s+/g, " "),
        }
      : null;
  });
  kit.check(
    `peek opens with the session's tail (${at})`,
    read?.title === title && read.text.includes(said),
    read?.title ?? "no peek"
  );
}

async function widths(kit: Kit, fleet: KitFleet) {
  const base = await fleet.dashboard();
  for (const theme of THEMES) {
    for (const view of ["desk", "phone"] as View[]) {
      const at = `${view}, ${theme}`;
      // biome-ignore lint/performance/noAwaitInLoops: one width and theme at a time
      const page = await kit.page(view, { theme });
      await openPanel(page, base);
      let p = await page.evaluate(panelOf);
      let r = await capture(page);
      const inks = trailingInk(r, p);
      const edge = (list: { what: string; ink: number | null }[]) =>
        spread(list.flatMap((one) => (one.ink === null ? [] : [one.ink])));
      kit.check(
        `one trailing edge by ink (${at})`,
        edge(inks) <= 1,
        `spread ${edge(inks).toFixed(2)}px; ${inks.map((one) => `${one.what} ${one.ink?.toFixed(2)}`).join("; ")}`
      );
      kit.check(
        `Approve in the done pair, Deny in the fail pair (${at})`,
        p.peers !== null &&
          p.peers.approve === p.peers.done &&
          p.peers.deny === p.peers.fail,
        JSON.stringify(p.peers)
      );
      kit.check(
        `every meta line ≥ 4.5:1 (${at})`,
        p.metas.length > 0 && p.metas.every((one) => one.ratio >= 4.5),
        p.metas
          .filter((one) => one.ratio < 4.5)
          .map((one) => `"${one.text}" ${one.ratio}`)
          .join("; ") || `${p.metas.length} lines`
      );
      const dot = dotWhole(r, p);
      kit.check(`the needs-you dot draws whole (${at})`, dot.whole, dot.detail);
      if (theme === "light") {
        kit.check(
          `the ask's marks at 16px (${view})`,
          p.marks.length > 0 &&
            p.marks.every((one) => one.width >= 14 && one.height >= 14),
          p.marks
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
          const s = getComputedStyle(name);
          const ink = getComputedStyle(strong).color;
          strong.remove();
          return {
            leads:
              name.closest(".where")?.firstElementChild?.contains(name) ===
              true,
            font: `${s.fontWeight} ${s.fontSize}`,
            strong: s.color === ink,
          };
        });
        kit.check(
          `the ask's project leads in label type and strong ink (${view})`,
          project?.leads === true &&
            project.font === "500 13px" &&
            project.strong,
          JSON.stringify(project)
        );
        const lead = await page.evaluate(() => {
          const head = document.querySelector(
            ".caw-pop .group > .notice > .lead"
          );
          const entries = [
            ...document.querySelectorAll(
              ".caw-pop .group .entries .notice > .lead"
            ),
          ];
          return {
            headTile: head?.querySelector(".tile") !== null,
            glyph: head?.querySelector(".glyph > svg") !== null,
            entries: entries.length,
            withTile: entries.filter((e) => e.querySelector(".tile")).length,
          };
        });
        kit.check(
          `moved logins: the head is led by the group glyph, not a tile (${view})`,
          !lead.headTile &&
            lead.glyph &&
            lead.entries > 0 &&
            lead.withTile === lead.entries,
          JSON.stringify(lead)
        );
        kit.check(
          `moved logins: the head apart from its entries (${view})`,
          p.moved !== null &&
            p.moved.explainerToFirst !== null &&
            p.moved.explainerToFirst > Math.max(...p.moved.betweenEntries) + 4,
          JSON.stringify(p.moved)
        );
        const grid = await page.evaluate(() => {
          const pop = document.querySelector(".caw-pop") as HTMLElement;
          const shown = (e: Element) =>
            e.getBoundingClientRect().height > 0 && !e.closest("[inert]");
          const all = (s: string) => [...pop.querySelectorAll(s)].filter(shown);
          const left = (e: Element | null) =>
            Math.round((e?.getBoundingClientRect().left ?? -1) * 100) / 100;
          const rows = [
            ...all(".section > .head").map((h) => [
              left(h.querySelector(".glyph")),
              left(h.querySelector(".title")),
            ]),
            ...all(".row").map((row) => [
              left(row.querySelector(".lead")),
              left(row.querySelector(".name")),
            ]),
            ...all(".notice").map((n) => [
              left(n.querySelector(".lead")),
              left(n.querySelector(".body")),
            ]),
          ];
          const list = pop.querySelector(".list") as HTMLElement;
          return {
            leads: [...new Set(rows.map((row) => row[0]))],
            texts: [...new Set(rows.map((row) => row[1]))],
            fits:
              list.scrollHeight <= list.clientHeight &&
              list.scrollWidth <= list.clientWidth,
            fit: `${list.scrollWidth}×${list.scrollHeight} in ${list.clientWidth}×${list.clientHeight}`,
          };
        });
        kit.check(
          `one lead column (${view})`,
          grid.leads.length === 1,
          `x ${grid.leads.join(", ")}`
        );
        kit.check(
          `one text column (${view})`,
          grid.texts.length === 1,
          `x ${grid.texts.join(", ")}`
        );
        kit.check(
          `the list fits, and never scrolls sideways (${view})`,
          grid.fits,
          grid.fit
        );
      }
      // The notes open: Configure on the title's column, one trailing edge still.
      await page.click(".caw-pop .actions .toggle");
      await page.mouse.move(1, 1);
      await page.waitForTimeout(700);
      p = await page.evaluate(panelOf);
      r = await capture(page);
      const cols = p.columns.map((c) => ({
        what: c.what,
        ink:
          inkSpan(
            r,
            {
              left: Math.max(p.list.left, c.box.left - 4),
              right: Math.min(p.list.right, c.box.right + 4),
              top: c.box.top + (c.box.bottom - c.box.top) / 4,
              bottom: c.box.bottom - (c.box.bottom - c.box.top) / 4,
            },
            p.surface,
            false
          )?.left ?? null,
      }));
      const title = cols.find((c) => c.what === "update title")?.ink;
      const configure = cols.find((c) => c.what.startsWith("Configure"))?.ink;
      kit.check(
        `Configure update behaviour on the text column (${at})`,
        typeof title === "number" &&
          typeof configure === "number" &&
          Math.abs(configure - title) <= 1,
        `title ink x ${title?.toFixed(2)}, Configure ink x ${configure?.toFixed(2)}`
      );
      const openInks = trailingInk(r, p);
      kit.check(
        `one trailing edge by ink, notes open (${at})`,
        edge(openInks) <= 1,
        `spread ${edge(openInks).toFixed(2)}px`
      );
      // Scrolled to the notes' middle: Hide changes stays in reach, then folds them.
      await page.evaluate(() => {
        const list = document.querySelector(".caw-pop .list") as HTMLElement;
        const notes = (
          document.querySelector("#update-notes") as HTMLElement
        ).getBoundingClientRect();
        const l = list.getBoundingClientRect();
        list.scrollTop += notes.top + notes.height / 2 - (l.top + l.height / 2);
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
          inside:
            toggle.top >= list.top - 0.5 && toggle.bottom <= list.bottom + 0.5,
          rowPastFoot: row.bottom > list.bottom + 0.5,
          stuck: footer.hasAttribute("data-stuck"),
        };
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
      kit.check(
        `sticky Hide changes (${at})`,
        held.inside &&
          held.stuck === held.rowPastFoot &&
          !folded.open &&
          folded.height === 0,
        `${JSON.stringify(held)} → folded ${JSON.stringify(folded)}`
      );
      await page.close();
    }
  }
}

async function peek(kit: Kit, fleet: KitFleet) {
  const base = await fleet.dashboard();
  // The transcript's permission card, desk and phone.
  for (const view of ["desk", "phone"] as View[]) {
    // biome-ignore lint/performance/noAwaitInLoops: one width at a time
    const page = await kit.page(view);
    await openPanel(page, base);
    await page.click(".caw-pop .row .cover");
    await page.waitForSelector(".choice .approve", { timeout: 60_000 });
    await page.waitForTimeout(600);
    const card = await peersIn(page, "body");
    kit.check(
      `transcript card: apart, untinted, outlined in done and fail inks, labels in ink-strong (${view})`,
      peersRight(card),
      JSON.stringify(card)
    );
    if (view === "desk") {
      await page.hover(".choice .approve");
      await page.waitForTimeout(300);
      const hovered = await peersIn(page, "body");
      kit.check(
        "transcript card: neither peer changes under the pointer (desk)",
        JSON.stringify(hovered?.approve) === JSON.stringify(card?.approve),
        `rest ${JSON.stringify(card?.approve)} → hovered ${JSON.stringify(hovered?.approve)}`
      );
    }
    await page.close();
  }
  // A desk: Peek rises on a row's hover and opens the peek; the panel's Peek; an archivable row.
  {
    const page = await kit.page("desk");
    await open(page, base, ROW_PEEK.replace(" button.peek", ""));
    await page.waitForSelector(ROW_PEEK, {
      state: "attached",
      timeout: 60_000,
    });
    await page.mouse.move(1, 1);
    await page.waitForTimeout(400);
    const rest = await peekButton(page, ROW_PEEK);
    await page.hover(".item[data-peek] > a.row");
    await page.waitForTimeout(400);
    const hovered = await peekButton(page, ROW_PEEK);
    kit.check(
      "row Peek hidden at rest, shown on hover (desk)",
      rest?.opacity === "0" && hovered?.opacity === "1",
      `${rest?.opacity} → ${hovered?.opacity}`
    );
    await page.click(ROW_PEEK);
    await peekShows(kit, page, "row, desk", WORK_TITLE, "step ");
    await openPanel(page, base);
    await page.click(PANEL_PEEK);
    await page.waitForSelector(".peek-sheet .choice .approve", {
      timeout: 60_000,
    });
    await peekShows(kit, page, "panel, desk", "Fix tray chip overflow", ASK);
    const peers = await peersIn(page, ".peek-sheet");
    kit.check(
      "peek's Approve/Deny: apart, untinted, outlined in done and fail inks, one label ink (desk)",
      peersRight(peers),
      JSON.stringify(peers)
    );
    // Caw's panel stays mounted while shut (HangCard), folded up behind its
    // cut: closed is its state, not its absence.
    const panel = await page.evaluate(() =>
      [...document.querySelectorAll(".caw-pop")].map((pop) =>
        pop.getAttribute("data-state")
      )
    );
    kit.check(
      "Peek from the panel closes the panel (desk)",
      panel.every((state) => state === "closed"),
      panel.join(", ") || "no panel"
    );
    await page.hover(".peek-sheet .choice .approve");
    await page.waitForTimeout(300);
    const under = await peersIn(page, ".peek-sheet");
    kit.check(
      "peek's peers: neither changes under the pointer (desk)",
      JSON.stringify(under?.approve) === JSON.stringify(peers?.approve)
    );
    await open(page, base, "[data-needs-caw]");
    await page.getByRole("tab", { name: FINISHED_TAB }).first().click();
    const archivable = ".item[data-archivable][data-peek]";
    await page.waitForSelector(archivable, {
      state: "attached",
      timeout: 120_000,
    });
    await page.hover(`${archivable} > a.row`);
    await page.waitForTimeout(400);
    const pair = await page.evaluate((a) => {
      const item = document.querySelector(a) as Element;
      const one = (s: string) => {
        const e = item.querySelector(s) as Element;
        const r = e.getBoundingClientRect();
        return {
          opacity: getComputedStyle(e).opacity,
          left: r.left,
          right: r.right,
        };
      };
      return { archive: one("button.archive"), peek: one("button.peek") };
    }, archivable);
    kit.check(
      "archivable row: Archive and Peek both on hover, Archive left of Peek (desk)",
      pair.archive.opacity === "1" &&
        pair.peek.opacity === "1" &&
        pair.archive.right < pair.peek.left,
      JSON.stringify(pair)
    );
    await page.close();
  }
  // An iPad: Peek always shown on the row, at the touch size, and opens.
  {
    const page = await kit.page("tablet");
    await open(page, base, "[data-needs-caw]");
    await page.waitForSelector(ROW_PEEK, {
      state: "attached",
      timeout: 60_000,
    });
    await page.waitForTimeout(600);
    const shown = await peekButton(page, ROW_PEEK);
    kit.check(
      "row Peek shown without hover (tablet)",
      shown?.opacity === "1" && shown.display !== "none",
      JSON.stringify(shown)
    );
    kit.check(
      "row Peek's glyph at the touch size, its ink ≥ 3:1 on the row (tablet)",
      shown?.glyph === "20×20" && (shown?.contrast ?? 0) >= 3,
      JSON.stringify(shown)
    );
    await page.tap(ROW_PEEK);
    await peekShows(kit, page, "row, tablet", WORK_TITLE, "step ");
    await page.waitForTimeout(1200);
    kit.check(
      "no tooltip after Peek opens from a row (tablet)",
      (await tooltips(page)) === 0
    );
    await openPanel(page, base);
    const panel = await peekButton(page, PANEL_PEEK);
    kit.check(
      "the panel's Needs-you row offers Peek at the touch size, ≥ 3:1 (tablet)",
      panel?.glyph === "20×20" && (panel?.contrast ?? 0) >= 3,
      JSON.stringify(panel)
    );
    await page.tap(PANEL_PEEK);
    await page.waitForSelector(".peek-sheet .choice .approve", {
      timeout: 60_000,
    });
    await peekShows(kit, page, "panel, tablet", "Fix tray chip overflow", ASK);
    const peers = await peersIn(page, ".peek-sheet");
    kit.check(
      "peek's Approve/Deny: apart, untinted, outlined in done and fail inks, one label ink (tablet)",
      peersRight(peers),
      JSON.stringify(peers)
    );
    await page.waitForTimeout(1200);
    kit.check(
      "no tooltip after Peek opens from the panel (tablet)",
      (await tooltips(page)) === 0
    );
    await page.close();
  }
  // A phone: no Peek anywhere.
  {
    const page = await kit.page("phone");
    await openPanel(page, base);
    const counts = await page.evaluate(() => ({
      asks: document.querySelectorAll(".caw-pop .row").length,
      peeks: document.querySelectorAll("button.peek, [aria-label^='Peek ']")
        .length,
      sheet: document.querySelector(".peek-sheet") !== null,
    }));
    kit.check(
      "no Peek on a phone, rows or panel",
      counts.asks === 1 && counts.peeks === 0 && !counts.sheet,
      JSON.stringify(counts)
    );
    await page.close();
  }
}

const spec: Spec = {
  name: "caw-notices",
  run: async (kit) => {
    const fleet = await kit.fleet(respond);
    const children: Bun.Subprocess[] = [];
    const dirs: string[] = [];
    try {
      const landedAt = await stage(fleet, children, dirs);
      const agents =
        await fleet.api<{ machineId: string; status: string }[]>("/api/agents");
      kit.check(
        "two machines online",
        [MACHINE, SECOND].every((id) =>
          agents.some((row) => row.machineId === id && row.status === "online")
        ),
        agents.map((row) => `${row.machineId} ${row.status}`).join(", ")
      );
      // The fleet's one-time upstream choice (8a732a3a7) is asked in this
      // panel until it is answered; this fleet answers it first, as the
      // owner's has, so the panel holds only what this spec stages.
      const answered = await fetch(`${fleet.base}/api/fleet/choices`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ upstream: false }),
      });
      kit.check(
        "the fleet's upstream choice answered",
        answered.ok,
        `${answered.status}`
      );
      const base = await fleet.dashboard();
      // The update alone: its notes stand open.
      for (const view of ["desk", "phone"] as View[]) {
        // biome-ignore lint/performance/noAwaitInLoops: one width at a time
        const page = await kit.page(view);
        await openPanel(page, base);
        const alone = await page.evaluate(() => {
          const fold = document.querySelector("#update-notes");
          return {
            notices: document.querySelectorAll(".caw-pop .notices > li").length,
            asks: document.querySelectorAll(".caw-pop .row").length,
            rows: [...document.querySelectorAll(".caw-pop .row")].map((row) =>
              (row.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 120)
            ),
            open: fold?.hasAttribute("data-open") ?? false,
            height: Math.round(fold?.getBoundingClientRect().height ?? 0),
          };
        });
        kit.check(
          `open by default when alone (${view})`,
          alone.notices === 1 &&
            alone.asks === 0 &&
            alone.open &&
            alone.height > 0,
          JSON.stringify(alone)
        );
        await page.close();
      }
      // The ask, and the moved logins.
      const askSession = await fleet.spawn(
        "claude",
        "Fix tray chip overflow",
        fleet.workdir,
        { permissionMode: "default" }
      );
      await fleet.send(askSession, `${ASK}: make a file.`);
      await until(
        "the hub parking the Bash permission ask",
        async () => JSON.stringify(await fleet.api<unknown>("/api/pending")),
        (text) => text.includes(askSession),
        180_000
      );
      for (const [n, one] of LOGINS.entries()) {
        fleet.write(
          "UPDATE account_signins SET moved_at = ?, moved_from = ? WHERE account_id = ? AND machine_id = ?",
          Date.now() - n * 60_000,
          one.from,
          one.id,
          MACHINE
        );
      }
      const accounts = await fleet.api<{
        signins: {
          accountId: string;
          machineId: string;
          movedAt: number | null;
        }[];
      }>("/api/accounts");
      const movedIds = accounts.signins
        .filter((one) => one.movedAt !== null && one.machineId === MACHINE)
        .map(
          (one) =>
            `moved-login:${one.accountId}:${one.machineId}:${one.movedAt}`
        );
      kit.check(
        "hub serves five moved logins",
        movedIds.length === 5,
        movedIds.join(", ")
      );
      await widths(kit, fleet);
      // Sessions for the home's lists: one at work, one finished.
      const work = await fleet.spawn("claude", WORK_TITLE, fleet.workdir, {
        permissionMode: "default",
      });
      await fleet.send(work, `${WORK}: keep going.`);
      const done = await fleet.spawn("claude", DONE_TITLE, fleet.workdir, {
        permissionMode: "default",
      });
      await fleet.send(done, "Say done.");
      await peek(kit, fleet);
      // One dismissal, then Clear all, on the hub's record.
      const seenIds = async () =>
        JSON.parse(
          await readFile(
            join(fleet.sandbox, "hub", "notices-seen.json"),
            "utf8"
          ).catch(() => "[]")
        ) as string[];
      const page = await kit.page("desk");
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
      kit.check(
        "dismissing one moved login acknowledges only its id",
        addedOne.length === 1 &&
          !!login &&
          addedOne[0]?.startsWith(`moved-login:${login.id}:${MACHINE}:`) ===
            true,
        `${name}: ${JSON.stringify(addedOne)}`
      );
      await page.waitForTimeout(600);
      const head = (
        await page.locator(".caw-pop .group .head").textContent()
      )?.trim();
      kit.check(
        "the group counts four",
        head === "4 logins moved into CawCo",
        head
      );
      await page.getByRole("button", { name: CLEAR_ALL }).click();
      await until(
        "Clear all on the hub",
        seenIds,
        (ids) => ids.length >= afterOne.length + 5,
        15_000
      );
      const addedAll = (await seenIds()).filter((id) => !afterOne.includes(id));
      const expected = [
        ...movedIds.filter((id) => !addedOne.includes(id)),
        `landed:${MACHINE}:${landedAt}`,
      ];
      kit.check(
        "Clear all acknowledges every notice's id",
        expected.every((id) => addedAll.includes(id)) &&
          addedAll.length === expected.length,
        JSON.stringify(addedAll)
      );
      await page.waitForTimeout(800);
      const left = await page.evaluate(() => ({
        notices: document.querySelector("#caw-notices") !== null,
        asks: document.querySelectorAll(".caw-pop .row").length,
      }));
      kit.check(
        "Notices leaves; the ask stays",
        !left.notices && left.asks === 1,
        JSON.stringify(left)
      );
    } finally {
      for (const child of children.reverse()) {
        // biome-ignore lint/performance/noAwaitInLoops: stopped one at a time, by PID
        await fleet.killTree(child.pid, "SIGTERM");
      }
      for (const dir of dirs) {
        // biome-ignore lint/performance/noAwaitInLoops: one dir at a time
        await rm(dir, { recursive: true, force: true });
      }
    }
  },
};
export default spec;
