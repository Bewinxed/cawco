#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
/**
 * Phase 9b gate — the fleet assistant on the PRESERVED measured shell.
 * Measures DW-9b.1 (shell geometry is law), DW-9b.2 (action->undo/checkpoint
 * map, zero silent, approval card), DW-9b.3 (non-positional distinguishing
 * cue), DW-9b.4 (ai-native canon-gap labels). Measure, never assert by faith.
 */
import { chromium } from "playwright-core";

const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = join(HERE, "v5-assistant.html");
const raw = readFileSync(FILE, "utf8");
let pass = 0,
  fail = 0;
const ok = (c, m) => {
  if (c) {
    pass++;
  } else {
    fail++;
    console.log(`  FAIL  ${m}`);
  }
};
const near = (a, b, t = 2) => Math.abs(a - b) <= t;

const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_BIN ||
    "/home/bewinxed/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--force-color-profile=srgb"],
});

async function open({ width = 1440, height = 960, dark = false } = {}) {
  const p = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 1,
  });
  await p.goto(pathToFileURL(FILE).href, { waitUntil: "load" });
  if (dark) {
    await p.evaluate(() => document.documentElement.classList.add("dark"));
  }
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(120);
  return p;
}
const rect = (p, s) =>
  p.evaluate((sel) => {
    const e = document.querySelector(sel);
    if (!e) {
      return null;
    }
    const r = e.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right };
  }, s);

// ================= DW-9b.1 — the preserved shell is LAW =================
console.log(
  "== DW-9b.1: preserved shell (380x899, 24/40, radius 16, header 47, pitch 44, scrim .06) =="
);
{
  const p = await open();
  const iw = await p.evaluate(() => window.innerWidth);
  const asst = await rect(p, ".asst");
  ok(asst && near(asst.w, 380), `panel width 380 (got ${asst && asst.w})`);
  ok(asst && near(asst.h, 899), `panel height 899 (got ${asst && asst.h})`);
  ok(asst && near(asst.y, 40), `panel inset top 40 (got ${asst && asst.y})`);
  ok(
    asst && near(iw - asst.right, 24),
    `panel inset right 24 (got ${asst && iw - asst.right})`
  );
  const radius = await p.evaluate(
    () => getComputedStyle(document.querySelector(".asst")).borderTopLeftRadius
  );
  ok(radius === "16px", `panel radius 16 (got ${radius})`);
  const head = await rect(p, ".asst header");
  ok(head && near(head.h, 47), `header height 47 (got ${head && head.h})`);
  // suggestion pitch: top-delta between the first two suggestion buttons == 44
  const pitch = await p.evaluate(() => {
    const b = [...document.querySelectorAll(".a-sug button")];
    if (b.length < 2) {
      return -1;
    }
    return b[1].getBoundingClientRect().top - b[0].getBoundingClientRect().top;
  });
  ok(near(pitch, 44), `suggestion-row pitch 44 (got ${pitch})`);
  const sugH = await rect(p, ".a-sug button");
  ok(
    sugH && near(sugH.h, 40),
    `suggestion-row height 40 (got ${sugH && sugH.h})`
  );
  // scrim alpha ~ .06 (rgba(0,0,0,.06) == --scrim-soft), light + dark both present
  const alpha = await p.evaluate(() => {
    const bg = getComputedStyle(
      document.querySelector(".asst-scrim")
    ).backgroundColor;
    const m = bg.match(/[\d.]+/g);
    if (!m) {
      return null;
    }
    return m.length >= 4 ? Number.parseFloat(m[3]) : 1; // rgba alpha; oklch(.. / a) also lands last
  });
  ok(
    alpha !== null && alpha > 0 && alpha <= 0.12,
    `scrim is a light wash, alpha<=.12 (got ${alpha})`
  );
  await p.close();
  // dark scheme: shell geometry identical
  const pd = await open({ dark: true });
  const ad = await rect(pd, ".asst");
  ok(
    ad && near(ad.w, 380) && near(ad.h, 899),
    `panel 380x899 unchanged in dark (${ad && ad.w}x${ad && ad.h})`
  );
  await pd.close();
}

