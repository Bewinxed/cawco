/**
 * Settings › Browsers, the stream relay step (Projects spec §5.11, build
 * item 5), on the built dashboard with the hub's `/api/stream-relay` mocked
 * by the page's own route: the one read the section makes, which carries
 * the machines whose capability report holds a public address. At 390, 680
 * and 1440:
 *
 * - no machine with a public address: the "No machine of yours…" line, and
 *   no Start relay;
 * - one machine (a short address): its row, the DNS name field under it,
 *   and Start relay asking in place, the Asking in the page tile measured
 *   under the row, inside its column;
 * - many machines (a long name, a long IPv6 address): every row, none picked
 *   until "Run the relay here", then the field under the picked row alone;
 * - a live relay: its line, one chip per port with its word, a down port's
 *   error under its chip, and Remove relay asking in place under the row.
 *
 * - the relay pulling (with its progress), starting, stopped, and failed with
 *   its `why` (the rootless sysctl sentence; a held port naming its
 *   process): each state's words, its badge's word and tint, Start relay
 *   only where it can act, the `why` whole and wrapping;
 * - live with no DNS name, and its Remove ask's sentence;
 * - dark: none, many and live, their words at 4.5:1 or more on their ground;
 * - keyboard focus on a pick button, Start relay and Remove relay, each
 *   ring drawn whole; a pointer resting on a row that is no control.
 *
 * Nothing in any state scrolls sideways. A capture of each state and width
 * goes to `.probe/stream-relay-step/` for the review item to read.
 *
 *   bun scripts/probe-kit/run.ts web stream-relay-step
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import type {
  RelayCandidate,
  StreamRelayAnswer,
} from "../../../../packages/core/src/stream-relay";
import {
  RELAY_FAILURES,
  STREAM_RELAY_WORDS,
} from "../../../../packages/core/src/stream-relay";
import type { Kit, Spec, View } from "../../kit";
import { open, ROOT, settle, type Theme } from "../../kit";

const LEGS: { name: string; view: View }[] = [
  { name: "390", view: "phone" },
  { name: "680", view: "narrowDesk" },
  { name: "1440", view: "desk" },
];

const CAPTURES = join(ROOT, ".probe", "stream-relay-step");

const one: RelayCandidate = {
  machineId: "m-relay",
  name: "relay",
  online: true,
  address: "178.63.54.124",
  addresses: ["178.63.54.124"],
};

const many: RelayCandidate[] = [
  one,
  {
    machineId: "m-long",
    name: "hetzner-falkenstein-dedicated-relay-node-number-seven",
    online: true,
    address: "2a01:4f8:c17:5e3a:8b2d:41ff:fe9c:aa17",
    addresses: ["2a01:4f8:c17:5e3a:8b2d:41ff:fe9c:aa17"],
  },
  {
    machineId: "m-nat",
    name: "cloud-box",
    online: true,
    address: "203.0.113.200",
    addresses: ["198.51.100.4"],
    seen: "203.0.113.200",
    externalIp: "203.0.113.200/198.51.100.4",
  },
  {
    machineId: "m-off",
    name: "spare",
    online: false,
    address: "198.51.100.77",
    addresses: ["198.51.100.77"],
  },
];

const LONG_ERROR =
  "STUN timeout: no answer from 178.63.54.124:443 within 3000 ms over tcp (connect ECONNREFUSED)";

const live: StreamRelayAnswer = {
  candidates: [one],
  relay: {
    machineId: one.machineId,
    machineName: one.name,
    address: one.address,
    hostname: "relay.example.com",
    state: "live",
    ports: { udp3478: true, tcp3478: true, tcp443: true, tls: true },
    why: null,
    whyCommand: null,
    health: [
      { port: "udp 3478", up: true },
      { port: "tcp 3478", up: true },
      { port: "tcp 443", up: false, error: LONG_ERROR },
      { port: "tls", up: true },
    ],
    checkedAt: Date.UTC(2026, 9, 19, 12),
    certificateEndsAt: Date.UTC(2027, 0, 17),
    urls: [],
  },
};

/** The live relay as another state, its health and ports as that state keeps them. */
const relayAs = (
  change: Partial<NonNullable<StreamRelayAnswer["relay"]>>
): StreamRelayAnswer => ({
  candidates: [one],
  relay: {
    ...(live.relay as NonNullable<StreamRelayAnswer["relay"]>),
    ports: null,
    health: [],
    checkedAt: null,
    ...change,
  },
});

/** The failures as the agent words them (core RELAY_FAILURES), on a machine named relay. */
const SYSCTL = RELAY_FAILURES.lowPort("relay", 443);
const HELD = RELAY_FAILURES.held("relay", [
  "TCP 3478 is held by cawco (pid 4242)",
  "UDP 443 is held by caddy (pid 917)",
]);

/** Each state the relay's own row can be in, what it must say, and which controls it offers. */
const STATES: {
  name: string;
  answer: StreamRelayAnswer;
  badge: string;
  tint: string;
  controls: string[];
  /** The controls shown but held, with the reason in their title. */
  held?: string[];
  why?: string;
  command?: string;
}[] = [
  {
    name: "pulling",
    answer: relayAs({ state: "pulling", progress: { done: 3, total: 7 } }),
    badge: "Pulling 3 of 7",
    tint: "status-live",
    controls: [STREAM_RELAY_WORDS.stop, STREAM_RELAY_WORDS.remove],
    held: [STREAM_RELAY_WORDS.stop],
  },
  {
    name: "starting",
    answer: relayAs({ state: "starting" }),
    badge: "Starting",
    tint: "status-live",
    controls: [STREAM_RELAY_WORDS.stop, STREAM_RELAY_WORDS.remove],
    held: [STREAM_RELAY_WORDS.stop],
  },
  {
    name: "stopped",
    answer: relayAs({ state: "stopped" }),
    badge: "Stopped",
    tint: "ink-muted",
    controls: [STREAM_RELAY_WORDS.start, STREAM_RELAY_WORDS.remove],
  },
  {
    name: "failed-sysctl",
    answer: relayAs({
      state: "failed",
      why: SYSCTL.why,
      whyCommand: SYSCTL.command ?? null,
      hostname: null,
    }),
    badge: "Failed",
    tint: "status-fail",
    controls: [STREAM_RELAY_WORDS.start, STREAM_RELAY_WORDS.remove],
    why: SYSCTL.why,
    command: SYSCTL.command,
  },
  {
    name: "failed-held",
    answer: relayAs({ state: "failed", why: HELD.why }),
    badge: "Failed",
    tint: "status-fail",
    controls: [STREAM_RELAY_WORDS.start, STREAM_RELAY_WORDS.remove],
    why: HELD.why,
  },
];

