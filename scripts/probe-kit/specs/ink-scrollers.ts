/**
 * Ink stays on what it was drawn on, whatever scrolls (the person's report on
 * onboarding-first-minutes, 2026-11-04: "drawn annotations ... moving along
 * with the scroll"). His page's body stands at the viewport's height and its
 * cards scroll in its first row; a Preview there is 1440 by 900, nearly as big
 * as the body, so a stroke on it read as the page's own box and stood on the
 * body, which never moves. No hub: the overlay's own build on pages this spec
 * serves, in Draw with the mouse, read from the page's doc and the ink layer.
 * Each check at a desk and on a phone:
 *
 * 1. A line and a loop over a page-sized frame whose overlay answers stand on
 *    the elements its embed names, and move with the page's scroller and with
 *    the embed's own.
 * 2. Over a page-sized frame whose document runs no overlay: on the frame, by
 *    the artifact it shows, moving with the page's scroller.
 * 3. Over no content in a scroller: on the content nearest, never the body,
 *    moving with the scroller; the same in a pane's gap.
 * 4. On words a `pre` scrolls itself: on the `pre` with its scroll kept, moved
 *    by what it scrolls since.
 * 5. Marks on content below the page's foot give the page no scroll of its own.
 * 6. A reload draws every group where it stood on its content; a frame mounted
 *    later than a mark's patience (absent.ts) leaves its marks on the page.
 * 7. A pin on ink stands hidden once its strokes have scrolled out of view.
 *
 * And on pages that scroll otherwise:
 *
 * 8. On a fixed bar: it stays on the bar through the document's scroll, and a
 *    stroke on the document's content moves with it. Over nothing on a document
 *    that scrolls itself: the body, as before.
 * 9. A body that is its own scroller carries a stroke over nothing.
 * 10. A comment with no ink on a fixed bar or a sticky head stays on it through
 *    the document's scroll; on the page's words it moves with them.
 * 11. Strokes drawn end to end join one group at any width (a box read back
 *    from rounded fractions stood a tenth of a px short); a stroke lifted over
 *    the root's gutter leaves its icon whole on the page, where a press opens
 *    its menu.
 * 12. Moving 30 groups through 180 frames of an inner scroller lays the page
 *    out at most three times a frame, the scroll's own among them (33 a frame
 *    when each group drew itself again), and outlines no stroke again.
 * 13. A stroke over an embed's own gap stands on the content nearest it there,
 *    and the embed's scroll carries it.
 * 14. Words that changed while nothing was open: on the page as it was served,
 *    a stroke stays on its element, in the page, in a same-origin frame and in
 *    an embed; one kept before anchors said their page, moved aside for it,
 *    comes back; with the page revised it goes to the moved tray.
 */
import type { Frame, Page } from "playwright-core";
import { bundleOverlay } from "../../../packages/core/src/preview-proxy";
import type { Kit, Spec } from "../kit";
import { dragFromIcon } from "./ink";

const ARTIFACT = "11111111-2222-4333-8444-555555555555";
const BRIDGED = "aaaa";
const BARE = "bbbb";
/** What a move is held to, px: the layout's own rounding. */
const SLOP = 3;
/** Past a mark's patience for an element standing missing (absent.ts `GONE_AFTER_MS`). */
const LATE_MS = 3000;

const OVERLAY_TAG = `<script src="/__cawco/overlay.js" data-page-hash="spec"></script>`;
const VIEWPORT = `<meta name="viewport" content="width=device-width,initial-scale=1">`;
const SEEDED_TAG = `${VIEWPORT}<script src="/__cawco/overlay.js" data-page-hash="spec" data-artifact="${ARTIFACT}" data-state="AAA=" data-kind="page"></script>`;

const tiles = Array.from(
  { length: 60 },
  (_, i) =>
    `<div id="t${i}" style="margin:10px 0;padding:10px;background:#eee;width:300px">tile ${i}</div>`
).join("");
/** A screen of tiles in a scroller of its own: what a Preview shows. */
const embedPage = (tag: string) =>
  `<!doctype html><html><head>${VIEWPORT}${tag}</head><body style="margin:0;font:16px sans-serif"><div id="inner" style="height:100dvh;overflow-y:auto"><div style="padding:20px">${tiles}</div></div></body></html>`;