// ================= DW-9b.2 — action->undo/checkpoint, zero silent =================
console.log(
  "== DW-9b.2: action contract, every action -> undo/checkpoint, zero silent =="
);
{
  const p = await open();
  // visible action list: every row has a reversibility tag, all in {undo,checkpoint}, none silent
  const acts = await p.evaluate(() =>
    [...document.querySelectorAll(".a-can li")].map((li) => ({
      label: li.querySelector("b")?.textContent?.trim() || "",
      rv: li.querySelector(".rv")?.textContent?.trim().toLowerCase() || "",
    }))
  );
  ok(acts.length >= 4, `>=4 enumerated actions (got ${acts.length})`);
  ok(
    acts.every((a) => a.rv === "undo" || a.rv === "checkpoint"),
    "every action tag is undo|checkpoint"
  );
  ok(
    acts.every((a) => a.rv !== "silent"),
    "zero actions map to silent"
  );
  ok(
    acts.some((a) => a.rv === "checkpoint") &&
      acts.some((a) => a.rv === "undo"),
    "both undo and checkpoint appear"
  );
  await p.close();
  // the design-deliverable comment carries the full contract incl. approval card + NONE-silent
  const cmt = raw.replace(/[\s\S]*ACTION CONTRACT/, "").slice(0, 1400);
  ok(/NONE maps to silent/i.test(cmt), "contract states NONE maps to silent");
  ok(
    /\[card\]/.test(cmt) && /approval card/i.test(raw),
    "consequential actions carry the approval card"
  );
  ok(
    /checkpoint/.test(cmt) && /undo/.test(cmt),
    "contract maps actions to undo/checkpoint"
  );
  ok(
    /inherited whole|inherits Phase 5|approval card \(symmetric/i.test(raw),
    "Phase 5 approval contract inherited in full"
  );
}

// ================= DW-9b.3 — distinguishable from a transcript, non-positional =================
console.log(
  "== DW-9b.3: distinguishable from a session transcript, not by position alone =="
);
{
  const p = await open();
  const name = await p.evaluate(
    () => document.querySelector(".asst .a-t")?.textContent?.trim() || ""
  );
  ok(
    /CawCo\s*Assistant/i.test(name),
    `assistant carries its NAME cue "${name}"`
  );
  const role = await p.evaluate(
    () => document.querySelector(".asst .a-role")?.textContent?.trim() || ""
  );
  ok(
    /assistant/i.test(role),
    `persistent non-positional role tag present ("${role}")`
  );
  const hasOrb = await p.evaluate(
    () => !!document.querySelector(".asst .a-logo svg")
  );
  ok(hasOrb, "assistant carries a distinct mark (orb) in its header");
  // the OTHER AI surface (transcript) uses a different role label -> the two are tellable apart
  const trRole = await p.evaluate(() =>
    [...document.querySelectorAll(".tr .who")].map((w) => w.textContent.trim())
  );
  ok(
    trRole.some((r) => /Claude Code/i.test(r)) &&
      !/Assistant/i.test(trRole.join("|")),
    'the transcript surface uses a different role label (Claude Code), not "Assistant"'
  );
  // the cue lives in the header (persists regardless of scroll position), not derived from panel position
  const headerHasCue = await p.evaluate(() => {
    const h = document.querySelector(".asst header");
    return !!(h && h.querySelector(".a-t") && h.querySelector(".a-role"));
  });
  ok(
    headerHasCue,
    "the name + role cue live in the always-visible header (non-positional)"
  );
  await p.close();
}

// ================= DW-9b.4 — ai-native canon-gap labels =================
console.log(
  "== DW-9b.4: every recommendation principle-derived; 4 canon gaps marked inference =="
);
{
  ok(
    /principle-derived/i.test(raw),
    "recommendations labelled principle-derived (ai-native has no settled canon)"
  );
  for (const gap of ["STREAMING", "LATENCY", "REFUSAL", "REASONING"]) {
    const re = new RegExp(`${gap}[^\\n]*designer inference`, "i");
    ok(re.test(raw), `canon gap ${gap} marked [designer inference]`);
  }
}

await browser.close();
console.log(`\n${pass + fail} checks, ${fail} failures`);
process.exit(fail ? 1 : 0);
