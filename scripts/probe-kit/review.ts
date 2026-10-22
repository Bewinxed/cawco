#!/usr/bin/env bun
/**
 * The owner's review page for captures that differ from their approved
 * baselines (`--review <dir>`): one page, `scripts/probe-review/index.html`
 * reading `manifest.json` beside it, grouped by surface. Each entry shows the
 * approved baseline, the new capture (held, the approved one) and pixelmatch's
 * picture of what changed, all three cut to the same region; each surface has
 * one Approve or Reject, a `data-cawco-choice` the CawCo overlay keeps on the
 * hub, so `artifact_read` answers the picks.
 *
 * The new captures are the candidate baselines, kept apart from the approved
 * set: `<dir>/candidates/web/<spec>/<entry>.png`, the same layout as
 * `baselines/`. Nothing here writes an approved baseline. Approving is
 * `approve-review.ts`, which reads the page's picks and moves the approved
 * surfaces' candidates over the approved set.
 *
 * Which commits on main made each change are the reviewer's finding, not the
 * run's: `<dir>/commits.json` (`{ "<spec>:<surface>": [{ "sha", "subject",
 * "states" }] }`, each commit with the states it changed)
 * names them, and the manifest carries each one. Written after the run,
 * `bun scripts/probe-kit/review.ts <dir>` writes the manifest again from the
 * run's `changed.json` and it, pictures untouched.
 */
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import { PNG } from "pngjs";
import type { Changed } from "./kit";

const PAGE = join(import.meta.dir, "..", "probe-review", "index.html");

/** One capture on the page, its paths inside the review's folder. */
export interface ReviewEntry {
  /** The new capture, cut to the region. */
  after: string;
  /** The approved baseline, cut to the region; null where none was approved yet. */
  before: string | null;
  /** The candidate baseline at full size: what Approve writes over the approved one. */
  candidate: string;
  /** pixelmatch's picture of the change, cut to the region; null when the sizes differ or none was approved. */
  diff: string | null;
  entry: string;
  /** "rest · desk · dark": the state and pass, the surface's own words left out. */
  label: string;
  /** Pixels that differ; null when the sizes differ or none was approved. */
  pixels: number | null;
  /** Where the size changed: `<baseline> → <capture>`. */
  size: string | null;
}

/** A commit on main that changed a surface, as the reviewer found it: the states it changed. */
export interface ReviewCommit {
  sha: string;
  /** The surface's states it changed, as an entry names them less its pass ("rest", "row-menu"). */
  states: string[];
  subject: string;
}

/** One surface's decision: approve every candidate under it, or reject them all. */
export interface ReviewSurface {
  /** Every commit that changed it, oldest first; empty where none is named yet. */
  commits: ReviewCommit[];
  entries: ReviewEntry[];
  /** The page's `data-cawco-choice`: `<spec>:<surface>`. */
  id: string;
  label: string;
  spec: string;
  surface: string;
}

export interface ReviewManifest {
  /** The main commit the captures were taken on. */
  base: string;
  id: string;
  surfaces: ReviewSurface[];
  title: string;
}

/** The run's own record of what it wrote, for the manifest to be written again. */
interface ReviewRecord {
  base: string;
  surfaces: Omit<ReviewSurface, "commits">[];
}

/** "tab-strip" as words: "Tab strip". */
const words = (slug: string): string => {
  const said = slug.replaceAll("-", " ");
  return said.charAt(0).toUpperCase() + said.slice(1);
};

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

/** HEAD's full hash in the checkout the run read. */
const head = (): string => {
  const run = Bun.spawnSync(["git", "rev-parse", "HEAD"], {
    cwd: import.meta.dir,
  });
  if (run.exitCode !== 0) {
    throw new Error(
      `git rev-parse HEAD exited ${run.exitCode}: ${run.stderr.toString().trim()}`
    );
  }
  return run.stdout.toString().trim();
};

/** `<dir>/commits.json`, by surface id; empty when the reviewer has written none. */
async function commitsOf(at: string): Promise<Record<string, ReviewCommit[]>> {
  const file = join(at, "commits.json");
  return existsSync(file)
    ? (JSON.parse(await readFile(file, "utf8")) as Record<
        string,
        ReviewCommit[]
      >)
    : {};
}

/**
 * `<dir>/manifest.json` from the run's `changed.json` and the reviewer's
 * `commits.json`: every surface, with the commits named for it.
 */
