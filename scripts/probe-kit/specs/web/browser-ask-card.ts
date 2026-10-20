/**
 * A browser ask's card (Projects spec §5.11, item 3) and its row in Needs
 * you. A scratch fleet gives the page a real session and board; the hub's
 * `/api/pending` is answered by the page's own route with a browser ask for
 * that session (core `BrowserAskFrame`), a short reason and a long one. At
 * 390, 680 and 1440, on the session's composer:
 *
 * - the title "Browser ask from <asker>", the reason as a question's
 *   text (the body's weight, not the summary's), the origin alone on its
 *   line in code type, each label on one line (broken only after its
 *   dots), and the one consequence
 *   line in the permission card's detail slot;
 * - Take over and Deny at the row's two ends, at least 44px apart and never
 *   less than `--space-8`, their fills computed equal, each in its own
 *   outline tint;
 * - "Other" is the question card's chip: choosing it opens the line beside
 *   it ("Your answer…", named "Your answer to: <reason>"), the card keeps its
 *   height and the peers' rects are the same before and after; Deny goes
 *   out on the socket as a deny carrying the line's words;
 * - Take over posts `/api/browsers/<key>/takeover` with the ask's request
 *   id and machine; while it is out the button reads "Taking over…"; a
 *   refusal reads "Couldn't take over. …" and the peers do not move;
 * - dark: the card in the dark scheme.
 *
 * In Caw's panel (the bar's Needs you, opened as a person opens it), the
 * ask's row: a browser ask, Deny then Take over at the row's trailing
 * edge, both filled and tinted (each its own), `--space-2` apart, opening to
 * `--space-4` on a coarse pointer. Take over there posts the same
 * `/api/browsers/<key>/takeover`, with the same body, as the card's: one way
 * to take the browser over, from either place. Where the home page shows the session's
 * composer with its card up (the desk), the card stays whole and still as
 * the panel opens (DESIGN: it "arrives once … and is then completely
 * still"): no transition or animation begins on it, its rects do not move,
 * its title and peers stand at full opacity untransformed, nothing stands
 * over it, and its surface (the grown shape) is its own rect.
 *
 * Every state at every width is swept for overflow and overlap: each text
 * element inside its container and the viewport, and no two text elements
 * overlapping; the sweep's total must be zero. A capture of each goes to
 * `.probe/browser-ask-card/`, once every finite animation on the page has
 * landed.
 *
 *   bun scripts/probe-kit/run.ts web browser-ask-card
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one width, one state at a time, each on its own page
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { MACHINE, type Reply } from "../../../scratch-fleet";
import {
  COMPOSER,
  type Kit,
  open,
  ROOT,
  type Spec,
  settle,
  type Theme,
  type View,
} from "../../kit";

const LEGS: { name: string; view: View }[] = [
  { name: "390", view: "phone" },
  { name: "680", view: "narrowDesk" },
  { name: "1440", view: "desk" },
];

const REASONS = {
  short: "Sign in to GitHub so I can open the release page.",
  long: "Sign in to the payment provider's dashboard with the company account and approve the pending payout to the contractor, then confirm the one-time code it sends to your phone; I need the receipt page that comes after it to file the invoice, and nothing before it is readable without your sign-in.",
} as const;

const ORIGIN =
  "https://dashboard.payments-provider-with-a-long-name.example.com";
const CONSEQUENCE =
  "No agent can see or use this browser until you hand it back.";
const REFUSAL = "The browser did not start.";
const CAPTURES = join(ROOT, ".probe", "browser-ask-card");
const CARD = '[data-slot="ask"]';
const KEY = "machine:scratch-fleet";

/** The browser ask as the hub parks it, for session `id`. */
const askFor = (id: string, reason: string, requestId: string) => ({
  verb: "frames",
  machineId: MACHINE,
  instanceId: id,
  requestId,
  payload: {
    kind: "permission_request",
    instanceId: id,
    requestId,
    harness: "claude",
    requestKind: "tool",
    toolName: "mcp__cawco__browser_ask",
    input: { reason, origin: ORIGIN },
    browserAsk: {
      artifactId: "artifact-browser",
      key: KEY,
      machineId: MACHINE,
      origin: ORIGIN,
      reason,
    },
    presentation: {
      asker: "Probe browser ask",
      summary: reason,
      changes: [],
      fields: [{ key: "origin", value: ORIGIN }],
    },
    raisedAt: Date.now(),
  },
});

