import type { PREVIEW_START, PreviewSource } from "./protocol";

/**
 * What a machine serves a preview from: a port (in a workspace's network or
 * on the host, a sheet's stage or a served server on it) or a folder. A
 * page is the hub's own, and no machine serves it.
 */
export type MachineSource = Exclude<PreviewSource, { page: string }>;

/**
 * WHICH MACHINE AND WHICH SOURCE SERVE AN ORIGIN, as one string: the key a
 * preview's upstream is started for and is compared by. It names everything
 * a machine's listener serves with (the port, the workspace, a sheet's
 * stage, a served server's command, a folder and the copy of it pinned
 * for the person) and nothing it does not (the
 * start page, which the frame names). Made by {@link sourceKeyOf} alone, so
 * two keys are equal exactly when the same listener would serve both.
 */
export type SourceKey = string & { readonly __brand: "SourceKey" };

/**
 * The key of `source` on machine `machineId` ({@link SourceKey}): a JSON
 * tuple, so no command, cwd or folder can make two sources read as one.
 */
export const sourceKeyOf = (at: {
  machineId: string;
  source: MachineSource;
}): SourceKey => {
  const { machineId, source } = at;
  const tuple =
    "dir" in source
      ? [machineId, "dir", source.dir, source.pin ?? null]
      : [
          machineId,
          "port",
          source.port,
          source.workspace ?? null,
          source.stage?.dir ?? null,
          source.stage?.file ?? null,
          source.serve?.command ?? null,
          source.serve?.cwd ?? null,
        ];
  // Cast kept, the brand's one mint: TypeScript makes a branded string only by assertion (https://github.com/microsoft/TypeScript/issues/202).
  return JSON.stringify(tuple) as SourceKey;
};

/**
 * Whether `value`, off the wire, is a {@link SourceKey} as
 * {@link sourceKeyOf} writes one: a JSON tuple of its machine, its kind
 * (`dir` or `port`), and the source's parts.
 */
export const isSourceKey = (value: unknown): value is SourceKey => {
  if (typeof value !== "string") {
    return false;
  }
  try {
    const tuple: unknown = JSON.parse(value);
    return (
      Array.isArray(tuple) &&
      typeof tuple[0] === "string" &&
      (tuple[1] === "dir" || tuple[1] === "port")
    );
  } catch {
    return false;
  }
};

/** What {@link PREVIEW_START} is asked: the source a machine serves (a port or a folder), the hub's name for the start (`instanceId`, which a stop of it names), the one credential its listener answers (`token`), and the source key it was started for, which the machine's register reports back. */
export type PreviewStartArgs = MachineSource & {
  for: SourceKey;
  instanceId: string;
  token: string;
};

/** The machine a {@link SourceKey} names: its tuple's first part. */
export const sourceMachine = (key: SourceKey): string => {
  const tuple: unknown = JSON.parse(key);
  return Array.isArray(tuple) && typeof tuple[0] === "string" ? tuple[0] : "";
};

/**
 * Where a preview origin's requests go now: a machine's listener, started
 * for the source key `for` with the hub's `token` for that start (core
 * `RELAY_HEADER`). A request may go through it only while `for` is the
 * key of what the origin's artifact row names now (hub preview-service.ts).
 */
export interface Upstream {
  address: string;
  for: SourceKey;
  port: number;
  token: string;
}

/**
 * One listener a machine still serves, as its register reports it (agent
 * preview.ts `servingPreviews`): its origin's key, its port, the token of
 * the start that opened it, and the source key that start named. The hub
 * points the origin at it again only while that key is its row's.
 */
export interface ServingPreview {
  for: SourceKey;
  instanceId: string;
  port: number;
  token: string;
}