/** A decision page as the host draws it: the body the viewport's height, the cards in its first row's scroller, Previews as tall as a screen. */
const decisionPage = (embedAt: string, late: boolean) => {
  const frame = (id: string, slot: string, path: string) =>
    `<div data-cawco-embed-place="${id}" style="height:100dvh" id="${slot}-place">${late ? "" : `<iframe id="${slot}" data-cawco-artifact="${id}" src="${embedAt}${path}" style="display:block;width:100%;height:100dvh;border:0"></iframe>`}</div>`;
  const words = Array.from({ length: 60 }, (_, i) => `line ${i} of words`).join(
    "\n"
  );
  const mount = late
    ? `<script>setTimeout(()=>{for(const [id,slot,path] of [["${BRIDGED}","bridged","/embed"],["${BARE}","bare","/bare"]]){const f=document.createElement("iframe");f.id=slot;f.dataset.cawcoArtifact=id;f.src="${embedAt}"+path;f.style.cssText="display:block;width:100%;height:100dvh;border:0";document.getElementById(slot+"-place").append(f)}},${LATE_MS})</script>`
    : "";
  return `<!doctype html><html><head>${SEEDED_TAG}</head><body style="margin:0;font:16px sans-serif">
<main style="display:grid;height:100dvh;grid-template-rows:minmax(0,1fr) auto">
<div id="scroller" style="overflow-y:auto;min-height:0">
<div id="col" style="display:flex;flex-direction:column;gap:40px;padding:0;overflow-x:clip">
<h1 id="title" style="margin:24px">A decision</h1>
<p id="para" style="margin:0 24px">Some words a stroke can cross, set in a paragraph of the page.</p>
${frame(BRIDGED, "bridged", "/embed")}
${frame(BARE, "bare", "/bare")}
<pre id="pre" style="overflow:auto;height:120px;margin:0;background:#def">${words}</pre>
<div id="pane" style="height:300px;overflow-y:auto;padding:30px;background:#fed"><div id="msg1" style="height:200px;background:#cfc;margin-bottom:60px">m1</div><div id="msg2" style="height:800px;background:#ccf">m2</div></div>
<div style="height:1200px"></div>
</div></div>
<footer id="foot" style="padding:12px;background:#ddd">Send</footer>
</main>${mount}</body></html>`;
};

const documentPage = `<!doctype html><html><head>${SEEDED_TAG}</head><body style="margin:0;font:16px sans-serif;height:3000px">
<div id="fixed" style="position:fixed;top:0;left:0;right:0;height:60px;background:#fcc">a fixed bar with words</div>
<p id="words" style="margin-top:200px;width:300px">words of the document page</p>
</body></html>`;

const staysPage = `<!doctype html><html><head>${SEEDED_TAG}</head><body style="margin:0;font:16px sans-serif;height:3000px">
<div id="fixed" style="position:fixed;top:0;left:0;right:0;height:60px;background:#fcc">a fixed bar with words</div>
<div id="sticky" style="position:sticky;top:70px;height:40px;background:#cfc;margin-top:100px">a sticky head with words</div>
<p id="words" style="margin-top:600px;width:300px">plain words of the page</p>
</body></html>`;

/** The root's gutter the preview proxy keeps on every page (core preview-proxy `GUTTER_FLOOR`). */
const gutterPage = `<!doctype html><html style="scrollbar-gutter:stable"><head>${SEEDED_TAG}</head><body style="margin:0;font:18px/1.6 sans-serif;height:3000px">
<main style="padding:24px"><p id="line" style="width:70%;margin:0">The third paragraph, to draw over end to end.</p></main>
</body></html>`;

/** An inner scroller holding many cards, marked in its first screen. */
const manyPage = `<!doctype html><html><head>${SEEDED_TAG}</head><body style="margin:0;font:16px sans-serif">
<div id="scroller" style="height:100dvh;overflow-y:auto">${Array.from(
  { length: 800 },
  (_, i) =>
    `<section style="padding:8px"><h3 style="margin:0">Card ${i}</h3><p style="margin:0">Words of the card, enough to stand a stroke on.</p></section>`
).join("")}</div>
</body></html>`;

const bodyScrollerPage = `<!doctype html><html style="height:100%;overflow:hidden"><head>${SEEDED_TAG}</head><body style="margin:0;height:100%;overflow:auto;font:16px sans-serif">
<p id="words" style="width:200px;margin-top:100px">words in a body scroller</p><div style="height:3000px"></div></body></html>`;

const serving = (overlay: string, pages: (address: string) => string | null) =>
  Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const { pathname, search } = new URL(request.url);
      if (pathname === "/__cawco/overlay.js") {
        return new Response(overlay, {
          headers: { "content-type": "text/javascript" },
        });
      }
      const body = pages(`${pathname}${search}`);
      return body === null
        ? new Response("none", { status: 404 })
        : new Response(body, { headers: { "content-type": "text/html" } });
    },
  });

interface Group {
  frames?: string[];
  id: string;
  over: string[];
  scrolled?: { x: number; y: number };
  selector?: string;
}

type Point = [number, number];