interface Rect {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

/** The card's measures, read from the DOM. */
const measure = () => {
  const card = document.querySelector<HTMLElement>('[data-slot="ask"]');
  const take = card?.querySelector<HTMLElement>("[data-browser-take]");
  const deny = card?.querySelector<HTMLElement>("[data-browser-deny]");
  const origin = card?.querySelector<HTMLElement>(
    '[data-slot="browser-origin"]'
  );
  const lede = card?.querySelector<HTMLElement>('[data-slot="lede"]');
  const detail = card?.querySelector<HTMLElement>('[data-slot="detail"]');
  const meta = card?.querySelector<HTMLElement>('[data-slot="browser-meta"]');
  if (!(card && take && deny && origin && lede && detail && meta)) {
    return null;
  }
  const box = (node: Element) => {
    const r = node.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  };
  const t = box(take);
  const d = box(deny);
  const probe = document.createElement("div");
  probe.style.inlineSize = "var(--space-8)";
  document.body.append(probe);
  const space8 = probe.getBoundingClientRect().width;
  probe.remove();
  const codeProbe = document.createElement("code");
  codeProbe.style.font = "var(--type-code)";
  document.body.append(codeProbe);
  const code = getComputedStyle(codeProbe);
  const codeFace = { family: code.fontFamily, size: code.fontSize };
  codeProbe.remove();
  const takeStyle = getComputedStyle(take);
  const denyStyle = getComputedStyle(deny);
  const originStyle = getComputedStyle(origin);
  const ledeStyle = getComputedStyle(lede);
  const detailStyle = getComputedStyle(detail);
  // Each dot-separated label on one line: broken only after a dot.
  const labelLines = [
    ...origin.querySelectorAll<HTMLElement>("[data-origin-label]"),
  ].map(
    (label) =>
      new Set([...label.getClientRects()].map((r) => Math.round(r.top))).size
  );
  const text = origin.textContent ?? "";
  return {
    title: card.querySelector('[data-slot="title"]')?.textContent?.trim() ?? "",
    reason: lede.textContent?.trim() ?? "",
    origin: text,
    meta: meta.textContent?.replace(/\s+/g, "").trim() ?? "",
    originLabels: labelLines.length,
    labelsWhole: labelLines.every((lines) => lines === 1),
    dots: text.split(".").length - 1,
    ledeWeight: ledeStyle.fontWeight,
    ledeSize: ledeStyle.fontSize,
    detail: detail.textContent?.replace(/\s+/g, " ").trim() ?? "",
    detailSize: detailStyle.fontSize,
    detailInk: detailStyle.color,
    gap: Math.round(d.left - t.right),
    space8,
    take: t,
    deny: d,
    card: box(card),
    fills: [takeStyle.backgroundColor, denyStyle.backgroundColor],
    edges: [takeStyle.borderColor, denyStyle.borderColor],
    inks: [takeStyle.color, denyStyle.color],
    labels: [
      take.textContent?.replace(/\s+/g, " ").trim() ?? "",
      deny.textContent?.replace(/\s+/g, " ").trim() ?? "",
    ],
    originFace: { family: originStyle.fontFamily, size: originStyle.fontSize },
    codeFace,
    sideways:
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  };
};

/**
 * Overflow and overlap in `selector`'s box: each element that draws text,
 * outside its container's inline edges or the viewport; and each pair of
 * text-drawing elements (neither holding the other) whose boxes overlap.
 * Answers the count and the first few, by their slots.
 */
const sweep = (selector: string) => {
  const root = document.querySelector<HTMLElement>(selector);
  if (!root) {
    return { total: -1, found: [`no ${selector}`] };
  }
  const box = root.getBoundingClientRect();
  const view = {
    width: document.documentElement.clientWidth,
    height: window.innerHeight,
  };
  // Not drawn: under an ancestor that is see-through (a button's pending
  // label waiting in its cell), hidden from sight and readers, or a
  // screen reader's own words clipped to a pixel.
  const unseen = (node: HTMLElement): boolean => {
    for (
      let at: HTMLElement | null = node;
      at && at !== root.parentElement;
      at = at.parentElement
    ) {
      const style = getComputedStyle(at);
      if (
        style.opacity === "0" ||
        style.visibility === "hidden" ||
        style.display === "none" ||
        at.getAttribute("aria-hidden") === "true"
      ) {
        return true;
      }
    }
    return false;
  };
  const drawn = [...root.querySelectorAll<HTMLElement>("*")].filter((node) => {
    if (unseen(node)) {
      return false;
    }
    const own = [...node.childNodes].some(
      (child) => child.nodeType === Node.TEXT_NODE && child.textContent?.trim()
    );
    const rect = node.getBoundingClientRect();
    return own && rect.width > 1 && rect.height > 1;
  });
  const name = (node: Element) =>
    node.getAttribute("data-slot") ??
    node.className.toString().split(" ")[0] ??
    node.tagName.toLowerCase();
  const found: string[] = [];
  const slack = 0.5;
  for (const node of drawn) {
    const r = node.getBoundingClientRect();
    if (r.left < box.left - slack || r.right > box.right + slack) {
      found.push(`${name(node)} past its container`);
    }
    if (r.left < -slack || r.right > view.width + slack) {
      found.push(`${name(node)} past the viewport`);
    }
  }
  for (let i = 0; i < drawn.length; i += 1) {
    for (let j = i + 1; j < drawn.length; j += 1) {
      const a = drawn[i] as HTMLElement;
      const b = drawn[j] as HTMLElement;
      if (a.contains(b) || b.contains(a)) {
        continue;
      }
      const p = a.getBoundingClientRect();
      const q = b.getBoundingClientRect();
      const w = Math.min(p.right, q.right) - Math.max(p.left, q.left);
      const h = Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top);
      if (w > 1 && h > 1) {
        found.push(`${name(a)} over ${name(b)}`);
      }
    }
  }
  return { total: found.length, found: found.slice(0, 6) };
};

