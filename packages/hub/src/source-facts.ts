/**
 * What an install's source is, for the person weighing it on the approval
 * card: where it comes from, when it first came out, and how many use it
 * (GitHub: the repository's creation date and stars; npm: the package's first
 * publish and last week's downloads). Read once at the hub as an
 * `admin_skills_write` install or an `admin_plugins_write` install or link is
 * proposed (admin-asks.ts), and kept on the ask, so the card reads the same
 * after a restart.
 */
import type { FleetMarketplace, SourceFacts } from "@cawco/core";
import { type Bounded, readWithin } from "@cawco/core/bounded";
import { hashFiles } from "@cawco/core/file-hash";
import { unhandled } from "@cawco/core/unhandled";
import { Octokit } from "@octokit/rest";
import {
  FOLDER_CHANGED,
  folderOf,
  parseSkillSource,
  readCheckedFolder,
  type SkillFolderReader,
} from "./skills";
import { GITHUB_API } from "./upstreams";

/** How long one registry read may take before the card says it did not answer. Our call. */
const READ_MS = 10_000;

const GITHUB_URL =
  /^(?:https?:\/\/|git@)github\.com[/:]([^/\s]+)\/([^/#?\s]+?)(?:\.git)?(?:[/#?].*)?$/iu;
const OWNER_REPO = /^[\w.-]+\/[\w.-]+$/u;
const LOCAL = /^(?:\/|\.|~)/u;

type Origin =
  | { kind: "github"; owner: string; repo: string }
  | { kind: "npm"; pkg: string }
  | { at: string; kind: "none"; why: string };

/** A skill's source (skills.ts `parseSkillSource`'s shapes). */
const skillOrigin = (source: string): Origin => {
  const parsed = parseSkillSource(source);
  if (!parsed) {
    return { kind: "none", at: source, why: "the source doesn't parse" };
  }
  if (parsed.kind === "npm") {
    return { kind: "npm", pkg: parsed.pkg };
  }
  if (parsed.kind === "repo") {
    return { kind: "github", owner: parsed.owner, repo: parsed.repo };
  }
  if (parsed.kind === "file") {
    return {
      kind: "none",
      at: parsed.path,
      why: "a folder on a machine carries no stars or age",
    };
  }
  const github = GITHUB_URL.exec(parsed.url);
  return github
    ? { kind: "github", owner: github[1], repo: github[2] }
    : {
        kind: "none",
        at: parsed.url,
        why: "a download URL carries no stars or age",
      };
};

/** A marketplace's source: whatever `claude plugin marketplace add` takes. */
const marketplaceOrigin = (source: string): Origin => {
  const trimmed = source.trim();
  const github = GITHUB_URL.exec(trimmed);
  if (github) {
    return { kind: "github", owner: github[1], repo: github[2] };
  }
  if (LOCAL.test(trimmed)) {
    return {
      kind: "none",
      at: trimmed,
      why: "a folder on the hub carries no stars or age",
    };
  }
  if (OWNER_REPO.test(trimmed)) {
    const [owner, repo] = trimmed.split("/");
    return { kind: "github", owner, repo };
  }
  return {
    kind: "none",
    at: trimmed,
    why: "only a GitHub repository or an npm package says its stars and age",
  };
};

/** One JSON read within {@link READ_MS}, its body included. */
const read = (url: string): Promise<Bounded<unknown>> =>
  readWithin(READ_MS, async (signal) => {
    const response = await fetch(url, {
      headers: { accept: "application/json", "user-agent": "cawco-hub" },
      signal,
    });
    if (!response.ok) {
      throw new Error(`${new URL(url).host} answered ${response.status}`);
    }
    return (await response.json()) as unknown;
  });

/** The words for a read the registry did not answer in time. */
const unanswered = (after: number): string =>
  `the registry didn't answer within ${Math.round(after / 1000)} s`;

const said = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const githubFacts = async (
  owner: string,
  repo: string
): Promise<SourceFacts> => {
  const at = `github.com/${owner}/${repo}`;
  try {
    // A public repository's facts, read with no sign-in through Octokit
    // (`GET /repos/{owner}/{repo}`).
    const asked = await readWithin(READ_MS, async (signal) => {
      const { data } = await new Octokit({
        baseUrl: GITHUB_API,
        userAgent: "cawco-hub",
      }).rest.repos.get({ owner, repo, request: { signal } });
      return data;
    });
    switch (asked.kind) {
      case "answered":
        break;
      case "unanswered":
        return { at, unknown: unanswered(asked.after) };
      default:
        unhandled("read", asked);
    }
    const found = asked.value;
    return {
      at,
      ...(found.created_at ? { since: found.created_at } : {}),
      ...(typeof found.stargazers_count === "number"
        ? { stars: found.stargazers_count }
        : {}),
    };
  } catch (error) {
    return { at, unknown: said(error) };
  }
};

const npmFacts = async (pkg: string): Promise<SourceFacts> => {
  const at = `npm ${pkg}`;
  const name = pkg.replace("/", "%2f");
  try {
    const [documentRead, downloadsRead] = await Promise.all([
      read(`https://registry.npmjs.org/${name}`),
      read(`https://api.npmjs.org/downloads/point/last-week/${pkg}`),
    ]);
    switch (documentRead.kind) {
      case "answered":
        break;
      case "unanswered":
        return { at, unknown: unanswered(documentRead.after) };
      default:
        unhandled("read", documentRead);
    }
    switch (downloadsRead.kind) {
      case "answered":
        break;
      case "unanswered":
        return { at, unknown: unanswered(downloadsRead.after) };
      default:
        unhandled("read", downloadsRead);
    }
    const document = documentRead.value as { time?: { created?: string } };
    const downloads = downloadsRead.value as { downloads?: number };
    return {
      at,
      ...(document.time?.created ? { since: document.time.created } : {}),
      weeklyDownloads: downloads.downloads ?? 0,
    };
  } catch (error) {
    return { at, unknown: said(error) };
  }
};

const factsOf = (origin: Origin): Promise<SourceFacts> => {
  switch (origin.kind) {
    case "github":
      return githubFacts(origin.owner, origin.repo);
    case "npm":
      return npmFacts(origin.pkg);
    case "none":
      break;
  }
  return Promise.resolve({ at: origin.at, unknown: origin.why });
};

/**
 * A skill folder on a machine, read through its agent before anyone is
 * asked: the card shows the skill's declared name and description and every
 * file the install would carry, each with its hash, and the hash of them all
 * that the approval pins (`contentHash`, bound into the call as it was
 * asked). A folder that cannot be read, whose SKILL.md names no name or
 * description, or that changed since the call was bound, throws its
 * sentence, so the call is refused and nobody is asked.
 */
const folderFacts = async (
  machine: string,
  path: string,
  pinned: unknown,
  readFolder: SkillFolderReader
): Promise<SourceFacts> => {
  const { declared, files, hash } = await readCheckedFolder(
    machine,
    path,
    readFolder
  );
  if (pinned !== hash) {
    throw new Error(FOLDER_CHANGED);
  }
  return {
    at: `${path} on ${machine}`,
    skill: {
      ...declared,
      hash,
      files: files
        .map((file) => ({ path: file.path, hash: hashFiles([file]) }))
        .sort((a, b) => a.path.localeCompare(b.path)),
    },
  };
};

/**
 * The facts for an admin write that fetches something new: a skill's
 * install, a plugin's install (its marketplace's source) or a marketplace's
 * link; undefined for every other call. A skill from a folder on a machine
 * is read through `readFolder` ({@link folderFacts}).
 */
export const sourceFacts = (
  name: string,
  input: Record<string, unknown>,
  marketplaces: () => FleetMarketplace[],
  readFolder: SkillFolderReader
): Promise<SourceFacts> | undefined => {
  const source = typeof input.source === "string" ? input.source : undefined;
  if (name === "admin_skills_write" && input.action === "install") {
    const folder = source ? folderOf(source) : undefined;
    if (folder) {
      return folderFacts(
        folder.machine,
        folder.path,
        input.contentHash,
        readFolder
      );
    }
    return source ? factsOf(skillOrigin(source)) : undefined;
  }
  if (name !== "admin_plugins_write") {
    return;
  }
  if (input.action === "link") {
    return source ? factsOf(marketplaceOrigin(source)) : undefined;
  }
  if (input.action === "install" && typeof input.id === "string") {
    const marketplace = input.id.split("@")[1] ?? "";
    const linked = marketplaces().find((one) => one.name === marketplace);
    return linked
      ? factsOf(marketplaceOrigin(linked.source))
      : Promise.resolve({
          at: `marketplace ${marketplace || "(none named)"}`,
          unknown: "no marketplace of that name is linked",
        });
  }
};
