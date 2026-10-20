// The lanes' one reading of their file list, shared by every lane gate.
// The list and the gates are committed with the lane's work, so a re-cut clone
// keeps them: the list at `.cutover/lanes/<lane>.files`, the gates in
// `.cutover/gates/`, run from the repository root as
//   L=<lane> bun .cutover/gates/lane-<check>.ts
// A lane's list names repository-relative paths. Each one is, at the time a gate
// runs, exactly one of:
//   present   the file exists;
//   deleted   the file is gone and the lane file says so on a
//             `deleted-file: <path>` line (a lane that dissolves a sheet);
//   missing   the file is gone and nothing says why: a typo, or a deletion the
//             lane never declared. Every gate fails on it.
// A `deleted-file:` line for a file that still exists fails the gates too.
// The list holds every file the lane changed: a path changed since the lane's
// start sha (its list's `start: <sha>` line; committed, uncommitted or
// untracked) that the list does not name is `unlisted`, and fails the gates; the
// lane edits only its list. `.cutover/` (the lanes' record, gates and lists) is
// no lane's product and is not listed.
// `dashboardSrc` is the present files under apps/dashboard/src, the scope of the
// repository's own style checks; the token JSON, DESIGN.md and the like are on
// a list so the lane may edit them, and no style check reads them.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

export type LaneList = {
  lane: string;
  start: string;
  listFile: string;
  laneFile: string;
  laneText: string;
  present: string[];
  deleted: string[];
  missing: string[];
  stale: string[];
  unlisted: string[];
  dashboardSrc: string[];
};

/** Paths changed since `start`: tracked changes against the working tree, and untracked files. */
function changedSince(start: string): string[] {
  const names = (args: string[]): string[] =>
    execFileSync("git", args, { encoding: "utf8" })
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  try {
    return [
      ...new Set([
        ...names(["diff", "--name-only", start]),
        ...names(["ls-files", "--others", "--exclude-standard"]),
      ]),
    ];
  } catch (error) {
    console.log(`git could not compare against the start sha ${start}: ${error}`);
    process.exit(2);
  }
}

export function loadLane(): LaneList {
  const lane = process.env.L;
  if (!lane) {
    console.log("set L to the lane name");
    process.exit(2);
  }
  const listFile = `.cutover/lanes/${lane}.files`;
  if (!existsSync(listFile)) {
    console.log(`${listFile} is not in this tree: commit the lane's list there`);
    process.exit(2);
  }
  const lines = readFileSync(listFile, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  const start = lines.find((line) => line.startsWith("start:"))?.slice("start:".length).trim();
  if (!start) {
    console.log(`${listFile} names no start sha: add a \`start: <sha>\` line, the commit the lane was cut from`);
    process.exit(2);
  }
  const listed = [...new Set(lines.filter((line) => !line.startsWith("start:")))];
  const laneFile = `.cutover/lanes/${lane}.md`;
  const laneText = existsSync(laneFile) ? readFileSync(laneFile, "utf8") : "";
  const declared = new Set([...laneText.matchAll(/^deleted-file:\s*(\S+)/gm)].map((match) => match[1]));
  const present = listed.filter((path) => existsSync(path));
  const absent = listed.filter((path) => !existsSync(path));
  const named = new Set(listed);
  return {
    lane,
    start,
    listFile,
    laneFile,
    laneText,
    present,
    deleted: absent.filter((path) => declared.has(path)),
    missing: absent.filter((path) => !declared.has(path)),
    stale: [...declared].filter((path) => existsSync(path)),
    unlisted: changedSince(start).filter((path) => !path.startsWith(".cutover/") && !named.has(path)),
    dashboardSrc: present.filter((path) => path.startsWith("apps/dashboard/src/")),
  };
}

/** Prints the list's partition; returns false when the list itself fails the gate. */
export function reportList(list: LaneList): boolean {
  console.log(
    `list: ${list.present.length} present (${list.dashboardSrc.length} under apps/dashboard/src) · ${list.deleted.length} deleted (declared) · ${list.missing.length} missing · ${list.stale.length} declared deleted but present · ${list.unlisted.length} changed but unlisted`,
  );
  for (const path of list.missing) {
    console.log(`missing: ${path} — listed, absent, and no \`deleted-file: ${path}\` line in ${list.laneFile}`);
  }
  for (const path of list.stale) {
    console.log(`stale: ${path} — \`deleted-file:\` in ${list.laneFile}, but the file exists`);
  }
  for (const path of list.unlisted) {
    console.log(`unlisted: ${path} — changed since ${list.start.slice(0, 9)}, not on ${list.listFile}`);
  }
  return list.missing.length === 0 && list.stale.length === 0 && list.unlisted.length === 0;
}
