/**
 * A browser ask's card (Projects spec §5.11, item 3): "Take over the
 * browser", the agent's reason, who asks, the page's origin in code type,
 * and Decline and Take over under DESIGN.md's Peer Rule transcript form.
 *
 * A scratch fleet gives the page a real session and board; the hub's
 * `/api/pending` is answered by the page's own route with a browser ask for
 * that session (core `BrowserAskFrame`), a short reason and a long one. At
 * 390, 680 and 1440, on the session's composer:
 *
 * - the card's title, reason and origin, the origin in code type (the
 *   `--type-code` face and size);
 * - Take over and Decline at the row's two ends, at least 44px apart and
 *   never less than `--space-8`, their fills computed equal (neither tinted
 *   stronger), each in its own outline tint;
 * - nothing scrolls sideways, and a long reason wraps inside the card;
 * - Take over posts `/api/browsers/<key>/takeover` with the ask's request
 *   id and machine (answered here);
 * - "Other…" opens the words field, and Decline goes out on the socket as
 *   a deny carrying those words.
 *
 * And on `/`, Needs you names it a browser ask with Decline and Take over.
 * A capture of each width and reason goes to `.probe/browser-ask-card/`.
 *
 *   bun scripts/probe-kit/run.ts web browser-ask-card
 */
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
const CAPTURES = join(ROOT, ".probe", "browser-ask-card");
const CARD = '[data-slot="ask"]';

/** The browser ask as the hub parks it, for session `id`. */
const askFor = (id: string, reason: string, requestId: string) => {
  const key = "machine:scratch-fleet";
  return {
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
        key,
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
  };
};

/** The card's measures, read from the DOM. */
const measure = () => {
  const card = document.querySelector<HTMLElement>('[data-slot="ask"]');
  const take = card?.querySelector<HTMLElement>("[data-browser-take]");
  const decline = card?.querySelector<HTMLElement>("[data-browser-decline]");
  const origin = card?.querySelector<HTMLElement>(
    '[data-slot="browser-origin"]'
  );
  const lede = card?.querySelector<HTMLElement>('[data-slot="lede"]');
  if (!(card && take && decline && origin && lede)) {
    return null;
  }
  const t = take.getBoundingClientRect();
  const d = decline.getBoundingClientRect();
  const c = card.getBoundingClientRect();
  const root = getComputedStyle(document.documentElement);
  const probe = document.createElement("div");
  probe.style.inlineSize = "var(--space-8)";
  document.body.append(probe);
  const space8 = probe.getBoundingClientRect().width;
  probe.remove();
  const takeStyle = getComputedStyle(take);
  const declineStyle = getComputedStyle(decline);
  const originStyle = getComputedStyle(origin);
  const codeProbe = document.createElement("code");
  codeProbe.style.font = "var(--type-code)";
  document.body.append(codeProbe);
  const code = getComputedStyle(codeProbe);
  const codeFace = { family: code.fontFamily, size: code.fontSize };
  codeProbe.remove();
  return {
    title: card.querySelector('[data-slot="title"]')?.textContent?.trim() ?? "",
    reason: lede.textContent?.trim() ?? "",
    origin: origin.textContent?.trim() ?? "",
    gap: Math.round(d.left - t.right),
    space8,
    take: { left: t.left, right: t.right, height: t.height },
    decline: { left: d.left, right: d.right, height: d.height },
    card: { left: c.left, right: c.right },
    fills: [takeStyle.backgroundColor, declineStyle.backgroundColor],
    edges: [takeStyle.borderColor, declineStyle.borderColor],
    inks: [takeStyle.color, declineStyle.color],
    originFace: { family: originStyle.fontFamily, size: originStyle.fontSize },
    codeFace,
    ledeOverflows: lede.scrollWidth > lede.clientWidth + 1,
    sideways:
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
    buttons: [...card.querySelectorAll("button")].map(
      (button) => button.textContent?.replace(/\s+/g, " ").trim() ?? ""
    ),
    rootSpace8: root.getPropertyValue("--space-8").trim(),
  };
};

