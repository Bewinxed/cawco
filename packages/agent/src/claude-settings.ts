/**
 * `cawco claude-settings <variable>...` (cli.ts): Claude Code's settings as
 * its own engine resolves them now, the Agent SDK's `resolveSettings`, which
 * "Resolves the effective Claude Code settings for a given directory using
 * the same merge engine as the CLI, without spawning the Claude CLI" and
 * "reads MDM sources, including macOS plist and Windows HKLM/HKCU"
 * (code.claude.com/docs/en/agent-sdk/typescript, read 2026-11-04), its
 * policy tier as at the CLI's start: "managed-settings.json, remote-cached
 * managed settings, MDM via macOS plist / Windows HKLM/HKCU" (its sdk.d.ts).
 * Narrowed to the variables asked for: the merged `env`'s and each
 * source's, never another of their keys.
 *
 * The agent runs it in a process of its own for each update it decides on
 * (tools.ts `SETTINGS_ENGINES`): the SDK reads a machine's policy once in a
 * process ("MDM resolution may invoke `plutil` (macOS, when an MDM plist
 * exists) or `reg.exe` (Windows/WSL) on the first call per process", its
 * sdk.d.ts), so a long-lived agent would keep its first read. A fresh one
 * reads the policy as it stands, as Claude Code's CLI reads it again every
 * 30 minutes ("Read at startup and checked for changes every 30 minutes",
 * code.claude.com/docs/en/managed-settings).
 */

import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { resolveSettings } from "@anthropic-ai/claude-agent-sdk";
import { claudeHome } from "@cawco/core/paths/claude";
import { toolWords } from "@cawco/core/words/tools";
import { z } from "zod";

/**
 * A settings `env`'s values as a source may hold them: a profile's plist
 * keeps a boolean or a number as itself.
 */
const ENV = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean()])
);

/**
 * What `cawco claude-settings` answers: the merged `env`, and each source,
 * by the engine's precedence, lowest first, with its file when it is one
 * and the managed policy it came from when it is that; and each source
 * Claude Code reads that is there and could not be read (`unreadSources`,
 * in words, {@link unreadSources}), which the engine shows as absent.
 */
export const SettingsReadSchema = z.object({
  effective: z.object({ env: ENV.optional() }),
  unreadSources: z.array(z.string()),
  sources: z.array(
    z.object({
      source: z.string(),
      path: z.string().optional(),
      policyOrigin: z.string().optional(),
      settings: z.object({ env: ENV.optional() }),
    })
  ),
});

export type SettingsRead = z.infer<typeof SettingsReadSchema>;

/** Of an `env`, the variables asked for that it sets. */
const narrowed = (
  env: Readonly<Record<string, unknown>> | undefined,
  variables: readonly string[]
): z.infer<typeof ENV> =>
  ENV.parse(
    Object.fromEntries(
      variables.flatMap((variable) =>
        env && Object.hasOwn(env, variable) ? [[variable, env[variable]]] : []
      )
    )
  );

/**
 * The largest settings file read: a settings file is a few kilobytes, and
 * one past this is no settings file anyone wrote by hand (a 200 MB one
 * stood in the host run's probes).
 */
const SETTINGS_FILE_LIMIT = 4 * 1024 * 1024;

/**
 * Where a settings file stands: absent (nothing there, or no folder it
 * could be in), read (its text one JSON object, `keys` how many it has), or
 * there and unread, with why.
 */
type FileRead =
  | { state: "absent" }
  | { keys: number; state: "read" }
  | { state: "unread"; why: string };

const errorCode = (error: unknown): string | undefined =>
  error instanceof Error && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;

const errorWords = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * One settings file as Claude Code would read it, read here first: the
 * engine (`resolveSettings`) answers a file it could not read as one that
 * is not there, so a settings file at mode 000, in a folder at mode 000,
 * malformed, a folder or a pipe in its place, a symlink loop, or one too
 * large all read as "no settings" (the host run's probes, every one exit 0
 * with `sources: []`). Absent only when nothing is at the path (ENOENT) or
 * a file stands where its folder would (ENOTDIR), as the engine itself
 * takes a managed-settings folder (`f==="ENOENT"||f==="ENOTDIR"`, the SDK's
 * bundle). A pipe is never opened: a read of one waits for a writer.
 */