/** Live with no DNS name, every port answering: no TLS chip, no name in its line. */
const livePlain = relayAs({
  hostname: null,
  ports: { udp3478: true, tcp3478: true, tcp443: true, tls: false },
  health: [
    { port: "udp 3478", up: true },
    { port: "tcp 3478", up: true },
    { port: "tcp 443", up: true },
  ],
  checkedAt: Date.UTC(2026, 9, 19, 12),
  certificateEndsAt: null,
});

/** The section's one read answered with `answer`; a change answered with `after`. */
const mock = async (
  page: Page,
  answer: StreamRelayAnswer,
  after: StreamRelayAnswer = answer
): Promise<void> => {
  await page.route("**/api/stream-relay**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(route.request().method() === "GET" ? answer : after),
    })
  );
};

/** How far the page scrolls sideways (0 when it does not), the section's own too. */
const sideways = (page: Page) =>
  page.evaluate(() => {
    const section = document.querySelector<HTMLElement>("[data-stream-relay]");
    return {
      page:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      section: section ? section.scrollWidth - section.clientWidth : null,
    };
  });

/**
 * The ask tile's box against its row's and its column's (under its trigger,
 * inside both), and its trigger held while it stands: disabled and
 * `aria-expanded`, so the tile's verb is the only one (DESIGN.md, Asking in
 * the page).
 */
const askUnder = (
  page: Page,
  rowSelector: string,
  at: string,
  triggerSelector: string
) =>
  page.evaluate(
    (where) => {
      const ask = document.querySelector<HTMLElement>(
        `section[data-ask="${where.at}"]`
      );
      const tile = ask?.querySelector<HTMLElement>('[data-slot="tile"]');
      const row = document.querySelector<HTMLElement>(where.rowSelector);
      const column = document.querySelector<HTMLElement>("[data-stream-relay]");
      if (!(ask && tile && row && column)) {
        return null;
      }
      const t = tile.getBoundingClientRect();
      const r = row.getBoundingClientRect();
      const c = column.getBoundingClientRect();
      const trigger = document.querySelector<HTMLElement>(
        where.triggerSelector
      );
      return {
        title: tile.querySelector('[data-slot="title"]')?.textContent?.trim(),
        body: tile.querySelector('[data-slot="body"]')?.textContent?.trim(),
        tileTop: Math.round(t.top),
        triggerBottom: trigger
          ? Math.round(trigger.getBoundingClientRect().bottom)
          : null,
        insideRow: t.left >= r.left - 0.5 && t.right <= r.right + 0.5,
        insideColumn: t.left >= c.left - 0.5 && t.right <= c.right + 0.5,
        focused:
          document.activeElement?.hasAttribute("data-ask-cancel") ?? false,
        triggerHeld:
          trigger !== null &&
          (trigger.hasAttribute("disabled") ||
            trigger.getAttribute("aria-disabled") === "true") &&
          trigger.getAttribute("aria-expanded") === "true",
      };
    },
    { rowSelector, at, triggerSelector }
  );

const capture = async (page: Page, name: string): Promise<void> => {
  await mkdir(CAPTURES, { recursive: true });
  await page.screenshot({
    path: join(CAPTURES, `${name}.png`),
    fullPage: true,
  });
};

const URL_PATH = "/config/browsers";

const none = async (kit: Kit, base: string, leg: (typeof LEGS)[number]) => {
  const page = await kit.page(leg.view);
  await mock(page, { candidates: [], relay: null });
  await open(page, `${base}${URL_PATH}`, "[data-relay-none]");
  await settle(page, 400);
  const read = await page.evaluate((lead) => {
    const section = document.querySelector("[data-stream-relay]");
    return {
      line: document.querySelector("[data-relay-none]")?.textContent?.trim(),
      start: document.querySelectorAll("[data-relay-start]").length,
      rows: document.querySelectorAll("[data-relay-candidate]").length,
      label: section?.getAttribute("aria-label"),
      headings: section?.querySelectorAll("h2, h3").length ?? null,
      lead: document.body.textContent?.includes(lead) ?? false,
    };
  }, STREAM_RELAY_WORDS.lead);
  const scroll = await sideways(page);
  kit.check(
    `${leg.name} none: the "No machine of yours…" line, no Start relay, the section named "${STREAM_RELAY_WORDS.title}" by its label with no heading or lead of its own, nothing sideways`,
    read.line === STREAM_RELAY_WORDS.none &&
      read.label === STREAM_RELAY_WORDS.title &&
      read.headings === 0 &&
      !read.lead &&
      read.start === 0 &&
      read.rows === 0 &&
      scroll.page <= 0 &&
      scroll.section === 0,
    JSON.stringify({ read, scroll })
  );
  await capture(page, `none-${leg.name}`);
};

