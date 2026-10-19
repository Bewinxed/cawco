/**
 * Settings › Browsers, the stream relay (Projects spec §5.11; its guided
 * journey, hub relay-journey.ts), on the built dashboard with the hub's
 * `GET /api/stream-relay` mocked by the page's own route: the journey as
 * the hub sends it, with the page's domain. At 390, 680 and 1440:
 *
 * - before anyone set it up: the lead (the domain's, or the plain one) and
 *   Set up, and nothing of the old page (no machine list, no DNS field, no
 *   Start relay asked in place);
 * - the journey standing on the name: every step in order, the open step's
 *   note, the record to copy and its controls, Later; on the phone the
 *   record's "(DNS only, no proxy)" on one line, and Copy record taking the
 *   record exactly as it reads;
 * - the summary, live with tcp 443 down: its badge in attn, a chip per port,
 *   the down port's error under the chips, the certificate's end and who
 *   proved it, Check again; Stop relay and the destructive Remove relay
 *   `--space-4` apart, and Remove asking in place under them;
 * - stopped: Start relay in Stop's place; no name: Add a name;
 * - dark: the lead, the summary's words, at 4.5:1 or more;
 * - keyboard focus on Set up and on Remove relay, each ring drawn whole.
 *
 * Nothing in any state scrolls sideways. Every relay failure is checked for
 * the error formula's order. A capture of each state and width goes to
 * `.probe/stream-relay-step/` for the review item to read.
 *
 *   bun scripts/probe-kit/run.ts web stream-relay-step
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import type {
  RelayAnswer,
  RelayJourneyView,
  RelayStep,
  RelaySummary,
} from "../../../../packages/core/src/stream-relay";
import {
  RELAY_FAILURES,
  STREAM_RELAY_WORDS as words,
} from "../../../../packages/core/src/stream-relay";
import type { Kit, Spec, View } from "../../kit";
import { open, ROOT, settle, type Theme } from "../../kit";

const LEGS: { name: string; view: View }[] = [
  { name: "390", view: "phone" },
  { name: "680", view: "narrowDesk" },
  { name: "1440", view: "desk" },
];

const CAPTURES = join(ROOT, ".probe", "stream-relay-step");
const DOMAIN = "outpost.example.com";
const NAME = "turn.example.com";
const machine = { name: "relay", address: "198.18.4.20", lan: "192.168.1.20" };

const LONG_ERROR =
  "STUN timeout: no answer from 198.18.4.20:443 within 3000 ms over tcp (connect ECONNREFUSED)";

const closed: RelayJourneyView = {
  open: false,
  asks: false,
  done: false,
  machine: null,
  candidates: 1,
  steps: [],
  summary: null,
  urls: [],
};

const standing: RelayStep[] = [
  { step: "machine", state: "done" },
  { step: "name", state: "needs", name: NAME, finding: "unresolved" },
  { step: "router", state: "needs" },
  { step: "runtime", state: "needs", lowest: 443 },
  { step: "certificate", state: "waiting" },
  { step: "start", state: "waiting" },
  { step: "prove", state: "waiting" },
];

const journeying: RelayJourneyView = {
  ...closed,
  open: true,
  asks: true,
  machine,
  steps: standing,
};

const live: RelaySummary = {
  machine,
  name: NAME,
  endsAt: Date.UTC(2027, 0, 17, 10),
  ports: [
    { name: "udp 443", up: true },
    { name: "tcp 443", up: false, error: LONG_ERROR },
    { name: "tls", up: true },
  ],
  proven: { device: "CawCo on iPhone", at: Date.UTC(2026, 9, 19, 12, 2) },
  state: "live",
  why: null,
  whyCommand: null,
};

/** Every port answering, with no name: udp and tcp 443, no TLS. */
const PLAIN_PORTS: RelaySummary["ports"] = [
  { name: "udp 443", up: true },
  { name: "tcp 443", up: true },
];

