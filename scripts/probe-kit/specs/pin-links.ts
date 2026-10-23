/**
 * Pointing at a place, and what changed since you looked (Projects spec
 * §5.7, "Pointing and what changed"). The owner: "why not make urself able
 * to link to specific chat threads in the transcript as chips? and u should
 * be able to guide me to where i need to look … like when i add a comment
 * and u respond and then a ui element is updated it should say so somehow".
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model) and the built dashboard at the desk, read from the engine:
 * the hub's answers, the page's doc (`window.cawcoArtifact.doc`), the
 * overlay's layers, the pane's and the transcript's DOM.
 *
 * 1. A turn holding a pin link, a resolved pin's, a decision card's, an
 *    artifact's and an unknown artifact's draws each known one as its chip:
 *    the label the hub holds now, the pin's disc (resolved: its 40% state),
 *    the card's checklist glyph, the page's document glyph; the unknown
 *    artifact as its label alone.
 * 2. A pin chip pressed while the pane shows another artifact opens its
 *    artifact with pin N's card open and its element chosen; a decision
 *    chip, likewise pressed, outlines its card.
 * 3. The hub's changes: a decision page's revision of one card yields that
 *    card alone in `meta.changes`, and its answer that card's link; a
 *    canvas patch yields its ids; a replaced picture yields its file.
 * 4. Marks: after comment_reply the pin's disc wears the unread dot on the
 *    page and in its Comments row, whose last line is `ink-strong`; opening
 *    its card clears it on the doc, and a second client (the artifact's own
 *    tab, by night) has it cleared; a revision's changed cards take the done
 *    wash, translucent, their words at 4.5:1 or better on it by day and
 *    night; the tag reads "2 changed since you looked", › steps "1 of 2" then
 *    "2 of 2" in page order, each step outlining its card; a later revision
 *    marks a seen card again; Send clears the round, dots too.
 * 5. With the tag stepping, the overlay draws one `brand-solid` mark on the
 *    page, 1px wide (The One Target Rule).
 *
 *   bun scripts/probe-kit/run.ts pin-links
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Color from "colorjs.io";
import type { Frame, Page } from "playwright-core";
import { PNG } from "pngjs";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { COMPOSER, type Kit, type KitFleet, open, type Spec } from "../kit";

const ROOT = join(import.meta.dir, "..", "..", "..");
const FRAME = 'iframe[title="Preview"]';
const PANE = ':is([data-slot="preview-pane"], [data-side-card="preview"])';
const SAY = "PROBE-SAY";
const UNKNOWN = "00000000-0000-4000-8000-000000000000";
/** An icon's first path in its body. */
const FIRST_PATH = / d="([^"]+)"/;
/** A computed colour that paints nothing. */
const CLEAR = /rgba\(.*,\s*0\)$|transparent/;

/** A decision page of three cards. */
const program = (
  when: string,
  who: string
) => `root = Decisions("Plan the run", [when, where, who])
${whenCard(when)}
daily = Option("daily", "Daily", "Every morning.", true, [], "Noisy.")
weekly = Option("weekly", "Weekly", "Mondays.", false, [], "Slow.")
where = Decision("where", "Where does it run?", [hub, edge], "On the hub today.")
hub = Option("hub", "The hub", "Nothing new to run.", true, [], "Far readers wait.")
edge = Option("edge", "An edge host", "Closer to readers.", false, [], "One more host.")
${whoCard(who)}
me = Option("me", "Me", "One inbox.", true, [], "The team never hears.")
team = Option("team", "The team", "Everyone hears.", false, [], "Noisier.")`;
function whenCard(question: string) {
  return `when = Decision("when", "${question}", [daily, weekly], "Nothing runs today.")`;
}
function whoCard(question: string) {
  return `who = Decision("who", "${question}", [me, team], "Nobody is told today.")`;
}
const WHEN = "When does it run?";
const WHO = "Who hears of it?";

const NOTES = `<!doctype html><html><head><title>Notes</title></head>
<body><main><h1>Notes</h1><p id="lede">A page the pane shows in between.</p></main></body></html>`;

/** The words the mock model says next, on a PROBE-SAY. */
let saying = "ok";
const respond = (request: Seen): Reply => {
  const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
  if (!request.tools) {
    return text("Pin links");
  }
  return request.last.includes(SAY) ? text(saying) : text("ok");
};

/** A Solar icon's first path, as unplugin-icons draws it: what tells one glyph from another. */
const solarPath = (name: string): string => {
  const icons = JSON.parse(
    readFileSync(
      join(ROOT, "packages/core/node_modules/@iconify-json/solar/icons.json"),
      "utf8"
    )
  ) as { icons: Record<string, { body: string }> };
  return icons.icons[name]?.body.match(FIRST_PATH)?.[1] ?? "";
};

