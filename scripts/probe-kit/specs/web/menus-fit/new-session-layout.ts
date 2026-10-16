/**
 * The New session dialog shows itself whole at every desktop viewport, and
 * opening a chip's menu moves nothing else in it. The owner, on a MacBook in
 * Chrome (about 1055×567 at DPR 2): "there's a regression in the new session
 * modal on my macbook chrome browser, it doesn't show the whole modal and
 * clicking the effort chip scales down the whole model/harness selector,
 * weird..."
 *
 * The dashboard he had open had loaded Config before: Config's PickerChip
 * styled the bare `.picker` class globally, and the dialog's model panel is
 * ModelSection's `.picker`. So each size here opens the built dashboard on
 * Config's skills page (which draws PickerChip) and starts New session from
 * there with Ctrl+Shift+N, on menus-fit's scratch fleet (real hub, agent and
 * sessiond, two Claude accounts, the fleet this part once stood up for
 * itself), at 1055×567, 1280×720 and 1440×900, DPR 2. Read from the engine:
 *  - the card's box lies inside the viewport, and the head and Start stand
 *    whole in it;
 *  - the prompt and model sections are reachable: in the body's scrollport,
 *    or within the scroll range of a body that scrolls; and a body that
 *    scrolls says so on the edge it has more behind (the house edge fade,
 *    `.kit-edge-fade-block`: its computed --fade-end is the fade's length at
 *    the top, its --fade-start at the bottom), where a body that fits fades
 *    neither edge;
 *  - the model panel is as tall as its column, and the harness rail's top
 *    is that column's top (search and list);
 *  - wheeled to its foot, a body that scrolls fades only its top;
 *  - the owner's path: a model the fleet's catalog gives an effort scale
 *    picked (found by that capability, from the feeds the dialog reads; the
 *    effort chip draws only for such a model), then each chip (effort, permission, account, location) brought into the
 *    body's view, pressed and held (long enough for a press transition to
 *    land), then let go so its menu opens: while held and once open, every
 *    box of the model section, its panel, the rail, the search, the list, the
 *    chosen row, the head, the prompt and Start is where it was (±0.5px), no
 *    frame from the press to the menu landing drew the panel elsewhere, the
 *    body's scroll is unchanged, and no ancestor of the rail has a
 *    transform, scale, zoom or running animation (the body's scroll-driven
 *    edge fade aside, which runs on its scroll, not on time).
 *
 *   bun scripts/probe-kit/run.ts web menus-fit
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one viewport, one step at a time.
import type { Page } from "playwright-core";
import { EFFORT_LEVELS } from "../../../../../packages/core/src/harness";
import type { Box } from "../../../geom";
import { type Kit, open, settle } from "../../../kit";

const CARD = ".session-card[data-ns-dialog]";
/** Every chip whose menu must move nothing: the chosen model's two, the model heading's account (the fleet signs two in), the composer's location. */
const CHIPS = [
  { label: "effort", sel: `${CARD} .tools button[id$='-effort']` },
  { label: "permission", sel: `${CARD} .tools button[id$='-permission']` },
  { label: "account", sel: `${CARD} section.model button[id$='-account']` },
  { label: "location", sel: `${CARD} #session-location` },
] as const;
type Chip = (typeof CHIPS)[number];
const SIZES = [
  { width: 1055, height: 567 },
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
] as const;
type Size = (typeof SIZES)[number];
/** Long enough for a press's transform transition (--dur-toggle) to land. */
const HOLD_MS = 300;

/** The boxes that must not move when a chip is pressed or its menu opens. */
const STILL = {
  section: `${CARD} section.model`,
  picker: `${CARD} section.model .picker`,
  rail: `${CARD} .harness-rail`,
  pick: `${CARD} .pick`,
  search: `${CARD} .search`,
  list: `${CARD} [role='listbox']`,
  chosen: `${CARD} [role='listbox'] [role='option'][aria-selected='true']`,
  head: `${CARD} .head`,
  prompt: `${CARD} .prompt-sec`,
  footer: `${CARD} #session-start`,
} as const;
type Key = keyof typeof STILL;

