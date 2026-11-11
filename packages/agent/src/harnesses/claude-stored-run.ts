/**
 * What a stored Claude Code session ran with, read where it is stored (core
 * `StoredRun`), for a resume that goes on as it was: the first send on a
 * transcript run outside CawCo starts a session of CawCo's on it, with no
 * form to pick anything in.
 *
 * - Account: the config dir that holds the transcript, an account's or the
 *   machine's own sign-in's.
 * - Permission mode: the transcript's newest `permission-mode` record (the
 *   CLI writes the session's mode there and reads it back on `--resume`,
 *   CLI 2.1.322); else `permissions.defaultMode` of the settings that apply
 *   to its folder; else `default`, Claude Code's own.
 * - Model: the newest assistant record's `message.model`; else the
 *   settings' `model`; else none, and the CLI takes its own default, as
 *   `claude --resume` in that folder would.
 * - Effort: the settings' `effortLevel` (no record of a transcript holds
 *   it); else none, the model's own default.
 *
 * Settings are read in Claude Code's order: the folder's
 * `.claude/settings.local.json`, its `.claude/settings.json`, then the
 * config dir's `settings.json`.
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { RanFrom, StoredRun } from "@cawco/core/harness";
import { isEffortLevel, PERMISSION_MODES } from "@cawco/core/harness";
import { projectClaudeDir } from "@cawco/core/paths";
import { ReverseReader, typeFilter } from "@cawco/jsonl-parser";

/** How far back from a transcript's end its mode and model are looked for. Ours: the CLI appends the mode after each turn, and a turn's assistant record is within one tool result of it. */
const LOOK_BACK_BYTES = 8 * 1024 * 1024;
const STEP_BYTES = 64 * 1024;
/** The lines the mode and the model are on, before any is parsed. */
const RUN_LINES = typeFilter("assistant", "permission-mode");
/** The model the CLI names on a message it wrote itself (an API error, a local answer). */
const SYNTHETIC_MODEL = "<synthetic>";

/** The modes a transcript may name that a session of CawCo's starts in: Claude Code's own, never Full Send (CawCo's). */
const CLAUDE_MODES: ReadonlySet<string> = new Set(
  PERMISSION_MODES.filter((mode) => mode !== "fullSend")
);

interface Settings {
  effortLevel?: unknown;
  model?: unknown;
  permissions?: { defaultMode?: unknown };
}

/** A settings file as JSON; nothing when it is absent or does not parse. */
const settingsAt = async (path: string): Promise<Settings | undefined> => {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    return parsed && typeof parsed === "object"
      ? (parsed as Settings)
      : undefined;
  } catch {
    // Absent, unreadable or not JSON: this tier sets nothing.
  }
};

/** The transcript's newest mode and model, read backward from its end. */
const fromTranscript = async (
  file: string
): Promise<{ mode?: string; model?: string }> => {
  const reader = new ReverseReader(file, {
    prefilter: RUN_LINES,
    chunkBytes: STEP_BYTES,
    maxBytes: LOOK_BACK_BYTES,
  });
  let mode: string | undefined;
  let model: string | undefined;
  for (;;) {
    await reader.more(1);
    const step = reader.records;
    reader.records = [];
    for (let at = step.length - 1; at >= 0; at -= 1) {
      const record = step[at]?.record as
        | {
            type?: unknown;
            permissionMode?: unknown;
            message?: { model?: unknown };
          }
        | undefined;
      if (
        mode === undefined &&
        record?.type === "permission-mode" &&
        typeof record.permissionMode === "string"
      ) {
        mode = record.permissionMode;
      }
      const said = record?.type === "assistant" ? record.message?.model : null;
      if (
        model === undefined &&
        typeof said === "string" &&
        said !== "" &&
        said !== SYNTHETIC_MODEL
      ) {
        model = said;
      }
    }
    if ((mode !== undefined && model !== undefined) || reader.spent) {
      return { mode, model };
    }
  }
};

/**
 * What the session stored at `file` (a transcript under a config dir's
 * `projects/<slug>/`) ran with. `cwd` is the folder it ran in, as its
 * transcript says; `account` the account whose config dir holds it, null
 * for the machine's own sign-in.
 */
export async function claudeStoredRun(
  file: string,
  cwd: string | undefined,
  account: string | null
): Promise<StoredRun> {
  const configDir = dirname(dirname(dirname(file)));
  const tiers: [RanFrom, string][] = [
    ...(cwd
      ? ([
          ["project-settings", projectClaudeDir(cwd, "settings.local.json")],
          ["project-settings", projectClaudeDir(cwd, "settings.json")],
        ] satisfies [RanFrom, string][])
      : []),
    ["user-settings", join(configDir, "settings.json")],
  ];
  const settings: [RanFrom, Settings][] = [];
  for (const [from, path] of tiers) {
    const read = await settingsAt(path);
    if (read) {
      settings.push([from, read]);
    }
  }
  /** The first tier that holds a value `read` takes. */
  const set = <T>(
    read: (one: Settings) => T | undefined
  ): { from: RanFrom; value: T } | undefined => {
    for (const [from, one] of settings) {
      const value = read(one);
      if (value !== undefined) {
        return { from, value };
      }
    }
  };
  const text = (value: unknown): string | undefined =>
    typeof value === "string" && value !== "" ? value : undefined;
  const mode = (value: unknown): string | undefined =>
    typeof value === "string" && CLAUDE_MODES.has(value) ? value : undefined;

  const said = await fromTranscript(file).catch(
    () =>
      ({}) as {
        mode?: string;
        model?: string;
      }
  );
  const saidMode = mode(said.mode);
  const model = said.model
    ? { from: "transcript" as const, value: said.model }
    : set((one) => text(one.model));
  const effort = set((one) =>
    isEffortLevel(one.effortLevel) ? one.effortLevel : undefined
  );
  return {
    account,
    permissionMode: saidMode
      ? { from: "transcript", value: saidMode }
      : (set((one) => mode(one.permissions?.defaultMode)) ?? {
          from: "default",
          value: "default",
        }),
    ...(model ? { model } : {}),
    ...(effort ? { effort } : {}),
  };
}