const line = (from: Point, to: Point, steps = 12): Point[] =>
  Array.from({ length: steps + 1 }, (_, i) => [
    from[0] + ((to[0] - from[0]) * i) / steps,
    from[1] + ((to[1] - from[1]) * i) / steps,
  ]);

const loop = (centre: Point, rx: number, ry: number, steps = 24): Point[] =>
  Array.from({ length: steps + 1 }, (_, i) => [
    centre[0] + rx * Math.cos((2 * Math.PI * i) / steps),
    centre[1] + ry * Math.sin((2 * Math.PI * i) / steps),
  ]);

const near = (a: number, b: number, slop = SLOP) => Math.abs(a - b) <= slop;

/** A page under the spec's hand: Draw on, strokes, reads. */
const handOn = (page: Page) => {
  const settle = (ms = 250) => page.waitForTimeout(ms);
  const draw = async () => {
    await page.evaluate((id) => {
      const to = location.origin;
      window.postMessage(
        {
          type: "cawco:hello",
          artifact: { id, kind: "page", name: "ink-scrollers" },
          sync: `/__cawco/artifact/${id}`,
        },
        to
      );
      window.postMessage({ type: "cawco:mode", mode: "draw" }, to);
    }, ARTIFACT);
    await settle(150);
  };
  const open = async (address: string) => {
    await page.goto(address);
    await settle(1000);
    await draw();
  };
  const stroke = async (points: Point[]) => {
    const [first, ...rest] = points as [Point, ...Point[]];
    await page.mouse.move(first[0], first[1]);
    await page.mouse.down();
    for (const [x, y] of rest) {
      await page.mouse.move(x, y);
    }
    await page.mouse.up();
    await settle(400);
  };
  const groups = (): Promise<Group[]> =>
    page.evaluate(() => {
      const { doc } = (
        window as unknown as {
          cawcoArtifact: {
            doc: {
              getMap: (name: string) => { toJSON: () => object };
            };
          };
        }
      ).cawcoArtifact;
      return Object.values(doc.getMap("ink").toJSON()).map(
        (group: {
          anchor: { frames?: string[]; selector?: string };
          id: string;
          over?: { selector: string }[];
          scrolled?: { x: number; y: number };
        }) => ({
          frames: group.anchor.frames,
          id: group.id,
          over: (group.over ?? []).map((one) => one.selector),
          scrolled: group.scrolled,
          selector: group.anchor.selector,
        })
      );
    });
  /** The newest group: a stroke's own, read as soon as its embed has answered. */
  const newest = async (): Promise<Group> => {
    const all = await groups();
    return all.at(-1) as Group;
  };
  const topOf = (id: string): Promise<number | null> =>
    page.evaluate(
      (group) =>
        document
          .querySelector(`[data-ink-group="${group}"]`)
          ?.getBoundingClientRect().y ?? null,
      id
    );
  const boxOf = (selector: string) =>
    page.evaluate((one) => {
      const r = document.querySelector(one)?.getBoundingClientRect();
      return r
        ? { x: r.x, y: r.y, w: r.width, h: r.height }
        : { x: 0, y: 0, w: 0, h: 0 };
    }, selector);
  /** Scrolls `selector`'s element to `top` in the page; `null`: the document. */
  const scroll = async (selector: string | null, top: number) => {
    await page.evaluate(
      ([one, to]) => {
        const el = one ? document.querySelector(one as string) : null;
        (el ?? document.scrollingElement)?.scrollTo(0, to as number);
      },
      [selector, top] as const
    );
    await settle();
  };
  /** Brings `selector`'s element `to` px under the viewport's top, in the page's scroller. */
  const bring = async (selector: string, to: number) => {
    await page.evaluate(
      ([one, at]) => {
        const scroller = document.querySelector("#scroller");
        const el = document.querySelector(one as string);
        if (scroller && el) {
          scroller.scrollTop += el.getBoundingClientRect().top - (at as number);
        }
      },
      [selector, to] as const
    );
    await settle();
  };
  /** How far a group moves as `act` runs, down the viewport. */
  const moved = async (id: string, act: () => Promise<void>) => {
    const before = await topOf(id);
    await act();
    const after = await topOf(id);
    return before !== null && after !== null ? after - before : null;
  };
  return {
    boxOf,
    bring,
    groups,
    moved,
    newest,
    open,
    scroll,
    settle,
    stroke,
    topOf,
  };
};

const embedFrame = (page: Page, path: string): Frame | undefined =>
  page.frames().find((one) => one.url().endsWith(path));