const same = (a: Rect, b: Rect): boolean =>
  Math.abs(a.left - b.left) < 0.5 &&
  Math.abs(a.top - b.top) < 0.5 &&
  Math.abs(a.right - b.right) < 0.5 &&
  Math.abs(a.bottom - b.bottom) < 0.5;

/** The sweep's total over every state: zero is the pass. */
let swept = 0;

const sweepCheck = async (
  kit: Kit,
  page: Page,
  label: string,
  selector: string
): Promise<void> => {
  const read = await page.evaluate(sweep, selector);
  swept += Math.max(read.total, 0);
  kit.check(
    `${label}: the overflow and overlap sweep finds ${read.total}`,
    read.total === 0,
    JSON.stringify(read.found)
  );
};

/** The takeover route's answer: held until let go, or refused. */
type TakeAnswer = "ok" | "held" | "refused";

/** The session's page with `/api/pending` holding a browser ask for it; what the page posted and sent. */
const pageWithAsk = async (
  kit: Kit,
  view: View,
  id: string,
  reason: string,
  requestId: string,
  options: { theme?: Theme; take?: TakeAnswer } = {}
) => {
  const page = await kit.page(view, { theme: options.theme ?? "light" });
  page.setDefaultTimeout(60_000);
  const posted: { url: string; body: unknown }[] = [];
  const sent: string[] = [];
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/pending", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([askFor(id, reason, requestId)]),
    })
  );
  await page.route("**/api/browsers/**", async (route) => {
    posted.push({
      url: route.request().url(),
      body: route.request().postDataJSON(),
    });
    if (options.take === "held") {
      await held;
    }
    if (options.take === "refused") {
      return route.fulfill({ status: 409, body: REFUSAL });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ artifactId: "artifact-browser", row: {} }),
    });
  });
  await page.routeWebSocket(
    (url) => url.pathname === "/ws/dashboard",
    (ws) => {
      const server = ws.connectToServer();
      ws.onMessage((message) => {
        sent.push(String(message));
        server.send(message);
      });
      server.onMessage((message) => ws.send(message));
    }
  );
  return { page, posted, sent, release: () => release() };
};

/**
 * The composer's card as the engine draws it, with Caw's panel open: its
 * rect; its title's, Take over's and Deny's computed opacity (their own,
 * and through every ancestor), transform and rect; what stands topmost over
 * it at a grid of its points; its surface (the grown shape's halo and drop,
 * Composer) and its clip; every run on it not finished; and how many
 * transitions and animations began on it since {@link countCardRuns}. Null
 * where no card is on the page.
 */
