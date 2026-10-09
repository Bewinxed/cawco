/**
 * Resolving a plain skill to its files (NEW.md §11). An installer CLI is a
 * wrapper around copying a directory into `~/.claude/skills/`, so cawco runs
 * none of them: the hub downloads the source once, reads the skill out of it,
 * and sync carries the files to every machine.
 */

import { lstat, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import type { SkillFile } from "@cawco/core";
import { projectClaudeRelative } from "@cawco/core/claude-dirs";
import { hashFiles } from "@cawco/core/file-hash";
import { SAFE_GIT_ENV, safeGitArgv } from "@cawco/core/safe-git";
import { $ } from "bun";

/** What a `source` string names, once its scheme has been read off it. */
export type SkillSource =
  | {
      kind: "repo";
      owner: string;
      repo: string;
      /** A `github:` source's directory inside the repo, which selects outright. */
      path?: string;
      ref?: string;
      /** A `skills:` slug's `@name`, which picks one of the skills discovery found. */
      skill?: string;
    }
  | { kind: "npm"; pkg: string; version?: string }
  | { kind: "url"; url: string };

/** A resolved skill: the files, and what they came to. */
export interface ResolvedSkill {
  bytes: number;
  files: SkillFile[];
  hash: string;
  /** The skill directory's own name, which is what the source called it. */
  name: string;
}

/**
 * Why it could not be resolved — and, when the answer is that the source did
 * not say which skill it meant, the ones it could have meant.
 */
export interface UnresolvedSkill {
  choices?: string[];
  error: string;
}

/** How long a download gets before the hub stops waiting on it. */
const FETCH_TIMEOUT_MS = 60_000;

/**
 * A skill this size is not a skill any more. Both caps are the download's, not
 * the tunnel's: the files ride every sync to every machine. Sized with real
 * headroom — impeccable's Claude variant was already 147 files / 3.07 MB on
 * 2026-08-07 and growing.
 *
 * A skill carries no media its instructions never name: an image or video
 * (gif, jpg, jpeg, png, webp, svg, mp4, mov, webm, avif) rides along only when
 * a markdown file in the skill other than README.md names its path or basename.
 * README demo renders are for people browsing the repo, not for the agent.
 * The rule runs on the walk before these caps, so they count what is carried.
 */
const MAX_FILES = 512;
const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Where a repo keeps its skills, in the order the skills CLI looks — except
 * that `.claude/skills` comes before `.agents/skills`: a repo that ships one
 * variant per agent has tuned the Claude one for Claude Code, and that is the
 * one a cawco fleet wants.
 */
const CONTAINERS = [
  "skills",
  "skills/.curated",
  "skills/.experimental",
  "skills/.system",
  projectClaudeRelative("skills"),
  ".agents/skills",
  ".cursor/skills",
];

/** How far into a container a skill directory is looked for. */
const MAX_DEPTH = 3;

/** Directories no skill lives in, and every one of them is a big download. */
const SKIP = ["node_modules", ".git", "dist", "build", "__pycache__"];

const said = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const URL_SOURCE_RE = /^https?:\/\//i;
const ZIP_NAME_RE = /\.zip$/i;
const MD_PATH_RE = /\.md$/i;
const ARCHIVE_PATH_RE = /\.(zip|tgz|tar\.gz)$/i;
const MEDIA_PATH_RE = /\.(gif|jpe?g|png|webp|svg|mp4|mov|webm|avif)$/i;
const README_NAME_RE = /^readme\.md$/i;

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: parses the four source shapes (url, npm:, github:, bare owner/repo) cawco accepts; each branch is a distinct grammar, not incidental complexity.
export const parseSkillSource = (source: string): SkillSource | undefined => {
  const trimmed = source.trim();
  if (URL_SOURCE_RE.test(trimmed)) {
    return { kind: "url", url: trimmed };
  }

  if (trimmed.startsWith("npm:")) {
    const rest = trimmed.slice("npm:".length);
    // A scoped package wears its own `@` at the front; only a later one is a version.
    const at = rest.lastIndexOf("@");
    if (!rest) {
      return undefined;
    }
    return at > 0
      ? { kind: "npm", pkg: rest.slice(0, at), version: rest.slice(at + 1) }
      : { kind: "npm", pkg: rest };
  }

  if (trimmed.startsWith("github:")) {
    const rest = trimmed.slice("github:".length);
    const at = rest.lastIndexOf("@");
    const [owner, repo, ...segments] = (
      at > 0 ? rest.slice(0, at) : rest
    ).split("/");
    if (!(owner && repo)) {
      return undefined;
    }
    return {
      kind: "repo",
      owner,
      repo,
      ref: at > 0 ? rest.slice(at + 1) : undefined,
      path: segments.join("/") || undefined,
    };
  }

  // A bare `owner/repo` is what the user would have typed after `bunx skills add`.
  const slug = trimmed.startsWith("skills:")
    ? trimmed.slice("skills:".length)
    : trimmed;
  const hash = slug.indexOf("#");
  const body = hash === -1 ? slug : slug.slice(0, hash);
  const at = body.lastIndexOf("@");
  const [owner, repo, ...segments] = (at > 0 ? body.slice(0, at) : body).split(
    "/"
  );
  if (!(owner && repo)) {
    return undefined;
  }
  return {
    kind: "repo",
    owner,
    repo,
    ref: hash === -1 ? undefined : slug.slice(hash + 1),
    // The registry's own ids are `owner/repo/<skill>`, so a third segment names one too.
    skill: at > 0 ? body.slice(at + 1) : segments[0],
  };
};

/** What the source is called in the sentence a failure comes back as. */
const describe = (source: SkillSource): string => {
  if (source.kind === "npm") {
    return source.pkg;
  }
  if (source.kind === "url") {
    return source.url;
  }
  return `${source.owner}/${source.repo}`;
};

export const get = (url: string): Promise<Response> =>
  fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });

