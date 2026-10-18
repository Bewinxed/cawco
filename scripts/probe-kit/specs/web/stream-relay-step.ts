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
import { STREAM_RELAY_WORDS } from "../../../../packages/core/src/stream-relay";
import type { Kit, Spec, View } from "../../kit";
import { open, ROOT, settle } from "../../kit";

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

const spec: Spec = {
  name: "stream-relay-step",
  run: async (kit: Kit) => {
    const base = await kit.built();
    for (const leg of LEGS) {
      // biome-ignore lint/performance/noAwaitInLoops: one width at a time, each state on its own page
      await none(kit, base, leg);
      await single(kit, base, leg);
      await several(kit, base, leg);
      await running(kit, base, leg);
      await previews(kit, base, leg);
    }
  },
};

export default spec;