/** Checks 1 to 7 at one view. */
const decisionChecks = async (
  kit: Kit,
  page: Page,
  at: string,
  say: (words: string) => string
) => {
  const hand = handOn(page);
  await hand.open(`${at}/decision`);
  const { width } = page.viewportSize() ?? { width: 0 };

  // 1. A line and a loop over the frame, as the person's two.
  await hand.bring("#bridged", 40);
  await hand.stroke(line([60, 80], [90, 400]));
  const across = await hand.newest();
  kit.check(
    say("1: a line over a page-sized frame stands on what its embed names"),
    across.selector?.startsWith("#t") === true &&
      across.frames?.join() === "#bridged",
    JSON.stringify(across)
  );
  await hand.stroke(loop([120, 500], Math.min(110, width / 2 - 20), 34));
  const around = await hand.newest();
  kit.check(
    say("1: a loop over it too, never the body"),
    around.selector?.startsWith("#t") === true,
    JSON.stringify(around)
  );
  const byPage = await hand.moved(around.id, () =>
    hand.bring("#bridged", -110)
  );
  kit.check(
    say("1: the page's scroller carries it"),
    byPage !== null && near(byPage, -150),
    String(byPage)
  );
  const inner = embedFrame(page, "/embed");
  const byEmbed = await hand.moved(around.id, async () => {
    await inner?.evaluate(() =>
      document.querySelector("#inner")?.scrollTo(0, 40)
    );
    await hand.settle(400);
  });
  kit.check(
    say("1: the embed's own scroller carries it"),
    byEmbed !== null && near(byEmbed, -40),
    String(byEmbed)
  );
  await inner?.evaluate(() => document.querySelector("#inner")?.scrollTo(0, 0));

  // 2. A frame that does not answer.
  await hand.bring("#bare", 40);
  await hand.stroke(line([60, 120], [80, 420]));
  const bare = await hand.newest();
  kit.check(
    say("2: a frame that does not answer is the anchor, by what it shows"),
    bare.selector === "#bare",
    JSON.stringify(bare)
  );
  const byPageBare = await hand.moved(bare.id, () => hand.bring("#bare", -60));
  kit.check(
    say("2: the page's scroller carries it"),
    byPageBare !== null && near(byPageBare, -100),
    String(byPageBare)
  );

  // 13. An embed's own gap: nothing of it under the stroke, its scroll to carry it.
  await hand.bring("#bridged", 40);
  await inner?.evaluate(() => document.querySelector("#inner")?.scrollTo(0, 0));
  await hand.settle(300);
  await hand.stroke(line([width - 30, 200], [width - 12, 240], 6));
  await hand.settle(300);
  const emptied = await hand.newest();
  const byGapInEmbed = await hand.moved(emptied.id, async () => {
    await inner?.evaluate(() =>
      document.querySelector("#inner")?.scrollTo(0, 30)
    );
    await hand.settle(400);
  });
  kit.check(
    say(
      "13: over an embed's own gap, on the content nearest, its scroll carrying it"
    ),
    emptied.selector?.startsWith("#t") === true &&
      byGapInEmbed !== null &&
      near(byGapInEmbed, -30),
    `${emptied.selector} ${byGapInEmbed}`
  );
  await inner?.evaluate(() => document.querySelector("#inner")?.scrollTo(0, 0));

  // 3. Over no content: the gap under the head, and a pane's.
  await hand.scroll("#scroller", 0);
  const title = await hand.boxOf("#title");
  const para = await hand.boxOf("#para");
  const gap = (title.y + title.h + para.y) / 2;
  await hand.stroke(line([width - 60, gap], [width - 20, gap]));
  const nothing = await hand.newest();
  kit.check(
    say("3: over no content in a scroller, on the content nearest"),
    nothing.selector === "#title" || nothing.selector === "#para",
    JSON.stringify(nothing)
  );
  const byGap = await hand.moved(nothing.id, () =>
    hand.scroll("#scroller", 30)
  );
  kit.check(
    say("3: the scroller carries it"),
    byGap !== null && near(byGap, -30),
    String(byGap)
  );
  await hand.bring("#pane", 100);
  const msg = await hand.boxOf("#msg1");
  const inGap = msg.y + msg.h + 30;
  await hand.stroke(line([msg.x + 10, inGap], [msg.x + 150, inGap]));
  const paneGap = await hand.newest();
  const byPane = await hand.moved(paneGap.id, () => hand.scroll("#pane", 50));
  kit.check(
    say("3: a pane's gap: the pane's scroll carries it"),
    byPane !== null && near(byPane, -50),
    `${paneGap.selector} ${byPane}`
  );

  // 4. Words a pre scrolls itself.
  await hand.bring("#pre", 200);
  await hand.stroke(line([20, 240], [120, 240]));
  const inPre = await hand.newest();
  kit.check(
    say("4: on words a pre scrolls, on the pre with its scroll kept"),
    inPre.selector === "#pre" && inPre.scrolled?.y === 0,
    JSON.stringify(inPre)
  );
  const byPre = await hand.moved(inPre.id, () => hand.scroll("#pre", 20));
  kit.check(
    say("4: the pre's own scroll carries it"),
    byPre !== null && near(byPre, -20),
    String(byPre)
  );

  // 5. Marks far under the page's foot.
  const room = await page.evaluate(() => [
    document.documentElement.scrollHeight,
    innerHeight,
  ]);
  kit.check(
    say("5: marks under the page's foot give it no scroll"),
    room[0] === room[1],
    room.join(" against ")
  );

  // 6. A reload: each where it stood on its content; a frame come late keeps its marks.
  await hand.bring("#bridged", 40);
  const held = await hand.groups();
  const before = await hand.topOf(around.id);
  await page.reload();
  await hand.settle(1500);
  await hand.bring("#bridged", 40);
  await hand.settle(600);
  const after = await hand.topOf(around.id);
  kit.check(
    say("6: a reload draws every group, where it stood"),
    (await hand.groups()).length === held.length &&
      before !== null &&
      after !== null &&
      near(before, after, 6),
    `${held.length} groups; ${before} then ${after}`
  );
  await hand.open(`${at}/decision?late`);
  await hand.settle(LATE_MS + 700);
  await hand.bring("#bridged", 40);
  await hand.settle(600);
  const stayed = await hand.groups();
  const shownLate = await hand.topOf(around.id);
  kit.check(
    say("6: a frame mounted late leaves its marks where they stood"),
    stayed.length === held.length &&
      shownLate !== null &&
      before !== null &&
      near(before, shownLate, 6),
    `${stayed.length} of ${held.length}; ${before} then ${shownLate}`
  );
};