const single = async (kit: Kit, base: string, leg: (typeof LEGS)[number]) => {
  const page = await kit.page(leg.view);
  await mock(page, { candidates: [one], relay: null }, live);
  await open(page, `${base}${URL_PATH}`, "[data-relay-candidate]");
  await settle(page, 400);
  const row = `[data-relay-candidate="${one.machineId}"]`;
  const read = await page.evaluate((selector) => {
    const li = document.querySelector<HTMLElement>(selector);
    const field = li?.querySelector<HTMLElement>("[data-relay-hostname]");
    const address = li?.querySelector<HTMLElement>("[data-relay-address]");
    const hint = li?.querySelector<HTMLElement>(".hint");
    return {
      text: li?.textContent ?? "",
      picks: li?.querySelectorAll("[data-relay-pick]").length ?? null,
      field:
        field && address
          ? {
              under:
                field.getBoundingClientRect().top >=
                address.getBoundingClientRect().bottom,
              fontSize: getComputedStyle(field).fontSize,
            }
          : null,
      hintWrap: hint ? getComputedStyle(hint).textWrapStyle : null,
      /** The hint's last line: how many words, and which (`pretty` keeps a lone word off it). */
      lastLineWords: (() => {
        const text = hint?.firstChild;
        if (!(hint && text && text.nodeType === Node.TEXT_NODE)) {
          return null;
        }
        const value = text.textContent ?? "";
        const tops: number[] = [];
        for (const match of value.matchAll(/\S+/g)) {
          const range = document.createRange();
          range.setStart(text, match.index);
          range.setEnd(text, match.index + match[0].length);
          tops.push(Math.round(range.getBoundingClientRect().top));
        }
        const last = tops.at(-1);
        const words = [...value.matchAll(/\S+/g)].map((match) => match[0]);
        return {
          count: tops.filter((top) => top === last).length,
          line: words.filter((_, index) => tops[index] === last).join(" "),
        };
      })(),
      start: li?.querySelectorAll("[data-relay-start]").length ?? 0,
    };
  }, row);
  kit.check(
    `${leg.name} one machine: its name, its address, no pick button, the DNS name field under it (its hint text-wrap pretty, its last line "${read.lastLineWords?.line}", no word alone), Start relay`,
    read.text.includes(one.name) &&
      read.text.includes(one.address) &&
      read.picks === 0 &&
      read.hintWrap === "pretty" &&
      (read.lastLineWords?.count ?? 0) >= 2 &&
      read.text.includes(STREAM_RELAY_WORDS.hostnameLabel) &&
      read.field?.under === true &&
      read.start === 1,
    JSON.stringify(read)
  );
  await page.fill("[data-relay-hostname]", "relay.example.com");
  await page.click("[data-relay-start]");
  await page.waitForSelector(`section[data-ask="start:${one.machineId}"]`);
  await settle(page, 500);
  const asked = await askUnder(
    page,
    row,
    `start:${one.machineId}`,
    "[data-relay-start]"
  );
  kit.check(
    `${leg.name} one machine: Start relay asks in place, the tile under the button inside the row, its title "${STREAM_RELAY_WORDS.startTitle(one.name)}", Cancel focused, the trigger held (disabled, aria-expanded)`,
    asked !== null &&
      asked.title === STREAM_RELAY_WORDS.startTitle(one.name) &&
      asked.triggerHeld &&
      asked.triggerBottom !== null &&
      asked.tileTop >= asked.triggerBottom &&
      asked.insideRow &&
      asked.insideColumn &&
      asked.focused,
    JSON.stringify(asked)
  );
  const scroll = await sideways(page);
  kit.check(
    `${leg.name} one machine asked: nothing sideways`,
    scroll.page <= 0 && scroll.section === 0,
    JSON.stringify(scroll)
  );
  await capture(page, `one-asked-${leg.name}`);
};

const several = async (kit: Kit, base: string, leg: (typeof LEGS)[number]) => {
  const page = await kit.page(leg.view);
  await mock(page, { candidates: many, relay: null });
  await open(page, `${base}${URL_PATH}`, "[data-relay-candidate]");
  await settle(page, 400);
  const before = await page.evaluate(() => ({
    rows: document.querySelectorAll("[data-relay-candidate]").length,
    fields: document.querySelectorAll("[data-relay-hostname]").length,
    /** Each row's pick button against its own address and the next row's name. */
    order: [...document.querySelectorAll("[data-relay-candidate]")].map(
      (row, index, rows) => {
        const button = row
          .querySelector("[data-relay-pick]")
          ?.getBoundingClientRect();
        const address = row
          .querySelector("[data-relay-address]")
          ?.getBoundingClientRect();
        const next = rows[index + 1]
          ?.querySelector("[data-relay-name]")
          ?.getBoundingClientRect();
        return {
          belowOwn: !!(button && address) && button.top >= address.bottom,
          aboveNext: !(button && next) || button.bottom <= next.top,
          beside: !!(button && address) && button.left > address.left,
          divided:
            index === 0 || getComputedStyle(row).borderTopWidth === "1px",
        };
      }
    ),
  }));
  const target = `[data-relay-candidate="m-long"]`;
  await page.click(`${target} [data-relay-pick]`);
  await settle(page, 400);
  const after = await page.evaluate((picked) => {
    const fields = [...document.querySelectorAll("[data-relay-hostname]")];
    return {
      fields: fields.length,
      inTarget: fields.every((field) => field.closest(picked) !== null),
      pressed: document
        .querySelector(`${picked} [data-relay-pick]`)
        ?.getAttribute("aria-pressed"),
      pickedWords: document
        .querySelector(`${picked} [data-relay-pick]`)
        ?.textContent?.trim(),
      otherWords: document
        .querySelector('[data-relay-candidate="m-relay"] [data-relay-pick]')
        ?.textContent?.trim(),
      nat: document
        .querySelector('[data-relay-candidate="m-nat"] p')
        ?.textContent?.replace(/\s+/g, " ")
        .trim(),
      off: document
        .querySelector('[data-relay-candidate="m-off"] p')
        ?.textContent?.replace(/\s+/g, " ")
        .trim(),
      offlineStart: document
        .querySelector('[data-relay-candidate="m-off"] [data-relay-start]')
        ?.hasAttribute("disabled"),
    };
  }, target);
  const scroll = await sideways(page);
  kit.check(
    `${leg.name} ${many.length} machines (a long name, a long IPv6 address, one seen from another address, one offline): every row, nothing picked, then the field under the picked row alone; nothing sideways`,
    before.rows === many.length &&
      before.fields === 0 &&
      after.fields === 1 &&
      after.inTarget &&
      after.pressed === "true" &&
      after.pickedWords === STREAM_RELAY_WORDS.picked &&
      after.otherWords === STREAM_RELAY_WORDS.runHere &&
      after.nat ===
        `203.0.113.200 · ${STREAM_RELAY_WORDS.seenAs("203.0.113.200")}` &&
      after.off === "198.51.100.77 · offline" &&
      scroll.page <= 0 &&
      scroll.section === 0,
    JSON.stringify({ before, after, scroll })
  );
  const phone = leg.view === "phone";
  kit.check(
    phone
      ? `${leg.name} rows: each pick button under its own address and above the next row's name, a hairline between rows`
      : `${leg.name} rows: each pick button beside its own words, a hairline between rows`,
    before.order.every(
      (row) =>
        row.divided &&
        row.aboveNext &&
        (phone ? row.belowOwn : row.beside && !row.belowOwn)
    ),
    JSON.stringify(before.order)
  );
  await capture(page, `many-${leg.name}`);
};