/**
 * The downloaded archive, extracted, with the one directory both tarball kinds
 * wrap everything in stripped — GitHub's is named for the ref, npm's `package`.
 */
export const unpack = async (
  response: Response,
  work: string,
  name: string
): Promise<string> => {
  const archive = join(work, "archive");
  await Bun.write(archive, response);
  return await extract(archive, work, name);
};

/** An archive already on disk, extracted, with its one wrapping directory stripped. */
const extract = async (
  archive: string,
  work: string,
  name: string
): Promise<string> => {
  const into = join(work, "src");
  await mkdir(into, { recursive: true });
  if (ZIP_NAME_RE.test(name)) {
    await $`unzip -q ${archive} -d ${into}`.quiet();
  } else {
    await $`tar -xzf ${archive} -C ${into}`.quiet();
  }

  const entries = await readdir(into, { withFileTypes: true });
  const [only] = entries;
  return entries.length === 1 && only.isDirectory()
    ? join(into, only.name)
    : into;
};

/**
 * How long one `git` step of a repo download gets. A shallow fetch of a large
 * marketplace is tens of megabytes, which is more than a page fetch.
 */
const GIT_TIMEOUT_MS = 180_000;

/**
 * A GitHub repo at one ref, extracted, fetched through the system `git`.
 *
 * `git` because it needs nothing of cawco's: a public repository is read with
 * no account at all, and a private one with whatever credential helper the
 * hub machine's own git already has. Cawco never reads, stores or passes a
 * token. It is still fetched HERE, once: a machine never needs reachability
 * to github or an account of its own, which is what resolving at the hub is
 * for. A source that pinned no ref fetches `HEAD`, which is the repository's
 * real default branch, never a guess at its name; a pinned ref may be a
 * branch, a tag or a full commit sha.
 *
 * Only the one commit is fetched, and `git archive` writes it out, so the
 * files are what a release tarball of that commit holds (`export-ignore`
 * honoured) and no `.git` comes with them. A credential the helper does not
 * have is a failure that says so: prompts are off, so it never waits on a
 * terminal nobody is at.
 */
export const downloadRepo = async (
  owner: string,
  repo: string,
  ref: string | undefined,
  work: string
): Promise<string> => {
  const slug = `${owner}/${repo}`;
  const store = join(work, "repo.git");
  const git = async (step: string, args: string[]): Promise<void> => {
    const child = Bun.spawn(
      safeGitArgv([`--git-dir=${store}`, step, ...args]),
      {
        env: { ...process.env, ...SAFE_GIT_ENV },
        stdout: "ignore",
        stderr: "pipe",
        timeout: GIT_TIMEOUT_MS,
      }
    );
    const [code, stderr] = await Promise.all([
      child.exited,
      new Response(child.stderr).text(),
    ]);
    if (code !== 0) {
      const why =
        stderr.trim() ||
        (child.signalCode
          ? `timed out after ${GIT_TIMEOUT_MS / 1000}s`
          : `exit ${code}`);
      throw new Error(`git ${step} failed for ${slug}: ${why}`);
    }
  };

  await git("init", ["--quiet", "--bare"]);
  await git("fetch", [
    "--quiet",
    "--depth",
    "1",
    `https://github.com/${slug}.git`,
    ref ?? "HEAD",
  ]);
  // One wrapping directory, so `extract` strips exactly it whatever the root holds.
  const archive = join(work, "archive.tar.gz");
  await git("archive", [
    "--format=tar.gz",
    `--prefix=${repo}/`,
    `--output=${archive}`,
    "FETCH_HEAD",
  ]);
  return await extract(archive, work, "archive.tar.gz");
};