/** Check 7: a Comment pins a group; its pill goes as its strokes scroll out of view. */
const pillChecks = async (kit: Kit, page: Page, at: string) => {
  const hand = handOn(page);
  await hand.open(`${at}/decision`);
  const para = await hand.boxOf("#para");
  await hand.stroke(
    line([para.x + 10, para.y + 8], [para.x + 200, para.y + 8])
  );
  const frame = page.mainFrame();
  await dragFromIcon(
    { page } as Parameters<typeof dragFromIcon>[0],
    frame,
    -90,
    40,
    "html"
  );
  // The radial's Comment opens the composer on the ink; its host's words write the pin (page.ts `writeDraft`).
  await page.evaluate(() =>
    window.postMessage(
      { type: "cawco:comment", text: "This one." },
      location.origin
    )
  );
  await hand.settle(500);
  const pills = () =>
    page.evaluate(
      () =>
        document.querySelectorAll("svg[data-cawco-pins] [data-pin-id]").length
    );
  const shown = await pills();
  await hand.scroll("#scroller", 2000);
  await hand.settle(400);
  const scrolledAway = await pills();
  await hand.scroll("#scroller", 0);
  await hand.settle(400);
  const back = await pills();
  kit.check(
    "7: a pin on ink stands hidden while its strokes are scrolled out of view",
    shown > 0 && scrolledAway === 0 && back === shown,
    `${shown} then ${scrolledAway} then ${back}`
  );
};

/** Words a script sets from what it kept, as a page's own running does between loads. */
const keptWords = (key: string) =>
  `<span class="count" style="display:inline-block;padding:8px;background:#eee">Runs</span><script>document.currentScript.previousElementSibling.textContent=localStorage.getItem("${key}")??"Runs: 1"</script>`;
const wordsFrame = (key: string) =>
  `<!doctype html><html><head>${OVERLAY_TAG}</head><body style="margin:0;font:16px sans-serif"><main><div>${keptWords(key)}</div></main></body></html>`;
const wordsPage = (hash: string, embedAt: string) =>
  `<!doctype html><html><head>${SEEDED_TAG.replace('data-page-hash="spec"', `data-page-hash="${hash}"`)}</head><body style="margin:0;font:16px sans-serif"><main><div>${keptWords("top")}</div><p>Words of the page, standing still.</p><iframe id="same" src="/words-frame" style="display:block;width:400px;height:80px;border:0"></iframe><iframe id="other" src="${embedAt}/embed-words" style="display:block;width:400px;height:80px;border:0"></iframe></main></body></html>`;