const running = async (kit: Kit, base: string, leg: (typeof LEGS)[number]) => {
  const page = await kit.page(leg.view);
  await mock(page, live, { candidates: [one], relay: null });
  await open(page, `${base}${URL_PATH}`, "[data-relay-row]");
  await settle(page, 400);
  const read = await page.evaluate(() => ({
    line: document
      .querySelector("[data-relay-line]")
      ?.textContent?.replace(/\s+/g, " ")
      .trim(),
    state: document.querySelector("[data-relay-state]")?.textContent?.trim(),
    chips: [...document.querySelectorAll("[data-relay-port]")].map((chip) =>
      chip.textContent?.trim()
    ),
    chipTops: [
      ...new Set(
        [...document.querySelectorAll("[data-relay-port]")].map((chip) =>
          Math.round(chip.getBoundingClientRect().top)
        )
      ),
    ],
    errorsUnder: (() => {
      const row = document
        .querySelector("[data-relay-ports]")
        ?.getBoundingClientRect();
      return [...document.querySelectorAll("[data-relay-port-error]")].every(
        (line) => !!row && line.getBoundingClientRect().top >= row.bottom
      );
    })(),
    stateTint: document
      .querySelector("[data-relay-state]")
      ?.className.includes("status-attn"),
    error: [...document.querySelectorAll("[data-relay-port-error]")].map(
      (span) => span.textContent?.trim()
    ),
    buttons: [...document.querySelectorAll("[data-relay-row] button")].map(
      (button) => button.textContent?.trim()
    ),
  }));
  kit.check(
    `${leg.name} live with tcp 443 down: the badge "Live, a port is down" in attn, the line "${one.address} · relay.example.com", a chip per port with its word, the down port's error under the chips' row, Stop relay and Remove relay`,
    read.state === "Live, a port is down" &&
      read.stateTint === true &&
      read.line === `${one.address} · relay.example.com` &&
      read.errorsUnder &&
      JSON.stringify(read.chips) ===
        JSON.stringify([
          "udp 3478 up",
          "tcp 3478 up",
          "tcp 443 down",
          "tls up",
        ]) &&
      JSON.stringify(read.error) ===
        JSON.stringify([`tcp 443: ${LONG_ERROR}`]) &&
      read.buttons.includes(STREAM_RELAY_WORDS.stop) &&
      read.buttons.includes(STREAM_RELAY_WORDS.remove),
    JSON.stringify(read)
  );
  if (leg.view !== "phone") {
    kit.check(
      `${leg.name} live: the four port chips stand on one row (one top)`,
      read.chipTops.length === 1,
      JSON.stringify(read.chipTops)
    );
  }
  const gap = await page.evaluate(() => {
    const stop = document.querySelector<HTMLElement>("[data-relay-stop]");
    const remove = document.querySelector<HTMLElement>("[data-relay-remove]");
    const words = document
      .querySelector("[data-relay-line]")
      ?.getBoundingClientRect();
    if (!(stop && remove && words)) {
      return null;
    }
    const a = stop.getBoundingClientRect();
    const b = remove.getBoundingClientRect();
    const padding =
      Number.parseFloat(getComputedStyle(stop).paddingInlineStart) +
      Number.parseFloat(getComputedStyle(stop).borderInlineStartWidth);
    return {
      apart: Math.round(b.left - a.right),
      wrapped: a.top >= words.bottom,
      inkFromWords: Math.round(a.left + padding - words.left),
      space4: Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--space-4")
      ),
    };
  });
  kit.check(
    `${leg.name} live: Stop relay and the destructive Remove relay stand --space-4 apart${leg.view === "phone" ? ", and wrapped under the words the ghost's first letter starts on their edge" : ""}`,
    gap !== null &&
      gap.apart === gap.space4 &&
      (leg.view !== "phone" ||
        (gap.wrapped && Math.abs(gap.inkFromWords) <= 1)),
    JSON.stringify(gap)
  );
  await capture(page, `live-${leg.name}`);
  await page.click("[data-relay-remove]");
  await page.waitForSelector('section[data-ask="relay-remove"]');
  await settle(page, 500);
  const asked = await askUnder(
    page,
    "[data-relay-row]",
    "relay-remove",
    "[data-relay-remove]"
  );
  const scroll = await sideways(page);
  const removeBody = STREAM_RELAY_WORDS.removeBody("relay.example.com");
  kit.check(
    `${leg.name} live: Remove relay asks in place under the row, its title "${STREAM_RELAY_WORDS.removeTitle(one.name)}", its consequence naming the certificate ("${removeBody}"), the trigger held (disabled, aria-expanded); nothing sideways`,
    asked !== null &&
      asked.title === STREAM_RELAY_WORDS.removeTitle(one.name) &&
      asked.body === removeBody &&
      removeBody.includes("the certificate for relay.example.com is deleted") &&
      asked.triggerHeld &&
      asked.triggerBottom !== null &&
      asked.tileTop >= asked.triggerBottom &&
      asked.insideRow &&
      asked.insideColumn &&
      scroll.page <= 0 &&
      scroll.section === 0,
    JSON.stringify({ asked, scroll })
  );
  await capture(page, `live-remove-asked-${leg.name}`);
};

