/**
 * Scratch launchd agents in this user's GUI domain, run as a release runs
 * its services on a Mac: the program started through core launchd.ts
 * `launchdProgram`'s shell, as cli service.ts starts every job, and
 * attributed to `CawCo Agent.app` by `AssociatedBundleIdentifiers` (core
 * agent-bundle.ts). So a privacy check (Local Network among them) is made
 * against the bundle's grant, the product's, never the probe's own process.
 * TN3179: "If you ship a launchd agent that's not installed using
 * SMAppService, make macOS aware of the responsible code by setting the
 * AssociatedBundleIdentifiers property in your launchd property list."
 *
 * Every job is booted out by its label, and its start record removed, when
 * `stopAll` runs, and on SIGINT or SIGTERM before it.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AGENT_BUNDLE_ID } from "../../packages/core/src/agent-bundle";
import {
  launchdProgram,
  launchdStartPath,
} from "../../packages/core/src/launchd";
import { until } from "../scratch-fleet";

/** The line a job's script prints its answer on, read back from its log. */
export const RESULT_MARK = "PROBE-RESULT ";

const xml = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A job's plist: its program through launchd's shell, its environment, its one log, run once at load. */
const plistOf = (
  label: string,
  argv: readonly string[],
  env: Record<string, string>,
  log: string
): string => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xml(label)}</string>
  <key>AssociatedBundleIdentifiers</key>
  <array>
    <string>${xml(AGENT_BUNDLE_ID)}</string>
  </array>
  <key>ProgramArguments</key>
  <array>
${launchdProgram(label, argv)
  .map((argument) => `    <string>${xml(argument)}</string>`)
  .join("\n")}
  </array>
  <key>EnvironmentVariables</key>
  <dict>
${Object.entries(env)
  .map(
    ([key, value]) =>
      `    <key>${xml(key)}</key>\n    <string>${xml(value)}</string>`
  )
  .join("\n")}
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${xml(log)}</string>
  <key>StandardErrorPath</key>
  <string>${xml(log)}</string>
</dict>
</plist>
`;

export interface LaunchAgents {
  /** `name` run until its log carries its {@link RESULT_MARK} line, then booted out: the line's JSON. */
  result: <T>(
    name: string,
    argv: readonly string[],
    env: Record<string, string>,
    withinMs: number
  ) => Promise<T>;
  /** The job `name` (`dev.cawco.probe.<name>`) loaded and started: its log's path. */
  start: (
    name: string,
    argv: readonly string[],
    env: Record<string, string>
  ) => Promise<string>;
  /** Every job booted out and its start record gone. */
  stopAll: () => void;
}

/** Scratch agents whose plists and logs live in `dir`. */
export const launchAgents = (dir: string): LaunchAgents => {
  mkdirSync(dir, { recursive: true });
  const domain = `gui/${process.getuid?.()}`;
  const labels = new Set<string>();
  const bootout = (label: string): void => {
    Bun.spawnSync(["launchctl", "bootout", `${domain}/${label}`]);
    rmSync(launchdStartPath(label), { force: true });
  };
  const stopAll = (): void => {
    for (const label of labels) {
      bootout(label);
    }
    labels.clear();
    process.off("SIGINT", interrupted);
    process.off("SIGTERM", interrupted);
  };
  const interrupted = (): void => {
    stopAll();
    process.exit(130);
  };
  process.once("SIGINT", interrupted);
  process.once("SIGTERM", interrupted);

  const start = async (
    name: string,
    argv: readonly string[],
    env: Record<string, string>
  ): Promise<string> => {
    const label = `dev.cawco.probe.${name}`;
    const plist = join(dir, `${label}.plist`);
    const log = join(dir, `${label}.log`);
    // A run that died before its stopAll left this one loaded: out first.
    bootout(label);
    rmSync(log, { force: true });
    writeFileSync(plist, plistOf(label, argv, env, log));
    labels.add(label);
    const loaded = Bun.spawnSync(["launchctl", "bootstrap", domain, plist]);
    if (loaded.exitCode !== 0) {
      throw new Error(
        `launchctl bootstrap ${domain} ${plist}: ${loaded.stderr.toString().trim()}`
      );
    }
    await Promise.resolve();
    return log;
  };

  return {
    start,
    async result<T>(
      name: string,
      argv: readonly string[],
      env: Record<string, string>,
      withinMs: number
    ): Promise<T> {
      const log = await start(name, argv, env);
      const read = async () => {
        const file = Bun.file(log);
        return (await file.exists()) ? await file.text() : "";
      };
      try {
        const said = await until(
          `${name}'s answer`,
          read,
          (text) => text.includes(RESULT_MARK),
          withinMs
        ).catch(async () => {
          throw new Error(
            `${name} printed no answer within ${withinMs / 1000} s: ${(await read()).slice(-600)}`
          );
        });
        const line =
          said
            .split("\n")
            .find((one) => one.startsWith(RESULT_MARK))
            ?.slice(RESULT_MARK.length) ?? "null";
        return JSON.parse(line) as T;
      } finally {
        bootout(`dev.cawco.probe.${name}`);
        labels.delete(`dev.cawco.probe.${name}`);
      }
    },
    stopAll,
  };
};