/** Check 14. */
const wordsChecks = async (kit: Kit, page: Page, at: string) => {
  const hand = handOn(page);
  const inPlace = (selector: string) =>
    hand.boxOf(selector).then(({ x, y }) => [x, y] as Point);
  await hand.open(`${at}/words`);
  /** A stroke across the count of the document at `from`, its box there. */
  const across = async (from: Point) => {
    await hand.stroke(
      line([from[0] + 4, from[1] + 12], [from[0] + 50, from[1] + 12])
    );
  };
  await across(await inPlace("main > div > .count"));
  const onTop = await hand.newest();
  await across(await inPlace("#same"));
  const onSame = await hand.newest();
  await across(await inPlace("#other"));
  await hand.settle(500);
  const onOther = (await hand.groups()).at(-1) as Group;
  kit.check(
    "14: strokes stand on the count named by its place, in the page, in a same-origin frame and in an embed",
    !!onTop.selector?.includes("span") &&
      onSame.frames?.join() === "#same" &&
      onOther.frames?.join() === "#other",
    JSON.stringify([onTop.selector, onSame.frames, onOther.frames])
  );
  const setWords = (frame: Frame, key: string) =>
    frame.evaluate(
      (name) => localStorage.setItem(name, "Runs: while you were away"),
      key
    );
  await setWords(page.mainFrame(), "top");
  await setWords(page.mainFrame(), "same");
  const other = page.frames().find((one) => one.url().endsWith("/embed-words"));
  if (other) {
    await setWords(other, "other");
  }
  await hand.open(`${at}/words`);
  // Past a mark's patience for what stands missing (absent.ts).
  await hand.settle(3000);
  const moved = () =>
    page.evaluate(
      () =>
        Object.keys(
          (
            window as unknown as {
              cawcoArtifact: {
                doc: { getMap: (name: string) => { toJSON: () => object } };
              };
            }
          ).cawcoArtifact.doc
            .getMap("moved")
            .toJSON()
        ).length
    );
  const standing = await hand.groups();
  const tops = await Promise.all(standing.map((group) => hand.topOf(group.id)));
  kit.check(
    "14: their words changed with nothing open, on the page as it was served: all three stand on their elements",
    standing.length === 3 &&
      (await moved()) === 0 &&
      tops.every((top) => top !== null),
    `${standing.length} standing; ${await moved()} moved; ${tops.join()}`
  );

  // Kept before anchors said their page, and moved aside for its words.
  await page.evaluate(() => {
    const { doc } = (
      window as unknown as {
        cawcoArtifact: {
          doc: {
            getMap: (name: string) => {
              delete: (key: string) => void;
              get: (
                key: string
              ) =>
                | { anchor: { page?: string; text?: string }; id: string }
                | undefined;
              keys: () => IterableIterator<string>;
              set: (key: string, value: object) => void;
            };
            transact: (run: () => void) => void;
          };
        };
      }
    ).cawcoArtifact;
    const ink = doc.getMap("ink");
    const aside = doc.getMap("moved");
    doc.transact(() => {
      for (const key of [...ink.keys()]) {
        const group = ink.get(key);
        if (group && !(group.anchor as { frames?: string[] }).frames) {
          const { page: _page, ...anchor } = group.anchor;
          ink.delete(key);
          aside.set(key, {
            ...group,
            anchor: { ...anchor, text: "Runs: long ago" },
          });
        }
      }
    });
  });
  await hand.open(`${at}/words`);
  await hand.settle(1500);
  kit.check(
    "14: a stroke kept before anchors said their page, moved aside for words that changed, comes back on the page not revised since",
    (await moved()) === 0 && (await hand.groups()).length === 3,
    `${await moved()} moved; ${(await hand.groups()).length} standing`
  );

  // The page revised: another element may stand at its place now.
  await hand.settle(4000);
  await page.evaluate(() =>
    localStorage.setItem("top", "Runs: after a revision")
  );
  await hand.open(`${at}/words?revised`);
  await hand.settle(3000);
  kit.check(
    "14: the page revised and its words gone: the stroke in the page goes to the moved tray, never onto what stands there",
    (await moved()) >= 1,
    `${await moved()} moved`
  );
};

