/**
 * Every menu and submenu stands whole on the screen and takes a press at
 * every width, and nothing in the New session sheet covers another control.
 * The owner's phone check, quoted: "the Account submenu is placed left of
 * its parent (translate(-216px,-23px), x −43…179 on a 390px viewport) inside
 * the parent's .kit-pop element (overflow hidden auto). It is clipped out of
 * the hit test (elementFromPoint returns HTML) and partly off-screen", and
 * "In the New session sheet, the Effort and Permission chips overlay the
 * selected model row (Haiku 5.5) and cover its text."
 *
 * On a scratch fleet (real hub, agent and sessiond) with two accounts of
 * one provider and one session, on the built dashboard, at the phone
 * (390×844, a finger) and the desk (1440×900, a mouse), each read from the
 * engine:
 *  - the session's tab menu and its sidebar row's menu, each opened as the
 *    hand opens it (a long press, a right click), Account pressed: the
 *    submenu's box lies inside the viewport; the hit test at each item's
 *    centre is that item; every account is a radio item (`menuitemradio`),
 *    exactly one `aria-checked`, the session's current account (by its
 *    label at the hub); a press on the other account starts the move (the
 *    hub's row for the session lands on it);
 *  - New session (Ctrl+Shift+N), a model picked: the chosen row's name and
 *    the Effort and Permission chips share no area; the hit test at each
 *    chip's centre is that chip, and at the name's centre the chosen row.
 *
 *   bun scripts/probe-kit/run.ts web menus-fit
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one hand, one step at a time.
import type { CDPSession, Page } from "playwright-core";
import { ACCOUNT, MACHINE, until } from "../../../scratch-fleet";
import { type Box, overlap } from "../../geom";
import { type Kit, type KitFleet, open, type Spec, settle } from "../../kit";
import { B, furnishAccount } from "../account-move";

const TITLE = "Menu fit";
const OPEN_MENU = "[data-slot='context-menu-content'][data-state='open']";
const OPEN_SUB = "[data-slot='context-menu-sub-content'][data-state='open']";

/** One input: a finger's or a mouse's, each at a point (CDP input), never a retrying click. */
interface Hand {
  /** Opens a context menu: a long press, or a right click. */
  context: (x: number, y: number) => Promise<void>;
  press: (x: number, y: number) => Promise<void>;
}

function handOf(page: Page, cdp: CDPSession, touch: boolean): Hand {
  if (!touch) {
    return {
      press: (x, y) => page.mouse.click(x, y),
      context: (x, y) => page.mouse.click(x, y, { button: "right" }),
    };
  }
  return {
    press: (x, y) => page.touchscreen.tap(x, y),
    // bits-ui opens a context menu after a 700ms press.
    context: async (x, y) => {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x, y }],
      });
      await page.waitForTimeout(900);
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
    },
  };
}

/** The centre of the first drawn element `selector` names. */
async function centre(page: Page, selector: string) {
  const at = await page.evaluate((sel) => {
    const el = [...document.querySelectorAll(sel)].find(
      (one) => one.getBoundingClientRect().width > 0
    );
    const r = el?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  }, selector);
  if (!at) {
    throw new Error(`nothing drawn at ${selector}`);
  }
  return at;
}

const fmt = (b: Box) =>
  `x ${b.left.toFixed(1)}…${b.right.toFixed(1)}, y ${b.top.toFixed(1)}…${b.bottom.toFixed(1)}`;

/**
 * With a menu open: Account pressed, its submenu read (inside the viewport,
 * every item the hit test's at its centre), then the other account pressed
 * and the move seen to start at the hub.
 */
