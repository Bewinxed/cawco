#!/usr/bin/env node
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
/**
 * Horizontal overflow — at the document AND at every clipping ancestor.
 *
 * WHY THIS WAS WIDENED — the first version asserted `documentElement.scrollWidth
 * <= clientWidth` and nothing else. That is a real check, but it is blind to the
 * commonest way a mobile layout loses content: an inner element that is wider
 * than an ancestor with `overflow-x: hidden`. The ancestor clips it, the document
 * never grows, and the page reports clean while a control sits permanently
 * off-screen with no way to reach it.
 *
 * It passed a build where `.shead` measured scrollWidth 442 inside a 390px
 * `main{overflow-x:hidden}`, hiding the `needs you` chip by 52px at 390 and
 * 122px at 320 — the same defect class as the filter row, on a different
 * surface, which is what happens when a fix is applied to an instance instead
 * of to the class.
 *
 * Two assertions per file per width:
 *   1. DOCUMENT — the page itself does not scroll horizontally.
 *   2. TRAPPED  — no element's content is clipped by a non-scrolling ancestor.
 *      An ancestor with `overflow-x: auto/scroll` is fine: the content is
 *      reachable. `hidden` with no scroll anywhere up the chain is not.
 *   3. UNREADABLE — for MUST-READ content, a scroll container is NOT an
 *      acceptable answer, and this assertion exists because treating it as one
 *      let the worst defect of the phase through: the `rm -rf` permission gate
 *      rendered its scope values 90.5px off-screen at 320 with no ellipsis and
 *      no cue, so `Path` read `/home/bewinxed/cawco/apps/dashboard/.svel` —
 *      not the path being granted — while Approve sat fully legible beneath it.
 *      The document measured clean, because a `.tr{overflow-x:auto}` ancestor
 *      absorbed the overflow.
 *
 *      THE RULE, stated: a horizontal scroll container is an acceptable answer
 *      for a wide DATA TABLE — the operator is scanning columns, the structure
 *      itself signals more sideways, and no single value carries the decision.
 *      It is NOT an acceptable answer for CONSENT- OR DECISION-BEARING content:
 *      the values in a confirmation dialog, a permission scope, an error
 *      explanation. Those must be fully visible at every supported width,
 *      because "reachable by scrolling" is not "read before deciding", and a
 *      dialog that looks complete while stating a truncated path is worse than
 *      one that looks broken.
 *
 *   node mocks/overflowcheck.mjs
 */
import { chromium } from "playwright-core";

const HERE = dirname(fileURLToPath(import.meta.url));
const FILES = ["v2-fleet.html", "v3-assistant.html", "v4-transcript.html"];
// Regions the operator must read IN FULL to decide correctly. Opt in with
// `data-must-read` on new surfaces; these are the ones that exist today.
const MUST_READ = '.scope, .hitl .lede, [role="alert"], [data-must-read]';
const WIDTHS = [320, 390, 768, 1024, 1440];

const b = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_BIN ||
    "/home/bewinxed/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-gpu"],
});

