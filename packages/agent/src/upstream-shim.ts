/**
 * `upstream-shim.ts RULE DOOR PROGRAM [ARG…]`: the upstream guard's judge
 * for one program start inside a workspace's boundary. Each of the
 * workspace's shims for `gh`, `hub`, `glab` and `curl` (boundary.ts
 * `writeGuardShims`) runs it before the real program, and reads its exit:
 * 0 runs the program; {@link HELD} means the post is held for the person
 * and the shim exits 0 without running it; {@link VIA_DOOR} runs curl
 * through the workspace's GitHub door; anything else is the call's exit.
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
 * Under `ask` (the person's "Ask me first"), a gh write to another
 * repository does not run here: its post, every file it reads already in it
 * (`ghPost`), goes to DOOR, the workspace's GitHub door on the host, which
 * asks the person through the hub; what the door answers is what the
 * session reads. A curl write goes to the door itself, which holds it the
 * same way. hub and glab cannot hand a post over, and are refused saying so.
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

const [ruleFile, door, program, ...args] = process.argv.slice(2);

/** The exit that tells the shim the post is held: it exits 0 and runs nothing. */
const HELD = 4;
/** The exit that tells curl's shim to send the call through the GitHub door. */
const VIA_DOOR = 3;

const refuse = (reason: string, status: number): never => {
  process.stderr.write(`${reason}\n`);
  process.exit(status);
};

if (!(ruleFile && door && program)) {
  refuse("usage: upstream-shim.ts RULE DOOR PROGRAM [ARG...]", 2);
}

const {
  askRefusal,
  ghPost,
  otherWrite,
  readUpstreamRule,
  upstreamWrite,
  writeRefusal,
} = (await import(join(import.meta.dir, "upstream-guard.ts"))) as Guard;

const readRule = (file: string): UpstreamRule => {
  const rule = readUpstreamRule(JSON.parse(readFileSync(file, "utf8")));
  if (!rule) {
    throw new Error(`${file} is not an upstream rule`);
  }
  return rule;
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

/** The branch the cwd's checkout is on; none when it is on none (a detached HEAD) or is no checkout. */
const branch = (): string | undefined => {
  const read = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    encoding: "utf8",
  });
  const name = (read.stdout ?? "").trim();
  return read.status === 0 && name && name !== "HEAD" ? name : undefined;
};

const call = {
  program: program as string,
  args,
  env: process.env,
  cwdRemotes,
  readFile,
};
const rule = ruleOrRefuse();
if (rule.posts === "off") {
  const refusal = writeRefusal(rule, upstreamWrite(call));
  if (refusal) {
    refuse(refusal, 1);
  }
} else if (rule.posts === "ask") {
  const write = otherWrite(rule, upstreamWrite(call));
  if (write && program === "curl") {
    process.exit(VIA_DOOR);
  }
  if (write) {
    const built = ghPost(call, write, branch);
    if ("problem" in built) {
      refuse(askRefusal(write.what, built.problem), 1);
    } else {
      const answer = await fetch("http://cawco/upstream/ask", {
        unix: door as string,
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ post: built.post, what: write.what }),
      }).catch((error: unknown) =>
        refuse(
          `cawco: \`${write.what}\` did not run: this workspace's GitHub door could not be reached (${error instanceof Error ? error.message : String(error)}), so the owner could not be asked. Nothing was posted.`,
          1
        )
      );
      const said = await answer.text();
      if (!answer.ok) {
        refuse(said.trim(), 1);
      }
      process.stderr.write(`${said.trim()}\n`);
      process.exit(HELD);
    }
  }
}