interface Changes {
  at: string;
  items: { anchor: string; kind: string; label: string; removed?: true }[];
  revision: number;
}
interface Meta {
  changes?: Changes;
  seen?: Record<string, string[]>;
  sentAt?: string;
}
interface DocPin {
  id: string;
  number: number;
  resolvedBy?: string;
  seenAt?: string;
}
interface Box {
  h: number;
  w: number;
  x: number;
  y: number;
}

/** A frame's doc: its meta and its pins (the overlay's `window.cawcoArtifact`). */
const docIn = (frame: Frame) =>
  frame.evaluate(() => {
    const { doc } = (
      window as unknown as {
        cawcoArtifact: {
          doc: { getMap: (name: string) => { toJSON: () => unknown } };
        };
      }
    ).cawcoArtifact;
    return {
      meta: doc.getMap("meta").toJSON(),
      pins: doc.getMap("pins").toJSON(),
    };
  }) as Promise<{ meta: Meta; pins: Record<string, DocPin> }>;

/** The name of the artifact a frame's doc holds; none while it holds none. */
const nameIn = (frame: Frame | null) =>
  frame
    ?.evaluate(
      () =>
        (
          window as unknown as {
            cawcoArtifact?: {
              doc: { getMap: (n: string) => { get: (k: string) => unknown } };
            };
          }
        ).cawcoArtifact?.doc
          .getMap("meta")
          .get("name") as string | undefined
    )
    .catch(() => undefined);

/** The frame of `selector` on `page` once its doc names artifact `name`. */
const frameOf = async (page: Page, name: string, selector = FRAME) =>
  (await until(
    `${name}'s page in the pane`,
    async () => {
      const frames = await Promise.all(
        (await page.locator(selector).elementHandles()).map((handle) =>
          handle.contentFrame()
        )
      );
      const names = await Promise.all(frames.map(nameIn));
      return frames[names.indexOf(name)] ?? undefined;
    },
    Boolean,
    90_000
  )) as Frame;

/** The overlay's target outline in the frame's viewport, and whether it is the chosen line (no `data-rest`). */
const outlineIn = (frame: Frame) =>
  frame.evaluate(() => {
    const rect = document
      .querySelector("cawco-overlay")
      ?.shadowRoot?.querySelector<HTMLElement>(".rect");
    if (!rect || rect.hidden) {
      return null;
    }
    const r = rect.getBoundingClientRect();
    return {
      x: r.x,
      y: r.y,
      w: r.width,
      h: r.height,
      chosen: !rect.hasAttribute("data-rest"),
    };
  });
