/**
 * The location popover's mock machine (LocationPicker.stories.ts): what its
 * gh lists and what its folders hold, shaped as the owner's are, answered
 * on a bench's hub (location-live.svelte). The machine's id says which
 * answer its gh gives (`mock-<answer>`), so every frame on one page shares
 * one bench. A pasted URL's repository is answered by the URL itself
 * ({@link lookupOf}): each of {@link PASTES} as its dial names it, any
 * other GitHub URL as one gh sees nothing at, any other host's as a page
 * that says nothing.
 */
import type {
  GhRepo,
  GhRepoLookup,
  GhRepoOwner,
} from "@cawco/core/connections";
import { type FsEntry, repoIdentity } from "@cawco/core/protocol";
import {
  DAY_MS as DAY,
  HOUR_MS as HOUR,
  MINUTE_MS as MINUTE,
} from "@cawco/core/time";
import { unhandled } from "@cawco/core/unhandled";
import type { MachineRepo, MachineRepos } from "../stores/machines";

/** What the mock machine's gh answers, as a dial names it. */
const ANSWERS = [
  "listed",
  "loading",
  "no-gh",
  "signed-out",
  "old-daemon",
] as const;
export type MockAnswer = (typeof ANSWERS)[number];

const BEWINXED: GhRepoOwner = {
  login: "bewinxed",
  kind: "user",
  avatarUrl:
    "data:image/jpeg;base64,/9j/2wCEAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDIBCQkJDAsMGA0NGDIhHCEyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMv/AABEIACgAKAMBIgACEQEDEQH/xAGiAAABBQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgsQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+gEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoLEQACAQIEBAMEBwUEBAABAncAAQIDEQQFITEGEkFRB2FxEyIygQgUQpGhscEJIzNS8BVictEKFiQ04SXxFxgZGiYnKCkqNTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2dri4+Tl5ufo6ery8/T19vf4+fr/2gAMAwEAAhEDEQA/AKfgHRLS+vr+XULcPNHIFVJB90Y9K9Gk8N6SIt32KNmA6lc15d4Be7vriSSw1BhO64ePjcm08E7s5BB/SvR7mO+vbaGzuLx1YuVd0O0t6dK5nfqdsPhPJ/GWmwWHii3FtGsKy4GR8qk55qM2ciKpeaABhlcyDkdK7bxJoVlYtZyXYE0cLvKQB1UIxx+gPvivMDrlvLO006SiIY2RoOwwAuT0474P0px5nZIyqxSdzYFpk83Nv/33/wDWp32Nf+fm3/77P+FYFzrVy6wr5PloARHmMKSOvJAyevU1B/adz/eX8qu0u5jbyL3gXXBoviS3uSdkEx8qViRwD/8AXxXsLalrF3sliFtHbiTfGjDLNwO/FeIQaColX529ST/SvRfD9lNd2UkFvqZj42ujqWKd8ryOtRK1z0YUKsaXtHHQzviVrT3otbXAUo2ZthyAef6VlLZaPHpcV8DGW8pUc5GzPQk575rU1y1sbSJLGBvOdXLyyn+JumK46fRpZHdbe6McDHJiOcA/SqpyWxVTLa84KpFb9BmpTQEx4ULjIyBgGs/zovWrWo2xtHSS5ieWDJBMbYPse+Ko+fpP/Ptef9/1/wDiauCdjjxMHCpZo7NBwXzzn9Kt209xZs8ltIUZlxke9VU+4fpVhPuioSPv1CM48sldERGRuPBNRMoB4qc/dX6VC3f6UGr1IpYlkVo3AKFcMD3qn/ZNj/zwStBv4vpUVBy1aFObvKKZ/9k=",
};
const PETRALAB: GhRepoOwner = {
  login: "petralab",
  kind: "org",
  avatarUrl:
    "data:image/png;base64,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",
};

const repo = (
  owner: GhRepoOwner,
  name: string,
  description: string | null,
  isPrivate: boolean,
  ago: number
): GhRepo => ({
  nameWithOwner: `${owner.login}/${name}`,
  owner,
  url: `https://github.com/${owner.login}/${name}.git`,
  sshUrl: `git@github.com:${owner.login}/${name}.git`,
  updatedAt: new Date(Date.now() - ago).toISOString(),
  description,
  isPrivate,
});

