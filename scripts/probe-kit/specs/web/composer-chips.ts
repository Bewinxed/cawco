/**
 * The composer's chips (MentionField), on the recall bench: the real
 * Composer over a session whose / menu holds two skills (`clean-copy`,
 * `interfaces:better-typography`) and a built-in, no hub. On Chromium and
 * WebKit:
 *
 *   bun scripts/probe-kit/run.ts web composer-chips
 *
 * - A skill picked from the / menu is its chip, and the message it starts
 *   is sent as `/clean-copy …`, byte for byte.
 * - A skill typed whole (`/name` and a space) is its chip where it stands;
 *   an unknown `/word` stays text; the message is sent as typed.
 * - Backspace after a chip takes it whole.
 * - In a draft long enough to wrap, a mention chip and a skill chip each
 *   sit in their line as a word does: the label on the text's baseline
 *   (within 1px), every line of the field its line-height, no space of the
 *   chip's own (geom.ts `inlineFit`).
 */
import type { Page } from "playwright-core";
import { fitsLine, inlineFit } from "../../geom";
import {
  COMPOSER,
  type Engine,
  type Kit,
  open,
  type Spec,
  settle,
} from "../../kit";

const FIELD = COMPOSER;

/** Long drafts, so each chip stands inside the field's lines, not at an end. */
const MENTIONED =
  "Before you push, read what the other pane found about the cap and the pane it stands in, then ask @Cap the tray chip at its pane <bench#1a2b> whether the count still lines up when the label truncates at its end on the narrowest width the shell allows, and say what changed.";
const SKILLED =
  "Before you push, read what the other pane found about the cap and the pane it stands in, then run /clean-copy over every empty state the shell draws and say which captions only restate their label, which hints nobody needed, and what you cut.";

interface Bench {
  draft: { text: string };
  sent: string[];
}

/** The bench's draft and what it sent (the recall bench's `__recall`). */
const bench = (page: Page): Promise<{ text: string; sent: string[] }> =>
  page.evaluate(() => {
    const { draft, sent } = (globalThis as unknown as { __recall: Bench })
      .__recall;
    return { text: draft.text, sent: [...sent] };
  });

/** Writes the draft as a restore does. */
const writeDraft = (page: Page, text: string): Promise<void> =>
  page.evaluate((words) => {
    (globalThis as unknown as { __recall: Bench }).__recall.draft.text = words;
  }, text);

/** The chips the field holds: what each is, and what it sends. */
const chipsIn = (page: Page) =>
  page.locator(`${FIELD} [data-mention-chip]`).evaluateAll((els) =>
    els.map((el) => ({
      skill: (el as HTMLElement).dataset.skillChip ?? null,
      sends: (el as HTMLElement).dataset.mention ?? "",
      label: el.textContent?.trim() ?? "",
    }))
  );

async function fresh(kit: Kit, base: string, engine: Engine): Promise<Page> {
  const page = await kit.page("desk", { engine });
  await open(page, `${base}/motion/recall`, FIELD, 120_000);
  await settle(page, 300);
  return page;
}

async function fitOf(
  kit: Kit,
  page: Page,
  engine: Engine,
  what: string,
  chip: string
): Promise<void> {
  await page.waitForSelector(chip, { timeout: 15_000 });
  await settle(page, 300);
  const fit = await page.locator(chip).first().evaluate(inlineFit);
  kit.note(`${what} on ${engine}: ${JSON.stringify(fit)}`);
  kit.check(
    `${what} on ${engine}: the label on the text's baseline (within 1px), every line its line-height, no space of the chip's own`,
    fitsLine(fit) && fit.lines.length >= 3,
    JSON.stringify({
      delta: fit.delta,
      lines: fit.lines.length,
      pitches: fit.pitches,
      lineHeight: fit.lineHeight,
      before: fit.before,
      after: fit.after,
    })
  );
}