const cardDrawn = () => {
  const card = document.querySelector<HTMLElement>('[data-slot="ask"]');
  if (!card) {
    return null;
  }
  const runs = window
    .kitRuns()
    .filter((run) => {
      const target = (run.effect as KeyframeEffect | null)?.target;
      return run.playState !== "finished" && !!target && card.contains(target);
    })
    .map((run) => {
      const target = (run.effect as KeyframeEffect | null)?.target;
      let { name } = run.constructor;
      if (run instanceof CSSAnimation) {
        name = `animation ${run.animationName}`;
      } else if (run instanceof CSSTransition) {
        name = `transition ${run.transitionProperty}`;
      }
      return `${name} on ${target?.getAttribute("data-slot") ?? target?.tagName.toLowerCase()} (${run.playState} at ${Math.round(Number(run.currentTime ?? 0))})`;
    });
  const part = (selector: string) => {
    const node = card?.querySelector<HTMLElement>(selector);
    if (!node) {
      return null;
    }
    let through = 1;
    for (let at: HTMLElement | null = node; at; at = at.parentElement) {
      through *= Number(getComputedStyle(at).opacity);
    }
    const style = getComputedStyle(node);
    const r = node.getBoundingClientRect();
    return {
      opacity: style.opacity,
      through: Math.round(through * 1000) / 1000,
      transform: style.transform,
      rect: [r.left, r.top, r.right, r.bottom].map(Math.round),
    };
  };
  const box = card.getBoundingClientRect();
  // What is topmost over the card, at a grid of its points: the card's own,
  // or what stands over it.
  const over: string[] = [];
  for (const fy of [0.1, 0.5, 0.9]) {
    for (const fx of [0.05, 0.25, 0.5, 0.75, 0.95]) {
      const x = box.left + box.width * fx;
      const y = box.top + box.height * fy;
      const hit = document.elementFromPoint(x, y);
      if (hit && !card.contains(hit)) {
        const host = hit.closest("[data-slot], [data-glass-card-frame]");
        over.push(
          `${Math.round(x)},${Math.round(y)}: ${hit.tagName.toLowerCase()}.${String(hit.className).split(" ")[0]} in ${host?.getAttribute("data-slot") ?? host?.getAttribute("data-glass-card-frame") ?? "-"}`
        );
      }
    }
  }
  const frame = document
    .querySelector("[data-glass-card-frame]")
    ?.getBoundingClientRect();
  const surfaces = [
    ...document.querySelectorAll<HTMLElement>(
      '[data-slot="grown-halo"], .grown-drop'
    ),
  ].map((node) => {
    const r = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return {
      what: node.className,
      rect: [r.left, r.top, r.right, r.bottom].map(Math.round),
      opacity: style.opacity,
      visibility: style.visibility,
    };
  });
  return {
    rect: [box.left, box.top, box.right, box.bottom].map(Math.round),
    title: part('[data-slot="title"]'),
    take: part("[data-browser-take]"),
    deny: part("[data-browser-deny]"),
    over,
    panel: frame
      ? [frame.left, frame.top, frame.right, frame.bottom].map(Math.round)
      : null,
    surfaces,
    clipped: card.style.clipPath !== "",
    runs,
    began: (window as unknown as { __cardBegan?: number }).__cardBegan ?? 0,
  };
};

/**
 * Counts every transition and animation that begins on the composer's card
 * from now on (`__cardBegan`, read by {@link cardDrawn}): a card that
 * arrives again begins its parts' transitions again.
 */
const countCardRuns = () => {
  const box = window as unknown as { __cardBegan?: number };
  box.__cardBegan = 0;
  const count = (event: Event) => {
    if (
      event.target instanceof Element &&
      event.target.closest('[data-slot="ask"]')
    ) {
      box.__cardBegan = (box.__cardBegan ?? 0) + 1;
    }
  };
  document.addEventListener("transitionrun", count, true);
  document.addEventListener("animationstart", count, true);
};

/** Each capture once every finite animation on the page has landed. */
const capture = async (page: Page, file: string): Promise<void> => {
  await settle(page);
  await mkdir(CAPTURES, { recursive: true });
  await page.screenshot({ path: join(CAPTURES, file) });
};

/** The session's composer with the card up, its parts settled. */
const cardUp = async (page: Page, base: string, id: string): Promise<void> => {
  await open(page, `${base}/session/${id}`, COMPOSER, 90_000);
  await page.locator(`${CARD} [data-browser-take]`).waitFor();
  // The parts come up one after the other once the shape stands.
  await page.waitForTimeout(1000);
  await settle(page);
};

