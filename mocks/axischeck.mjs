#!/usr/bin/env node
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
/**
 * Axis coverage — the conditions the rest of the suite never varies.
 *
 * WHY THIS EXISTS. Four consecutive reviews found exactly one class of defect:
 * something on an axis the gates did not exercise. Scheme was covered, width was
 * covered, and every finding lived somewhere else — one pointer type, one
 * container context, one interaction state. Closing each specific hole converges
 * slowly. This file exists to enumerate the axes and hold the invariants across
 * them, so the class is closed rather than the instance.
 *
 * The invariants held on every axis are the ones that have actually bitten:
 *   - no text clipped by a hidden-overflow box
 *   - no document-level horizontal overflow
 *   - no must-read content (permission scope, alert copy) needing a scroll
 *   - no interactive target below 44x44 under a coarse pointer
 *
 * WHAT IS COVERED, and why it can bite:
 *   scheme            light / dark            — a literal that does not theme
 *   width             320..1440               — the clipping class
 *   pointer           fine / coarse           — rules misattached to width
 *   text scale        100% / 200%             — WCAG 2.2 SC 1.4.4; the scale is
 *                                               rem, so a user preference moves
 *                                               real layout
 *   content length    nominal / 55-char       — names and paths are user data
 *   forced colours    off / active            — Windows high-contrast strips
 *                                               backgrounds; status that lived
 *                                               only in a tint would vanish
 *   reduced motion    off / reduce            — the token must actually collapse
 *   font loading      loaded / failed         — fallback metrics change every
 *                                               line box, and this design is
 *                                               full of fixed-height rows
 *   prefers-contrast  no-preference / more    — a user asking for more contrast
 *                                               must not lose the tint-based
 *                                               status channel
 *   keyboard          tab walk                — held by mocks/keyboardcheck.mjs:
 *                                               every pointer affordance
 *                                               focusable and named, focus ring
 *                                               >= 3:1 in both schemes, tab
 *                                               order following reading order
 *                                               within each landmark. This axis
 *                                               was ABSENT from the first
 *                                               enumeration — neither enforced
 *                                               nor named as uncovered — and an
 *                                               enumeration is only worth
 *                                               something if absence from it
 *                                               means something.
 *
 * THE CROSSING RULE. Enumerating axes is not enough: the sixth Critical of this
 * phase was not a missing axis but a missing COMBINATION of two axes already
 * enforced — the tab walk ran at 1440, the width sweep never pressed Tab, and the
 * drawer opener only exists below 900px. A property verified where an element
 * does not exist is not verified.
 *
 * Axes are of two kinds:
 *   STRUCTURAL     change which elements exist or which rules apply:
 *                  width (media queries), pointer type, scheme, forced colours,
 *                  contrast preference, disclosure state (drawer, modal sheet).
 *   PRESENTATIONAL change values inside a fixed structure:
 *                  text scale, content length, font loading, reduced motion.
 *
 * The rule: **cross every behavioural property with every STRUCTURAL axis; test
 * each PRESENTATIONAL axis once per property at its extreme, and do not cross
 * presentational axes with each other.** A structural axis can make an element
 * vanish, so it must multiply; a presentational axis can only stress an element
 * that is already there, so its worst case dominates and crossing it adds cost
 * without adding failure modes.
 *
 * Crossings this suite runs:
 *   keyboard x width x scheme          keyboardcheck.mjs — 3 files x 5 widths x 2
 *   clipping x width x scheme          clipcheck.mjs     — 3 x 5 x 2
 *   overflow/must-read x width x scheme overflowcheck.mjs — 3 x 5 x 2
 *   target size x pointer x width      axischeck.mjs
 *   painted contrast x scheme x occlusion  paintcheck.mjs
 *   interaction state x scheme         keyboardcheck.mjs (hover pressed, painted)
 *   disclosure state x width           the inert assertions in keyboardcheck
 *   forced colours x width             axischeck.mjs (1440 and 390)
 *
 * Crossings deliberately NOT run, and why:
 *   text scale x keyboard    text scale cannot remove an element or a rule, so it
 *                            cannot invalidate a focus assertion; clipping at
 *                            200% is covered at two widths.
 *   content length x scheme  string length and colour are independent.
 *   font loading x pointer   metrics and input device do not interact.
 *   reduced motion x any     the motion tokens touch no layout, focus or colour.
 *   RTL x anything           RTL is itself unenforced (below); crossing an
 *                            unenforced axis would imply a coverage that is not
 *                            claimed.
 *
 * WHAT IS DELIBERATELY NOT COVERED, stated rather than implied:
 *   text direction    RTL is measured and REPORTED here, but does not fail the
 *                     build. CawCo ships English only, JOURNEY.md specifies no
 *                     localisation, and the logical-property work to support it
 *                     is a real change with no consumer today. If i18n is ever
 *                     scoped, this flips to failing and the physical
 *                     left/right properties in the mocks become the work item.
 *   print             a fleet console is not printed; no stylesheet is shipped
 *                     and none is claimed.
 *   zoom              browser zoom is equivalent to a narrower viewport at the
 *                     same DPR, which the width axis already covers. Measured
 *                     to confirm rather than assumed: at `zoom: 2` the layout is
 *                     proportional and nothing clips.
 *   OS scrollbars     a persistent-scrollbar platform narrows the viewport by
 *                     ~15px; 320 already sits below every breakpoint edge, so
 *                     the narrowest tested case dominates it.
 *   pointer gestures  drag, long-press and multi-touch: this design ships no
 *                     such affordance today, so there is nothing to assert. The
 *                     mobile drawer is a checkbox toggle, not a swipe.
 *   window blur       background-window styling is a browser default here; no
 *                     rule keys off :focus-within on the document.
 *   screen reader     the suite asserts accessible NAMES and roles, not the
 *                     announced experience. Verifying live announcement order
 *                     needs a real AT and a human, and is named as such rather
 *                     than implied by the presence of aria attributes.
 *
 *   node mocks/axischeck.mjs
 */
