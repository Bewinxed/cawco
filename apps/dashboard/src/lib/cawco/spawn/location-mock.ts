/**
 * The location popover's mock machine (LocationPicker.stories.ts): what its
 * gh lists and what its folders hold, shaped as the owner's are, answered
 * on a bench's hub (location-live.svelte). The machine's id says which
 * answer its gh gives (`mock-<answer>`), so every frame on one page shares
 * one bench.
 */
import type { GhRepo, GhRepoOwner } from "@cawco/core/connections";
import type { FsEntry } from "@cawco/core/protocol";
import {
  DAY_MS as DAY,
  HOUR_MS as HOUR,
  MINUTE_MS as MINUTE,
} from "@cawco/core/time";
import { unhandled } from "@cawco/core/unhandled";
import type { MachineRepos } from "../stores/machines";

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