/** The session's page with `/api/pending` holding a browser ask for it; what the page posted and sent. */
const pageWithAsk = async (
  kit: Kit,
  view: View,
  id: string,
  reason: string,
  requestId: string
) => {
  const page = await kit.page(view);
  page.setDefaultTimeout(60_000);
  const posted: { url: string; body: unknown }[] = [];
  const sent: string[] = [];
  await page.route("**/api/pending", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([askFor(id, reason, requestId)]),
    })
  );
  await page.route("**/api/browsers/**", (route) => {
    posted.push({
      url: route.request().url(),
      body: route.request().postDataJSON(),
    });
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
  return { page, posted, sent };
};

const capture = async (page: Page, file: string): Promise<void> => {
  await mkdir(CAPTURES, { recursive: true });
  await page.screenshot({ path: join(CAPTURES, file) });
};

async function leg(
  kit: Kit,
  base: string,
  id: string,
  { name, view }: (typeof LEGS)[number],
  which: keyof typeof REASONS
): Promise<void> {
  const label = `${name} ${which}`;
  const requestId = `probe-browser-ask-${name}-${which}`;
  const reason = REASONS[which];
  const { page, posted, sent } = await pageWithAsk(
    kit,
    view,
    id,
    reason,
    requestId
  );
  await open(page, `${base}/session/${id}`, COMPOSER, 90_000);
  await page.locator(`${CARD} [data-browser-take]`).waitFor();
  // The parts come up one after the other once the shape stands.
  await page.waitForTimeout(1000);
  await settle(page);
  const card = await page.evaluate(measure);
  kit.check(
    `${label}: the card reads "Take over the browser", the reason whole, the origin`,
    !!card &&
      card.title === "Take over the browser" &&
      card.reason === reason &&
      card.origin === ORIGIN,
    JSON.stringify(card && { title: card.title, origin: card.origin })
  );
  if (!card) {
    await page.close();
    return;
  }
  kit.check(
    `${label}: Take over and Decline apart, ${card.gap}px between them (≥ 44 and ≥ --space-8 ${card.space8}px)`,
    card.gap >= 44 && card.gap >= card.space8,
    JSON.stringify({ take: card.take, decline: card.decline })
  );
  kit.check(
    `${label}: neither tinted stronger: fills computed equal (${card.fills[0]}), labels in one ink`,
    card.fills[0] === card.fills[1] && card.inks[0] === card.inks[1],
    JSON.stringify({ fills: card.fills, inks: card.inks, edges: card.edges })
  );
  kit.check(
    `${label}: each outlined in its own tint`,
    card.edges[0] !== card.edges[1],
    JSON.stringify(card.edges)
  );
  kit.check(
    `${label}: the origin in code type (${card.originFace.family.split(",")[0]} ${card.originFace.size})`,
    card.originFace.family === card.codeFace.family &&
      card.originFace.size === card.codeFace.size,
    JSON.stringify({ origin: card.originFace, code: card.codeFace })
  );
  kit.check(
    `${label}: nothing scrolls sideways, the reason wraps inside the card`,
    card.sideways === 0 &&
      !card.ledeOverflows &&
      card.take.left >= card.card.left &&
      card.decline.right <= card.card.right + 0.5,
    JSON.stringify({ sideways: card.sideways, card: card.card })
  );
  await capture(page, `${name}-${which}.png`);

  if (which === "short") {
    await page.locator(`${CARD} [data-browser-other]`).click();
    const field = page.locator(`${CARD} [data-decline-words]`);
    await field.waitFor();
    await field.fill("Not on this account");
    await capture(page, `${name}-${which}-other.png`);
    await page.locator(`${CARD} [data-browser-decline]`).click();
    await page.waitForTimeout(800);
    const deny = sent.find(
      (raw) => raw.includes(requestId) && raw.includes('"deny"')
    );
    kit.check(
      `${label}: Decline goes out as a deny carrying the person's words`,
      !!deny?.includes("Not on this account"),
      deny?.slice(0, 400) ?? `${sent.length} frames sent, none a deny`
    );
  } else {
    await page.locator(`${CARD} [data-browser-take]`).click();
    await page.waitForTimeout(800);
    const take = posted.find((one) => one.url.includes("/takeover"));
    kit.check(
      `${label}: Take over posts /api/browsers/<key>/takeover with the ask's request id and machine`,
      !!take &&
        take.url.endsWith(
          `/api/browsers/${encodeURIComponent("machine:scratch-fleet")}/takeover`
        ) &&
        JSON.stringify(take.body) ===
          JSON.stringify({ requestId, machineId: MACHINE }),
      JSON.stringify(posted)
    );
  }
  await page.close();
}

/** Needs you on `/`: the ask named a browser ask, Decline and Take over its peers. */
async function needs(
  kit: Kit,
  base: string,
  id: string,
  { name, view }: (typeof LEGS)[number]
): Promise<void> {
  const requestId = `probe-browser-ask-needs-${name}`;
  const { page } = await pageWithAsk(kit, view, id, REASONS.short, requestId);
  await open(page, `${base}/`, "[data-approve]", 90_000);
  await settle(page);
  const row = await page.evaluate(() => {
    const approve = document.querySelector<HTMLElement>("[data-approve]");
    const deny = document.querySelector<HTMLElement>("[data-deny]");
    const meta = document.querySelector('[data-slot="meta"]');
    return {
      take: approve?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      decline: deny?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      meta: meta?.textContent?.replace(/\s+/g, " ").trim() ?? "",
    };
  });
  kit.check(
    `${name} Needs you: a browser ask, Decline and Take over its peers`,
    row.meta.includes("Browser ask") &&
      row.take.startsWith("Take over") &&
      row.decline.startsWith("Decline"),
    JSON.stringify(row)
  );
  await capture(page, `${name}-needs.png`);
  await page.close();
}

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
      // biome-ignore lint/performance/noAwaitInLoops: one width at a time, each reason on its own page
      await leg(kit, base, id, width, "short");
      await leg(kit, base, id, width, "long");
      await needs(kit, base, id, width);
    }
  },
};

export default spec;