async function rest(
  kit: Kit,
  base: string,
  id: string,
  { name, view }: (typeof LEGS)[number],
  which: keyof typeof REASONS
): Promise<void> {
  const label = `${name} ${which}`;
  const requestId = `probe-browser-ask-${name}-${which}`;
  const reason = REASONS[which];
  const { page, sent } = await pageWithAsk(kit, view, id, reason, requestId);
  await cardUp(page, base, id);
  const card = await page.evaluate(measure);
  if (!card) {
    kit.check(`${label}: the card is up`, false, "no card");
    await page.close();
    return;
  }
  kit.check(
    `${label}: titled "${card.title}", the reason whole, the origin alone on its line`,
    card.title.startsWith("Browser ask from ") &&
      card.reason === reason &&
      card.origin === ORIGIN &&
      card.meta === ORIGIN,
    JSON.stringify({ title: card.title, meta: card.meta })
  );
  kit.check(
    `${label}: the reason as a question's text (weight ${card.ledeWeight}, ${card.ledeSize}), not the summary's 500`,
    card.ledeWeight !== "500" && Number(card.ledeWeight) < 500,
    JSON.stringify({ weight: card.ledeWeight, size: card.ledeSize })
  );
  kit.check(
    `${label}: the origin in code type (${card.originFace.family.split(",")[0]} ${card.originFace.size}), each of its ${card.originLabels} labels on one line (broken only after its ${card.dots} dots)`,
    card.originFace.family === card.codeFace.family &&
      card.originFace.size === card.codeFace.size &&
      card.originLabels === card.dots + 1 &&
      card.labelsWhole,
    JSON.stringify({ origin: card.originFace, code: card.codeFace })
  );
  kit.check(
    `${label}: the consequence line in the detail slot (${card.detailSize}): "${card.detail}"`,
    card.detail === CONSEQUENCE,
    JSON.stringify({ size: card.detailSize, ink: card.detailInk })
  );
  kit.check(
    `${label}: Take over and Deny apart, ${card.gap}px between them (≥ 44 and ≥ --space-8 ${card.space8}px)`,
    card.gap >= 44 &&
      card.gap >= card.space8 &&
      card.labels[0]?.startsWith("Take over") === true &&
      card.labels[1]?.startsWith("Deny") === true,
    JSON.stringify({ take: card.take, deny: card.deny, labels: card.labels })
  );
  kit.check(
    `${label}: neither tinted stronger: fills computed equal (${card.fills[0]}), labels in one ink, each outlined in its own tint`,
    card.fills[0] === card.fills[1] &&
      card.inks[0] === card.inks[1] &&
      card.edges[0] !== card.edges[1],
    JSON.stringify({ fills: card.fills, inks: card.inks, edges: card.edges })
  );
  kit.check(
    `${label}: nothing scrolls sideways`,
    card.sideways === 0,
    String(card.sideways)
  );
  await sweepCheck(kit, page, `${label} rest`, CARD);
  await capture(page, `${name}-${which}.png`);

  // "Other": the question card's chip; its line opens beside it.
  const before = card;
  await page.locator(`${CARD} [data-slot="browser-other"] button`).click();
  const field = page.locator(`${CARD} [data-other]`);
  await field.waitFor();
  await settle(page);
  const after = await page.evaluate(measure);
  const named = await field.evaluate((node) => ({
    name: node.getAttribute("aria-label"),
    placeholder: node.getAttribute("placeholder"),
    chip:
      document
        .querySelector('[data-slot="browser-other"] button')
        ?.textContent?.trim() ?? "",
  }));
  kit.check(
    `${label}: "Other" opens the line beside it ("${named.placeholder}", named "${named.name}"), the card keeps its height and the peers do not move`,
    !!after &&
      named.chip === "Other" &&
      named.placeholder === "Your answer…" &&
      named.name === `Your answer to: ${reason}` &&
      same(before.take, after.take) &&
      same(before.deny, after.deny) &&
      Math.abs(
        before.card.bottom -
          before.card.top -
          (after.card.bottom - after.card.top)
      ) < 0.5,
    JSON.stringify({
      before: [before.take, before.deny, before.card],
      after: after && [after.take, after.deny, after.card],
    })
  );
  await field.fill("Not on this account");
  await sweepCheck(kit, page, `${label} other`, CARD);
  await capture(page, `${name}-${which}-other.png`);
  if (which === "short") {
    await field.press("Enter");
    await page.waitForTimeout(800);
    const deny = sent.find(
      (raw) => raw.includes(requestId) && raw.includes('"deny"')
    );
    kit.check(
      `${label}: Enter on the line goes out as a deny carrying its words`,
      !!deny?.includes("Not on this account"),
      deny?.slice(0, 400) ?? `${sent.length} frames sent, none a deny`
    );
  }
  await page.close();
}