import { chromium } from "playwright-core";

const HERE = dirname(fileURLToPath(import.meta.url));
const FILES = ["v2-fleet.html", "v3-assistant.html", "v4-transcript.html"];
const MUST_READ = '.scope, .hitl .lede, [role="alert"], [data-must-read]';

const KILL_FONT = () => {
  const s = document.createElement("style");
  s.textContent =
    '@font-face{font-family:"Geist Variable";src:url(about:invalid) format("woff2")}' +
    '@font-face{font-family:"Geist Mono Variable";src:url(about:invalid) format("woff2")}';
  document.documentElement.appendChild(s);
};

// axis name -> page setup
const AXES = [
  { name: "baseline", width: 1440 },
  { name: "narrow 320", width: 320 },
  // COARSE x EVERY WIDTH, and CONTRAST x EVERY WIDTH. The rule says structural
  // axes multiply; coarse ran at 2 of 5 widths and prefers-contrast at 1 of 5,
  // so the table claimed a coverage the suite did not have.
  { name: "coarse @320", width: 320, touch: true },
  { name: "coarse @390", width: 390, touch: true },
  { name: "coarse @768", width: 768, touch: true },
  { name: "coarse @1024", width: 1024, touch: true },
  { name: "coarse @1440", width: 1440, touch: true },
  { name: "contrast more @320", width: 320, contrast: "more" },
  { name: "contrast more @390", width: 390, contrast: "more" },
  { name: "contrast more @768", width: 768, contrast: "more" },
  { name: "contrast more @1024", width: 1024, contrast: "more" },
  { name: "text scale 200%", width: 1440, rootFont: "200%" },
  { name: "text 200% @390", width: 390, rootFont: "200%" },
  { name: "long content", width: 1440, longText: true },
  { name: "long content @320", width: 320, longText: true },
  { name: "forced-colors", width: 1440, forcedColors: "active" },
  { name: "forced-colors @390", width: 390, forcedColors: "active" },
  { name: "reduced motion", width: 1440, reducedMotion: "reduce" },
  { name: "font load failure", width: 1440, init: KILL_FONT },
  { name: "font failure @390", width: 390, init: KILL_FONT },
  { name: "contrast more @1440", width: 1440, contrast: "more" },
  { name: "RTL (report only)", width: 1440, rtl: true, report: true },
];

const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_BIN ||
    "/home/bewinxed/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--force-color-profile=srgb"],
});

let fails = 0,
  reported = 0;
