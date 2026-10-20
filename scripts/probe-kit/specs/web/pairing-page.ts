/**
 * The pairing decision page (apps/dashboard/src/lib/cawco/pairing/preview/
 * page.oui) drawn as the owner sees it, with no hub (decision-embeds.ts):
 * the hub's decision host around the program, and each Preview the pairing
 * sheet's component canvas (Pairing.stories.ts) drawn live by the
 * dashboard's own stage, `by=embed` with the stories its Preview names.
 *
 * At 1440×900 and 390×844, light and dark, each embed scrolled to as the
 * owner would:
 * 1. The program passes the hub's own check (`checkProgram`).
 * 2. There is one embed for each Preview, each naming the stories its
 *    Preview names.
 * 3. Each draws those stories and only those (decision-embeds.ts
 *    `embedDrawFaults`): every frame drawn with words in it, its pixels its
 *    DOM's paint, nothing over it.
 * 4. No embed shows the canvas's working chrome, each is as tall as what it
 *    draws, and no console error.
 * 5. The page's own capture, window by window as CawCo shows it
 *    (decision-embeds.ts `capturePage`), paints every embed, and is files a
 *    delegate can hand over: RGB, each within the hub's 1 MiB (a tall page
 *    in numbered sections cut between its cards), read back pixel for
 *    pixel. The captures and their manifest go to .probe/decision-pages/.
 *
 *   bun scripts/probe-kit/run.ts web pairing-page
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one leg at a time
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { checkProgram } from "../../../../packages/hub/src/decision-program";
import { FOLDER_FILE_LIMIT } from "../../../../packages/hub/src/project-folder";
import {
  blankEmbeds,
  captureFaults,
  capturePage,
  EMBED_FRAME,
  type EmbedPaint,
  embedDrawFaults,
  readEmbeds,
  startDecisionStage,
} from "../../decision-embeds";
import { type Kit, ROOT, type Spec, THEMES } from "../../kit";

const OUT = join(ROOT, ".probe/pairing-page");
/** The page's own captures, one a window size and theme, and their manifest. */
const PAGES = join(ROOT, ".probe/decision-pages");
/** The published page this program is, as the hub names it (artifact d02dc1de…). */
const PAGE_ID = "d02dc1de";
const NAME = "pairing-page";
const DIR = "apps/dashboard/src/lib/cawco/pairing";
const FILE = "src/lib/cawco/pairing/Pairing.stories.ts";
const PROGRAM = readFileSync(join(ROOT, DIR, "preview/page.oui"), "utf8");
const PREVIEW = /Preview\("([0-9a-f-]+)", "[^"]*", \[([^\]]*)\]\)/g;
/** The canvas each Preview embeds, and the stories each names, as the program writes them. */
const previews = [...PROGRAM.matchAll(PREVIEW)].map((m) => ({
  id: m[1] as string,
  stories: (m[2] as string).split(",").map((one) => one.trim().slice(1, -1)),
}));
const CANVAS = previews[0]?.id ?? "";

const key = (stories: readonly string[]) => stories.join(",");
/** The Previews' story lists, sorted: the page draws them in its own order. */
const WANTED = previews.map((one) => key(one.stories)).sort();