/** Take over held (pending) and refused: the button's wording, the refusal's line, the peers still. */
async function taking(
  kit: Kit,
  base: string,
  id: string,
  { name, view }: (typeof LEGS)[number]
): Promise<void> {
  const held = await pageWithAsk(
    kit,
    view,
    id,
    REASONS.short,
    `probe-browser-ask-${name}-held`,
    { take: "held" }
  );
  await cardUp(held.page, base, id);
  await held.page.locator(`${CARD} [data-browser-take]`).click();
  await held.page.waitForTimeout(300);
  const pending = await held.page.evaluate(measure);
  const take = held.posted.find((one) => one.url.includes("/takeover"));
  kit.check(
    `${name}: Take over posts /api/browsers/<key>/takeover with the ask's request id and machine, and reads "Taking over…" while it is out`,
    !!take &&
      take.url.endsWith(`/api/browsers/${encodeURIComponent(KEY)}/takeover`) &&
      JSON.stringify(take.body) ===
        JSON.stringify({
          requestId: `probe-browser-ask-${name}-held`,
          machineId: MACHINE,
        }) &&
      !!pending?.labels[0]?.includes("Taking over…"),
    JSON.stringify({ posted: held.posted, labels: pending?.labels })
  );
  await sweepCheck(kit, held.page, `${name} pending`, CARD);
  await capture(held.page, `${name}-pending.png`);
  held.release();
  await held.page.close();

  const refused = await pageWithAsk(
    kit,
    view,
    id,
    REASONS.short,
    `probe-browser-ask-${name}-refused`,
    { take: "refused" }
  );
  await cardUp(refused.page, base, id);
  const before = await refused.page.evaluate(measure);
  // Watched from the press through the check's hold: a refused take-over
  // never raises the success check.
  const ticked = refused.page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        const began = performance.now();
        let seen = false;
        const look = () => {
          const button = document.querySelector(
            '[data-slot="ask"] [data-browser-take]'
          );
          const cell = button?.querySelector(
            'svg[data-slot="tick"]'
          )?.parentElement;
          if (
            cell?.getAttribute("data-active") === "true" &&
            getComputedStyle(cell).opacity !== "0"
          ) {
            seen = true;
          }
          if (performance.now() - began > 2000) {
            resolve(seen);
            return;
          }
          requestAnimationFrame(look);
        };
        look();
      })
  );
  await refused.page.locator(`${CARD} [data-browser-take]`).click();
  const line = refused.page.locator(`${CARD} [data-slot="refused"]`);
  await line.waitFor();
  const tickSeen = await ticked;
  kit.check(
    `${name}: a refused take-over draws no success check on Take over (watched for 2 s from the press)`,
    !tickSeen,
    String(tickSeen)
  );
  await settle(refused.page);
  const after = await refused.page.evaluate(measure);
  const words = (await line.textContent())?.trim() ?? "";
  kit.check(
    `${name}: a refused take-over reads "${words}" and the peers do not move`,
    words ===
      `Couldn't take over. ${REFUSAL} The agent is still waiting; try Take over again.` &&
      !!before &&
      !!after &&
      same(before.take, after.take) &&
      same(before.deny, after.deny),
    JSON.stringify({
      before: before && [before.take, before.deny],
      after: after && [after.take, after.deny],
    })
  );
  await sweepCheck(kit, refused.page, `${name} refused`, CARD);
  await capture(refused.page, `${name}-refused.png`);
  await refused.page.close();
}

async function dark(
  kit: Kit,
  base: string,
  id: string,
  { name, view }: (typeof LEGS)[number]
): Promise<void> {
  const { page } = await pageWithAsk(
    kit,
    view,
    id,
    REASONS.long,
    `probe-browser-ask-${name}-dark`,
    { theme: "dark" }
  );
  await cardUp(page, base, id);
  const isDark = await page.evaluate(() =>
    document.documentElement.classList.contains("dark")
  );
  kit.check(`${name} dark: the dark scheme is on`, isDark, String(isDark));
  await sweepCheck(kit, page, `${name} dark`, CARD);
  await capture(page, `${name}-dark.png`);
  await page.close();
}

