/**
 * `upstream-shim.ts RULE PROGRAM [ARG…]`: the upstream guard's judge for one
 * program start inside a workspace's boundary. Each of the workspace's
 * shims for `gh`, `hub`, `glab` and `curl` (boundary.ts `writeGuardShims`)
 * runs it before the real program, which it runs only when this exits 0.
 *
 * RULE is the workspace's rule as the agent last wrote it (`upstream.json`
 * in the part of its state dir a command reads, `UpstreamRule`). The call is
 * judged by `upstream-guard.ts`, the copy beside this script: a refused call
 * exits 1 with the reason on stderr, which is what the session reads. A rule
 * it cannot read refuses too, saying so: a call is never let through
 * unjudged. A file the call names for its body (a GraphQL query's
 * `-F query=@file`, `--input`, curl's `-d @file`) is read here, as the
 * program would read it.
 *
 * In a guarded workspace no command holds a GitHub token (boundary.ts
 * `guardedEnv`): gh reaches GitHub through the workspace's GitHub door,
 * which judges each request again on the host (github-door.ts). This judge
 * is the first word: it refuses with the guard's reason before gh starts.
 *
 * A plain Bun script, as the workspace's judge is (boundary-judge.ts): it
 * imports only node's built-ins and the guard beside it.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";

/** The guard's module; only its type is imported here, which Bun erases. */
type Guard = typeof import("@cawco/core/upstream-guard");
type GitRemote = import("@cawco/core/upstream-guard").GitRemote;
type UpstreamRule = import("@cawco/core/upstream-guard").UpstreamRule;

const [ruleFile, program, ...args] = process.argv.slice(2);

const refuse = (reason: string, status: number): never => {
  process.stderr.write(`${reason}\n`);
  process.exit(status);
};

if (!(ruleFile && program)) {
  refuse("usage: upstream-shim.ts RULE PROGRAM [ARG...]", 2);
}

const { upstreamRefusal } = (await import(
  join(import.meta.dir, "upstream-guard.ts")
)) as Guard;

const readRule = (file: string): UpstreamRule => {
  const rule = JSON.parse(readFileSync(file, "utf8")) as Partial<UpstreamRule>;
  if (typeof rule.guarded !== "boolean" || !Array.isArray(rule.remotes)) {
    throw new Error(`${file} is not an upstream rule`);
  }
  return rule as UpstreamRule;
};

/** `remote.<name>.<key> <value>`, as `git config --get-regexp` prints each. */
const REMOTE_LINE = /^remote\.(.+)\.(url|pushurl|gh-resolved) (.*)$/;

/** The cwd's git remotes; none outside a repository. */
const cwdRemotes = (): GitRemote[] => {
  const listed = spawnSync(
    "git",
    ["config", "--get-regexp", "^remote\\..*\\.(url|pushurl|gh-resolved)$"],
    { encoding: "utf8" }
  );
  const remotes = new Map<string, Record<string, string>>();
  for (const line of (listed.stdout ?? "").split("\n")) {
    const match = REMOTE_LINE.exec(line);
    if (!match) {
      continue;
    }
    const [, name = "", key = "", value = ""] = match;
    const remote = remotes.get(name) ?? {};
    // git lists a remote's first url first; gh fetches from it.
    remote[key] ??= value;
    remotes.set(name, remote);
  }
  return [...remotes].map(([name, keys]) => ({
    name,
    ...(keys.url ? { url: keys.url } : {}),
    ...(keys.pushurl ? { pushUrl: keys.pushurl } : {}),
    ...(keys["gh-resolved"] ? { ghResolved: keys["gh-resolved"] } : {}),
  }));
};

/** The workspace's rule; a rule that cannot be read refuses the call, saying why. */
const ruleOrRefuse = (): UpstreamRule => {
  try {
    return readRule(ruleFile as string);
  } catch (error) {
    return refuse(
      `cawco: \`${program}\` did not run: this workspace's upstream rule could not be read (${error instanceof Error ? error.message : String(error)}), so whether it may write to another repository is unknown. Try again in a minute; the agent writes the rule as it hears from the hub.`,
      2
    );
  }
};

/** A file the call names, relative to the cwd as the program reads it; none when it cannot be read. */
const readFile = (path: string): string | undefined => {
  try {
    return readFileSync(
      isAbsolute(path) ? path : join(process.cwd(), path),
      "utf8"
    );
  } catch {
    // What the program could not read either: the guard calls it unread.
    return undefined;
  }
};

const refusal = upstreamRefusal(ruleOrRefuse(), {
  program: program as string,
  args,
  env: process.env,
  cwdRemotes,
  readFile,
});
if (refusal) {
  refuse(refusal, 1);
}
