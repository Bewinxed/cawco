import { chmod } from "node:fs/promises";
import { join } from "node:path";
import { cawcoConfigDir } from "@cawco/core/paths";

/** Machine configuration shared by the CLI and daemon. */
export interface CliConfig {
  /**
   * The id of the hub this machine joined (hub hub-id.ts), recorded the
   * first time the agent reaches it at `hubUrl` or asks its `/health`; a
   * new `hubUrl` drops it. What makes an agent the machine's own whichever
   * address it reaches that hub by (machine-agent.ts).
   */
  hubId?: string;
  hubUrl: string;
  /** Transcript cache budget in megabytes (default 256). */
  transcriptCacheMb?: number;
  updatedAt: string;
}

export const CONFIG_PATH = join(cawcoConfigDir(), "config.json");

/** Readable by its owner and nobody else. */
const CONFIG_MODE = 0o600;

/**
 * Undefined for a first run, and for a file someone has since broken. Only the
 * fields above are read, so a key the config no longer has (the Claude token
 * `cawco` once kept here) is dropped by the next write.
 */
export const readConfig = async (
  path = CONFIG_PATH
): Promise<CliConfig | undefined> => {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    return undefined;
  }
  const config = await file.json().catch(() => undefined);
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return undefined;
  }
  const tcm = config.transcriptCacheMb;
  return {
    ...(typeof config.hubId === "string" && config.hubId
      ? { hubId: config.hubId }
      : {}),
    hubUrl: typeof config.hubUrl === "string" ? config.hubUrl : "",
    transcriptCacheMb:
      typeof tcm === "number" && Number.isFinite(tcm) && tcm > 0
        ? tcm
        : undefined,
    updatedAt: typeof config.updatedAt === "string" ? config.updatedAt : "",
  };
};

/**
 * Merges over what is already there: remembering a hub must not drop the
 * transcript cache budget. The mode is set after the write
 * because it has to be re-applied to a file that already existed.
 */
export const writeConfig = async (
  patch: Partial<CliConfig>,
  path = CONFIG_PATH
): Promise<void> => {
  const held = await readConfig(path);
  const config: CliConfig = {
    hubUrl: "",
    ...held,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  // Another hub address is another join: the id recorded for the old one is
  // not this one's until it is read again.
  if (
    patch.hubUrl !== undefined &&
    patch.hubUrl !== held?.hubUrl &&
    patch.hubId === undefined
  ) {
    config.hubId = undefined;
  }
  await Bun.write(path, `${JSON.stringify(config, null, 2)}\n`);
  await chmod(path, CONFIG_MODE);
};