/** Caw's panel as a person opens it: the ask's row, Deny then Take over at its trailing edge. */
async function needs(
  kit: Kit,
  base: string,
  id: string,
  { name, view }: (typeof LEGS)[number]
): Promise<void> {
  const requestId = `probe-browser-ask-needs-${name}`;
  const { page, posted, sent } = await pageWithAsk(
    kit,
    view,
    id,
    REASONS.short,
    requestId
  );
  await open(page, `${base}/`, "button[data-needs-caw]", 90_000);
  // A composer's card already up on the page (the desk's session pane) is
  // read before the panel opens, and every run that begins on it counted.
  const cardShown = await page
    .locator(`${CARD} [data-browser-take]`)
    .waitFor({ timeout: 5000 })
    .then(
      () => true,
      () => false
    );
  if (cardShown) {
    await page.waitForTimeout(1000);
  }
  await settle(page);
  const cardBefore = await page.evaluate(cardDrawn);
  await page.evaluate(countCardRuns);
  await page.locator("button[data-needs-caw]").click();
  const approve = page.locator("[data-glass-card-frame] [data-approve]");
  await approve.waitFor();
  await page.waitForTimeout(600);
  await settle(page);
  const row = await page.evaluate(() => {
    const take = document.querySelector<HTMLElement>(
      "[data-glass-card-frame] [data-approve]"
    );
    const deny = document.querySelector<HTMLElement>(
      "[data-glass-card-frame] [data-deny]"
    );
    const peers = take?.closest<HTMLElement>('[data-slot="peers"]');
    const item = peers?.parentElement;
    if (!(take && deny && peers && item)) {
      return null;
    }
    item.setAttribute("data-probe-row", "");
    const t = take.getBoundingClientRect();
    const d = deny.getBoundingClientRect();
    const i = item.getBoundingClientRect();
    const space = (token: string) => {
      const probe = document.createElement("div");
      probe.style.inlineSize = `var(${token})`;
      document.body.append(probe);
      const { width } = probe.getBoundingClientRect();
      probe.remove();
      return width;
    };
    const fill = (node: HTMLElement) => getComputedStyle(node).backgroundColor;
    const meta =
      item
        .querySelector('[data-slot="meta"]')
        ?.textContent?.replace(/\s+/g, " ")
        .trim() ?? "";
    const origin = item.querySelector<HTMLElement>(
      '[data-slot="needs-origin"]'
    );
    const labels = origin
      ? [...origin.querySelectorAll<HTMLElement>("[data-origin-label]")]
      : [];
    return {
      take: take.textContent?.replace(/\s+/g, " ").trim() ?? "",
      deny: deny.textContent?.replace(/\s+/g, " ").trim() ?? "",
      meta,
      gap: Math.round((t.left - d.right) * 10) / 10,
      order: d.right <= t.left,
      trailing: Math.round((i.right - t.right) * 10) / 10,
      fills: [fill(deny), fill(take)],
      coarse: matchMedia("(pointer: coarse)").matches,
      space2: space("--space-2"),
      space4: space("--space-4"),
      origin: origin?.textContent ?? "",
      originFamily: origin ? getComputedStyle(origin).fontFamily : "",
      labelsWhole: labels.every(
        (label) =>
          new Set([...label.getClientRects()].map((r) => Math.round(r.top)))
            .size === 1
      ),
    };
  });
  kit.check(
    `${name} Needs you: the row names the site, ${row?.origin}, in code type (${row?.originFamily.split(",")[0]}), each label on one line`,
    row?.origin === ORIGIN &&
      row.originFamily.includes("Mono") &&
      row.labelsWhole,
    JSON.stringify({ origin: row?.origin, family: row?.originFamily })
  );
  const want = row?.coarse ? row.space4 : row?.space2;
  kit.check(
    `${name} Needs you: a browser ask, Deny then Take over at the row's trailing edge (${row?.trailing}px in), filled and each tinted (${row?.fills.join(" / ")}), ${row?.gap}px apart (${row?.coarse ? "--space-4 on a coarse pointer" : "--space-2"})`,
    !!row &&
      row.meta.includes("Browser ask") &&
      row.deny.startsWith("Deny") &&
      row.take.startsWith("Take over") &&
      row.order &&
      Math.abs(row.gap - (want ?? -1)) < 1 &&
      row.fills.every(
        (one) => one !== "rgba(0, 0, 0, 0)" && one !== "transparent"
      ) &&
      row.fills[0] !== row.fills[1],
    JSON.stringify(row)
  );
  await sweepCheck(kit, page, `${name} Needs you`, "[data-probe-row]");
  await mkdir(CAPTURES, { recursive: true });
  await page
    .locator("[data-probe-row]")
    .screenshot({ path: join(CAPTURES, `${name}-needs-row.png`) });
  await settle(page);
  cardStaysWhole(kit, name, cardBefore, await page.evaluate(cardDrawn));
  await capture(page, `${name}-needs.png`);

  // Take over from the row: the transcript card's take-over, the same POST
  // with the same body (`taking`), never a permission answer on the socket.
  await approve.click();
  await page.waitForTimeout(800);
  const take = posted.find((one) => one.url.includes("/takeover"));
  const allowed = sent.find(
    (raw) => raw.includes(requestId) && raw.includes('"allow"')
  );
  kit.check(
    `${name} Needs you: Take over posts /api/browsers/<key>/takeover with the ask's request id and machine, as the card's Take over does, and sends no permission answer`,
    !!take &&
      take.url.endsWith(`/api/browsers/${encodeURIComponent(KEY)}/takeover`) &&
      JSON.stringify(take.body) ===
        JSON.stringify({ requestId, machineId: MACHINE }) &&
      allowed === undefined,
    JSON.stringify({ posted, allowed: allowed?.slice(0, 400) })
  );
  await page.close();
}

