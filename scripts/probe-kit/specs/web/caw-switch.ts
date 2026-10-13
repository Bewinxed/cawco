/**
 * Switching the glass's card into Caw's panel (GlassCard) from another of
 * its cards, on the glass bench (/motion/echo, no hub), desk, light. Owner:
 * "if i'm in another panel then switch to caw's panel, during the transition
 * the rows jump to half height then back, including their dismiss buttons
 * x".
 *
 * The panel's notices are the live feed's own (caw-feed `liveFeed`), seeded
 * through the dev store (`__cawcoDebug`) and the notices module the page
 * itself runs: a machine, five accounts whose logins were moved in on it,
 * and the hub's notices record, adopted empty. Opened once and settled, each
 * notice row (NoticeRow `.notice`) and its ✕ are read at rest. Then from the
 * machines, and from Jump, a press on Caw is caught on the clock (anim.ts)
 * and every run is sought to 0, 0.1 … 1 of it: at every fraction each row
 * and each ✕ reads its settled height and its settled trailing edge
 * (getBoundingClientRect, within 0.5px), and the face leaving keeps the
 * trailing edge it stood on: the card's leading edge and its foot move,
 * what is in it does not.
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one switch, one fraction at a time.
import type { Page } from "playwright-core";
import { Clock } from "../../anim";
import { r2 } from "../../geom";
import { type Kit, open, type Spec, settle } from "../../kit";

const ROUTE = "/motion/echo";
const CARD = ".kit-pop.kit-hang.glass-card";
const ROWS = `${CARD} .glass-face[data-face="caw"] .notice`;
const FRACTIONS = Array.from({ length: 11 }, (_, k) => k / 10);
const MACHINE = "probe-machine";
const LOGINS = ["design", "ops", "marketing", "studio", "rand"];

/** A machine, five accounts moved in on it, and the notices record: the panel's notices. */
async function seed(page: Page) {
  await page.evaluate(
    async ({ machine, logins }) => {
      const debug = (
        globalThis as unknown as {
          __cawcoDebug: { state: Record<string, unknown> };
        }
      ).__cawcoDebug;
      const now = Date.now();
      debug.state.machines = [
        {
          auth: "unknown",
          hostname: "studio.local",
          lastSeenAt: now,
          machineId: machine,
          os: "linux",
          status: "online",
        },
      ];
      debug.state.accounts = {
        accounts: logins.map((name, order) => ({
          createdAt: now,
          email: `${name}@petralab.test`,
          hue: "blue",
          id: `acct-${name}`,
          identity: {
            email: `${name}@petralab.test`,
            organization: "Petra Lab",
          },
          kind: "console",
          label: null,
          neverBackup: false,
          order: order + 1,
          provider: "anthropic",
          reservePct: null,
        })),
        bench: [],
        catalogs: [],
        readings: [],
        rebalances: [],
        routing: [],
        signins: logins.map((name, n) => ({
          accountId: `acct-${name}`,
          checkedAt: now,
          machineId: machine,
          movedAt: now - n * 60_000,
          movedFrom: "claude",
          reason: null,
          state: "signed-in",
        })),
      };
      // The module the page runs, as Vite serves it: the same instance.
      const served = "/src/lib/cawco/notices.svelte.ts";
      const { notices } = (await import(/* @vite-ignore */ served)) as {
        notices: { adopt: (ids: string[]) => void };
      };
      notices.adopt([]);
    },
    { machine: MACHINE, logins: LOGINS }
  );
}

/** A box's height and its trailing edge's x. */
interface Read {
  h: number;
  right: number;
}

/** Each notice row and each ✕, in the order they stand. */
const heights = (page: Page) =>
  page.evaluate((sel) => {
    const read = (el: Element | null) => {
      const box = el?.getBoundingClientRect();
      return { h: box?.height ?? -1, right: box?.right ?? -1 };
    };
    const rows = [...document.querySelectorAll<HTMLElement>(sel)];
    return {
      rows: rows.map((row) => read(row)),
      xs: rows.map((row) => read(row.querySelector(":scope > .end .x"))),
    };
  }, ROWS);
type Heights = Awaited<ReturnType<typeof heights>>;