async function account(
  kit: Kit,
  page: Page,
  hand: Hand,
  fleet: KitFleet,
  id: string,
  name: string
) {
  await page.waitForSelector(OPEN_MENU, { timeout: 10_000 });
  await settle(page, 200);
  const trigger = `${OPEN_MENU} [data-slot='context-menu-sub-trigger']`;
  const at = await page.evaluate((sel) => {
    const row = [...document.querySelectorAll(sel)].find((one) =>
      one.textContent?.includes("Account")
    );
    const r = row?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  }, trigger);
  if (!at) {
    kit.check(`${name}: the menu holds Account`, false);
    return;
  }
  await hand.press(at.x, at.y);
  const shown = await page
    .waitForSelector(OPEN_SUB, { timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  if (!shown) {
    kit.check(`${name}: a press on Account opens its submenu`, false);
    return;
  }
  await settle(page, 200);
  const read = await page.evaluate((sel) => {
    const sub = document.querySelector(sel) as HTMLElement;
    const r = sub.getBoundingClientRect();
    const items = [...sub.querySelectorAll("[role='menuitemradio']")].map(
      (item) => {
        const b = item.getBoundingClientRect();
        const x = b.left + b.width / 2;
        const y = b.top + b.height / 2;
        const hit = document.elementFromPoint(x, y);
        return {
          name: (item.textContent ?? "").trim(),
          checked: item.getAttribute("aria-checked") === "true",
          x,
          y,
          hits: Boolean(hit && item.contains(hit)),
          hit: hit ? `${hit.tagName.toLowerCase()}.${hit.className}` : "none",
        };
      }
    );
    return {
      // Items the submenu holds that are not radio items: none, if each is the kit's.
      plain: sub.querySelectorAll("[role='menuitem']").length,
      box: {
        left: r.left,
        top: r.top,
        right: r.right,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
      },
      vw: document.documentElement.clientWidth,
      vh: document.documentElement.clientHeight,
      side: sub.getAttribute("data-side"),
      items,
    };
  }, OPEN_SUB);
  const b = read.box;
  kit.check(
    `${name}: the Account submenu lies inside the viewport`,
    b.left >= 0 && b.top >= 0 && b.right <= read.vw && b.bottom <= read.vh,
    `${fmt(b)} in ${read.vw}×${read.vh}, side ${read.side}`
  );
  kit.check(
    `${name}: the hit test at each item's centre is that item`,
    read.items.length > 0 && read.items.every((item) => item.hits),
    read.items
      .map(
        (item) =>
          `${item.name} at ${item.x.toFixed(0)},${item.y.toFixed(0)} → ${item.hits ? "itself" : item.hit}`
      )
      .join("; ") || "no items"
  );
  const was = accountOf(fleet, id);
  const label = (accountId: string | null) =>
    fleet.query<{ label: string }>(
      "SELECT label FROM accounts WHERE id = ?",
      accountId ?? ""
    )[0]?.label ?? "?";
  const checked = read.items.filter((item) => item.checked);
  kit.check(
    `${name}: every account is a radio item (role menuitemradio), exactly one checked, the session's current account`,
    read.items.length >= 2 &&
      read.plain === 0 &&
      checked.length === 1 &&
      checked[0]?.name === label(was),
    `${read.items.length} radio items, ${read.plain} plain; checked: ${checked.map((item) => item.name).join(", ") || "none"}; the session runs on ${label(was)} (${was})`
  );
  const other = read.items.find((item) => !item.checked);
  const to = was === ACCOUNT ? B : ACCOUNT;
  if (!other) {
    kit.check(`${name}: the submenu offers the other account`, false);
    return;
  }
  await hand.press(other.x, other.y);
  const landed = await until(
    `${name}: the move lands`,
    () => accountOf(fleet, id) ?? "",
    (one) => one === to,
    60_000
  ).catch(() => accountOf(fleet, id));
  kit.check(
    `${name}: a press on ${other.name} starts the move (the hub's row lands on it)`,
    landed === to,
    `${was} → ${landed}`
  );
}

/** Every menu put away (Escape, as many as are open), whatever the round found. */
async function dismiss(page: Page) {
  for (let n = 0; n < 3; n += 1) {
    if ((await page.locator(OPEN_MENU).count()) === 0) {
      break;
    }
    await page.keyboard.press("Escape");
    await page
      .waitForSelector(OPEN_MENU, { state: "detached", timeout: 2000 })
      .catch(() => undefined);
  }
  await settle(page, 200);
}

const accountOf = (fleet: KitFleet, id: string) =>
  fleet.query<{ account_id: string | null }>(
    "SELECT account_id FROM instances WHERE id = ?",
    id
  )[0]?.account_id ?? null;

/** The session's tab menu: a long press on its tab, or a right click. */
async function tabMenu(
  kit: Kit,
  page: Page,
  hand: Hand,
  fleet: KitFleet,
  id: string,
  view: string
) {
  const tab = `.session-tabs [data-session-tab="${id}"]`;
  const at = await centre(page, tab);
  await hand.context(at.x, at.y);
  await account(kit, page, hand, fleet, id, `${view}, tab menu`);
  await dismiss(page);
}

/** The session's sidebar row menu: the rail (a phone's sheet, from the burger), its row long-pressed or right-clicked. */
async function rowMenu(
  kit: Kit,
  page: Page,
  hand: Hand,
  fleet: KitFleet,
  id: string,
  view: string
) {
  if (view === "phone") {
    const burger = await centre(page, ".burger");
    await hand.press(burger.x, burger.y);
    await page.waitForSelector(`.rail-sheet [data-hover-session="${id}"]`);
    await settle(page, 300);
  }
  const row = `${view === "phone" ? ".rail-sheet " : ""}[data-hover-session="${id}"]`;
  await page.locator(row).first().scrollIntoViewIfNeeded();
  const at = await centre(page, row);
  await hand.context(at.x, at.y);
  await account(kit, page, hand, fleet, id, `${view}, sidebar row menu`);
  await dismiss(page);
}

/** New session, a model picked: its chips and its name apart, each the hit test's at its centre. */
async function newSession(kit: Kit, page: Page, hand: Hand, view: string) {
  const name = `${view}, New session`;
  await page.keyboard.press("Control+Shift+N");
  const listed = await page
    .waitForSelector("[role='listbox'] .option [role='option']", {
      timeout: 30_000,
    })
    .then(() => true)
    .catch(() => false);
  if (!listed) {
    kit.check(`${name}: the sheet lists models`, false);
    return;
  }
  await settle(page, 300);
  // The owner's case is Haiku; a catalogue without it picks its second row.
  const pick = await page.evaluate(() => {
    const rows = [
      ...document.querySelectorAll<HTMLElement>(
        "[role='listbox'] .option [role='option']:not([disabled])"
      ),
    ];
    const row =
      rows.find((one) =>
        (one.textContent ?? "").toLowerCase().includes("haiku")
      ) ?? rows[1];
    if (!row) {
      return null;
    }
    row.scrollIntoView({ block: "center" });
    const r = row.getBoundingClientRect();
    return {
      model: row.dataset.model ?? "",
      x: r.left + r.width / 2,
      y: r.top + r.height / 2,
    };
  });
  if (!pick) {
    kit.check(`${name}: a model to pick`, false);
    return;
  }
  await settle(page, 200);
  const again = await centre(
    page,
    `[role='listbox'] [role='option'][data-model="${pick.model}"]`
  );
  await hand.press(again.x, again.y);
  await page.waitForSelector(
    `[role='listbox'] .option:has([data-model="${pick.model}"][aria-selected='true']) .tools .ns-chip-btn`
  );
  await settle(page, 300);
  const read = await page.evaluate((model) => {
    const option = document.querySelector(
      `[role='listbox'] .option:has([data-model="${model}"][aria-selected='true'])`
    ) as HTMLElement;
    const row = option.querySelector("[role='option']") as HTMLElement;
    const text = row.querySelector(".text") as HTMLElement;
    const rect = (el: Element) => {
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
    const nameEl = row.querySelector(".name") as HTMLElement;
    const n = nameEl.getBoundingClientRect();
    const nameHit = document.elementFromPoint(
      n.left + n.width / 2,
      n.top + n.height / 2
    );
    const fill = option.parentElement?.querySelector(".fill");
    return {
      text: rect(text),
      name: rect(nameEl),
      nameShown: nameEl.scrollWidth > 0 && n.width >= 40,
      nameHits: Boolean(nameHit && row.contains(nameHit)),
      nameHit: nameHit
        ? `${nameHit.tagName.toLowerCase()}.${nameHit.className}`
        : "none",
      option: rect(option),
      fill: fill ? rect(fill) : null,
      chips: [...option.querySelectorAll(".tools .ns-chip-btn")].map((chip) => {
        const b = chip.getBoundingClientRect();
        const hit = document.elementFromPoint(
          b.left + b.width / 2,
          b.top + b.height / 2
        );
        return {
          label: (chip.textContent ?? "").trim(),
          box: rect(chip),
          hits: Boolean(hit && chip.contains(hit)),
          hit: hit ? `${hit.tagName.toLowerCase()}.${hit.className}` : "none",
        };
      }),
    };
  }, pick.model);
  const shared = read.chips.map((chip) => overlap(chip.box, read.text));
  kit.check(
    `${name}: the Effort and Permission chips share no area with the chosen row's text (${pick.model})`,
    read.chips.length >= 2 && shared.every((area) => area === 0),
    `text ${fmt(read.text)}; ${read.chips.map((chip, i) => `${chip.label} ${fmt(chip.box)} → ${shared[i]?.toFixed(0)}px²`).join("; ")}`
  );
  kit.check(
    `${name}: the chosen model's name shows (≥ 40px) and the hit test at its centre is its row`,
    read.nameShown && read.nameHits,
    `name ${fmt(read.name)}, hit ${read.nameHits ? "its row" : read.nameHit}`
  );
  kit.check(
    `${name}: the hit test at each chip's centre is that chip`,
    read.chips.every((chip) => chip.hits),
    read.chips
      .map((chip) => `${chip.label} → ${chip.hits ? "itself" : chip.hit}`)
      .join("; ")
  );
  kit.check(
    `${name}: the selection fill covers the chosen option, chips and all`,
    read.fill !== null &&
      Math.abs(read.fill.top - read.option.top) <= 1 &&
      Math.abs(read.fill.bottom - read.option.bottom) <= 1,
    read.fill ? `fill ${fmt(read.fill)}, option ${fmt(read.option)}` : "no fill"
  );
  await page.keyboard.press("Escape");
  await settle(page, 300);
}

const spec: Spec = {
  name: "menus-fit",
  async run(kit) {
    const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["Ready."] }));
    await furnishAccount(fleet.home, B);
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.write(
      "INSERT OR IGNORE INTO accounts (id, provider, kind, label, hue, \"order\", never_backup, created_at) VALUES (?, 'anthropic', 'console', 'Probe B', 'green', 1, 0, ?)",
      B,
      Date.now()
    );
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    await until(
      "account B signed in",
      () =>
        fleet.query<{ state: string }>(
          "SELECT state FROM account_signins WHERE account_id = ?",
          B
        )[0],
      (row) => row?.state === "signed-in"
    );
    // In a project, so the sidebar lists its row.
    const project = await fleet.api<{ id: string }>("/api/projects", {
      name: "Menus",
      machineId: MACHINE,
      cwd: fleet.repo,
      caw: false,
    });
    const id = await fleet.spawn("claude", TITLE, fleet.repo, {
      projectId: project.id,
    });
    await until(
      "the session placed on an account",
      () => accountOf(fleet, id) ?? "",
      (one) => one === ACCOUNT || one === B
    );
    const base = await fleet.dashboard();
    for (const view of ["phone", "desk"] as const) {
      const page = await kit.page(view);
      page.setDefaultTimeout(60_000);
      const ws = {
        v: 1,
        root: { t: "l", id: "probe-leaf", tabs: [id], active: id },
        focusedLeaf: "probe-leaf",
        ctx: {},
      };
      await page.context().addCookies([
        {
          name: "cawco-workspace",
          value: encodeURIComponent(JSON.stringify(ws)),
          url: base,
        },
      ]);
      await page.context().addInitScript((w) => {
        localStorage.setItem("cawco-workspace", JSON.stringify(w));
      }, ws);
      await open(
        page,
        `${base}/session/${id}`,
        `.session-tabs [data-session-tab="${id}"]`
      );
      await settle(page, 600);
      const hand = handOf(
        page,
        await page.context().newCDPSession(page),
        view === "phone"
      );
      await tabMenu(kit, page, hand, fleet, id, view);
      await rowMenu(kit, page, hand, fleet, id, view);
      await open(
        page,
        `${base}/session/${id}`,
        `.session-tabs [data-session-tab="${id}"]`
      );
      await settle(page, 600);
      await newSession(kit, page, hand, view);
      await page.close();
    }
  },
};
export default spec;