for (const axis of AXES) {
  for (const dark of [false, true]) {
    const problems = [];
    for (const file of FILES) {
      const page = await browser.newPage({
        viewport: { width: axis.width, height: 900 },
        deviceScaleFactor: 1,
        hasTouch: !!axis.touch,
        isMobile: !!axis.touch,
        reducedMotion: axis.reducedMotion,
        forcedColors: axis.forcedColors,
        contrast: axis.contrast,
      });
      if (axis.init) {
        await page.addInitScript(axis.init);
      }
      await page.goto(pathToFileURL(join(HERE, file)).href, {
        waitUntil: "load",
      });
      if (dark) {
        await page.evaluate(() =>
          document.documentElement.classList.add("dark")
        );
      }
      if (axis.rootFont) {
        await page.evaluate((s) => {
          document.documentElement.style.fontSize = s;
        }, axis.rootFont);
      }
      if (axis.rtl) {
        await page.evaluate(() => {
          document.documentElement.dir = "rtl";
        });
      }
      if (axis.longText) {
        await page.evaluate(() => {
          const long =
            "deploy-pipeline-refactor-for-the-hetzner-cluster-and-mba-m3";
          document
            .querySelectorAll(".nm-cell b, .nm, .a-t b, .crumb, h1")
            .forEach((e) => {
              if (e.children.length === 0) {
                e.textContent = long;
              }
            });
        });
      }
      await page.evaluate(() => document.fonts.ready).catch(() => {});
      await page.waitForTimeout(90);

      const r = await page.evaluate(
        ({ MUST_READ_SEL, coarse }) => {
          const out = { clipped: [], doc: null, unread: [], small: [] };
          const srOnly = (el, cs) => {
            if (cs.clipPath === "inset(50%)") {
              return true;
            }
            if (cs.clip && cs.clip !== "auto" && /rect\(/.test(cs.clip)) {
              return true;
            }
            const r = el.getBoundingClientRect();
            return (
              (cs.position === "absolute" || cs.position === "fixed") &&
              (cs.overflow === "hidden" || cs.overflowX === "hidden") &&
              r.width <= 1.5 &&
              r.height <= 1.5
            );
          };
          const de = document.documentElement;
          if (de.scrollWidth > de.clientWidth + 1) {
            out.doc = `${de.scrollWidth}/${de.clientWidth}`;
          }

          for (const el of document.querySelectorAll("body *")) {
            const cs = getComputedStyle(el);
            if (cs.display === "none" || cs.visibility === "hidden") {
              continue;
            }
            if (srOnly(el, cs)) {
              continue;
            }
            const name = (`${el.tagName}.${String(el.className || "")}`).slice(
              0,
              34
            );
            const hasText = [...el.childNodes].some(
              (n) => n.nodeType === 3 && n.textContent.trim()
            );
            const oneLine =
              cs.whiteSpace === "nowrap" || cs.whiteSpace === "pre";
            const ellipsis = cs.textOverflow === "ellipsis" && oneLine;
            const hidY = cs.overflowY === "hidden" || cs.overflow === "hidden";
            const hidX = cs.overflowX === "hidden" || cs.overflow === "hidden";
            if (
              hasText &&
              ((hidY && el.scrollHeight > el.clientHeight + 1) ||
                (hidX && !ellipsis && el.scrollWidth > el.clientWidth + 1))
            ) {
              out.clipped.push(
                `${name} ${el.clientWidth}x${el.clientHeight} vs ${el.scrollWidth}x${el.scrollHeight}`
              );
            }
            if (coarse) {
              // genuinely interactive only: `.stat .chip` is a decorative icon
              // tile and `.tdot` a 5px status mark — neither is a touch target,
              // and counting them would bury the controls that really are small.
              const interactive = el.matches(
                "a,button,input,select,textarea," +
                  ".nav-i,.run-i,.act span,.ghost,.icobtn,.sel,.pg i,.star,.chev,.collapse"
              );
              if (interactive) {
                const r = el.getBoundingClientRect();
                if (
                  r.width > 0 &&
                  r.height > 0 &&
                  (r.width < 43.5 || r.height < 43.5)
                ) {
                  out.small.push(
                    `${name} ${Math.round(r.width)}x${Math.round(r.height)}`
                  );
                }
              }
            }
          }
          const vw = de.clientWidth;
          for (const el of document.querySelectorAll(MUST_READ_SEL)) {
            const cs = getComputedStyle(el);
            if (cs.display === "none") {
              continue;
            }
            const r = el.getBoundingClientRect();
            const off = Math.max(0, Math.round(r.right - vw));
            if (el.scrollWidth - el.clientWidth > 1 || off > 0) {
              out.unread.push(
                `${(`${el.tagName}.${String(el.className || "")}`).slice(0, 26)} ` +
                  `${el.scrollWidth}/${el.clientWidth} off ${off}`
              );
            }
          }
          return out;
        },
        { MUST_READ_SEL: MUST_READ, coarse: !!axis.touch }
      );

      const tag = file
        .replace(".html", "")
        .replace("-transcript", "")
        .replace("-assistant", "")
        .replace("-fleet", "");
      if (r.doc) {
        problems.push(`${tag} doc overflow ${r.doc}`);
      }
      for (const c of r.clipped) {
        problems.push(`${tag} clipped ${c}`);
      }
      for (const u of r.unread) {
        problems.push(`${tag} must-read unreachable ${u}`);
      }
      for (const sm of [...new Set(r.small)]) {
        problems.push(`${tag} target ${sm}`);
      }
      await page.close();
    }
    const label = `${axis.name}${dark ? " · dark" : " · light"}`;
    if (!problems.length) {
      console.log(`  PASS  ${label}`);
    } else if (axis.report) {
      reported += problems.length;
      console.log(
        `  NOTE  ${label} — ${problems.length} finding(s), reported not enforced`
      );
      for (const p of [...new Set(problems)].slice(0, 4)) {
        console.log(`          ${p}`);
      }
    } else {
      fails += problems.length;
      console.log(`  FAIL  ${label} — ${problems.length} finding(s)`);
      for (const p of [...new Set(problems)].slice(0, 6)) {
        console.log(`          ${p}`);
      }
    }
  }
}
await browser.close();
console.log(
  fails
    ? `  ${fails} axis failures (${reported} reported-only findings on unenforced axes)`
    : `  every enforced axis holds (${reported} reported-only findings on RTL, which is not enforced — see header)`
);
process.exit(fails ? 1 : 0);