interface Read {
  body: {
    bottom: number;
    clientHeight: number;
    fadeEnd: string;
    fadeStart: string;
    overflowY: string;
    scrollHeight: number;
    scrollTop: number;
    top: number;
  };
  boxes: Record<Key, Box | null>;
  card: Box;
  /** Ancestors of the rail with a transform, scale, zoom or a running time-based animation. */
  moved: string[];
  vh: number;
  vw: number;
}

function read(page: Page): Promise<Read> {
  return page.evaluate(
    ({ card, still }) => {
      const rect = (el: Element | null) => {
        if (!el) {
          return null;
        }
        const r = el.getBoundingClientRect();
        return {
          left: r.left,
          top: r.top,
          right: r.right,
          bottom: r.bottom,
          width: r.width,
          height: r.height,
        };
      };
      const boxes = Object.fromEntries(
        Object.entries(still).map(([key, sel]) => [
          key,
          rect(document.querySelector(sel)),
        ])
      );
      const moved: string[] = [];
      for (
        let at: Element | null = document.querySelector(still.rail);
        at;
        at = at.parentElement
      ) {
        const style = getComputedStyle(at);
        const name = `${at.tagName.toLowerCase()}.${String(at.className).split(" ").slice(0, 2).join(".")}`;
        // An animation's `both` fill at its end draws the identity matrix.
        if (
          style.transform !== "none" &&
          style.transform !== "matrix(1, 0, 0, 1, 0, 0)"
        ) {
          moved.push(`${name} transform ${style.transform}`);
        }
        if (style.scale !== "none") {
          moved.push(`${name} scale ${style.scale}`);
        }
        if (style.zoom !== "1") {
          moved.push(`${name} zoom ${style.zoom}`);
        }
        const runs = at
          .getAnimations()
          .filter(
            (run) =>
              run.playState === "running" &&
              run.timeline instanceof DocumentTimeline
          );
        if (runs.length > 0) {
          moved.push(
            `${name} running ${runs.map((run) => (run as CSSAnimation).animationName ?? run.id).join(",")}`
          );
        }
      }
      const body = document.querySelector(`${card} .body`) as HTMLElement;
      const b = body.getBoundingClientRect();
      const bs = getComputedStyle(body);
      return {
        moved,
        boxes,
        card: rect(document.querySelector(card)),
        body: {
          clientHeight: body.clientHeight,
          scrollHeight: body.scrollHeight,
          scrollTop: body.scrollTop,
          overflowY: bs.overflowY,
          fadeStart: bs.getPropertyValue("--fade-start").trim(),
          fadeEnd: bs.getPropertyValue("--fade-end").trim(),
          top: b.top,
          bottom: b.bottom,
        },
        vw: document.documentElement.clientWidth,
        vh: document.documentElement.clientHeight,
      } as Read;
    },
    { card: CARD, still: STILL }
  );
}

const fmt = (b: Box | null) =>
  b
    ? `x ${b.left.toFixed(1)}…${b.right.toFixed(1)}, y ${b.top.toFixed(1)}…${b.bottom.toFixed(1)}`
    : "none";

const same = (a: Box | null, b: Box | null) =>
  Boolean(
    a &&
    b &&
    (["left", "top", "right", "bottom"] as const).every(
      (side) => Math.abs(a[side] - b[side]) <= 0.5
    )
  );

/** The keys whose boxes moved between two reads. */
const shifted = (from: Read, to: Read) =>
  (Object.keys(STILL) as Key[]).filter(
    (key) => !same(from.boxes[key], to.boxes[key])
  );

const scrolls = (body: Read["body"]) =>
  body.scrollHeight > body.clientHeight + 0.5 &&
  (body.overflowY === "auto" || body.overflowY === "scroll");