const boxIn = (frame: Frame, selector: string) =>
  frame.locator(selector).evaluate((el): Box => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
const near = (a: Box | null, b: Box, slack = 2) =>
  !!a &&
  Math.abs(a.x - b.x) <= slack &&
  Math.abs(a.y - b.y) <= slack &&
  Math.abs(a.w - b.w) <= slack &&
  Math.abs(a.h - b.h) <= slack;
/** `selector`'s element outlined as chosen in the frame, read until it is: the outline's box and the element's. */
const chosenOn = async (frame: Frame, selector: string, ms = 10_000) => {
  const read = async () => ({
    outline: await outlineIn(frame),
    box: await boxIn(frame, selector),
  });
  return await until(
    `${selector} chosen`,
    read,
    (at) => !!at.outline?.chosen && near(at.outline, at.box),
    ms
  ).catch(read);
};
const isChosen = (at: Awaited<ReturnType<typeof chosenOn>>) =>
  !!at.outline?.chosen && near(at.outline, at.box);

/** Whether pin `number`'s disc on the page wears the unread dot. */
const dotOn = (frame: Frame, number: number) =>
  frame.evaluate(
    (n) =>
      !!document.querySelector(
        `svg[data-cawco-pins] g[data-pin-dot="${n}"] circle[data-unread]`
      ),
    number
  );
/** How many done washes the page holds. */
const washCount = (frame: Frame) =>
  frame.evaluate(
    () =>
      document.querySelectorAll("g[data-cawco-changes] rect[data-change]")
        .length
  );

/** The done wash over `selector`, its box and the element's, the words' ink and the first opaque ground under them. */
const washRead = (frame: Frame, selector: string) =>
  frame.evaluate(
    ({ anchor, clear }) => {
      const wash = document.querySelector(
        `svg[data-cawco-pins] g[data-cawco-changes] rect[data-change='${anchor}']`
      );
      const el = document.querySelector(anchor);
      if (!(wash && el)) {
        return null;
      }
      let ground: Element | null = el;
      while (
        ground?.parentElement &&
        new RegExp(clear).test(getComputedStyle(ground).backgroundColor)
      ) {
        ground = ground.parentElement;
      }
      const r = el.getBoundingClientRect();
      const at = (name: string) => Number(wash.getAttribute(name));
      return {
        fill: wash.getAttribute("fill") ?? "",
        box: {
          x: at("x") - scrollX,
          y: at("y") - scrollY,
          w: at("width"),
          h: at("height"),
        },
        el: { x: r.x, y: r.y, w: r.width, h: r.height },
        ink: getComputedStyle(el.querySelector("h2") ?? el).color,
        ground: ground ? getComputedStyle(ground).backgroundColor : "white",
      };
    },
    { anchor: selector, clear: CLEAR.source }
  );
/** The wash as read, with its alpha and the words' contrast on the blend (WCAG 2.1). */
const washOn = async (frame: Frame, selector: string) => {
  const read = await washRead(frame, selector);
  if (!read) {
    return null;
  }
  const fill = new Color(read.fill);
  const solid = new Color(fill).to("srgb").set("alpha", 1);
  const blend = new Color(read.ground).mix(solid, fill.alpha, {
    space: "srgb",
  });
  return {
    ...read,
    alpha: fill.alpha,
    contrast: new Color(read.ink).contrast(blend, "WCAG21"),
  };
};

/**
 * The One Target Rule's scan (5): every mark in `brand-solid` the overlay
 * draws over the page (its shadow's chrome, its pin and ink layers): an
 * outline, a border, a fill, an SVG fill or stroke, with its width.
 */
const coralMarks = (frame: Frame) =>
  frame.evaluate(() => {
    const shadow = document.querySelector("cawco-overlay")?.shadowRoot;
    const probe = document.createElement("span");
    probe.style.color = "var(--brand-solid)";
    shadow?.append(probe);
    const brand = getComputedStyle(probe).color;
    probe.remove();
    const own = [
      ...(shadow ? shadow.querySelectorAll("*") : []),
      ...document.querySelectorAll(
        "svg[data-cawco-pins] *, svg[data-cawco-ink] *"
      ),
    ].filter((el) => !(el instanceof HTMLElement && el.hidden));
    return own.flatMap((el) => {
      const cs = getComputedStyle(el);
      const name = `${el.localName}.${el.getAttribute("class") ?? ""}`;
      const outline =
        cs.outlineStyle !== "none" && cs.outlineColor === brand
          ? Number.parseFloat(cs.outlineWidth)
          : 0;
      const marks = [
        { what: `${name} outline`, width: outline },
        ...(["Top", "Right", "Bottom", "Left"] as const).map((side) => ({
          what: `${name} border-${side}`,
          width:
            cs[`border${side}Style`] !== "none" &&
            cs[`border${side}Color`] === brand
              ? Number.parseFloat(cs[`border${side}Width`])
              : 0,
        })),
        {
          what: `${name} fill`,
          width:
            cs.backgroundColor === brand || cs.fill === brand
              ? Number.POSITIVE_INFINITY
              : 0,
        },
        {
          what: `${name} stroke`,
          width: cs.stroke === brand ? Number.parseFloat(cs.strokeWidth) : 0,
        },
      ];
      return cs.display === "none" ? [] : marks.filter((m) => m.width > 0);
    });
  });

/** The person's pin, written in the page's own doc as its overlay writes one. */
const pinOn = (
  frame: Frame,
  pin: { id: string; number: number; selector: string; text: string }
) =>
  frame.evaluate((one) => {
    const { doc } = (
      window as unknown as {
        cawcoArtifact: {
          doc: {
            getMap: (n: string) => { set: (k: string, v: unknown) => void };
          };
        };
      }
    ).cawcoArtifact;
    const at = new Date().toISOString();
    doc.getMap("pins").set(one.id, {
      id: one.id,
      number: one.number,
      kind: "comment",
      anchor: { selector: one.selector, source: null, text: "" },
      at,
      by: "person",
      elements: [],
      thread: [{ id: crypto.randomUUID(), by: "person", text: one.text, at }],
    });
  }, pin);

interface On {
  /** The session's artifact routes: a POST with `body`, else a GET. */
  api: <T>(path: string, body?: object) => Promise<T>;
  base: string;
  desk: Page;
  fleet: KitFleet;
  kit: Kit;
  pins: readonly [string, string];
  plan: string;
  said: string[];
  session: string;
}

/** The fleet, the session, the desk on it; the decision page and the person's two pins on it. */
const setUp = async (kit: Kit): Promise<On> => {
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const session = await fleet.spawn("claude", "Pin links", fleet.repo);
  const base = await fleet.dashboard();
  const desk = await kit.page("desk", { theme: "light" });
  const said: string[] = [];
  desk.on("pageerror", (error) => said.push(`pageerror: ${error.message}`));
  await open(desk, `${base}/session/${session}`, COMPOSER);
  const api = <T>(path: string, body?: object) =>
    fleet.api<T>(`/api/instances/${session}/artifacts${path}`, body);
  // 3. The decision page's create answers its link and every card's.
  const plan = await api<{
    cards?: Record<string, string>;
    id: string;
    link?: string;
  }>("", {
    kind: "page",
    does: "pick",
    ask: "Pick how the routine runs",
    name: "plan",
    program: program(WHEN, WHO),
  });
  kit.check(
    "3: artifact_create answers the page's link and each card's",
    plan.link === `[plan](cawco:artifact/${plan.id})` &&
      plan.cards?.when === `[${WHEN}](cawco:decision/${plan.id}/when)` &&
      Object.keys(plan.cards ?? {}).join() === "when,where,who",
    JSON.stringify({ link: plan.link, cards: plan.cards })
  );
  const frame = await frameOf(desk, "plan");
  // The person pins what the page shows: its cards drawn first.
  await frame.locator("#decision-who").waitFor({ timeout: 30_000 });
  const pins = [crypto.randomUUID(), crypto.randomUUID()] as const;
  await pinOn(frame, {
    id: pins[0],
    number: 1,
    selector: "#decision-where",
    text: "Say where it runs plainer",
  });
  await pinOn(frame, {
    id: pins[1],
    number: 2,
    selector: "#decision-who",
    text: "Who is the team here?",
  });
  await until(
    "the pins on the hub",
    () => fleet.api<{ pins: unknown[] }>(`/api/artifacts/${plan.id}/places`),
    (read) => read.pins.length === 2,
    20_000
  );
  return {
    api,
    base,
    desk,
    fleet,
    kit,
    pins,
    plan: plan.id,
    said,
    session,
  };
};

/** 4a. The agent answers pin 1 and resolves pin 2: their links, pin 1's dot on the page and in its row. */
const answered = async (on: On) => {
  const { api, desk, kit, plan, pins } = on;
  const replied = await api<{ link?: string }>(`/comments/${pins[0]}/reply`, {
    text: "Said it plainer: the hub runs it.",
  });
  const resolved = await api<{ link?: string }>(
    `/comments/${pins[1]}/resolve`,
    { text: "The team is everyone in the project." }
  );
  kit.check(
    "4: comment_reply and comment_resolve answer the pin's link",
    !!replied.link?.endsWith(`(cawco:pin/${plan}/1)`) &&
      !!resolved.link?.endsWith(`(cawco:pin/${plan}/2)`),
    `${replied.link} | ${resolved.link}`
  );
  const frame = await frameOf(desk, "plan");
  const dotted = await until(
    "pin 1's unread dot on the page",
    () => dotOn(frame, 1),
    Boolean,
    15_000
  ).catch(() => false);
  kit.check(
    "4: after comment_reply, pin 1's disc on the page wears the unread dot",
    dotted
  );
  const resolvedBy = (await docIn(frame)).pins[pins[1]]?.resolvedBy;
  kit.check(
    "4: comment_resolve stamps resolvedBy agent",
    resolvedBy === "agent",
    String(resolvedBy)
  );
  const comments = desk.locator(`${PANE} button[data-slot="comments"]`);
  await comments.click();
  const row = desk.locator('[data-pin-list-pop] [data-pin-row="1"]');
  await row.waitFor({ timeout: 10_000 });
  const read = await row.evaluate((el) => {
    const probe = document.createElement("span");
    probe.style.color = "var(--ink-strong)";
    document.body.append(probe);
    const strong = getComputedStyle(probe).color;
    probe.remove();
    const last = el.querySelector('[data-slot="last"]');
    return {
      unread: el.hasAttribute("data-unread"),
      dot: !!el.querySelector('[data-slot="unread"]'),
      last: last ? getComputedStyle(last).color : null,
      strong,
      said: el.querySelector(".sr-only")?.textContent ?? "",
    };
  });
  kit.check(
    '4: its Comments row wears the dot, its last line in ink-strong, and says "Pin 1, new answer"',
    read.unread &&
      read.dot &&
      read.last === read.strong &&
      read.said.startsWith("Pin 1, new answer"),
    JSON.stringify(read)
  );
  await comments.click();
};

/** 3b. One card revised: that card alone is the revision's change, and the answer names its link. */
const revisedOnce = async (on: On) => {
  const { api, desk, kit, plan } = on;
  const question = "When does the routine run?";
  const revised = await api<{ cards?: Record<string, string> }>(
    `/${plan}/statements`,
    { statements: whenCard(question) }
  );
  const frame = await frameOf(desk, "plan");
  const changes = await until(
    "the revision's changes in the doc",
    async () => (await docIn(frame)).meta.changes,
    (read) => read.revision >= 2,
    20_000
  );
  kit.check(
    "3: a decision page revision that changes one card yields exactly that card in meta.changes",
    JSON.stringify(changes.items) ===
      JSON.stringify([
        { kind: "card", anchor: "#decision-when", label: question },
      ]) &&
      Object.keys(revised.cards ?? {}).join() === "when" &&
      revised.cards?.when === `[${question}](cawco:decision/${plan}/when)`,
    JSON.stringify({ items: changes.items, cards: revised.cards })
  );
  return question;
};

/** A chip in the transcript, the newest of its kind and place. */
const chipAt = (desk: Page, kind: string, place: string) =>
  desk.locator(`[data-place-chip="${kind}"][data-place="${place}"]`).last();

/** What a chip draws: its label, title, disc, states and glyph; null when there is none. */
const chipRead = (desk: Page, kind: string, place: string) =>
  desk.evaluate(
    ({ k, p }) => {
      const all = document.querySelectorAll(
        `[data-place-chip="${k}"][data-place="${p}"]`
      );
      const el = all.item(all.length - 1);
      return el
        ? {
            label: el.querySelector('[data-slot="label"]')?.textContent ?? "",
            title: el.getAttribute("title") ?? "",
            disc: el.querySelector('[data-slot="disc"]')?.textContent ?? null,
            resolved: !!el.querySelector('[data-slot="disc"][data-resolved]'),
            unread: !!el.querySelector('[data-slot="unread"]'),
            path: el.querySelector("svg path")?.getAttribute("d") ?? null,
          }
        : null;
    },
    { k: kind, p: place }
  );

/** 1. A turn holding each link kind: each known one drawn as its chip, the unknown as its label. */
const transcript = async (on: On, question: string) => {
  const { desk, fleet, kit, plan, session } = on;
  const places = await fleet.api<{ pins: { name: string; number: number }[] }>(
    `/api/artifacts/${plan}/places`
  );
  const pinName = places.pins.find((one) => one.number === 1)?.name ?? "";
  saying = [
    `Answered [Where](cawco:pin/${plan}/1)`,
    `and [Who](cawco:pin/${plan}/2),`,
    `reworded [When](cawco:decision/${plan}/when)`,
    `on [the plan](cawco:artifact/${plan})`,
    `and left [Gone page](cawco:artifact/${UNKNOWN}).`,
  ].join(" ");
  await fleet.send(session, SAY);
  await chipAt(desk, "pin", `${plan}/1`).waitFor({ timeout: 60_000 });
  const pin = await chipRead(desk, "pin", `${plan}/1`);
  kit.check(
    "1: a pin link draws the pin chip: its disc with its number, what it stands on as its label, the unread dot",
    pin?.disc === "1" &&
      pin.label === pinName &&
      pin.unread &&
      pin.title === `Pin 1 on ${pinName}`,
    JSON.stringify(pin)
  );
  const resolved = await chipRead(desk, "pin", `${plan}/2`);
  kit.check(
    "1: a resolved pin's chip shows its resolved state (its disc at 40%, its title)",
    !!resolved?.resolved && resolved.title === "Pin 2 · resolved",
    JSON.stringify(resolved)
  );
  const card = await chipRead(desk, "decision", `${plan}/when`);
  kit.check(
    "1: a decision link draws the card's checklist glyph and its current question",
    card?.label === question &&
      card.path === solarPath("checklist-bold-duotone") &&
      card.title === `${question} · not picked`,
    JSON.stringify(card)
  );
  const artifact = await chipRead(desk, "artifact", plan);
  kit.check(
    "1: an artifact link draws the page's document glyph and its name",
    artifact?.label === "plan" &&
      artifact.path === solarPath("document-text-bold-duotone"),
    JSON.stringify(artifact)
  );
  const unknown = await chipRead(desk, "artifact", UNKNOWN);
  const words = await desk.evaluate(
    () => document.body.textContent?.includes("Gone page") ?? false
  );
  kit.check(
    "1: an unknown artifact draws its label alone",
    unknown === null && words,
    JSON.stringify(unknown)
  );
};

/** 2 and 4b. Chips pressed while the pane shows another artifact; pin 1's card open is its look, cleared everywhere. */
const presses = async (on: On) => {
  const { api, base, desk, kit, plan, pins } = on;
  const notes = await api<{ id: string }>("", {
    kind: "page",
    does: "judge",
    ask: "Judge the notes",
    name: "notes",
    html: NOTES,
  });
  await frameOf(desk, "notes");
  await chipAt(desk, "pin", `${plan}/1`).click();
  let frame = await frameOf(desk, "plan");
  const cardOpen = await desk
    .locator('[data-slot="pin-card"][data-pin-card="1"]')
    .waitFor({ timeout: 20_000 })
    .then(
      () => true,
      () => false
    );
  const chosen = await chosenOn(frame, "#decision-where");
  kit.check(
    "2: a pin chip pressed before its page is loaded opens that artifact with pin 1's card open and its element chosen",
    cardOpen && isChosen(chosen),
    JSON.stringify({ cardOpen, chosen })
  );
  const seenAt = await until(
    "pin 1 seen on the doc",
    async () => (await docIn(frame)).pins[pins[0]]?.seenAt,
    Boolean,
    10_000
  ).catch(() => undefined);
  const night = await kit.page("desk", { theme: "dark" });
  await open(night, `${base}/artifact/${plan}`, FRAME);
  const readNight = async () => {
    const nightFrame = await frameOf(night, "plan");
    return {
      seenAt: (await docIn(nightFrame)).pins[pins[0]]?.seenAt,
      dot: await dotOn(nightFrame, 1),
    };
  };
  const nightClear = await until(
    "pin 1 cleared on the second client",
    readNight,
    (read) => !!read.seenAt && !read.dot,
    20_000
  ).catch(readNight);
  const chipDots = () =>
    chipAt(desk, "pin", `${plan}/1`).locator('[data-slot="unread"]').count();
  const chipDot = await until(
    "pin 1's chip without its dot",
    chipDots,
    (count) => count === 0,
    10_000
  ).catch(chipDots);
  kit.check(
    "4: opening the card clears the dot on the doc (seenAt), so a second client and the chip see it cleared",
    !!seenAt && !!nightClear.seenAt && !nightClear.dot && chipDot === 0,
    JSON.stringify({ seenAt, nightClear, chipDot })
  );
  await desk.keyboard.press("Escape");
  await api(`/${notes.id}/show`, {});
  await frameOf(desk, "notes");
  await chipAt(desk, "decision", `${plan}/when`).click();
  frame = await frameOf(desk, "plan");
  const outlined = await chosenOn(frame, "#decision-when", 15_000);
  kit.check(
    "2: a decision chip pressed before its page is loaded scrolls to its card and outlines it",
    isChosen(outlined),
    JSON.stringify(outlined)
  );
  return night;
};

/** 4c and 5. Two cards revised: the done wash on each, by day and night; the tag and its steps; one target. */
const stepping = async (on: On, night: Page) => {
  const { api, desk, kit, plan } = on;
  await api(`/${plan}/statements`, {
    statements: `${whenCard("When does the routine run each week?")}\n${whoCard("Who hears when it runs?")}`,
  });
  const frame = await frameOf(desk, "plan");
  const both = async () => ({
    when: await washOn(frame, "#decision-when"),
    who: await washOn(frame, "#decision-who"),
  });
  const washes = await until(
    "the done wash on both cards",
    both,
    (read) => !!(read.when && read.who),
    15_000
  ).catch(both);
  kit.check(
    "4: each changed card shows the done wash over its box",
    !!(washes.when && washes.who) &&
      near(washes.when.box, washes.when.el, 1) &&
      near(washes.who.box, washes.who.el, 1),
    JSON.stringify(washes)
  );
  const nightRead = async () => {
    const nightFrame = await frameOf(night, "plan");
    return {
      wash: await washOn(nightFrame, "#decision-when"),
      changes: (await docIn(nightFrame)).meta.changes,
    };
  };
  const byNight = await until(
    "the done wash by night",
    nightRead,
    (read) => !!read.wash,
    15_000
  ).catch(nightRead);
  const day = washes.when;
  kit.check(
    "4: the wash is translucent and the card's words hold 4.5:1 or better on it, by day and by night",
    !!(day && byNight.wash) &&
      day.alpha > 0 &&
      day.alpha < 0.5 &&
      day.contrast >= 4.5 &&
      byNight.wash.contrast >= 4.5,
    JSON.stringify({
      day: day && {
        fill: day.fill,
        contrast: day.contrast.toFixed(2),
        ink: day.ink,
        ground: day.ground,
      },
      night: byNight.wash
        ? {
            fill: byNight.wash.fill,
            contrast: byNight.wash.contrast.toFixed(2),
            ink: byNight.wash.ink,
            ground: byNight.wash.ground,
          }
        : { changes: byNight.changes },
    })
  );
  const tag = desk.locator(`${PANE} [data-slot="changes-tag"]`);
  const count = tag.locator('[data-slot="changes-count"]');
  const words = async () => (await count.textContent().catch(() => ""))?.trim();
  const said = await until(
    "the tag",
    words,
    (read) => read === "2 changed since you looked",
    10_000
  ).catch(words);
  kit.check(
    'the tag reads "2 changed since you looked"',
    said === "2 changed since you looked",
    String(said)
  );
  const next = tag.getByRole("button", { name: "Next change" });
  for (const [at, selector] of [
    ["1 of 2", "#decision-when"],
    ["2 of 2", "#decision-who"],
  ] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: each step follows the one before it
    await next.click();
    const step = await chosenOn(frame, selector);
    const reads = await words();
    kit.check(
      `4: › steps to "${at}", ${selector} in page order, outlined as chosen`,
      !!reads?.startsWith(at) && isChosen(step),
      JSON.stringify({ reads, step })
    );
  }
  const marks = await coralMarks(frame);
  kit.check(
    "5: with the tag stepping, the overlay draws one brand-solid mark on the page, 1px wide",
    marks.length === 1 && (marks[0]?.width ?? 0) <= 1,
    JSON.stringify(marks)
  );
  const lookedRead = async () => {
    const { meta } = await docIn(frame);
    return {
      seen: meta.seen?.[String(meta.changes?.revision)] ?? [],
      washes: await washCount(frame),
    };
  };
  const looked = await until(
    "both changes seen, their washes gone",
    lookedRead,
    (read) => read.seen.length === 2 && read.washes === 0,
    10_000
  ).catch(lookedRead);
  kit.check(
    "4: each step is the person's look: both anchors seen on the doc, and their washes faded off",
    looked.seen.length === 2 && looked.washes === 0,
    JSON.stringify(looked)
  );
  await api(`/${plan}/statements`, {
    statements: whenCard("When does the routine run each month?"),
  });
  const againRead = async () => ({
    wash: !!(await washOn(frame, "#decision-when")),
    words: await words(),
  });
  const again = await until(
    "the seen card marked again",
    againRead,
    (read) => read.wash && read.words === "1 changed since you looked",
    20_000
  ).catch(againRead);
  kit.check(
    "4: a later revision that changes a seen card marks it again",
    again.wash && again.words === "1 changed since you looked",
    JSON.stringify(again)
  );
  return { frame, tag };
};

/** 4e. Send clears the round: the wash, the tag, a pin's unread dot. */
const sendClears = async (
  on: On,
  { frame, tag }: Awaited<ReturnType<typeof stepping>>
) => {
  const { api, desk, kit, pins } = on;
  await api(`/comments/${pins[0]}/reply`, { text: "And it runs monthly." });
  const again = await until(
    "pin 1 unread again",
    () => dotOn(frame, 1),
    Boolean,
    15_000
  ).catch(async () => JSON.stringify((await docIn(frame)).pins[pins[0]]));
  kit.check(
    "4: a new answer on a pin already looked at wears the dot again",
    again === true,
    String(again)
  );
  await frame.locator('#decision-where [data-option="edge"]').click();
  const send = desk.locator(`${PANE} button[data-slot="send"]`);
  await send.waitFor({ timeout: 10_000 });
  await send.click();
  const read = async () => ({
    sentAt: (await docIn(frame)).meta.sentAt,
    tag: await tag.count(),
    washes: await washCount(frame),
    dot: await dotOn(frame, 1),
  });
  const cleared = await until(
    "the round cleared by Send",
    read,
    (at) => !!at.sentAt && at.tag === 0 && at.washes === 0 && !at.dot,
    20_000
  ).catch(read);
  kit.check(
    "4: Send clears the round: no tag, no wash, no unread dot",
    !!cleared.sentAt &&
      cleared.tag === 0 &&
      cleared.washes === 0 &&
      !cleared.dot,
    JSON.stringify(cleared)
  );
};

/** 3c. A canvas patch yields the ids it wrote. */
const canvasIds = async (on: On) => {
  const { api, desk, kit, session, fleet } = on;
  const sketch = await api<{ id: string }>("", {
    kind: "canvas",
    does: "draw",
    ask: "Draw the flow",
    name: "sketch",
    elements: [
      {
        type: "rectangle",
        id: "api",
        x: 0,
        y: 0,
        width: 160,
        height: 60,
        label: { text: "API" },
      },
    ],
  });
  const frame = await frameOf(desk, "sketch", 'iframe[title="Canvas"]');
  await fetch(`${fleet.base}/api/instances/${session}/artifacts/${sketch.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      elements: [
        {
          type: "rectangle",
          id: "db",
          x: 0,
          y: 120,
          width: 160,
          height: 60,
          label: { text: "Database" },
        },
      ],
    }),
  });
  const read = async () => (await docIn(frame)).meta.changes;
  const drawn = await until(
    "the canvas patch's changes",
    read,
    (changes) => changes.items.length > 0,
    20_000
  ).catch(read);
  kit.check(
    "3: a canvas patch yields its ids",
    JSON.stringify(drawn?.items) ===
      JSON.stringify([{ kind: "canvas", anchor: "db", label: "Database" }]),
    JSON.stringify(drawn)
  );
  // 4f. The canvas marks it too: the wash over the element, the tag over the canvas, a step to it.
  const canvasWash = () =>
    frame.evaluate(() => {
      const wash = document.querySelector<HTMLElement>(
        '.canvas-change[data-change="db"]:not([data-leaving])'
      );
      const probe = document.createElement("span");
      probe.style.color = "var(--c-change-tint)";
      document.body.append(probe);
      const token = getComputedStyle(probe).color;
      probe.remove();
      return wash
        ? {
            fill: getComputedStyle(wash).backgroundColor,
            token,
            w: wash.offsetWidth,
            h: wash.offsetHeight,
          }
        : null;
    });
  const wash = await until(
    "the canvas's wash",
    canvasWash,
    (at) => !!at,
    15_000
  ).catch(canvasWash);
  kit.check(
    "4: a canvas patch's element takes the done tint over it, in c-change-tint",
    !!wash && wash.fill === wash.token && wash.w > 0 && wash.h > 0,
    JSON.stringify(wash)
  );
  const tag = desk.locator('[data-slot="changes-tag"]');
  const count = tag.locator('[data-slot="changes-count"]');
  const words = async () => (await count.textContent().catch(() => ""))?.trim();
  const said = await until(
    "the tag over the canvas",
    words,
    (at) => at === "1 changed since you looked",
    10_000
  ).catch(words);
  kit.check(
    'the tag over the canvas reads "1 changed since you looked"',
    said === "1 changed since you looked",
    String(said)
  );
  await tag.getByRole("button", { name: "Next change" }).click();
  const stepRead = async () => ({
    words: await words(),
    chosen: await frame.evaluate(
      () => !!document.querySelector('.canvas-chosen[data-chosen="db"]')
    ),
    seen: (await docIn(frame)).meta.seen,
    washes: await frame.evaluate(
      () =>
        document.querySelectorAll(".canvas-change:not([data-leaving])").length
    ),
  });
  const step = await until(
    "the step onto the canvas's change",
    stepRead,
    (at) =>
      !!at.words?.startsWith("1 of 1") &&
      at.chosen &&
      Object.values(at.seen ?? {}).some((ids) => ids.includes("db")) &&
      at.washes === 0,
    10_000
  ).catch(stepRead);
  kit.check(
    '4: › on the canvas steps to "1 of 1", draws its chosen line and is the person\'s look (seen, its wash faded off)',
    !!step.words?.startsWith("1 of 1") &&
      step.chosen &&
      Object.values(step.seen ?? {}).some((ids) => ids.includes("db")) &&
      step.washes === 0,
    JSON.stringify(step)
  );
};

/** 3d. A replaced picture yields its file. */
const pictureFile = async (on: On) => {
  const { api, desk, fleet, kit } = on;
  const pictures = join(fleet.sandbox, "pictures");
  mkdirSync(pictures, { recursive: true });
  const image = join(pictures, "landing.png");
  const png = (shade: number) => {
    const one = new PNG({ width: 64, height: 40 });
    one.data.fill(shade);
    return PNG.sync.write(one);
  };
  writeFileSync(image, png(200));
  const shot = `shot = Image("${image}", "The landing as it stands", "Today's landing")`;
  const look = await api<{ id: string }>("", {
    kind: "page",
    does: "pick",
    ask: "Pick the landing",
    name: "look",
    program: `root = Decisions("Pick the landing", [land])
land = Decision("land", "Which landing ships?", [keep, swap], "Today's landing.", [shot])
keep = Option("keep", "Keep it", "Nothing moves.", true, [], "It stays plain.")
swap = Option("swap", "Swap it", "A new one.", false, [], "More to build.")
${shot}`,
  });
  const frame = await frameOf(desk, "look");
  writeFileSync(image, png(40));
  await api(`/${look.id}/statements`, { statements: shot });
  const read = async () => (await docIn(frame)).meta.changes;
  const replaced = await until(
    "the replaced picture's change",
    read,
    (changes) => changes.revision >= 2,
    20_000
  ).catch(read);
  const [item] = replaced?.items ?? [];
  kit.check(
    "3: a replaced picture yields its file, and no card",
    replaced?.items.length === 1 &&
      item?.kind === "picture" &&
      item.label === "landing.png" &&
      item.anchor.startsWith('img[src="files/'),
    JSON.stringify(replaced)
  );
};

const run = async (kit: Kit) => {
  const on = await setUp(kit);
  await answered(on);
  const question = await revisedOnce(on);
  await transcript(on, question);
  const night = await presses(on);
  await sendClears(on, await stepping(on, night));
  await canvasIds(on);
  await pictureFile(on);
  kit.check(
    "no page error on the desk",
    on.said.length === 0,
    on.said.slice(0, 3).join(" | ")
  );
};

const spec: Spec = { name: "pin-links", run };
export default spec;