/**
 * The composer's card with Caw's panel open, against the card before it
 * opened (DESIGN: it "arrives once … and is then completely still"): no
 * transition or animation began on it, its rect and its title's and peers'
 * rects unchanged, each of them at full opacity through every ancestor and
 * untransformed, nothing standing over it, its surface its own rect, and
 * nothing running on it.
 */
const cardStaysWhole = (
  kit: Kit,
  name: string,
  before: ReturnType<typeof cardDrawn>,
  after: ReturnType<typeof cardDrawn>
): void => {
  if (!(before || after)) {
    kit.note(
      `${name} Needs you: no composer card on the home page at this width`
    );
    return;
  }
  const parts = after ? [after.title, after.take, after.deny] : [];
  const sameRect = (a?: number[] | null, b?: number[] | null) =>
    !!a && !!b && a.every((v, i) => Math.abs(v - (b[i] ?? Number.NaN)) <= 1);
  kit.check(
    `${name} Needs you: the composer's card stays whole and still with the panel open (no run began on it, rects unchanged, title and both peers at full opacity, nothing over it, its surface its own rect)`,
    !!before &&
      !!after &&
      after.began === 0 &&
      after.runs.length === 0 &&
      sameRect(before.rect, after.rect) &&
      sameRect(before.title?.rect, after.title?.rect) &&
      sameRect(before.take?.rect, after.take?.rect) &&
      sameRect(before.deny?.rect, after.deny?.rect) &&
      parts.every((part) => part?.through === 1 && part.transform === "none") &&
      after.over.length === 0 &&
      after.surfaces.length > 0 &&
      after.surfaces.every(
        (surface) =>
          sameRect(surface.rect, after.rect) &&
          surface.opacity === "1" &&
          surface.visibility === "visible"
      ),
    JSON.stringify({ before, after })
  );
};

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

const spec: Spec = {
  name: "browser-ask-card",
  run: async (kit) => {
    const fleet = await kit.fleet(respond);
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    const base = await fleet.dashboard();
    const id = await fleet.spawn("claude", "Probe browser ask", fleet.workdir, {
      permissionMode: "default",
    });
    for (const width of LEGS) {
      await rest(kit, base, id, width, "short");
      await rest(kit, base, id, width, "long");
      await taking(kit, base, id, width);
      await dark(kit, base, id, width);
      await needs(kit, base, id, width);
    }
    kit.check(
      `the overflow and overlap sweep totals ${swept} over every state at 390, 680 and 1440`,
      swept === 0,
      String(swept)
    );
  },
};

export default spec;
