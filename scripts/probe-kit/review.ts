/**
 * The owner's review page for baselines that differ (`--review <dir>`): the
 * fleet's one shape for pictures that need his eye, a few decisions on one
 * phone page (`scripts/probe-review/`, copied from backlot). One decision per
 * surface (a capture's name less its viewport and theme), two candidates,
 * the approved look and the new one, on the same pictures: one per viewport
 * and theme, cut to the region that changed. Each decision names the
 * entries a "New look" pick approves, so the picks turn into `--approve`.
 */
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import { PNG } from "pngjs";
import { type Changed, entrySlug, ROOT, THEMES, VIEWS } from "./kit";

const PAGE = join(ROOT, "scripts", "probe-review", "index.html");
/** Words a capture's name ends with that name its viewport or theme. */
const SUFFIXES = new Set<string>([...THEMES, ...Object.keys(VIEWS)]);

interface Item {
  after: string;
  before: string;
  label: string;
}
interface Decision {
  /** What a "New look" pick approves: `--approve <spec>:<entries>`. */
  approve: { command: string; entries: string[]; spec: string };
  candidates: { id: string; items: Item[]; label: string; result: string }[];
  id: string;
  question: string;
}

/** "tab-strip" as words: "Tab strip". */
const words = (slug: string): string => {
  const said = slug.replaceAll("-", " ");
  return said.charAt(0).toUpperCase() + said.slice(1);
};

/** A capture's name split into its surface and its viewport/theme words. */
function surfaceOf(entry: string): { surface: string; variant: string[] } {
  const parts = entry.split("-");
  const variant: string[] = [];
  while (parts.length > 1 && SUFFIXES.has(parts.at(-1) as string)) {
    variant.unshift(parts.pop() as string);
  }
  return { surface: parts.join("-"), variant };
}

/** `png` cut to `box`, made a phone-sized jpg at `to` with ffmpeg. */
async function jpg(png: Buffer, box: Changed["box"], to: string) {
  let bytes = png;
  if (box) {
    const img = PNG.sync.read(png);
    const cut = new PNG({ width: box.width, height: box.height });
    PNG.bitblt(img, cut, box.x, box.y, box.width, box.height, 0, 0);
    bytes = PNG.sync.write(cut);
  }
  const ffmpeg = Bun.spawn(
    [
      "ffmpeg",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "png_pipe",
      "-i",
      "pipe:0",
      "-vf",
      "scale='min(1024,iw)':-2",
      "-q:v",
      "3",
      to,
    ],
    { stdin: bytes, stdout: "ignore", stderr: "pipe" }
  );
  const [err, code] = await Promise.all([
    new Response(ffmpeg.stderr).text(),
    ffmpeg.exited,
  ]);
  if (code !== 0) {
    throw new Error(`ffmpeg exited ${code} writing ${to}: ${err.trim()}`);
  }
}

/**
 * Writes `<dir>/index.html`, `<dir>/manifest.json` and `<dir>/img/` for the
 * captures that differ, and prints what each decision's picks run.
 */
export async function writeReview(
  dir: string,
  changed: readonly Changed[]
): Promise<void> {
  const at = resolve(dir);
  // This page's files alone: pictures an earlier run left would read as this run's.
  await rm(join(at, "img"), { recursive: true, force: true });
  await rm(join(at, "manifest.json"), { force: true });
  await mkdir(join(at, "img"), { recursive: true });
  await copyFile(PAGE, join(at, "index.html"));

  const groups = new Map<string, Changed[]>();
  for (const one of changed) {
    const key = `${one.spec}:${surfaceOf(one.entry).surface}`;
    groups.set(key, [...(groups.get(key) ?? []), one]);
  }
  const decisions: Decision[] = [];
  for (const [id, group] of groups) {
    const spec = group[0]?.spec as string;
    const { surface } = surfaceOf(group[0]?.entry as string);
    const name =
      surface === spec
        ? words(spec)
        : `${words(spec)}, ${surface.replaceAll("-", " ")}`;
    const keep: Item[] = [];
    const take: Item[] = [];
    for (const one of group) {
      const stem = `${one.spec}-${one.entry}`;
      const approved = `img/${stem}-approved.jpg`;
      const now = `img/${stem}-new.jpg`;
      // biome-ignore lint/performance/noAwaitInLoops: one ffmpeg at a time
      await jpg(await readFile(one.baseline), one.box, join(at, approved));
      await jpg(await readFile(one.capture), one.box, join(at, now));
      const { variant } = surfaceOf(one.entry);
      const label =
        variant.length > 0 ? variant.map(words).join(" · ") : words(one.entry);
      keep.push({ label, before: approved, after: approved });
      take.push({ label, before: approved, after: now });
    }
    const entries = group.map((one) => entrySlug(one.entry));
    decisions.push({
      id,
      question: `${name}: keep the approved look or take the new one?`,
      approve: {
        spec,
        entries,
        command: `bun scripts/probe-kit/run.ts web ${spec} --approve ${spec}:${entries.join(",")}`,
      },
      candidates: [
        {
          id: "keep",
          label: "Approved look",
          result:
            "What the baseline holds today; the new drawing fails the check until it changes back.",
          items: keep,
        },
        {
          id: "approve",
          label: "New look",
          result:
            "What the code draws now; picking it makes this the approved look.",
          items: take,
        },
      ],
    });
  }
  const specs = [...new Set(changed.map((one) => one.spec))];
  const manifest = {
    id: `${basename(at)}-${Date.now()}`,
    title: `${specs.map(words).join(", ")}: pixels that changed`,
    decisions,
  };
  await writeFile(
    join(at, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`
  );

  console.log(
    `REVIEW ${relative(process.cwd(), at) || "."}: ${decisions.length} decision(s) for the owner (index.html, manifest.json, img/)`
  );
  for (const d of decisions) {
    console.log(`  ${d.id} "${d.question}"`);
    console.log(`    New look (approve) → ${d.approve.command}`);
    console.log("    Approved look (keep) → nothing to approve");
  }
}