/** The repositories, latest updated first. */
const REPOS: GhRepo[] = [
  repo(
    BEWINXED,
    "cockpit",
    "Caw&Co: one board for every machine, project and agent session",
    true,
    8 * MINUTE
  ),
  repo(BEWINXED, "bewinxed.com", "Personal site and writing", false, 3 * HOUR),
  repo(
    PETRALAB,
    "agent-evals",
    "Harness-agnostic eval suites for long-running coding agents",
    true,
    18 * HOUR
  ),
  repo(
    BEWINXED,
    "backlot",
    "Film studio MCP: shots, takes, cast and LoRAs",
    true,
    30 * HOUR
  ),
  repo(PETRALAB, "petralab.ai", "Marketing site", false, 3 * DAY),
  repo(
    BEWINXED,
    "hairline",
    "Hairline icon set, drawn on a 24px grid with 1.5px strokes",
    false,
    7 * DAY
  ),
  repo(
    BEWINXED,
    "mcp-server-snoonu",
    "Order from Snoonu through an MCP server",
    false,
    15 * DAY
  ),
  repo(BEWINXED, "dotfiles", null, false, 22 * DAY),
  repo(
    PETRALAB,
    "infra",
    "Terraform and Tailscale ACLs for the lab",
    true,
    29 * DAY
  ),
  repo(
    BEWINXED,
    "a-very-long-repository-name-that-keeps-going-for-testing-truncation",
    "Kept to check that long names truncate instead of pushing the row wider than the popover",
    false,
    78 * DAY
  ),
];

/** An SVG as an image's address. */
const svg = (markup: string): string =>
  `data:image/svg+xml;utf8,${encodeURIComponent(markup)}`;

/** A square avatar: its initial on its colour. */
const avatar = (initial: string, fill: string): string =>
  svg(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="${fill}"/><text x="20" y="27" font-family="system-ui,sans-serif" font-size="20" font-weight="600" fill="#fff" text-anchor="middle">${initial}</text></svg>`
  );

const OXIDELABS: GhRepoOwner = {
  login: "oxidelabs",
  kind: "org",
  avatarUrl: avatar("Ox", "#c2410c"),
};
const AYAAN: GhRepoOwner = {
  login: "ayaanmehta",
  kind: "user",
  avatarUrl: avatar("A", "#0f766e"),
};

/** Quarry's own social card, 1280 by 640, as its owners would set one. */
const QUARRY_CARD = svg(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 640"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1c1917"/><stop offset="1" stop-color="#7c2d12"/></linearGradient></defs><rect width="1280" height="640" fill="url(#g)"/><g fill="none" stroke="#fdba74" stroke-width="10" opacity="0.9"><rect x="120" y="200" width="60" height="240" rx="10"/><rect x="200" y="140" width="60" height="300" rx="10"/><rect x="280" y="260" width="60" height="180" rx="10"/></g><text x="420" y="320" font-family="system-ui,sans-serif" font-size="128" font-weight="700" fill="#fff7ed">quarry</text><text x="424" y="400" font-family="system-ui,sans-serif" font-size="34" fill="#fed7aa">Columnar queries over event logs</text></svg>`
);