/** Check 10: the pills of comments with no ink, as the document scrolls. */
const pinChecks = async (kit: Kit, page: Page, at: string) => {
  const hand = handOn(page);
  await hand.open(`${at}/stays`);
  await page.evaluate(() =>
    window.postMessage({ type: "cawco:mode", mode: "comment" }, location.origin)
  );
  await hand.settle(150);
  for (const selector of ["#fixed", "#sticky", "#words"]) {
    const box = await hand.boxOf(selector);
    await page.mouse.click(box.x + 60, box.y + box.h / 2);
    await hand.settle(200);
    await page.evaluate(() =>
      window.postMessage(
        { type: "cawco:comment", text: "here" },
        location.origin
      )
    );
    await hand.settle(300);
  }
  const pills = () =>
    page.evaluate(() =>
      [...document.querySelectorAll("svg[data-cawco-pins] [data-pin]")].map(
        (pill) => pill.getBoundingClientRect().y
      )
    );
  const [onBar, onSticky, onWords] = await pills();
  await hand.scroll(null, 400);
  await hand.settle(200);
  const [barThen, stickyThen, wordsThen] = await pills();
  const stuck = await hand.boxOf("#sticky");
  kit.check(
    "10: a comment on a fixed bar stays on it through the document's scroll",
    onBar !== undefined && barThen !== undefined && near(onBar, barThen),
    `${onBar} then ${barThen}`
  );
  kit.check(
    "10: a comment on a sticky head stays on it where it sticks",
    onSticky !== undefined &&
      stickyThen !== undefined &&
      stickyThen >= stuck.y - 40 &&
      stickyThen <= stuck.y + stuck.h,
    `${onSticky} then ${stickyThen}; the head at ${stuck.y}`
  );
  kit.check(
    "10: a comment on the page's words moves with them",
    onWords !== undefined &&
      wordsThen !== undefined &&
      near(wordsThen - onWords, -400),
    `${onWords} then ${wordsThen}`
  );
};

/** Check 11: strokes end to end, and an icon at the gutter. */
const strokeEndChecks = async (kit: Kit, page: Page, at: string) => {
  const hand = handOn(page);
  let split = 0;
  for (const width of [963, 1017, 1211, 1313]) {
    await page.setViewportSize({ width, height: 800 });
    await hand.open(`${at}/gutter`);
    const { x, y } = await hand.boxOf("#line");
    for (const reach of [120, 147, 163]) {
      const before = (await hand.groups()).length;
      await hand.stroke(
        line([x + reach - 100, y + 10], [x + reach, y + 10], 6)
      );
      await hand.stroke(
        line([x + reach, y + 10], [x + reach + 100, y + 10], 6)
      );
      split += (await hand.groups()).length - before - 1;
      await hand.settle(4200);
    }
  }
  kit.check(
    "11: strokes drawn end to end are one group at every width",
    split === 0,
    `${split} of 12 split`
  );
  await page.setViewportSize({ width: 1200, height: 800 });
  await hand.open(`${at}/gutter`);
  const { y } = await hand.boxOf("#line");
  await hand.stroke(line([1130, y + 40], [1196, y + 40]));
  const icon = await page.evaluate(() => {
    const host = document.querySelector("cawco-overlay");
    const r = host?.shadowRoot
      ?.querySelector(".ink-icon")
      ?.getBoundingClientRect();
    const room = host?.getBoundingClientRect();
    return r && room
      ? {
          x: r.x + r.width / 2,
          y: r.y + r.height / 2,
          right: r.right,
          room: room.right,
        }
      : null;
  });
  if (icon) {
    await page.mouse.click(icon.x, icon.y);
    await hand.settle(400);
  }
  const opened = await page.evaluate(
    () =>
      !!document
        .querySelector("cawco-overlay")
        ?.shadowRoot?.querySelector(".ink-menu")
  );
  kit.check(
    "11: a stroke lifted over the gutter leaves its icon whole on the page, and a press opens its menu",
    !!icon && icon.right <= icon.room && opened,
    JSON.stringify({ icon, opened })
  );
};

/** Check 12: what a frame of an inner scroller costs with marks standing. */
const costChecks = async (kit: Kit, page: Page, at: string) => {
  const hand = handOn(page);
  await hand.open(`${at}/many`);
  const groups = 30;
  for (let i = 0; i < groups; i += 1) {
    const y = 40 + (i % 14) * 50;
    const x = 40 + ((i * 17) % 200);
    await hand.stroke(line([x, y], [x + 120, y + 6], 6));
  }
  await hand.settle(800);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  const layouts = async () =>
    (await cdp.send("Performance.getMetrics")).metrics.find(
      (one) => one.name === "LayoutCount"
    )?.value ?? 0;
  const paths = () =>
    page.evaluate(() => {
      (window as unknown as { kept?: Element[] }).kept ??= [
        ...document.querySelectorAll("svg[data-cawco-ink] path[data-stroke]"),
      ];
      return (window as unknown as { kept: Element[] }).kept.filter(
        (one) => one.isConnected
      ).length;
    });
  const held = await paths();
  const frames = 180;
  const before = await layouts();
  await page.evaluate(
    (count) =>
      new Promise<void>((done) => {
        const scroller = document.querySelector("#scroller");
        let drawn = 0;
        const step = () => {
          if (scroller) {
            scroller.scrollTop += 23;
          }
          drawn += 1;
          if (drawn < count) {
            requestAnimationFrame(step);
          } else {
            done();
          }
        };
        requestAnimationFrame(step);
      }),
    frames
  );
  const spent = (await layouts()) - before;
  const kept = await paths();
  kit.check(
    `12: ${groups} groups through ${frames} frames of an inner scroller lay the page out at most ${3 * frames} times, and keep their paths`,
    (await hand.groups()).length === groups &&
      spent <= 3 * frames &&
      kept === held,
    `${spent} layouts; ${kept} of ${held} paths kept`
  );
  await cdp.detach();
};