/**
 * The Field hint's `text-wrap: pretty` is shared: Settings › Previews' hint,
 * in host mode its longest, still wraps inside its column, nothing sideways.
 */
const previews = async (kit: Kit, base: string, leg: (typeof LEGS)[number]) => {
  const page = await kit.page(leg.view);
  await page.route("**/api/preview-settings", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        mode: "host",
        pattern: "https://p-{port}.example.com",
        ports: "3457–3556",
      }),
    })
  );
  await open(page, `${base}/config/previews`, ".hint");
  await settle(page, 400);
  const read = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".hint")].map((hint) => {
      const range = document.createRange();
      range.selectNodeContents(hint);
      const lines = new Set(
        [...range.getClientRects()]
          .filter((rect) => rect.width > 0)
          .map((rect) => Math.round(rect.top))
      ).size;
      return {
        wrap: getComputedStyle(hint).textWrapStyle,
        lines,
        inside: hint.scrollWidth <= hint.clientWidth,
      };
    })
  );
  const scroll = await sideways(page);
  kit.check(
    `${leg.name} Settings › Previews: its ${read.length} field hints wrap pretty inside their column (${read.map((hint) => `${hint.lines} lines`).join(", ")}), nothing sideways`,
    read.length > 0 &&
      read.every(
        (hint) => hint.wrap === "pretty" && hint.inside && hint.lines > 0
      ) &&
      scroll.page <= 0,
    JSON.stringify({ read, scroll })
  );
};

/** A page on Settings › Browsers with `answer` mocked, its section in. */
const look = async (
  kit: Kit,
  base: string,
  leg: (typeof LEGS)[number],
  answer: StreamRelayAnswer,
  ready: string,
  theme: Theme = "light"
): Promise<Page> => {
  const page = await kit.page(leg.view, { theme });
  await mock(page, answer);
  await open(page, `${base}${URL_PATH}`, ready);
  await settle(page, 400);
  return page;
};

/** The relay row as it reads: badge word and tint, line, controls, why, chips. */
const relayRead = (page: Page) =>
  page.evaluate(() => {
    const badge = document.querySelector<HTMLElement>("[data-relay-state]");
    const why = document.querySelector<HTMLElement>("[data-relay-why]");
    const lines = (node: HTMLElement | null) => {
      if (!node) {
        return 0;
      }
      const range = document.createRange();
      range.selectNodeContents(node);
      return new Set(
        [...range.getClientRects()]
          .filter((rect) => rect.width > 0)
          .map((rect) => Math.round(rect.top))
      ).size;
    };
    return {
      badge: badge?.textContent?.trim(),
      badgeClass: badge?.className ?? "",
      line: document
        .querySelector("[data-relay-line]")
        ?.textContent?.replace(/\s+/g, " ")
        .trim(),
      controls: [
        ...document.querySelectorAll<HTMLButtonElement>(
          "[data-relay-row] > div button"
        ),
      ].map((button) => button.textContent?.trim()),
      held: [
        ...document.querySelectorAll<HTMLButtonElement>(
          "[data-relay-row] > div button"
        ),
      ]
        .filter(
          (button) =>
            button.hasAttribute("disabled") ||
            button.getAttribute("aria-disabled") === "true"
        )
        .map((button) => ({
          words: button.textContent?.trim(),
          describedBy: button.getAttribute("aria-describedby"),
        })),
      why: why?.textContent?.replace(/\s+/g, " ").trim() ?? null,
      whyCode: why?.querySelector("code")?.textContent ?? null,
      backtick: document
        .querySelector("[data-stream-relay]")
        ?.textContent?.includes("`"),
      wait: (() => {
        const line = document.querySelector<HTMLElement>("[data-relay-wait]");
        return line ? { id: line.id, words: line.textContent?.trim() } : null;
      })(),
      whyInside: why ? why.scrollWidth <= why.clientWidth : null,
      whyLines: lines(why),
      chips: document.querySelectorAll("[data-relay-port]").length,
    };
  });

