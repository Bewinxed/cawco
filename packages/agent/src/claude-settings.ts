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

import { resolveSettings } from "@anthropic-ai/claude-agent-sdk";
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
 * and the managed policy it came from when it is that.
 */
export const SettingsReadSchema = z.object({
  effective: z.object({ env: ENV.optional() }),
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
 * Claude Code's settings for `variables`, read now: the user's alone of the
 * filesystem's, since a project's apply where Claude Code runs in it, not to
 * the machine; every managed source the engine reads.
 */
export const claudeSettings = async (
  variables: readonly string[]
): Promise<SettingsRead> => {
  const { effective, sources } = await resolveSettings({
    settingSources: ["user"],
  });
  return {
    effective: { env: narrowed(effective.env, variables) },
    sources: sources.map(({ source, path, policyOrigin, settings }) => ({
      source,
      ...(path ? { path } : {}),
      ...(policyOrigin ? { policyOrigin } : {}),
      settings: { env: narrowed(settings.env, variables) },
    })),
  };
};