const finished = (summary: RelaySummary): RelayJourneyView => ({
  ...journeying,
  asks: false,
  done: true,
  steps: [
    { step: "machine", state: "done" },
    { step: "name", state: "done", name: NAME },
    { step: "router", state: "done", how: "UPnP" },
    { step: "certificate", state: "done", endsAt: Date.UTC(2027, 0, 17, 10) },
    { step: "start", state: "done" },
    {
      step: "prove",
      state: "done",
      device: "CawCo on iPhone",
      at: Date.UTC(2026, 9, 19, 12, 2),
      ports: "udp 443, tcp 443, tls",
    },
  ],
  summary,
  urls: [],
});

/** The page's one read answered with `journey` through `domain`; an act answered with the same. */
const mock = async (
  page: Page,
  journey: RelayJourneyView,
  domain: string | null = DOMAIN
): Promise<void> => {
  const answer: RelayAnswer = { domain, journey };
  await page.route("**/api/stream-relay**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(answer),
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

const capture = async (page: Page, name: string): Promise<void> => {
  await mkdir(CAPTURES, { recursive: true });
  await page.screenshot({
    path: join(CAPTURES, `${name}.png`),
    fullPage: true,
  });
};

const URL_PATH = "/config/browsers";

/** A page on Settings › Browsers with `journey` mocked, its section in. */
const look = async (
  kit: Kit,
  base: string,
  leg: (typeof LEGS)[number],
  journey: RelayJourneyView,
  ready: string,
  theme: Theme = "light",
  domain: string | null = DOMAIN
): Promise<Page> => {
  const page = await kit.page(leg.view, {
    theme,
    init: [
      () => {
        // The clipboard as Copy writes it, read back without a permission.
        const scope = window as unknown as { copied: string | null };
        scope.copied = null;
        Object.defineProperty(navigator, "clipboard", {
          value: {
            writeText: (text: string) => {
              scope.copied = text;
              return Promise.resolve();
            },
          },
        });
      },
    ],
  });
  await mock(page, journey, domain);
  await open(page, `${base}${URL_PATH}`, ready);
  await settle(page, 400);
  return page;
};

const before = async (kit: Kit, base: string, leg: (typeof LEGS)[number]) => {
  for (const domain of [DOMAIN, null]) {
    // biome-ignore lint/performance/noAwaitInLoops: one page at a time
    const page = await look(
      kit,
      base,
      leg,
      closed,
      "[data-relay-set-up]",
      "light",
      domain
    );
    const read = await page.evaluate(() => ({
      lead: document.querySelector("[data-relay-start] p")?.textContent?.trim(),
      setUp: document.querySelector("[data-relay-set-up]")?.textContent?.trim(),
      old: document.querySelectorAll(
        "[data-relay-candidate], [data-relay-hostname], [data-relay-pick]"
      ).length,
      title: document
        .querySelector("[data-relay-start] h3")
        ?.textContent?.trim(),
    }));
    const scroll = await sideways(page);
    const lead = domain ? words.leadDomain(domain) : words.leadPlain;
    kit.check(
      `${leg.name} before Set up${domain ? ` through ${domain}` : ", by IP or the tailnet"}: the title "${read.title}", the lead "${read.lead?.slice(0, 50)}…", Set up; no machine list, DNS field or pick; nothing sideways`,
      read.lead === lead &&
        read.setUp === words.setUp &&
        read.title === words.title &&
        read.old === 0 &&
        scroll.page <= 0 &&
        scroll.section === 0,
      JSON.stringify({ read, scroll })
    );
    await capture(page, `set-up-${domain ? "domain" : "plain"}-${leg.name}`);
  }
};

const journeyLeg = async (
  kit: Kit,
  base: string,
  leg: (typeof LEGS)[number]
) => {
  const page = await look(kit, base, leg, journeying, "[data-relay-journey]");
  const read = await page.evaluate((laterWords) => {
    const steps = [
      ...document.querySelectorAll(
        "[data-stream-relay] [data-relay-journey] li[data-step]"
      ),
    ];
    const opened = document.querySelector(
      "[data-stream-relay] [data-relay-journey] li[data-open]"
    );
    const units = [
      ...document.querySelectorAll<HTMLElement>(
        "[data-stream-relay] [data-unit]"
      ),
    ]
      .filter((unit) => unit.offsetParent !== null)
      .map((unit) => ({
        text: unit.textContent,
        lines: (() => {
          const range = document.createRange();
          range.selectNodeContents(unit);
          return new Set(
            [...range.getClientRects()]
              .filter((r) => r.width > 0)
              .map((r) => Math.round(r.top))
          ).size;
        })(),
      }));
    return {
      steps: steps.map((one) => one.getAttribute("data-step")),
      open: opened?.getAttribute("data-step"),
      words: opened?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      units,
      later: (() => {
        const later = [
          ...document.querySelectorAll<HTMLElement>(
            "[data-stream-relay] [data-relay-journey] button"
          ),
        ].find((button) => button.textContent?.trim() === laterWords);
        const card = document
          .querySelector("[data-stream-relay] [data-relay-journey]")
          ?.getBoundingClientRect();
        if (!(later && card)) {
          return null;
        }
        const style = getComputedStyle(later);
        const box = later.getBoundingClientRect();
        // The ghost hangs its padding past the card's edge, so its ink ends on it.
        return {
          hang: Math.round(box.right - card.right),
          ink: Math.round(
            box.right -
              Number.parseFloat(style.paddingInlineEnd) -
              Number.parseFloat(style.borderInlineEndWidth) -
              card.right
          ),
        };
      })(),
    };
  }, words.later);
  const scroll = await sideways(page);
  kit.check(
    `${leg.name} the journey standing on the name: steps ${read.steps.join(", ")}, the name open with its finding, Let CawCo add it and Skip the name, and ${words.later}, its ink on the card's edge (${read.later?.ink}px off, its box hanging ${read.later?.hang}px past it); the page scrolls nothing sideways`,
    read.steps.join() ===
      "machine,name,router,runtime,certificate,start,prove" &&
      read.open === "name" &&
      read.words.includes(words.nameUnresolved(NAME)) &&
      read.words.includes(words.letCawCoAdd) &&
      read.words.includes(words.skipName) &&
      read.later !== null &&
      Math.abs(read.later.ink) <= 1 &&
      scroll.page <= 0 &&
      // Past the section's box only by the ghost's own hang, its ink on the edge.
      (scroll.section ?? 0) <= Math.max(0, read.later.hang),
    JSON.stringify({ read, scroll })
  );
  if (leg.view === "phone") {
    const record = words.record(NAME, machine.address);
    const paren = read.units.find(
      (unit) => unit.text === "(DNS only, no proxy)"
    );
    await page
      .locator("[data-stream-relay]")
      .getByRole("button", { name: words.copyRecord })
      .click();
    const copied = await page.evaluate(
      () => (window as unknown as { copied: string | null }).copied
    );
    kit.check(
      `${leg.name} the record's "(DNS only, no proxy)" stands on one line (${paren?.lines} line), and Copy record takes the record exactly: "${copied}"`,
      paren?.lines === 1 && copied === record,
      JSON.stringify({ units: read.units, copied })
    );
  }
  await capture(page, `journey-name-${leg.name}`);
};

const summaryLeg = async (
  kit: Kit,
  base: string,
  leg: (typeof LEGS)[number]
) => {
  const page = await look(
    kit,
    base,
    leg,
    finished(live),
    "[data-relay-summary]"
  );
  const read = await page.evaluate(() => ({
    badge: document.querySelector("[data-relay-state]")?.textContent?.trim(),
    badgeClass: document.querySelector("[data-relay-state]")?.className ?? "",
    line: document
      .querySelector("[data-relay-line]")
      ?.textContent?.replace(/\s+/g, " ")
      .trim(),
    chips: [...document.querySelectorAll("[data-relay-port]")].map((chip) =>
      chip.textContent?.trim()
    ),
    errorUnder: (() => {
      const chips = document
        .querySelector("[data-relay-ports]")
        ?.getBoundingClientRect();
      const error = document
        .querySelector("[data-relay-port-error]")
        ?.getBoundingClientRect();
      return !!chips && !!error && error.top >= chips.bottom;
    })(),
    proven: document.querySelector("[data-relay-proven]")?.textContent?.trim(),
    checkAgain: document.querySelector("[data-relay-check-again]") !== null,
  }));
  kit.check(
    `${leg.name} the summary, live with tcp 443 down: "${read.badge}" in attn, "${read.line}", chips ${read.chips.join(", ")}, the error under them, "${read.proven}", Check again`,
    read.badge === words.portDown &&
      read.badgeClass.includes("status-attn") &&
      read.line === `${machine.address} · ${NAME}` &&
      JSON.stringify(read.chips) ===
        JSON.stringify(["udp 443 up", "tcp 443 down", "tls up"]) &&
      read.errorUnder &&
      read.proven?.startsWith(words.certificateEnds(live.endsAt as number)) ===
        true &&
      read.proven.includes("Proven from outside by CawCo on iPhone") &&
      read.checkAgain,
    JSON.stringify(read)
  );
  const gap = await page.evaluate(() => {
    const stop = document
      .querySelector<HTMLElement>("[data-relay-stop]")
      ?.getBoundingClientRect();
    const remove = document
      .querySelector<HTMLElement>("[data-relay-remove]")
      ?.getBoundingClientRect();
    if (!(stop && remove)) {
      return null;
    }
    // Side by side on one line, or Remove wrapped under Stop where the
    // row is too narrow for both labels: the gap on that axis.
    const wrapped = remove.top >= stop.bottom;
    return {
      wrapped,
      apart: Math.round(
        wrapped ? remove.top - stop.bottom : remove.left - stop.right
      ),
      space4: Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--space-4")
      ),
    };
  });
  kit.check(
    `${leg.name} Stop and the destructive Remove stand --space-4 apart (${gap?.apart}px, ${gap?.wrapped ? "Remove wrapped under Stop" : "side by side"})`,
    gap !== null && gap.apart === gap.space4,
    JSON.stringify(gap)
  );
  await capture(page, `summary-${leg.name}`);
  await page.click("[data-relay-remove]");
  await page.waitForSelector('section[data-ask="relay-remove"]');
  await settle(page, 500);
  const asked = await page.evaluate(() => {
    const tile = document.querySelector<HTMLElement>(
      'section[data-ask="relay-remove"] [data-slot="tile"]'
    );
    const trigger = document.querySelector<HTMLElement>("[data-relay-remove]");
    const section = document.querySelector<HTMLElement>("[data-relay-summary]");
    if (!(tile && trigger && section)) {
      return null;
    }
    const t = tile.getBoundingClientRect();
    const s = section.getBoundingClientRect();
    return {
      title: tile.querySelector('[data-slot="title"]')?.textContent?.trim(),
      body: tile.querySelector('[data-slot="body"]')?.textContent?.trim(),
      under: t.top >= trigger.getBoundingClientRect().bottom,
      inside: t.left >= s.left - 0.5 && t.right <= s.right + 0.5,
      held:
        trigger.hasAttribute("disabled") &&
        trigger.getAttribute("aria-expanded") === "true",
    };
  });
  const scroll = await sideways(page);
  kit.check(
    `${leg.name} Remove relay asks in place: "${asked?.title}", "${asked?.body}", under its button and inside the summary, the trigger held; nothing sideways`,
    asked !== null &&
      asked.title === words.removeTitle(machine.name) &&
      asked.body === words.removeBody(NAME) &&
      asked.under &&
      asked.inside &&
      asked.held &&
      scroll.page <= 0 &&
      scroll.section === 0,
    JSON.stringify({ asked, scroll })
  );
  await capture(page, `summary-remove-asked-${leg.name}`);
};

const otherStates = async (
  kit: Kit,
  base: string,
  leg: (typeof LEGS)[number]
) => {
  const stopped = await look(
    kit,
    base,
    leg,
    finished({ ...live, state: "stopped", ports: [] }),
    "[data-relay-summary]"
  );
  const stoppedRead = await stopped.evaluate(() => ({
    badge: document.querySelector("[data-relay-state]")?.textContent?.trim(),
    start: document
      .querySelector("[data-relay-start-again]")
      ?.textContent?.trim(),
    stop: document.querySelector("[data-relay-stop]") !== null,
    chips: document.querySelectorAll("[data-relay-port]").length,
  }));
  kit.check(
    `${leg.name} stopped: "${stoppedRead.badge}", ${words.startRelay} in Stop's place, no chips`,
    stoppedRead.badge === words.stopped &&
      stoppedRead.start === words.startRelay &&
      !stoppedRead.stop &&
      stoppedRead.chips === 0,
    JSON.stringify(stoppedRead)
  );
  await capture(stopped, `summary-stopped-${leg.name}`);
  const plain = await look(
    kit,
    base,
    leg,
    finished({
      ...live,
      name: null,
      endsAt: null,
      ports: PLAIN_PORTS,
    }),
    "[data-relay-summary]"
  );
  const plainRead = await plain.evaluate(() => ({
    line: document
      .querySelector("[data-relay-line]")
      ?.textContent?.replace(/\s+/g, " ")
      .trim(),
    addName: document
      .querySelector("[data-relay-add-name]")
      ?.textContent?.trim(),
    badge: document.querySelector("[data-relay-state]")?.textContent?.trim(),
  }));
  const scroll = await sideways(plain);
  kit.check(
    `${leg.name} no name: "${plainRead.line}", "${plainRead.badge}", and ${words.addName}; nothing sideways`,
    plainRead.line === machine.address &&
      plainRead.badge === words.live &&
      plainRead.addName === words.addName &&
      scroll.page <= 0,
    JSON.stringify(plainRead)
  );
  await capture(plain, `summary-no-name-${leg.name}`);
};

/** The contrast of each element's text on the ground under it, colours read through a canvas. */
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

const dark = async (kit: Kit, base: string, leg: (typeof LEGS)[number]) => {
  const cases = [
    {
      name: "set-up",
      journey: closed,
      ready: "[data-relay-set-up]",
      words: ["[data-relay-start] p", "[data-relay-start] h3"],
    },
    {
      name: "journey",
      journey: journeying,
      ready: "[data-relay-journey]",
      words: [
        '[data-stream-relay] [data-step="name"] [data-slot="step-label"]',
        '[data-stream-relay] [data-step="name"] [data-slot="step-body"] p',
      ],
    },
    {
      name: "summary",
      journey: finished(live),
      ready: "[data-relay-summary]",
      words: [
        "[data-relay-machine]",
        "[data-relay-line]",
        "[data-relay-port-error]",
        "[data-relay-proven]",
        "[data-relay-remove]",
      ],
    },
  ];
  for (const item of cases) {
    // biome-ignore lint/performance/noAwaitInLoops: one state at a time, each on its own page
    const page = await look(kit, base, leg, item.journey, item.ready, "dark");
    const on = await page.evaluate(() =>
      document.documentElement.classList.contains("dark")
    );
    const ratios = await contrasts(page, item.words);
    kit.check(
      `${leg.name} dark ${item.name}: ${ratios.map((r) => `${r.selector} ${r.ratio}:1`).join(", ")} (each ≥ 4.5:1)`,
      on && ratios.every((r) => r.ratio >= 4.5),
      JSON.stringify(ratios)
    );
    await capture(page, `${item.name}-dark-${leg.name}`);
  }
};

/** Tabs from the page's start until `selector` holds the focus. */
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
    const reach = width + Math.max(Number.parseFloat(style.outlineOffset), 0);
    const box = node.getBoundingClientRect();
    let clipped: string | null = null;
    for (let at = node.parentElement; at; at = at.parentElement) {
      const overflow = getComputedStyle(at);
      if (
        overflow.overflowX !== "visible" ||
        overflow.overflowY !== "visible"
      ) {
        const clip = at.getBoundingClientRect();
        if (
          box.left - reach < clip.left - 0.5 ||
          box.right + reach > clip.right + 0.5
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

const focus = async (kit: Kit, base: string, leg: (typeof LEGS)[number]) => {
  const cases = [
    {
      name: "set-up",
      journey: closed,
      ready: "[data-relay-set-up]",
      target: "[data-relay-set-up]",
      words: words.setUp,
    },
    {
      name: "remove",
      journey: finished(live),
      ready: "[data-relay-summary]",
      target: "[data-relay-remove]",
      words: words.remove,
    },
  ];
  for (const item of cases) {
    // biome-ignore lint/performance/noAwaitInLoops: one control at a time, each on its own page
    const page = await look(kit, base, leg, item.journey, item.ready);
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

/** A relay failure's first clause: what happened, up to its first colon or its first parenthesis. */
const HAPPENED =
  /^(?:The stream relay(?:'s certificate[^:]*?)? (?:could not start|was not renewed)[^:]*:|Let's Encrypt did not issue a certificate for \S+ \(|The certificate for \S+ was not issued:|certbot did not finish within \d+ s\.)/;
/** The verb its fix opens with. */
const FIX =
  /\b(?:Run|Install|Free|Give|Point|Check|Start|Try|Pick|Issue|Add)\b/;

/** Every relay failure, on sample values: what happened first, then the fix; a command it names sits in its sentence; no backtick, no 3478 or 5349. */
const failures = (kit: Kit): void => {
  const samples = {
    notLinux: RELAY_FAILURES.notLinux("relay"),
    noRuntime: RELAY_FAILURES.noRuntime("relay", "sudo apt install podman"),
    notDnsName: RELAY_FAILURES.notDnsName("relay", "relay_example"),
    lowPort: RELAY_FAILURES.lowPort("relay", 443),
    held: RELAY_FAILURES.held("relay", ["TCP 443 is held by caddy (pid 917)"]),
    noCertificate: RELAY_FAILURES.noCertificate("relay", NAME),
    coturnExited: RELAY_FAILURES.coturnExited(
      "relay",
      "1",
      "bind: Permission denied"
    ),
    coturnUnbound: RELAY_FAILURES.coturnUnbound("relay", ["TCP 443"], 20),
    certificateHttp: RELAY_FAILURES.certificateHttp(
      NAME,
      "Detail: DNS problem: NXDOMAIN looking up A"
    ),
    certificateDns: RELAY_FAILURES.certificateDns(
      NAME,
      "DNS problem: NXDOMAIN looking up TXT"
    ),
    certificatePort80: RELAY_FAILURES.certificatePort80(
      NAME,
      "TCP 80 is held by nginx (pid 12)"
    ),
    certbotSlow: RELAY_FAILURES.certbotSlow(180, true),
    renewNone: RELAY_FAILURES.renewNone("relay"),
    renewPort80: RELAY_FAILURES.renewPort80(
      "relay",
      NAME,
      "TCP 80 is held by nginx (pid 12)"
    ),
    renewRefused: RELAY_FAILURES.renewRefused(
      "relay",
      NAME,
      "Detail: too many certificates already issued"
    ),
  };
  const read = Object.entries(samples).map(([name, failure]) => {
    const head = HAPPENED.exec(failure.why)?.[0] ?? "";
    const fixAt = failure.why.search(FIX);
    return {
      name,
      ordered: head.length > 0 && fixAt >= head.length,
      command:
        failure.command === undefined || failure.why.includes(failure.command),
      backtick: failure.why.includes("`"),
    };
  });
  kit.check(
    `every relay failure (${read.length}) says what happened first, then the fix; a named command inside its sentence; no backtick`,
    read.every((row) => row.ordered && row.command && !row.backtick),
    JSON.stringify(
      read.filter((row) => !(row.ordered && row.command) || row.backtick)
    )
  );
  const sysctl = samples.lowPort.command ?? "";
  const all = JSON.stringify({ samples });
  kit.check(
    `the sysctl fix is one line that sets the value live and keeps it over a reboot ("${sysctl}"), the low-ports step says the same; no failure names 3478 or 5349`,
    sysctl ===
      "sudo sh -c 'sysctl -w net.ipv4.ip_unprivileged_port_start=443 && echo net.ipv4.ip_unprivileged_port_start=443 > /etc/sysctl.d/90-cawco-relay.conf'" &&
      words.runtimeCommand(443) === sysctl &&
      words.runtimeCommand(80) === sysctl.replaceAll("=443", "=80") &&
      !(all.includes("3478") || all.includes("5349")),
    JSON.stringify({ sysctl })
  );
};

const spec: Spec = {
  name: "stream-relay-step",
  run: async (kit: Kit) => {
    failures(kit);
    const base = await kit.built();
    for (const leg of LEGS) {
      // biome-ignore lint/performance/noAwaitInLoops: one width at a time, each state on its own page
      await before(kit, base, leg);
      await journeyLeg(kit, base, leg);
      await summaryLeg(kit, base, leg);
      await otherStates(kit, base, leg);
      await dark(kit, base, leg);
      await focus(kit, base, leg);
    }
  },
};

export default spec;