const readSettingsFile = async (path: string): Promise<FileRead> => {
  let info: Awaited<ReturnType<typeof stat>>;
  try {
    info = await stat(path);
  } catch (error) {
    const code = errorCode(error);
    return code === "ENOENT" || code === "ENOTDIR"
      ? { state: "absent" }
      : { state: "unread", why: errorWords(error) };
  }
  if (!info.isFile()) {
    return { state: "unread", why: toolWords.settingsNotAFile };
  }
  if (info.size > SETTINGS_FILE_LIMIT) {
    return {
      state: "unread",
      why: toolWords.settingsTooLarge(info.size, SETTINGS_FILE_LIMIT),
    };
  }
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    return { state: "unread", why: errorWords(error) };
  }
  // The engine reads an empty file as no settings ("if(e.trim()==="")return
  // {settings:{},errors:[],loadState:"loaded"}").
  if (text.trim() === "") {
    return { state: "read", keys: 0 };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { state: "unread", why: errorWords(error) };
  }
  return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
    ? { state: "read", keys: Object.keys(parsed).length }
    : { state: "unread", why: toolWords.settingsNotAnObject };
};

/**
 * Claude Code's config dir as its engine names it: `CLAUDE_CONFIG_DIR` when
 * set at all, else `~/.claude` (core `claudeHome`; the SDK's
 * `Iu()??R8(A8(),".claude")`, where `Iu()` is
 * `process.env.CLAUDE_CONFIG_DIR`), so both read the same files.
 */
const claudeConfigDir = (): string =>
  process.env.CLAUDE_CONFIG_DIR ?? claudeHome();

/**
 * EACH SETTINGS SOURCE CLAUDE CODE READS THAT IS THERE AND WAS NOT READ, in
 * words: what no update is decided on (agent tools.ts `settingsAnswer`).
 * The Agent SDK says nothing of a user settings file it could not read
 * (`ResolvedSettings.sources` leaves it out, as it leaves out one that is
 * not there; `SDKSettingsParseError` is only on a session's own
 * `get_settings`), so this read tells them apart:
 * - the user's `settings.json` in the config dir, read here
 *   ({@link readSettingsFile}); one read here with keys in it that the
 *   engine's `sources` leaves out was skipped by the engine (a schema it
 *   refuses: "the file is skipped", sdk.d.ts `SDKSettingsParseError`);
 * - the server-managed settings Claude Code last fetched, its
 *   `remote-settings.json` in the config dir, read here the same way;
 * - the machine's own policy, by the engine's word
 *   (`ResolvedSettings.machinePolicy.didNotLoad`, 0.3.325 on: "`effective`,
 *   `provenance` and `sources` show a source that was not read as absent,
 *   so a host that enforces managed settings reads this first"): its
 *   managed-settings file and drop-ins, a macOS profile, the Windows
 *   registry value.
 */
const unreadSources = async (
  resolved: Awaited<ReturnType<typeof resolveSettings>>
): Promise<string[]> => {
  const dir = claudeConfigDir();
  const user = join(dir, "settings.json");
  const remote = join(dir, "remote-settings.json");
  const [userRead, remoteRead] = await Promise.all([
    readSettingsFile(user),
    readSettingsFile(remote),
  ]);
  const unread: string[] = [];
  if (userRead.state === "unread") {
    unread.push(toolWords.settingsSourceUnread(user, userRead.why));
  } else if (
    userRead.state === "read" &&
    userRead.keys > 0 &&
    !resolved.sources.some((one) => one.source === "user")
  ) {
    unread.push(
      toolWords.settingsSourceUnread(user, toolWords.settingsSkipped)
    );
  }
  if (remoteRead.state === "unread") {
    unread.push(toolWords.settingsSourceUnread(remote, remoteRead.why));
  }
  const policy = resolved.machinePolicy?.didNotLoad;
  if (policy) {
    unread.push(
      toolWords.settingsSourceUnread(
        toolWords.settingsPolicy(policy),
        toolWords.settingsPolicyUnloaded
      )
    );
  }
  return unread;
};

/**
 * Claude Code's settings for `variables`, read now: the user's alone of the
 * filesystem's, since a project's apply where Claude Code runs in it, not to
 * the machine; every managed source the engine reads; and each of those
 * that is there and was not read ({@link unreadSources}).
 */
export const claudeSettings = async (
  variables: readonly string[]
): Promise<SettingsRead> => {
  const resolved = await resolveSettings({
    settingSources: ["user"],
  });
  const { effective, sources } = resolved;
  return {
    effective: { env: narrowed(effective.env, variables) },
    unreadSources: await unreadSources(resolved),
    sources: sources.map(({ source, path, policyOrigin, settings }) => ({
      source,
      ...(path ? { path } : {}),
      ...(policyOrigin ? { policyOrigin } : {}),
      settings: { env: narrowed(settings.env, variables) },
    })),
  };
};