/** Config's skills page, which draws PickerChip, then New session from there. */
async function openDialog(kit: Kit, page: Page, base: string, name: string) {
  await open(page, `${base}/config/skills`, "main");
  await settle(page, 600);
  const chip = await page.evaluate(() => {
    const walk = (rules: CSSRuleList): string[] =>
      [...rules].flatMap((rule) => [
        ...(rule instanceof CSSStyleRule &&
        rule.selectorText.includes("picker") &&
        rule.selectorText.includes(":active")
          ? [rule.selectorText]
          : []),
        ...("cssRules" in rule ? walk((rule as CSSGroupingRule).cssRules) : []),
      ]);
    return [...document.styleSheets].flatMap((sheet) => walk(sheet.cssRules));
  });
  kit.check(
    `${name}: Config's PickerChip styles are on the page before New session opens (its press rule)`,
    chip.length > 0,
    chip.join(", ") || "none"
  );
  // The shortcut is the app's once it has hydrated: pressed until the card opens.
  for (let tries = 0; tries < 20 && !(await page.$(CARD)); tries += 1) {
    await page.keyboard.press("Control+Shift+N");
    await page.waitForSelector(CARD, { timeout: 3000 }).catch(() => undefined);
  }
  const listed = await page
    .waitForSelector(
      `${CARD} [role='listbox'] .option [role='option'][aria-selected='true']`,
      { timeout: 30_000 }
    )
    .then(() => true)
    .catch(() => false);
  kit.check(`${name}: the dialog opens and lists models, one chosen`, listed);
  if (listed) {
    await settle(page, 600);
  }
  return listed;
}

function whole(kit: Kit, name: string, rest: Read) {
  const c = rest.card;
  kit.check(
    `${name}: the dialog lies inside the viewport`,
    c.left >= 0 && c.top >= 0 && c.right <= rest.vw && c.bottom <= rest.vh,
    `${fmt(c)} in ${rest.vw}×${rest.vh}`
  );
  const within = (b: Box | null) =>
    Boolean(b && b.top >= c.top - 0.5 && b.bottom <= c.bottom + 0.5);
  kit.check(
    `${name}: the head and Start stand whole inside the card`,
    within(rest.boxes.head) && within(rest.boxes.footer),
    `head ${fmt(rest.boxes.head)}, Start ${fmt(rest.boxes.footer)}, card ${fmt(c)}`
  );
  const { body } = rest;
  // In the body's content, from its top: reachable when it is in view, or
  // within the scroll range of a body that scrolls.
  const reachable = (b: Box | null) => {
    if (!b) {
      return false;
    }
    if (b.top >= body.top - 0.5 && b.bottom <= body.bottom + 0.5) {
      return true;
    }
    const top = b.top - body.top + body.scrollTop;
    return (
      scrolls(body) && top >= -0.5 && top + b.height <= body.scrollHeight + 0.5
    );
  };
  kit.check(
    `${name}: the prompt and the model sections are reachable in the body (in view, or in its scroll range)`,
    reachable(rest.boxes.prompt) && reachable(rest.boxes.section),
    `prompt ${fmt(rest.boxes.prompt)}, model ${fmt(rest.boxes.section)}, body y ${body.top.toFixed(1)}…${body.bottom.toFixed(1)}, scroll ${body.scrollTop}/${body.scrollHeight - body.clientHeight} (${body.overflowY})`
  );
  kit.check(
    `${name}: the body opens at its top, the prompt's head in view`,
    body.scrollTop === 0 &&
      Boolean(rest.boxes.prompt && rest.boxes.prompt.top >= body.top),
    `scrollTop ${body.scrollTop}, prompt top ${rest.boxes.prompt?.top.toFixed(1)}, body top ${body.top.toFixed(1)}`
  );
  kit.check(
    scrolls(body)
      ? `${name}: the body scrolls, and at its top fades only its foot (--fade-start 0px, --fade-end > 0)`
      : `${name}: the body fits, and fades neither edge`,
    scrolls(body)
      ? body.fadeStart === "0px" && Number.parseFloat(body.fadeEnd) > 0
      : body.fadeStart === "0px" && body.fadeEnd === "0px",
    `--fade-start ${body.fadeStart}, --fade-end ${body.fadeEnd}`
  );
  const { picker, pick, rail } = rest.boxes;
  kit.check(
    `${name}: the model panel is as tall as its column, and the harness rail's top is the column's top`,
    Boolean(
      picker &&
      pick &&
      rail &&
      pick.bottom <= picker.bottom + 0.5 &&
      Math.abs(rail.top - pick.top) <= 0.5
    ),
    `panel ${fmt(picker)}, rail ${fmt(rail)}, column ${fmt(pick)}`
  );
  kit.check(
    `${name}: at rest nothing around the rail is transformed or animating`,
    rest.moved.length === 0,
    rest.moved.join("; ") || "none"
  );
}