/**
 * A directory read as files, hashed. The identity of a tree is its contents, so
 * two machines given the same hash hold the same bytes — which is the property
 * that makes a fleet converge rather than merely all-succeed.
 */
export const readTree = async (
  dir: string,
  what = "the directory",
  keep: (found: Found[]) => Promise<Found[]> = async (found) => found
): Promise<{ files: SkillFile[]; hash: string; bytes: number }> => {
  const found = await keep(await walk(dir));
  if (found.length > MAX_FILES) {
    throw new Error(
      `${what} has ${found.length} files; cawco carries at most ${MAX_FILES}`
    );
  }
  const bytes = found.reduce((total, file) => total + file.size, 0);
  if (bytes > MAX_BYTES) {
    throw new Error(
      `${what} is ${bytes} bytes; cawco carries at most ${MAX_BYTES}`
    );
  }
  const files: SkillFile[] = await Promise.all(
    found.map(async (file) => ({
      path: file.rel,
      contentBase64: Buffer.from(await Bun.file(file.path).bytes()).toString(
        "base64"
      ),
      executable: file.executable,
    }))
  );
  return { files, hash: hashFiles(files), bytes };
};

/** What the registry says about a package: enough of it to find one tarball. */
interface Packument {
  "dist-tags"?: Record<string, string>;
  versions?: Record<string, { dist?: { tarball?: string } }>;
}

const npmRoot = async (
  source: SkillSource & { kind: "npm" },
  work: string
): Promise<string> => {
  const metadata = await get(`https://registry.npmjs.org/${source.pkg}`);
  if (!metadata.ok) {
    throw new Error(
      `the npm registry answered ${metadata.status} for ${source.pkg}`
    );
  }

  const packument = (await metadata.json()) as Packument;
  const version = source.version ?? packument["dist-tags"]?.latest;
  const tarball = version
    ? packument.versions?.[version]?.dist?.tarball
    : undefined;
  if (!tarball) {
    throw new Error(
      `the npm registry has no ${source.pkg}@${version ?? "latest"}`
    );
  }

  const response = await get(tarball);
  if (!response.ok) {
    throw new Error(`${tarball} answered ${response.status}`);
  }
  return await unpack(response, work, tarball);
};

/** Every directory under `container` that holds a `SKILL.md`, which is what a skill is. */
const discover = async (container: string, depth = 1): Promise<string[]> => {
  const entries = await readdir(container, { withFileTypes: true }).catch(
    () => []
  );
  const found: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || SKIP.includes(entry.name)) {
      continue;
    }
    const dir = join(container, entry.name);
    // biome-ignore lint/performance/noAwaitInLoops: each entry may recurse into `discover` to accumulate its own subtree before the next entry is checked; the entries are directories on local disk, not a rate concern.
    if (await Bun.file(join(dir, "SKILL.md")).exists()) {
      found.push(dir);
    } else if (depth < MAX_DEPTH) {
      found.push(...(await discover(dir, depth + 1)));
    }
  }
  return found;
};

/**
 * The skills an archive turned out to hold. The first container that holds any
 * is the answer: the order is what decides between a repo's Claude variant and
 * its variants for other agents.
 */
const skillDirs = async (root: string): Promise<string[]> => {
  if (await Bun.file(join(root, "SKILL.md")).exists()) {
    return [root];
  }
  for (const container of CONTAINERS) {
    // biome-ignore lint/performance/noAwaitInLoops: containers are tried in the documented priority order and the loop stops at the first that holds a skill; a later container is only checked once an earlier one came up empty.
    const found = await discover(join(root, container));
    if (found.length > 0) {
      return found.sort();
    }
  }
  return [];
};

/** The one directory the source meant, or why the archive could not answer that. */
const pickSkillDir = async (
  root: string,
  source: SkillSource
): Promise<{ dir: string } | UnresolvedSkill> => {
  if (source.kind === "repo" && source.path) {
    const dir = join(root, source.path);
    if (!(await Bun.file(join(dir, "SKILL.md")).exists())) {
      throw new Error(`${source.path} holds no SKILL.md`);
    }
    return { dir };
  }

  const found = await skillDirs(root);
  const names = found.map((dir) => basename(dir));
  if (found.length === 0) {
    // An installer package is the normal way to have none: its CLI fetches the
    // files from somewhere else at run time, and there is nothing here to copy.
    throw new Error(
      source.kind === "npm"
        ? `${source.pkg} carries no SKILL.md — its installer fetches the files at run time`
        : `${describe(source)} holds no SKILL.md`
    );
  }

  const wanted = source.kind === "repo" ? source.skill : undefined;
  if (wanted) {
    const dir = found.find((candidate) => basename(candidate) === wanted);
    return dir
      ? { dir }
      : {
          error: `${describe(source)} has no skill called ${wanted}`,
          choices: names,
        };
  }
  if (found.length > 1) {
    return {
      error: "repo has several skills — pick one with @<name>",
      choices: names,
    };
  }
  return { dir: found[0] };
};