/** Checks 8 and 9: a document that scrolls itself, and a body that does. */
const otherScrollers = async (kit: Kit, page: Page, at: string) => {
  const hand = handOn(page);
  await hand.open(`${at}/document`);
  await hand.stroke(line([30, 30], [200, 30]));
  const onBar = await hand.newest();
  const byDocument = await hand.moved(onBar.id, () => hand.scroll(null, 300));
  kit.check(
    "8: a stroke on a fixed bar stays on it through the document's scroll",
    onBar.selector === "#fixed" && byDocument !== null && near(byDocument, 0),
    `${onBar.selector} ${byDocument}`
  );
  await hand.scroll(null, 0);
  const words = await hand.boxOf("#words");
  await hand.stroke(
    line([words.x + 10, words.y + 8], [words.x + 200, words.y + 8])
  );
  const onWords = await hand.newest();
  const carried = await hand.moved(onWords.id, () => hand.scroll(null, 150));
  kit.check(
    "8: the document's own scroll carries a stroke on its content",
    carried !== null && near(carried, -150),
    String(carried)
  );
  await hand.scroll(null, 0);
  await hand.stroke(line([900, 600], [1000, 600]));
  const empty = await hand.newest();
  kit.check(
    "8: over nothing on a document that scrolls itself, the body",
    empty.selector === "body",
    String(empty.selector)
  );

  await hand.open(`${at}/body`);
  const inBody = await hand.boxOf("#words");
  await hand.stroke(line([900, inBody.y + 8], [1000, inBody.y + 8]));
  const overNone = await hand.newest();
  const byBody = await hand.moved(overNone.id, async () => {
    await page.evaluate(() => document.body.scrollTo(0, 100));
    await hand.settle();
  });
  kit.check(
    "9: a body that is its own scroller carries a stroke over nothing",
    byBody !== null && near(byBody, -100),
    `${overNone.selector} ${byBody}`
  );
};

/** `check` on pages of a pair of origins of its own: a page's doc stays on its device by origin (artifact.ts). */
const onOwnOrigins = async (
  overlay: string,
  check: (at: string) => Promise<void>
) => {
  const embeds = serving(overlay, (address) => {
    if (address === "/embed") {
      return embedPage(OVERLAY_TAG);
    }
    if (address === "/embed-words") {
      return wordsFrame("other");
    }
    return address === "/bare" ? embedPage("") : null;
  });
  const embedAt = `http://127.0.0.1:${embeds.port}`;
  const top = serving(
    overlay,
    (address) =>
      ({
        "/decision": decisionPage(embedAt, false),
        "/decision?late": decisionPage(embedAt, true),
        "/document": documentPage,
        "/body": bodyScrollerPage,
        "/stays": staysPage,
        "/gutter": gutterPage,
        "/many": manyPage,
        "/words": wordsPage("spec", embedAt),
        "/words?revised": wordsPage("revised", embedAt),
        "/words-frame": wordsFrame("same"),
      })[address] ?? null
  );
  try {
    await check(`http://127.0.0.1:${top.port}`);
  } finally {
    top.stop(true);
    embeds.stop(true);
  }
};

const run = async (kit: Kit) => {
  const overlay = await bundleOverlay();
  await onOwnOrigins(overlay, async (at) =>
    decisionChecks(kit, await kit.page("desk"), at, (words) => `desk ${words}`)
  );
  await onOwnOrigins(overlay, async (at) =>
    decisionChecks(
      kit,
      await kit.page("phone"),
      at,
      (words) => `phone ${words}`
    )
  );
  await onOwnOrigins(overlay, async (at) =>
    pillChecks(kit, await kit.page("desk"), at)
  );
  await onOwnOrigins(overlay, async (at) =>
    otherScrollers(kit, await kit.page("desk"), at)
  );
  await onOwnOrigins(overlay, async (at) =>
    pinChecks(kit, await kit.page("desk"), at)
  );
  await onOwnOrigins(overlay, async (at) =>
    strokeEndChecks(kit, await kit.page("desk"), at)
  );
  await onOwnOrigins(overlay, async (at) =>
    costChecks(kit, await kit.page("desk"), at)
  );
  await onOwnOrigins(overlay, async (at) =>
    wordsChecks(kit, await kit.page("desk"), at)
  );
};

const spec: Spec = {
  group: "Previews, pages and comments",
  name: "ink-scrollers",
  run,
};
export default spec;