async function fits(kit: Kit, base: string, engine: Engine): Promise<void> {
  const page = await fresh(kit, base, engine);
  await writeDraft(page, MENTIONED);
  await fitOf(
    kit,
    page,
    engine,
    "mention-chip",
    `${FIELD} [data-mention-chip]:not([data-skill-chip])`
  );
  await writeDraft(page, SKILLED);
  await fitOf(
    kit,
    page,
    engine,
    "skill-chip, a draft put back",
    `${FIELD} [data-skill-chip="clean-copy"]`
  );
  const held = await bench(page);
  kit.check(
    `skill-chip on ${engine}: the draft with its chip is the string put in, byte for byte`,
    held.text === SKILLED,
    held.text
  );
  await page.close();
}

async function picked(kit: Kit, base: string, engine: Engine): Promise<void> {
  const page = await fresh(kit, base, engine);
  await page.locator(FIELD).click();
  await page.keyboard.type("/clean");
  const row = '[id^="composer-entry-"]';
  await page.waitForSelector(row, { timeout: 5000 });
  await page.keyboard.press("Enter");
  await page.waitForSelector(`${FIELD} [data-skill-chip="clean-copy"]`, {
    timeout: 5000,
  });
  await page.keyboard.type("over the empty states");
  const before = await chipsIn(page);
  await page.keyboard.press("Enter");
  await settle(page, 300);
  const after = await bench(page);
  kit.check(
    `skill-chip on ${engine}: picked from the / menu, /clean-copy is its chip (the skill's glyph and name)`,
    before.length === 1 &&
      before[0]?.skill === "clean-copy" &&
      before[0]?.sends === "/clean-copy" &&
      before[0]?.label === "clean-copy",
    JSON.stringify(before)
  );
  kit.check(
    `skill-chip on ${engine}: the message it starts is sent as typed, the command first ("/clean-copy over the empty states")`,
    after.sent.at(-1) === "/clean-copy over the empty states",
    JSON.stringify(after.sent)
  );
  await page.close();
}

async function typed(kit: Kit, base: string, engine: Engine): Promise<void> {
  const page = await fresh(kit, base, engine);
  await page.locator(FIELD).click();
  const words =
    "please run /interfaces:better-typography now, and /nope-skill too";
  await page.keyboard.type(words);
  await settle(page, 200);
  const chips = await chipsIn(page);
  const text = await page.locator(FIELD).textContent();
  kit.check(
    `skill-chip on ${engine}: a skill typed whole is its chip where it stands; an unknown /word stays text`,
    chips.length === 1 &&
      chips[0]?.skill === "interfaces:better-typography" &&
      chips[0]?.sends === "/interfaces:better-typography" &&
      (text ?? "").includes("/nope-skill"),
    JSON.stringify({ chips, text })
  );
  await page.keyboard.press("Enter");
  await settle(page, 300);
  const after = await bench(page);
  kit.check(
    `skill-chip on ${engine}: the typed message is sent byte for byte`,
    after.sent.at(-1) === words,
    JSON.stringify(after.sent)
  );

  // Backspace after a chip takes it whole.
  await page.locator(FIELD).click();
  await page.keyboard.type("/clean-copy ");
  await page.waitForSelector(`${FIELD} [data-skill-chip="clean-copy"]`, {
    timeout: 5000,
  });
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  await settle(page, 200);
  const gone = await chipsIn(page);
  const left = await bench(page);
  kit.check(
    `skill-chip on ${engine}: Backspace takes the chip whole`,
    gone.length === 0 && left.text === "",
    JSON.stringify({ chips: gone, text: left.text })
  );
  await page.close();
}

const spec: Spec = {
  name: "composer-chips",
  async run(kit) {
    const base = await kit.bench();
    const scenes: [string, (k: Kit, b: string) => Promise<void>][] = [];
    for (const engine of ["chromium", "webkit"] as const) {
      scenes.push(
        [`fits on ${engine}`, (k, b) => fits(k, b, engine)],
        [`picked on ${engine}`, (k, b) => picked(k, b, engine)],
        [`typed on ${engine}`, (k, b) => typed(k, b, engine)]
      );
    }
    for (const [name, scene] of scenes) {
      try {
        // biome-ignore lint/performance/noAwaitInLoops: one scene at a time
        await scene(kit, base);
      } catch (error) {
        kit.check(`${name}: runs`, false, String(error));
      }
    }
  },
};
export default spec;