/** One file of the skill, as the walk found it on disk. */
interface Found {
  /** Any execute bit as extracted; a zip without Unix modes extracts with none. */
  executable: boolean;
  path: string;
  rel: string;
  size: number;
}

/**
 * Every file under the skill's directory. Symlinks are left where they are: a
 * link out of the skill is a file that is not the skill's, and one into it is
 * already being read on its own account.
 */
const walk = async (dir: string, prefix = ""): Promise<Found[]> => {
  const entries = await readdir(dir, { withFileTypes: true });
  const found: Found[] = [];
  for (const entry of entries) {
    if (SKIP.includes(entry.name)) {
      continue;
    }
    const path = join(dir, entry.name);
    // Forward slashes whatever the hub runs on: the daemon joins them onto its own.
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (rel.startsWith("/") || rel.split("/").includes("..")) {
      continue;
    }

    // biome-ignore lint/performance/noAwaitInLoops: each entry may recurse via `walk` to read its own subtree before the next entry is stat'd; entries are local-disk directory contents, not a rate concern.
    const stats = await lstat(path);
    if (stats.isSymbolicLink()) {
      continue;
    }
    if (stats.isDirectory()) {
      found.push(...(await walk(path, rel)));
    } else if (stats.isFile()) {
      found.push({
        path,
        rel,
        size: stats.size,
        // biome-ignore lint/suspicious/noBitwiseOperators: the execute bits of a stat mode are a mask, and the mask is the question
        executable: (stats.mode & 0o111) !== 0,
      });
    }
  }
  return found;
};

/**
 * The walk's files less the media the skill's own instructions never name: a
 * gif or jpg is kept only when a markdown file other than README.md mentions
 * its relative path or its basename.
 */
const namedMedia = async (found: Found[]): Promise<Found[]> => {
  const instructions = await Promise.all(
    found
      .filter(
        (file) =>
          MD_PATH_RE.test(file.rel) && !README_NAME_RE.test(basename(file.rel))
      )
      .map((file) => Bun.file(file.path).text())
  );
  const text = instructions.join("\n");
  return found.filter(
    (file) =>
      !MEDIA_PATH_RE.test(file.rel) ||
      text.includes(file.rel) ||
      text.includes(basename(file.rel))
  );
};

const readSkill = async (dir: string): Promise<ResolvedSkill> => {
  const { files, hash, bytes } = await readTree(dir, "the skill", namedMedia);
  return { name: basename(dir), hash, bytes, files };
};

/** A URL is either the skill's own file or an archive holding it. */
const fetchUrl = async (
  url: string,
  work: string
): Promise<ResolvedSkill | UnresolvedSkill> => {
  const response = await get(url);
  if (!response.ok) {
    throw new Error(`${url} answered ${response.status}`);
  }

  const path = new URL(url).pathname;
  if (MD_PATH_RE.test(path)) {
    const content = Buffer.from(await response.arrayBuffer());
    const files: SkillFile[] = [
      {
        path: "SKILL.md",
        contentBase64: content.toString("base64"),
        executable: false,
      },
    ];
    // A lone file has no directory of its own; the one it was served from names it.
    return {
      name: basename(dirname(path)),
      hash: hashFiles(files),
      bytes: content.byteLength,
      files,
    };
  }
  if (!ARCHIVE_PATH_RE.test(path)) {
    await response.body?.cancel();
    throw new Error(`${url} is neither a SKILL.md nor an archive`);
  }

  const root = await unpack(response, work, path);
  const picked = await pickSkillDir(root, { kind: "url", url });
  return "error" in picked ? picked : await readSkill(picked.dir);
};

const fetchSkill = async (
  source: SkillSource,
  work: string
): Promise<ResolvedSkill | UnresolvedSkill> => {
  if (source.kind === "url") {
    return await fetchUrl(source.url, work);
  }

  const root =
    source.kind === "npm"
      ? await npmRoot(source, work)
      : await downloadRepo(source.owner, source.repo, source.ref, work);
  const picked = await pickSkillDir(root, source);
  return "error" in picked ? picked : await readSkill(picked.dir);
};

/**
 * The skill a source names, fetched and read once for the whole fleet. Every
 * failure comes back as a sentence rather than thrown: a source that cannot be
 * resolved is a row the dashboard shows, not a request that fell over.
 */
export const resolveSkill = async (
  source: string
): Promise<ResolvedSkill | UnresolvedSkill> => {
  const parsed = parseSkillSource(source);
  if (!parsed) {
    return { error: `${source} is not a source cawco knows how to fetch` };
  }

  const work = await mkdtemp(join(tmpdir(), "cawco-skill-"));
  try {
    return await fetchSkill(parsed, work);
  } catch (error) {
    return { error: said(error) };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
};