/** The body wheeled down as the hand does it: at its foot it fades only its top. */
async function wheelDown(kit: Kit, page: Page, name: string) {
  const bb = await (await page.$(`${CARD} .body`))?.boundingBox();
  if (!bb) {
    kit.check(`${name}: the body is drawn`, false);
    return;
  }
  await page.mouse.move(bb.x + bb.width / 2, bb.y + 20);
  await page.mouse.wheel(0, 1000);
  await settle(page, 300);
  const at = await read(page);
  if (scrolls(at.body)) {
    const end =
      at.body.scrollTop >= at.body.scrollHeight - at.body.clientHeight - 1;
    kit.check(
      `${name}: wheeled to its foot, the body fades only its top (--fade-start > 0, --fade-end 0px)`,
      end &&
        Number.parseFloat(at.body.fadeStart) > 0 &&
        at.body.fadeEnd === "0px",
      `scroll ${at.body.scrollTop}/${at.body.scrollHeight - at.body.clientHeight}, --fade-start ${at.body.fadeStart}, --fade-end ${at.body.fadeEnd}`
    );
  }
}

/**
 * The Claude models New session gives an effort picker, read from the feeds
 * the dialog reads (`/api/agents` for each machine's harness report,
 * `/api/accounts` for each signed-in account's catalog). The dialog draws the
 * `-effort` chip only when ToolChips' `effortPicker` holds,
 * `!(readonly || effortOff) && tools.efforts.length > 0`, and NewSessionDialog
 * fills `efforts` with the EFFORT_LEVELS stops where
 * `report?.capabilities.effort === true && (selected?.effort.includes(stop.value) ?? false)`,
 * `selected.effort` being every `supportedEffortLevels` of the model's rows
 * (model-entries.ts). So a model qualifies when every machine's Claude report
 * says `capabilities.effort`, and its rows carry a level: on a machine's
 * report, or in every signed-in Claude account's catalog (the dialog offers
 * the catalog of whichever account placement picks).
 */