/** Each relay state at this width: its words, tint, controls and why. */
const states = async (kit: Kit, base: string, leg: (typeof LEGS)[number]) => {
  for (const state of STATES) {
    // biome-ignore lint/performance/noAwaitInLoops: one state at a time, each on its own page
    const page = await look(kit, base, leg, state.answer, "[data-relay-row]");
    const read = await relayRead(page);
    const scroll = await sideways(page);
    kit.check(
      `${leg.name} ${state.name}: badge "${state.badge}" (${state.tint}), line "${one.address}${state.answer.relay?.hostname ? " · relay.example.com" : ""}", controls ${state.controls.join(" and ")}${state.held ? ` (${state.held.join(", ")} held, described by the wait line "${read.wait?.words}" under the row)` : ", no wait line"}${state.why ? `, the why whole in ${read.whyLines} lines` : ", no why"}${state.command ? `, its command in code ("${read.whyCode}")` : ""}, no backtick, no chips, nothing sideways`,
      read.badge === state.badge &&
        read.badgeClass.includes(state.tint) &&
        read.line ===
          `${one.address}${state.answer.relay?.hostname ? " · relay.example.com" : ""}` &&
        JSON.stringify(read.controls) === JSON.stringify(state.controls) &&
        JSON.stringify(read.held.map((button) => button.words)) ===
          JSON.stringify(state.held ?? []) &&
        (state.held
          ? read.wait !== null &&
            read.wait.words === STREAM_RELAY_WORDS.stopWhileStarting &&
            read.held.every((button) => button.describedBy === read.wait?.id)
          : read.wait === null) &&
        read.backtick === false &&
        read.whyCode === (state.command ?? null) &&
        (state.why
          ? read.why === state.why &&
            read.whyInside === true &&
            read.whyLines > 0
          : read.why === null) &&
        read.chips === 0 &&
        scroll.page <= 0 &&
        scroll.section === 0,
      JSON.stringify({ read, scroll })
    );
    await capture(page, `state-${state.name}-${leg.name}`);
  }
};

/**
 * The Steady Swap Rule: the relay row keeps one height as its state changes,
 * so its name stands at one top in pulling, starting, stopped and live; the
 * wait line stands under the row, never inside its controls' cell. At 680
 * and 1440, where the row's two sides stand side by side.
 */
const steady = async (kit: Kit, base: string, leg: (typeof LEGS)[number]) => {
  if (leg.view === "phone") {
    return;
  }
  const answers: [string, StreamRelayAnswer][] = [
    ["pulling", relayAs({ state: "pulling", progress: { done: 3, total: 7 } })],
    ["starting", relayAs({ state: "starting" })],
    ["stopped", relayAs({ state: "stopped" })],
    ["live", live],
  ];
  const tops: {
    state: string;
    name: number | null;
    waitBelow: boolean | null;
  }[] = [];
  for (const [state, answer] of answers) {
    // biome-ignore lint/performance/noAwaitInLoops: one state at a time, each on its own page
    const page = await look(kit, base, leg, answer, "[data-relay-row]");
    tops.push({
      state,
      ...(await page.evaluate(() => {
        const name = document
          .querySelector("[data-relay-row] [data-relay-name]")
          ?.getBoundingClientRect();
        const row = document
          .querySelector("[data-relay-row] > div")
          ?.getBoundingClientRect();
        const wait = document
          .querySelector("[data-relay-wait]")
          ?.getBoundingClientRect();
        return {
          name: name ? Math.round(name.top * 100) / 100 : null,
          waitBelow: wait && row ? wait.top >= row.bottom : null,
        };
      })),
    });
  }
  const names = tops.flatMap((top) => (top.name === null ? [] : [top.name]));
  const spread = Math.max(...names) - Math.min(...names);
  kit.check(
    `${leg.name} steady: the relay's name stands at one top in pulling, starting, stopped and live (spread ${Math.round(spread * 100) / 100}px ≤ 0.5px), the wait line under the row`,
    names.length === answers.length &&
      spread <= 0.5 &&
      tops
        .filter((top) => top.state === "pulling" || top.state === "starting")
        .every((top) => top.waitBelow === true),
    JSON.stringify(tops)
  );
};

/** Live with no DNS name: its line, three chips, and its Remove ask's sentence without a certificate. */
const plain = async (kit: Kit, base: string, leg: (typeof LEGS)[number]) => {
  const page = await look(kit, base, leg, livePlain, "[data-relay-row]");
  const read = await relayRead(page);
  kit.check(
    `${leg.name} live, no DNS name: badge "Live" (done), line "${one.address}", three chips, Stop relay and Remove relay`,
    read.badge === "Live" &&
      read.badgeClass.includes("status-done") &&
      read.line === one.address &&
      read.chips === 3 &&
      JSON.stringify(read.controls) ===
        JSON.stringify([STREAM_RELAY_WORDS.stop, STREAM_RELAY_WORDS.remove]),
    JSON.stringify(read)
  );
  await capture(page, `live-plain-${leg.name}`);
  await page.click("[data-relay-remove]");
  await page.waitForSelector('section[data-ask="relay-remove"]');
  await settle(page, 500);
  const asked = await askUnder(
    page,
    "[data-relay-row]",
    "relay-remove",
    "[data-relay-remove]"
  );
  const body = STREAM_RELAY_WORDS.removeBody(null);
  kit.check(
    `${leg.name} live, no DNS name: Remove relay asks "${body}", no certificate named, the trigger held`,
    asked !== null &&
      asked.body === body &&
      !body.includes("certificate") &&
      asked.triggerHeld,
    JSON.stringify(asked)
  );
  await capture(page, `live-plain-remove-asked-${leg.name}`);
};

/**
 * The contrast of each element's text on the ground under it, colours read
 * through a canvas so oklch() and color-mix() land in sRGB.
 */