const spec: Spec = {
  name: "pairing-page",
  run: async (kit: Kit) => {
    rmSync(OUT, { recursive: true, force: true });
    mkdirSync(OUT, { recursive: true });
    rmSync(PAGES, { recursive: true, force: true });
    mkdirSync(PAGES, { recursive: true });
    const captures: {
      embeds: EmbedPaint[];
      files: {
        bytes: number;
        file: string;
        rows: { from: number; to: number };
      }[];
      height: number;
      theme: string;
      viewport: { height: number; width: number };
    }[] = [];

    let refusal = "";
    try {
      checkProgram(PROGRAM);
    } catch (error) {
      refusal = (error as Error).message;
    }
    kit.check(
      `the hub's check keeps the program (${previews.length} Previews of one canvas)`,
      refusal === "" &&
        previews.length > 0 &&
        previews.every((one) => one.id === CANVAS),
      refusal
    );

    const stage = await startDecisionStage(new Map([[NAME, PROGRAM]]), {
      [CANVAS]: [FILE],
    });
    try {
      for (const view of ["desk", "phone"] as const) {
        for (const theme of THEMES) {
          const leg = `${view === "desk" ? "1440×900" : "390×844"} ${theme}`;
          const page = await kit.page(view, { theme });
          const errors: string[] = [];
          page.on("console", (message) => {
            if (message.type() === "error") {
              errors.push(message.text().slice(0, 240));
            }
          });
          page.on("pageerror", (error) =>
            errors.push(error.message.slice(0, 240))
          );
          await page.goto(stage.pageUrl(NAME, theme), { waitUntil: "load" });
          await page.waitForSelector(".dp-card", { timeout: 30_000 });
          await page.waitForFunction(
            ({ n, selector }) =>
              document.querySelectorAll(selector).length === n,
            { n: previews.length, selector: EMBED_FRAME },
            { timeout: 60_000 }
          );
          const { embeds, undrawn } = await readEmbeds(
            page,
            theme,
            join(OUT, `${view}-${theme}`)
          );
          const seen = embeds
            .map((e) => {
              const url = new URL(e.src);
              return url.searchParams.get("by") === "embed"
                ? key(url.searchParams.getAll("story"))
                : `not an embed: ${e.src}`;
            })
            .sort();
          kit.check(
            `${leg}: one embed a Preview, each naming its Preview's stories (${embeds.length} of ${previews.length})`,
            key(seen) === key(WANTED),
            `seen ${seen.join(" | ")}\nwanted ${WANTED.join(" | ")}`
          );
          const faults = [...embeds.flatMap(embedDrawFaults), ...undrawn];
          kit.check(
            `${leg}: every embed draws its stories (${embeds.map((e) => `${e.shots.map((shot) => shot.story).join("+")}`).join("; ")})`,
            embeds.length === previews.length && faults.length === 0,
            faults.slice(0, 12).join("\n    ")
          );
          const chrome = embeds.flatMap((e) => e.chrome);
          const tall = embeds.filter((e) => Math.abs(e.box.h - e.tall) > 2);
          kit.check(
            `${leg}: no canvas chrome, every embed as tall as it draws, no console error`,
            chrome.length === 0 && tall.length === 0 && errors.length === 0,
            [
              ...chrome,
              ...tall.map((e) => `${e.caption}: ${e.box.h}px of ${e.tall}`),
              ...new Set(errors),
            ]
              .slice(0, 12)
              .join("\n    ")
          );

          const viewport = page.viewportSize() ?? { width: 0, height: 0 };
          const file = join(PAGES, `pairing-${viewport.width}-${theme}.png`);
          const capture = await capturePage(page, file);
          const { paints } = capture;
          const captured = captureFaults(capture);
          kit.check(
            `${leg}: the page's capture is files a delegate can hand over, each RGB and at most ${FOLDER_FILE_LIMIT / 1024 / 1024} MiB, its whole picture pixel for pixel (${capture.files.map((f) => `${relative(ROOT, f.path)} ${(f.bytes / 1024).toFixed(0)} KiB, rows ${f.rows.from}–${f.rows.to}`).join(", ")}; ${capture.picture.width}×${capture.picture.height})`,
            capture.files.length > 0 && captured.length === 0,
            captured.join("\n    ")
          );
          const blank = blankEmbeds(paints);
          kit.check(
            `${leg}: the page's own capture paints every embed (${relative(ROOT, file)}; ${paints.map((one) => `“${one.embed}” ${Math.round(one.flat * 1000) / 10}%`).join(", ")} its commonest colour)`,
            paints.length === previews.length && blank.length === 0,
            blank.join("\n    ")
          );
          captures.push({
            files: capture.files.map((f) => ({
              bytes: f.bytes,
              file: relative(PAGES, f.path),
              rows: f.rows,
            })),
            theme,
            viewport,
            height: await page.evaluate(
              () => document.documentElement.scrollHeight
            ),
            embeds: paints,
          });
          await page.close();
        }
      }
    } finally {
      await stage.stop();
    }
    const commit = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: ROOT })
      .stdout.toString()
      .trim();
    const dirty =
      Bun.spawnSync(["git", "status", "--porcelain"], { cwd: ROOT })
        .stdout.toString()
        .trim() !== "";
    writeFileSync(
      join(PAGES, "manifest.json"),
      `${JSON.stringify(
        {
          page: PAGE_ID,
          title: "How the pairing screen behaves",
          program: {
            file: join(DIR, "preview/page.oui"),
            sha256: createHash("sha256").update(PROGRAM).digest("hex"),
          },
          canvas: { id: CANVAS, file: join("apps/dashboard", FILE) },
          commit,
          dirty,
          captured: new Date().toISOString(),
          captures,
        },
        null,
        2
      )}\n`
    );
    kit.note(
      `captures: ${captures.flatMap((one) => one.files.map((f) => relative(ROOT, join(PAGES, f.file)))).join(", ")}, ${relative(ROOT, join(PAGES, "manifest.json"))}`
    );
  },
};

export default spec;