function effortModels(
  page: Page
): Promise<{ capable: boolean; detail: string; ids: string[] }> {
  return page.evaluate(async (levels) => {
    interface Row {
      resolvedModel?: string;
      supportedEffortLevels?: string[];
      value: string;
    }
    interface Report {
      capabilities?: { effort?: boolean };
      harness: string;
      models?: Row[];
    }
    const get = async <T>(path: string): Promise<T> =>
      (await fetch(path)).json() as Promise<T>;
    const [agents, view] = await Promise.all([
      get<{ harnesses?: Report[] }[]>("/api/agents"),
      get<{
        accounts: { id: string; provider: string }[];
        catalogs: { accountId: string; models?: Row[] }[];
        signins: { accountId: string; state: string }[];
      }>("/api/accounts"),
    ]);
    const takes = (rows: Row[] = []) =>
      new Set(
        rows
          .filter((row) =>
            (row.supportedEffortLevels ?? []).some((level) =>
              levels.includes(level)
            )
          )
          .map((row) => row.resolvedModel ?? row.value)
      );
    const reports = agents.flatMap((agent) =>
      (agent.harnesses ?? []).filter((one) => one.harness === "claude")
    );
    const capable =
      reports.length > 0 &&
      reports.every((one) => one.capabilities?.effort === true);
    const onMachine = takes(reports.flatMap((one) => one.models ?? []));
    const claude = new Set(
      view.accounts
        .filter((one) => one.provider === "anthropic")
        .map((one) => one.id)
    );
    const signed = [
      ...new Set(
        view.signins
          .filter(
            (one) => one.state === "signed-in" && claude.has(one.accountId)
          )
          .map((one) => one.accountId)
      ),
    ];
    const perAccount = signed.map((id) =>
      takes(view.catalogs.find((one) => one.accountId === id)?.models)
    );
    const inEvery = perAccount.length
      ? [...perAccount[0]].filter((id) =>
          perAccount.every((set) => set.has(id))
        )
      : [];
    const ids = [...new Set([...onMachine, ...inEvery])];
    return {
      capable,
      ids,
      detail: `claude reports effort: ${reports.map((one) => String(one.capabilities?.effort)).join(",") || "none"}; with levels on a machine: ${[...onMachine].join(",") || "none"}; in all ${signed.length} signed-in accounts' catalogs: ${inEvery.join(",") || "none"}`,
    };
  }, EFFORT_LEVELS as string[]);
}

/**
 * The owner's path: a model with an effort scale picked by a press on its
 * row (the lowest such row other than the chosen one, else the chosen one),
 * so the chosen row draws all its chips.
 */
async function pickEffortModel(kit: Kit, page: Page, name: string) {
  const effort = await effortModels(page);
  kit.check(
    `${name}: the fleet's catalog offers a Claude model that takes effort`,
    effort.capable && effort.ids.length > 0,
    effort.detail
  );
  const target = await page.evaluate(
    ({ card, ids }) => {
      const rows = [
        ...document.querySelectorAll<HTMLElement>(
          `${card} [role='listbox'] .option [role='option']:not([disabled])`
        ),
      ].filter((one) => ids.includes(one.dataset.model ?? ""));
      const row =
        rows
          .filter((one) => one.getAttribute("aria-selected") !== "true")
          .at(-1) ?? rows.at(-1);
      if (!row) {
        return null;
      }
      row.scrollIntoView({ block: "nearest" });
      const r = row.getBoundingClientRect();
      return {
        model: row.dataset.model ?? "",
        x: r.left + r.width / 3,
        y: r.top + r.height / 2,
      };
    },
    { card: CARD, ids: effort.ids }
  );
  if (!target) {
    kit.check(
      `${name}: the list draws a model that takes effort`,
      false,
      effort.ids.join(",") || "none"
    );
    return;
  }
  await settle(page, 300);
  await page.mouse.click(target.x, target.y);
  const picked = await page
    .waitForSelector(
      `${CARD} [role='option'][data-model="${target.model}"][aria-selected='true']`,
      { timeout: 5000 }
    )
    .then(() => true)
    .catch(() => false);
  kit.check(
    `${name}: a press on ${target.model}, a model that takes effort, picks it`,
    picked
  );
  await settle(page, 600);
}