const contrasts = (page: Page, selectors: string[]) =>
  page.evaluate((list) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const rgb = (color: string): [number, number, number, number] => {
      if (!context) {
        return [0, 0, 0, 0];
      }
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const [r = 0, g = 0, b = 0, a = 0] = context.getImageData(
        0,
        0,
        1,
        1
      ).data;
      return [r, g, b, a];
    };
    const luminance = ([r, g, b]: number[]) => {
      const channel = (value: number) => {
        const c = value / 255;
        return c <= 0.040_45 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      return (
        0.2126 * channel(r ?? 0) +
        0.7152 * channel(g ?? 0) +
        0.0722 * channel(b ?? 0)
      );
    };
    const ground = (node: Element | null): [number, number, number, number] => {
      for (let at = node; at; at = at.parentElement) {
        const color = rgb(getComputedStyle(at).backgroundColor);
        if (color[3] === 255) {
          return color;
        }
      }
      return [255, 255, 255, 255];
    };
    return list.map((selector) => {
      const node = document.querySelector(selector);
      if (!node) {
        return { selector, ratio: 0 };
      }
      const ink = luminance(rgb(getComputedStyle(node).color));
      const back = luminance(ground(node));
      const [hi, lo] = ink > back ? [ink, back] : [back, ink];
      return {
        selector,
        ratio: Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100,
      };
    });
  }, selectors);

/** Dark: none, many and live, the app's dark theme on, every word at 4.5:1 or more. */
const dark = async (kit: Kit, base: string, leg: (typeof LEGS)[number]) => {
  const cases: {
    name: string;
    answer: StreamRelayAnswer;
    ready: string;
    words: string[];
  }[] = [
    {
      name: "none",
      answer: { candidates: [], relay: null },
      ready: "[data-relay-none]",
      words: ["[data-relay-none]"],
    },
    {
      name: "many",
      answer: { candidates: many, relay: null },
      ready: "[data-relay-candidate]",
      words: ["[data-relay-name]", "[data-relay-address]", "[data-relay-pick]"],
    },
    {
      name: "live",
      answer: live,
      ready: "[data-relay-row]",
      words: [
        "[data-relay-row] [data-relay-state] span",
        "[data-relay-line]",
        '[data-relay-port="tcp 443"] span',
        "[data-relay-port-error]",
        "[data-relay-remove]",
      ],
    },
  ];
  for (const item of cases) {
    // biome-ignore lint/performance/noAwaitInLoops: one state at a time, each on its own page
    const page = await look(kit, base, leg, item.answer, item.ready, "dark");
    const on = await page.evaluate(() =>
      document.documentElement.classList.contains("dark")
    );
    const ratios = await contrasts(page, item.words);
    kit.check(
      `${leg.name} dark ${item.name}: the dark theme on, ${ratios.map((r) => `${r.selector} ${r.ratio}:1`).join(", ")} (each ≥ 4.5:1)`,
      on && ratios.every((r) => r.ratio >= 4.5),
      JSON.stringify(ratios)
    );
    await capture(page, `${item.name}-dark-${leg.name}`);
  }
};

/** Tabs from the page's start until `selector` holds the focus (at most `limit` presses). */
const tabTo = async (
  page: Page,
  selector: string,
  limit = 120
): Promise<boolean> => {
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  for (let at = 0; at < limit; at += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: each press moves the focus one stop on
    await page.keyboard.press("Tab");
    if (
      await page.evaluate(
        (wanted) => document.activeElement?.matches(wanted) ?? false,
        selector
      )
    ) {
      return true;
    }
  }
  return false;
};

/** The focused control's ring: drawn by :focus-visible, and whole inside every box that clips it. */
const ring = (page: Page) =>
  page.evaluate(() => {
    const node = document.activeElement as HTMLElement | null;
    if (!node) {
      return null;
    }
    const style = getComputedStyle(node);
    const width = Number.parseFloat(style.outlineWidth);
    const offset = Number.parseFloat(style.outlineOffset);
    const box = node.getBoundingClientRect();
    const reach = width + Math.max(offset, 0);
    const outer = {
      left: box.left - reach,
      right: box.right + reach,
      top: box.top - reach,
      bottom: box.bottom + reach,
    };
    let clipped: string | null = null;
    for (let at = node.parentElement; at; at = at.parentElement) {
      const overflow = getComputedStyle(at);
      if (
        overflow.overflowX !== "visible" ||
        overflow.overflowY !== "visible"
      ) {
        const clip = at.getBoundingClientRect();
        if (
          outer.left < clip.left - 0.5 ||
          outer.right > clip.right + 0.5 ||
          (overflow.overflowY !== "visible" &&
            (outer.top < clip.top - 0.5 || outer.bottom > clip.bottom + 0.5))
        ) {
          clipped = at.className || at.tagName;
          break;
        }
      }
    }
    return {
      words: node.textContent?.trim(),
      visible: node.matches(":focus-visible"),
      style: style.outlineStyle,
      width,
      clipped,
    };
  });

/** Keyboard focus on a pick button, Start relay and Remove relay: each ring drawn and whole. */
const focus = async (kit: Kit, base: string, leg: (typeof LEGS)[number]) => {
  const cases = [
    {
      name: "pick",
      answer: { candidates: many, relay: null } as StreamRelayAnswer,
      ready: "[data-relay-candidate]",
      target: '[data-relay-candidate="m-long"] [data-relay-pick]',
      words: STREAM_RELAY_WORDS.runHere,
    },
    {
      name: "start",
      answer: { candidates: [one], relay: null } as StreamRelayAnswer,
      ready: "[data-relay-start]",
      target: "[data-relay-start]",
      words: STREAM_RELAY_WORDS.start,
    },
    {
      name: "remove",
      answer: live,
      ready: "[data-relay-row]",
      target: "[data-relay-remove]",
      words: STREAM_RELAY_WORDS.remove,
    },
  ];
  for (const item of cases) {
    // biome-ignore lint/performance/noAwaitInLoops: one control at a time, each on its own page
    const page = await look(kit, base, leg, item.answer, item.ready);
    const reached = await tabTo(page, item.target);
    await settle(page, 200);
    const read = await ring(page);
    kit.check(
      `${leg.name} keyboard focus on ${item.words}: reached by Tab, :focus-visible, a ${read?.style} ${read?.width}px ring drawn whole${read?.clipped ? ` (clipped by ${read.clipped})` : ""}`,
      reached &&
        read !== null &&
        read.words === item.words &&
        read.visible &&
        read.style === "solid" &&
        read.width > 0 &&
        read.clipped === null,
      JSON.stringify({ reached, read })
    );
    await capture(page, `focus-${item.name}-${leg.name}`);
  }
};