let fails = 0;
for (const f of FILES) {
  const row = [];
  const trapped = [];
  for (const w of WIDTHS) {
    for (const dark of [false, true]) {
      const p = await b.newPage({ viewport: { width: w, height: 900 } });
      await p.goto(pathToFileURL(join(HERE, f)).href, { waitUntil: "load" });
      if (dark) {
        await p.evaluate(() => document.documentElement.classList.add("dark"));
      }
      await p.evaluate(() => document.fonts.ready);

      const r = await p.evaluate((MUST_READ_SEL) => {
        const doc = {
          sw: document.documentElement.scrollWidth,
          cw: document.documentElement.clientWidth,
        };
        // same two exclusions clipcheck uses, for the same reasons: the
        // visually-hidden idiom is SUPPOSED to be clipped, and single-line
        // ellipsis truncation is a designed affordance, not lost content.
        const srOnly = (el, cs) => {
          if (cs.clipPath === "inset(50%)") {
            return true;
          }
          if (cs.clip && cs.clip !== "auto" && /rect\(/.test(cs.clip)) {
            return true;
          }
          const r = el.getBoundingClientRect();
          const positioned =
            cs.position === "absolute" || cs.position === "fixed";
          const hidden = cs.overflow === "hidden" || cs.overflowX === "hidden";
          return positioned && hidden && r.width <= 1.5 && r.height <= 1.5;
        };
        const out = [];
        for (const el of document.querySelectorAll("body *")) {
          const cs = getComputedStyle(el);
          if (cs.display === "none" || cs.visibility === "hidden") {
            continue;
          }
          if (srOnly(el, cs)) {
            continue;
          }
          const oneLine = cs.whiteSpace === "nowrap" || cs.whiteSpace === "pre";
          if (cs.textOverflow === "ellipsis" && oneLine) {
            continue;
          }
          const over = el.scrollWidth - el.clientWidth;
          if (over <= 1) {
            continue;
          }
          // is the overflow reachable? either here or anywhere up the chain
          let scrollable = cs.overflowX === "auto" || cs.overflowX === "scroll";
          let clipper = null;
          for (
            let a = el;
            a && a !== document.documentElement;
            a = a.parentElement
          ) {
            const acs = getComputedStyle(a);
            if (acs.overflowX === "auto" || acs.overflowX === "scroll") {
              scrollable = true;
              break;
            }
            if (acs.overflowX === "hidden" && !clipper) {
              clipper = a;
            }
          }
          if (scrollable) {
            continue;
          }
          if (!clipper && doc.sw > doc.cw) {
            continue; // the document scrolls: reachable
          }
          if (!clipper) {
            continue;
          }
          out.push({
            name: (`${el.tagName}.${String(el.className || "")}`).slice(0, 34),
            sw: el.scrollWidth,
            cw: el.clientWidth,
            lost: over,
            clipper: (
              clipper.tagName +
              "." +
              String(clipper.className || "")
            ).slice(0, 26),
          });
        }
        // 3. must-read content, where a scroll container is not an answer
        const unread = [];
        for (const el of document.querySelectorAll(MUST_READ_SEL)) {
          const cs = getComputedStyle(el);
          if (cs.display === "none" || cs.visibility === "hidden") {
            continue;
          }
          const r = el.getBoundingClientRect();
          const vw = document.documentElement.clientWidth;
          const over = el.scrollWidth - el.clientWidth;
          const off = Math.max(0, Math.round(r.right - vw));
          if (over > 1 || off > 0) {
            unread.push({
              name: (`${el.tagName}.${String(el.className || "")}`).slice(
                0,
                30
              ),
              sw: el.scrollWidth,
              cw: el.clientWidth,
              off,
            });
          }
        }
        return { doc, out, unread };
      }, MUST_READ);

      if (!dark) {
        row.push(
          `${w}:${r.doc.sw}/${r.doc.cw}${r.doc.sw > r.doc.cw ? " OVERFLOW" : ""}`
        );
      }
      if (r.doc.sw > r.doc.cw) {
        fails++;
      }
      for (const u of r.unread || []) {
        fails++;
        trapped.push(
          `      UNREADABLE @${w}${dark ? " dark" : ""}  ${u.name} ` +
            `content ${u.sw} inside ${u.cw}, ${u.off}px past the viewport — must-read content ` +
            "may not depend on horizontal scrolling"
        );
      }
      for (const t of r.out) {
        fails++;
        trapped.push(
          `      TRAPPED @${w}${dark ? " dark" : ""}  ${t.name} ` +
            `content ${t.sw} inside ${t.cw} — ${t.lost}px unreachable, clipped by ${t.clipper}`
        );
      }
      await p.close();
    }
  }
  console.log(`  ${f.padEnd(20)} ${row.join("  ")}`);
  for (const t of trapped) {
    console.log(t);
  }
}
await b.close();
console.log(
  fails
    ? `  ${fails} overflow failures`
    : "  no document overflow and no content trapped behind a non-scrolling ancestor"
);
process.exit(fails ? 1 : 0);
