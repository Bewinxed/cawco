/**
 * A tool's managed policies that are no file of its own (core
 * `ToolPolicySource`), read on the machine as the tool itself reads them, for
 * the switches with which an owner turns its updates off (tools.ts
 * `switchedOff`). Claude Code 2.1.311 reads them so, in each platform's
 * build:
 * - macOS: `syi()` lists `/Library/Managed Preferences/${e}/${t}.plist`
 *   ("per-user managed preferences", `e` the user's name), then
 *   `/Library/Managed Preferences/${t}.plist` ("device-level managed
 *   preferences"), `t="com.anthropic.claudecode"`; each is read with
 *   `mns="/usr/bin/plutil"` and `eyi=["-convert","json","-o","-","--"]`,
 *   and the first plutil reads stands (`findIndex((s)=>s.stdout!==null)`).
 * - Windows: `` `${process.env.SYSTEMROOT||"C:\\Windows"}\\System32\\reg.exe` ``
 *   with `["query",o,"/v",WTn]`, `WTn="Settings"`, its output read by
 *   `function Fe(e,n="Settings"){…new RegExp(`^[ \\t]+${r}[ \\t]+REG_(?:EXPAND_)?SZ[ \\t]+([\\s\\S]*)`,"im")…}`.
 * Each read is given 5 s, as Claude Code gives it (`whi=5000`).
 */
import { userInfo } from "node:os";
import type { ToolPolicySource } from "@cawco/core";
import { readWithin } from "@cawco/core/bounded";
import { toolWords } from "@cawco/core/words/tools";
import { systemProgram } from "@cawco/core/workspace-needs";

/** How long one policy read may take: Claude Code's own, 5 s. */
const POLICY_WAIT_MS = 5000;

/** What a value's name needs escaped to stand in a regular expression. */
const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/gu;

/** A policy's settings as read: its `env`, and where it stands, in the words a row says it with. */
export interface PolicyRead {
  env: Record<string, unknown>;
  where: string;
}

/** The programs a policy is read with: what this machine has, unless a caller stands one in. */
export interface PolicyPrograms {
  plutil: () => string;
  reg: (env: Readonly<Record<string, string | undefined>>) => string;
}

const SYSTEM_PROGRAMS: PolicyPrograms = {
  plutil: () => systemProgram("plutil"),
  // As Claude Code finds it: the system root's, never one a PATH offers.
  reg: (env) => `${env.SYSTEMROOT || "C:\\Windows"}\\System32\\reg.exe`,
};

/** The managed preferences files of `domain`, the user's own first, as macOS keeps them. */
export const plistPaths = (
  domain: string,
  user: string | undefined
): string[] => [
  ...(user ? [`/Library/Managed Preferences/${user}/${domain}.plist`] : []),
  `/Library/Managed Preferences/${domain}.plist`,
];

/**
 * The text a `reg.exe query <key> /v <value>` printed for `value`, read as
 * Claude Code's `Fe` reads it; none when it printed no such value.
 */
export const registryText = (
  stdout: string,
  value: string
): string | undefined => {
  const name = value.replace(REGEX_SPECIALS, "\\$&");
  const said = new RegExp(
    `^[ \\t]+${name}[ \\t]+REG_(?:EXPAND_)?SZ[ \\t]+([\\s\\S]*)`,
    "imu"
  )
    .exec(stdout)?.[1]
    ?.trimEnd();
  return said || undefined;
};

/** A settings document's `env`, from its JSON; none when it is no JSON object or holds no `env` object. */
export const policyEnv = (
  json: string
): Record<string, unknown> | undefined => {
  let document: unknown;
  try {
    document = JSON.parse(json);
  } catch {
    return;
  }
  const env =
    typeof document === "object" && document !== null
      ? (document as { env?: unknown }).env
      : undefined;
  return typeof env === "object" && env !== null && !Array.isArray(env)
    ? (env as Record<string, unknown>)
    : undefined;
};

/**
 * Asks a program: runs `argv` within `ms`, answering its exit code and its
 * output; none when it didn't answer in time or couldn't be started. How a
 * tool's policy (here) and a package manager's hold on a copy (tools.ts
 * `asksHold`) are asked.
 */
export const askProgram = async (
  argv: string[],
  env: Readonly<Record<string, string | undefined>>,
  ms = POLICY_WAIT_MS
): Promise<{ code: number; out: string } | undefined> => {
  const read = await readWithin(ms, async (signal) => {
    const child = Bun.spawn(argv, {
      env,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "ignore",
      signal,
    });
    const [out, code] = await Promise.all([
      new Response(child.stdout).text(),
      child.exited,
    ]);
    return { code, out };
  }).catch(() => undefined);
  return read?.kind === "answered" ? read.value : undefined;
};

/** The user's name, as Claude Code asks for it: none when the system can't say. */
const userName = (): string | undefined => {
  let name: string | undefined;
  try {
    name = userInfo().username;
  } catch {
    // A uid with no entry in the user database has no name to say.
  }
  return name;
};

/**
 * One managed policy, read on this machine: its `env` and where it stands;
 * none when it isn't here or can't be read. `programs` stands in for this
 * machine's plutil and reg.exe.
 */
export const readPolicy = async (
  source: ToolPolicySource,
  env: Readonly<Record<string, string | undefined>>,
  programs: PolicyPrograms = SYSTEM_PROGRAMS
): Promise<PolicyRead | undefined> => {
  if (source.kind === "plist") {
    let plutil: string;
    try {
      plutil = programs.plutil();
    } catch {
      return;
    }
    for (const path of plistPaths(source.domain, userName())) {
      const ran = await askProgram(
        [plutil, "-convert", "json", "-o", "-", "--", path],
        env
      );
      if (ran?.code === 0) {
        return {
          env: policyEnv(ran.out) ?? {},
          where: toolWords.inProfile(source.domain),
        };
      }
    }
    return;
  }
  const ran = await askProgram(
    [programs.reg(env), "query", source.key, "/v", source.value],
    env
  );
  const text =
    ran?.code === 0 ? registryText(ran.out, source.value) : undefined;
  return text === undefined
    ? undefined
    : {
        env: policyEnv(text) ?? {},
        where: toolWords.inRegistry(source.value, source.key),
      };
};