export async function writeManifest(dir: string): Promise<ReviewManifest> {
  const at = resolve(dir);
  const record = JSON.parse(
    await readFile(join(at, "changed.json"), "utf8")
  ) as ReviewRecord;
  const commits = await commitsOf(at);
  const unknown = Object.keys(commits).filter(
    (id) => !record.surfaces.some((s) => s.id === id)
  );
  if (unknown.length > 0) {
    throw new Error(
      `commits.json names surfaces this review does not hold: ${unknown.join(", ")}`
    );
  }
  const specs = [...new Set(record.surfaces.map((s) => s.spec))];
  const manifest: ReviewManifest = {
    id: `${basename(at)}-${record.base.slice(0, 9)}`,
    title: `${specs.map(words).join(", ")} at ${record.base.slice(0, 9)}: captures that differ from their approved baselines`,
    base: record.base,
    surfaces: record.surfaces.map((s) => ({
      ...s,
      commits: commits[s.id] ?? [],
    })),
  };
  await writeFile(
    join(at, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
  return manifest;
}

/**
 * One capture's pictures and candidate, written into the review's folder
 * `at`: the candidate at full size, the approved and new pictures cut to the
 * region that changed, and pixelmatch's picture of it.
 */
async function entryOf(at: string, one: Changed): Promise<ReviewEntry> {
  const stem = `${one.spec}-${one.entry}`;
  const candidate = join("candidates", "web", one.spec, `${one.entry}.png`);
  await mkdir(join(at, "candidates", "web", one.spec), { recursive: true });
  const shot = await readFile(one.capture);
  await writeFile(join(at, candidate), shot);
  const after = `img/${stem}-new.jpg`;
  await jpg(shot, one.box, join(at, after));
  let before: string | null = null;
  let size: string | null = null;
  if (one.baseline) {
    before = `img/${stem}-approved.jpg`;
    const approved = await readFile(one.baseline);
    await jpg(approved, one.box, join(at, before));
    if (one.box === null) {
      const [was, now] = [PNG.sync.read(approved), PNG.sync.read(shot)];
      size = `${was.width}×${was.height} → ${now.width}×${now.height}`;
    }
  }
  let diff: string | null = null;
  if (one.diff) {
    diff = `img/${stem}-diff.jpg`;
    await jpg(await readFile(one.diff), null, join(at, diff));
  }
  const own = `${one.surface}-`;
  const rest = one.entry.startsWith(own)
    ? one.entry.slice(own.length)
    : one.entry;
  return {
    entry: one.entry,
    label: rest.split("-").join(" · "),
    before,
    after,
    diff,
    candidate,
    pixels: one.pixels,
    size,
  };
}

/**
 * Writes `<dir>/index.html`, `<dir>/img/`, `<dir>/candidates/`,
 * `<dir>/changed.json` and `<dir>/manifest.json` for the captures that
 * differ, and prints each surface.
 */
export async function writeReview(
  dir: string,
  changed: readonly Changed[]
): Promise<void> {
  const at = resolve(dir);
  // This page's files alone: pictures an earlier run left would read as this run's.
  await Promise.all(
    ["img", "candidates", "changed.json", "manifest.json"].map((old) =>
      rm(join(at, old), { recursive: true, force: true })
    )
  );
  await mkdir(join(at, "img"), { recursive: true });
  await copyFile(PAGE, join(at, "index.html"));

  const groups = new Map<string, Changed[]>();
  for (const one of changed) {
    const id = `${one.spec}:${one.surface}`;
    groups.set(id, [...(groups.get(id) ?? []), one]);
  }
  const surfaces: ReviewRecord["surfaces"] = [];
  for (const [id, group] of [...groups].sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    const { spec, surface } = group[0] as Changed;
    const entries: ReviewEntry[] = [];
    for (const one of group) {
      // biome-ignore lint/performance/noAwaitInLoops: one ffmpeg at a time
      entries.push(await entryOf(at, one));
    }
    surfaces.push({ id, spec, surface, label: words(surface), entries });
  }
  const record: ReviewRecord = { base: head(), surfaces };
  await writeFile(
    join(at, "changed.json"),
    `${JSON.stringify(record, null, 2)}\n`
  );
  const manifest = await writeManifest(at);
  console.log(
    `REVIEW ${relative(process.cwd(), at) || "."}: ${manifest.surfaces.length} surface(s), ${changed.length} capture(s) for the owner (index.html, manifest.json, img/, candidates/)`
  );
  for (const s of manifest.surfaces) {
    console.log(`  ${s.id}: ${s.entries.map((e) => e.entry).join(", ")}`);
  }
  console.log(
    `  approve the picks: bun scripts/probe-kit/approve-review.ts ${relative(process.cwd(), at) || "."} <picks.json>`
  );
}

if (import.meta.main) {
  const [, , dir] = process.argv;
  if (!dir) {
    console.error(
      "usage: bun scripts/probe-kit/review.ts <dir>   (the manifest again, from changed.json and commits.json)"
    );
    process.exit(2);
  }
  const manifest = await writeManifest(dir);
  const named = manifest.surfaces.filter((s) => s.commits.length > 0).length;
  console.log(
    `${join(dir, "manifest.json")}: ${manifest.surfaces.length} surface(s), ${named} with their commits`
  );
}