/** A GitLab project's avatar, which its page gives as its `og:image`. */
const VECTORPRESS_AVATAR = svg(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect width="400" height="400" fill="#4338ca"/><path d="M90 300 L200 90 L310 300 Z" fill="none" stroke="#e0e7ff" stroke-width="22" stroke-linejoin="round"/><circle cx="200" cy="230" r="34" fill="#e0e7ff"/></svg>`
);

/** The URLs the pasted-URL dial pastes, by what each one's lookup answers. */
export const PASTES = {
  "Nothing pasted": "",
  "One of my repositories": "git@github.com:petralab/agent-evals.git",
  "GitHub, with a picture": "https://github.com/oxidelabs/quarry",
  "GitHub, no picture": "git@github.com:ayaanmehta/tidy-diff.git",
  "GitHub, nothing there": "https://github.com/petralab/roadmap-2027",
  GitLab: "https://gitlab.com/inkpress/vectorpress.git",
  "Our own server, over ssh":
    "git@git.petralab.ai:platform/billing-service.git",
} as const;
export type MockPaste = keyof typeof PASTES;

/** What the mock machine says of each pasted URL, by its identity. */
const LOOKUPS = new Map<string, GhRepoLookup>([
  [
    repoIdentity(PASTES["GitHub, with a picture"]),
    {
      kind: "found",
      repo: repo(
        OXIDELABS,
        "quarry",
        "Columnar query engine for append-only event logs, in Rust",
        false,
        2 * HOUR
      ),
      socialImageUrl: QUARRY_CARD,
    },
  ],
  [
    repoIdentity(PASTES["GitHub, no picture"]),
    {
      kind: "found",
      repo: repo(
        AYAAN,
        "tidy-diff",
        "Review a diff as a tree of moved and changed symbols",
        false,
        5 * DAY
      ),
      socialImageUrl: null,
    },
  ],
  [
    repoIdentity(PASTES.GitLab),
    {
      kind: "other-host",
      description: "Print-ready SVG page layout from Markdown and a stylesheet",
      socialImageUrl: VECTORPRESS_AVATAR,
    },
  ],
]);

/** GitHub's host, whose URLs the mock's gh answers. */
const GITHUB = "github.com/";

/**
 * What the mock machine says of the repository at `url`, after `waitMs`:
 * {@link LOOKUPS}' answer, else gh seeing nothing at a GitHub URL, else a
 * page that says nothing.
 */
export async function lookupOf(
  url: string,
  waitMs: number
): Promise<MachineRepo> {
  await new Promise((done) => {
    setTimeout(done, waitMs);
  });
  const id = repoIdentity(url);
  return (
    LOOKUPS.get(id) ??
    (id.startsWith(GITHUB)
      ? { kind: "not-found" }
      : { kind: "other-host", description: null, socialImageUrl: null })
  );
}

/** The mock machine's id, by the answer its gh gives. */
export const mockMachine = (answer: MockAnswer): string => `mock-${answer}`;

/** What the mock machine's gh answers, read off its id; a read that never ends while it is "loading". */
export function reposOf(machineId: string): Promise<MachineRepos> {
  const answer = ANSWERS.find((one) => machineId === mockMachine(one));
  switch (answer) {
    case "loading":
      return new Promise(() => undefined);
    case "no-gh":
    case "signed-out":
    case "old-daemon":
      return Promise.resolve({ kind: answer });
    case "listed":
    case undefined:
      return Promise.resolve({ kind: "listed", repos: REPOS });
    default:
      return unhandled("answer", answer);
  }
}

/** The mock machine's folders: `~` and what is under it; a git checkout's origin by its path. */
const FOLDERS: Record<string, string[]> = {
  "~": ["cockpit", "bewinxed.com", "code", "dotfiles", "Downloads", ".config"],
  "~/code": ["backlot", "experiments", "hairline"],
  "~/code/experiments": [],
  "~/cockpit": ["apps", "packages", "design"],
  "~/bewinxed.com": ["src", "public"],
  "~/dotfiles": [],
  "~/Downloads": [],
  "~/.config": ["gh", "git"],
  "~/code/backlot": ["src"],
  "~/code/hairline": ["icons"],
};
const ORIGINS: Record<string, string> = {
  "~/cockpit": "git@github.com:bewinxed/cockpit.git",
  "~/bewinxed.com": "https://github.com/bewinxed/bewinxed.com",
  // A folder of the same name holding another repository: the clone can't go there.
  "~/dotfiles": "https://gitlab.com/someone-else/dotfiles.git",
  "~/code/backlot": "git@github.com:bewinxed/backlot.git",
  "~/code/hairline": "git@github.com:bewinxed/hairline.git",
};
const TRAILING = /\/+$/u;
const CONFIG = /\/\.git\/config$/u;

/** What the mock machine's files answer an `fs` op with; a path not there throws as the machine refuses it. */
export function filesOf(op: string, path: string): unknown {
  const at = path.replace(TRAILING, "") || "/";
  if (op === "list") {
    const names = FOLDERS[at];
    if (!names) {
      throw new Error(`ENOENT: ${at} does not exist`);
    }
    return names.map((name): FsEntry => {
      const child = `${at}/${name}`;
      return ORIGINS[child]
        ? { name, kind: "dir", size: 0, git: true }
        : { name, kind: "dir", size: 0 };
    });
  }
  const checkout = CONFIG.test(at) ? at.replace(CONFIG, "") : "";
  const origin = ORIGINS[checkout];
  if (op === "read" && origin) {
    return `[core]\n\tbare = false\n[remote "origin"]\n\turl = ${origin}\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n`;
  }
  throw new Error(`ENOENT: ${at} does not exist`);
}