/** A chip pressed and held, then let go: nothing else in the dialog moves. */
async function chipStill(kit: Kit, page: Page, at: string, chip: Chip) {
  const name = `${at}, ${chip.label} chip`;
  const el = await page.$(chip.sel);
  if (!el) {
    kit.check(`${name}: drawn`, false);
    return;
  }
  // In the body's view first, as a hand reaches it (a scroll closes menus,
  // so it comes before the reading every later one is held against).
  await el.evaluate((one) => one.scrollIntoView({ block: "nearest" }));
  await settle(page, 300);
  const rest = await read(page);
  const eb = await el.boundingBox();
  if (!eb) {
    kit.check(`${name}: drawn`, false);
    return;
  }
  // Every frame from the press until the menu has settled: a transient
  // scale would be gone by the time it lands.
  await page.evaluate((sel) => {
    const w = window as unknown as {
      probeFrames: string[];
      probeStop: boolean;
    };
    w.probeFrames = [];
    w.probeStop = false;
    const first = document.querySelector(sel)?.getBoundingClientRect();
    const tick = () => {
      const r = document.querySelector(sel)?.getBoundingClientRect();
      if (
        first &&
        r &&
        (Math.abs(r.width - first.width) > 0.5 ||
          Math.abs(r.height - first.height) > 0.5 ||
          Math.abs(r.top - first.top) > 0.5 ||
          Math.abs(r.left - first.left) > 0.5)
      ) {
        w.probeFrames.push(
          `${r.left.toFixed(1)},${r.top.toFixed(1)} ${r.width.toFixed(1)}×${r.height.toFixed(1)}`
        );
      }
      if (!w.probeStop) {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  }, STILL.picker);
  await page.mouse.move(eb.x + eb.width / 2, eb.y + eb.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(HOLD_MS);
  const held = await read(page);
  await page.mouse.up();
  const opened = await page
    .waitForSelector(".ns-pop[data-state='open']", { timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  kit.check(`${name}: a press opens its menu`, opened);
  await settle(page, 400);
  const frames = await page.evaluate(() => {
    const w = window as unknown as {
      probeFrames: string[];
      probeStop: boolean;
    };
    w.probeStop = true;
    return w.probeFrames;
  });
  const after = await read(page);
  for (const [when, now] of [
    ["while held", held],
    ["with its menu open", after],
  ] as const) {
    const moved = shifted(rest, now);
    kit.check(
      `${name}: ${when}, the model section, panel, rail, search, list, chosen row, head, prompt and Start are where they were (±0.5px)`,
      moved.length === 0 && same(rest.card, now.card),
      moved
        .map((key) => `${key} ${fmt(rest.boxes[key])} → ${fmt(now.boxes[key])}`)
        .join("; ") || `card ${fmt(rest.card)} → ${fmt(now.card)}`
    );
    kit.check(
      `${name}: ${when}, no ancestor of the rail is transformed, scaled or animating`,
      now.moved.length === 0,
      now.moved.join("; ") || "none"
    );
  }
  kit.check(
    `${name}: no frame from the press to the menu landing drew the panel at another size or place`,
    frames.length === 0,
    frames.slice(0, 6).join("; ") || "none"
  );
  kit.check(
    `${name}: the body's scroll is where it was`,
    after.body.scrollTop === rest.body.scrollTop,
    `${rest.body.scrollTop} → ${after.body.scrollTop}`
  );
  await page.keyboard.press("Escape");
  await page
    .waitForSelector(".ns-pop", { state: "detached", timeout: 3000 })
    .catch(() => undefined);
  await settle(page, 300);
}

async function size(kit: Kit, page: Page, base: string, at: Size) {
  const name = `${at.width}×${at.height}`;
  await page.setViewportSize(at);
  if (!(await openDialog(kit, page, base, name))) {
    return;
  }
  whole(kit, name, await read(page));
  await wheelDown(kit, page, name);
  await pickEffortModel(kit, page, name);
  for (const chip of CHIPS) {
    await chipStill(kit, page, name, chip);
  }
}

/**
 * The New session dialog at each desktop size, on the built dashboard at
 * `base`, served against a fleet with two accounts signed in (the model
 * heading draws its account chip only then).
 */
export async function newSessionLayout(kit: Kit, base: string): Promise<void> {
  const page = await kit.page("desk");
  page.setDefaultTimeout(60_000);
  for (const at of SIZES) {
    await size(kit, page, base, at);
  }
  await page.close();
}