/**
 * A pointer resting on a candidate row's words (no chips, no control): the
 * row takes no hover fill, as it is no control. Then on its pick button: a
 * fine pointer tints it (`surface-hover`); a touch screen leaves it as it
 * was, no hover stuck on.
 */
const hover = async (kit: Kit, base: string, leg: (typeof LEGS)[number]) => {
  const page = await look(
    kit,
    base,
    leg,
    { candidates: many, relay: null },
    "[data-relay-candidate]"
  );
  const row = '[data-relay-candidate="m-nat"]';
  const fill = (selector: string) =>
    page.evaluate((wanted) => {
      const node = document.querySelector<HTMLElement>(wanted);
      return node
        ? {
            background: getComputedStyle(node).backgroundColor,
            cursor: getComputedStyle(node).cursor,
          }
        : null;
    }, selector);
  const rowBefore = await fill(row);
  const buttonBefore = await fill(`${row} [data-relay-pick]`);
  await page.hover(`${row} [data-relay-name]`);
  await settle(page, 300);
  const rowOn = await fill(row);
  await capture(page, `hover-row-${leg.name}`);
  await page.hover(`${row} [data-relay-pick]`);
  await settle(page, 300);
  const buttonOn = await fill(`${row} [data-relay-pick]`);
  const touch = leg.view === "phone";
  kit.check(
    `${leg.name} pointer on a row with no chips: the row takes no fill and no pointer cursor; its pick button ${touch ? "keeps its fill on a touch screen" : "takes the hover fill"}`,
    rowBefore !== null &&
      rowOn !== null &&
      rowOn.background === rowBefore.background &&
      rowOn.cursor !== "pointer" &&
      buttonBefore !== null &&
      buttonOn !== null &&
      (touch
        ? buttonOn.background === buttonBefore.background
        : buttonOn.background !== buttonBefore.background),
    JSON.stringify({ rowBefore, rowOn, buttonBefore, buttonOn })
  );
  await capture(page, `hover-pick-${leg.name}`);
};

/**
 * Every relay failure the agent or the hub's renewal words (core
 * RELAY_FAILURES), on sample values: it says what happened first (the
 * clause before its first colon), then the fix; a command it names sits in
 * its sentence word for word; no backtick anywhere.
 */
/** A relay failure's first clause: what happened, up to its first colon. */
const HAPPENED =
  /^The relay(?:'s certificate[^:]*?)? (?:could not start|was not renewed)[^:]*:/;
/** The verb its fix opens with. */
const FIX = /\b(?:Run|Install|Free|Give|Point|Check|Start|Try|Pick)\b/;

const failures = (kit: Kit): void => {
  const samples = {
    notLinux: RELAY_FAILURES.notLinux("relay"),
    noRuntime: RELAY_FAILURES.noRuntime("relay", "sudo apt install podman"),
    notDnsName: RELAY_FAILURES.notDnsName("relay", "relay_example"),
    lowPort: RELAY_FAILURES.lowPort("relay", 443),
    held: HELD,
    port80: RELAY_FAILURES.port80("relay", "TCP 80 is held by nginx (pid 12)"),
    certificate: RELAY_FAILURES.certificate(
      "relay",
      "relay.example.com",
      "Detail: DNS problem: NXDOMAIN looking up A for relay.example.com"
    ),
    certbotSlow: RELAY_FAILURES.certbotSlow("relay", 180),
    coturnExited: RELAY_FAILURES.coturnExited(
      "relay",
      "1",
      "bind: Permission denied"
    ),
    coturnUnbound: RELAY_FAILURES.coturnUnbound("relay", ["TCP 443"], 20),
    renewNone: RELAY_FAILURES.renewNone("relay"),
    renewPort80: RELAY_FAILURES.renewPort80(
      "relay",
      "relay.example.com",
      "TCP 80 is held by nginx (pid 12)"
    ),
    renewRefused: RELAY_FAILURES.renewRefused(
      "relay",
      "relay.example.com",
      "Detail: too many certificates already issued"
    ),
  };
  const read = Object.entries(samples).map(([name, failure]) => {
    const head = HAPPENED.exec(failure.why)?.[0] ?? "";
    const fixAt = failure.why.search(FIX);
    return {
      name,
      head,
      ordered: head.length > 0 && fixAt > head.length,
      command:
        failure.command === undefined || failure.why.includes(failure.command),
      backtick: failure.why.includes("`"),
    };
  });
  kit.check(
    `every relay failure (${read.length}) says what happened first ("The relay could not start on relay:" / "…was not renewed:"), then the fix; a named command inside its sentence; no backtick`,
    read.every((row) => row.ordered && row.command && !row.backtick),
    JSON.stringify(
      read.filter((row) => !(row.ordered && row.command) || row.backtick)
    )
  );
};

const spec: Spec = {
  name: "stream-relay-step",
  run: async (kit: Kit) => {
    failures(kit);
    const base = await kit.built();
    for (const leg of LEGS) {
      // biome-ignore lint/performance/noAwaitInLoops: one width at a time, each state on its own page
      await none(kit, base, leg);
      await single(kit, base, leg);
      await several(kit, base, leg);
      await running(kit, base, leg);
      await previews(kit, base, leg);
      await states(kit, base, leg);
      await steady(kit, base, leg);
      await plain(kit, base, leg);
      await dark(kit, base, leg);
      await focus(kit, base, leg);
      await hover(kit, base, leg);
    }
  },
};

export default spec;