/** Every height, and every trailing edge, off its settled one by more than half a pixel. */
function off(settled: Heights, at: number, now: Heights): string[] {
  if (now.rows.length !== settled.rows.length) {
    return [`${at}: ${now.rows.length} rows, not ${settled.rows.length}`];
  }
  const each = (what: string, list: Read[], was: Read[]) =>
    list.flatMap((one, k) => {
      const then = was[k] ?? { h: 0, right: 0 };
      const out: string[] = [];
      if (Math.abs(one.h - then.h) > 0.5) {
        out.push(`${at}: ${what} ${k} height ${r2(one.h)} not ${r2(then.h)}`);
      }
      if (Math.abs(one.right - then.right) > 0.5) {
        out.push(
          `${at}: ${what} ${k} right ${r2(one.right)} not ${r2(then.right)}`
        );
      }
      return out;
    });
  return [
    ...each("row", now.rows, settled.rows),
    ...each("✕", now.xs, settled.xs),
  ];
}
const heightsOf = (list: Read[]) => list.map((one) => r2(one.h)).join("/");

/** A face's trailing edge's x while it is in the card; null once it is gone. */
const faceRight = (page: Page, face: string) =>
  page.evaluate(
    ({ card, name }) =>
      document
        .querySelector(`${card} .glass-face[data-face="${name}"]`)
        ?.getBoundingClientRect().right ?? null,
    { card: CARD, name: face }
  );

/**
 * The cards a switch into Caw's panel comes from, and how each is opened:
 * on the desk by its own item; on the phone, whose machines are in its
 * sidebar, Jump from the keyboard.
 */
const FROMS: Record<
  "desk" | "phone",
  { face: string; name: string; open: (page: Page) => Promise<void> }[]
> = {
  desk: [
    {
      name: "the machines",
      face: "machines",
      open: (page) => page.click(".bar-item.machines"),
    },
    {
      name: "Jump",
      face: "jump",
      open: (page) => page.click("[data-share='jump']"),
    },
  ],
  phone: [
    {
      name: "Jump",
      face: "jump",
      open: (page) => page.keyboard.press("Control+k"),
    },
  ],
};

async function readAt(kit: Kit, view: "desk" | "phone") {
  const page = await kit.page(view);
  await open(page, `${await kit.bench()}${ROUTE}`, "[data-needs-caw]", 120_000);
  await settle(page, 400);
  // The card's unseen first open, placed and shut.
  await page.waitForTimeout(800);
  await seed(page);
  await page.click("[data-needs-caw]");
  await page.waitForSelector(ROWS, { timeout: 30_000 });
  await settle(page, 400);
  const settled = await heights(page);
  kit.check(
    `${view}: Caw's panel lists the seeded notices, each with its ✕`,
    settled.rows.length >= 2 && settled.xs.every((x) => x.h > 0),
    `rows ${heightsOf(settled.rows)}; ✕ ${heightsOf(settled.xs)}`
  );

  const clock = await Clock.on(page);
  for (const { face, open: opener, name: from } of FROMS[view]) {
    const name = `${view}, ${from}`;
    await opener(page);
    await settle(page, 400);
    const standing = await faceRight(page, face);
    const runs = await clock.catchRuns(
      () => page.click("[data-needs-caw]"),
      CARD
    );
    // The switch's own motion is caught: the card's box tween among them.
    const tween = await page.evaluate(
      (card) =>
        document
          .querySelector(card)
          ?.getAnimations()
          .some((one) =>
            (one.effect as KeyframeEffect)
              .getKeyframes()
              .some((frame) => "width" in frame && "height" in frame)
          ) ?? false,
      CARD
    );
    const faults: string[] = [];
    const seen: string[] = [];
    const leaving: string[] = [];
    for (const at of FRACTIONS) {
      await clock.seek(at);
      const now = await heights(page);
      faults.push(...off(settled, at, now));
      seen.push(`${at}: ${heightsOf(now.rows)} ✕ ${heightsOf(now.xs)}`);
      const right = await faceRight(page, face);
      if (right !== null && Math.abs(right - (standing ?? 0)) > 0.5) {
        leaving.push(`${at}: right ${r2(right)} not ${r2(standing ?? 0)}`);
      }
    }
    await clock.release();
    await settle(page, 400);
    kit.check(
      `from ${name} into Caw's panel: every row and ✕ at its settled height and trailing edge at every fraction`,
      tween && faults.length === 0,
      faults.length > 0
        ? `${faults.slice(0, 12).join("; ")} | ${seen.slice(0, 3).join(" | ")}`
        : `${runs.length} runs, the box tween ${tween ? "among them" : "not caught"}, ${FRACTIONS.length} fractions`
    );
    kit.check(
      `from ${name} into Caw's panel: the ${face} face leaves from its own trailing edge, never sliding`,
      standing !== null && leaving.length === 0,
      leaving.slice(0, 6).join("; ") || `right ${r2(standing ?? 0)} held`
    );
  }
  await page.close();
}

const spec: Spec = {
  name: "caw-switch",
  run: async (kit) => {
    await readAt(kit, "desk");
    await readAt(kit, "phone");
  },
};
export default spec;
