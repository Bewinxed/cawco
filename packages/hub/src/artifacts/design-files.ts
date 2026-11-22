/**
 * A folder's files read off a machine: a design folder's `dir`
 * (design-folder.ts), a folder preview's (preview-folder.ts), or a folder
 * preview's copy a hub from before it kept them left there
 * (folder-move.ts). Every file of it is admitted as a delegate's inputs are
 * (agent inputs.ts `admitInputs`: a session in a workspace hands only what
 * it reads itself, never what every boundary hides), then read range by
 * range as inputs cross between machines (core `inputBatches`), held to its
 * limits before a byte of it is read.
 */
import type { InstanceRow } from "@cawco/core/protocol";
import {
  CONTROL_INPUTS_ADMIT,
  CONTROL_INPUTS_READ,
  type InputNamed,
  type InputWant,
  inputBatches,
  type WorkspaceRef,
} from "@cawco/core/workspace/controls";
import { problem } from "elysia";
import { type MachineCall, MachineProblem } from "../machine-answers";
import { DESIGN_LIMITS, type DesignFile } from "./design-folder";

/** What reading a folder needs of the hub. */
export interface DesignFilesDeps {
  call: MachineCall;
  /** The workspace a session's commands are bound to, when it runs in one. */
  workspaceOf: (row: InstanceRow) => WorkspaceRef | undefined;
}

/**
 * Who reads a folder, and on which machine: a session, with its
 * workspace's and project's reach, on its own machine (or `machineId`,
 * where its workspace's clone is not, so only its project's reach goes
 * with it); or the hub itself on machine `machineId`, with the reach of a
 * session in no workspace and no project.
 */
export type FolderReader =
  { instance: InstanceRow; machineId?: string } | { machineId: string };

/** The most a folder read holds: its files, and their bytes together. */
export interface FolderLimits {
  bytes: number;
  files: number;
}

/** A folder that wasn't read, in the machine's words. */
const unread = (dir: string, why: string) =>
  problem(400, {
    code: "artifact-folder-unread",
    detail: `${dir} wasn't read: ${why}`,
  });

/** Why `files` (admitted) are more than `limits` hold; null when they fit. */
const tooMuch = (
  files: readonly InputNamed[],
  limits: FolderLimits
): string | null => {
  const bytes = files.reduce((sum, one) => sum + one.size, 0);
  if (files.length > limits.files) {
    return `it holds ${files.length} files, and CawCo keeps ${limits.files} at most: leave out what an install makes (node_modules), a repository's .git and anything its pages don't load.`;
  }
  return bytes > limits.bytes
    ? `it holds ${Math.ceil(bytes / 1024 / 1024)} MiB, and CawCo keeps ${limits.bytes / 1024 / 1024} MiB at most.`
    : null;
};

export const createDesignFiles = (deps: DesignFilesDeps) => {
  /** Admitted `files` read off `machineId` whole, by their names; or the machine's refusal. */
  const readAll = async (
    machineId: string,
    reach: [bound: WorkspaceRef | null, project: string | null],
    files: readonly InputNamed[]
  ): Promise<Map<string, Buffer[]> | string> => {
    const pieces = new Map<string, Buffer[]>();
    for (const batch of inputBatches(files)) {
      const read = await deps.call(machineId, CONTROL_INPUTS_READ, [
        ...reach,
        batch.map(({ file, at, length }): InputWant => ({
          from: file.from,
          at,
          length,
          size: file.size,
        })),
      ]);
      if ("refused" in read) {
        return read.refused;
      }
      for (const [index, { file }] of batch.entries()) {
        const held = pieces.get(file.name) ?? [];
        held.push(Buffer.from(read.contents[index] ?? "", "base64"));
        pieces.set(file.name, held);
      }
    }
    return pieces;
  };
  /** Where `reader` reads, and with what reach (agent inputs.ts `reachOf`). */
  const placeOf = (
    reader: FolderReader
  ): {
    machineId: string;
    reach: [WorkspaceRef | null, string | null];
  } => {
    if (!("instance" in reader)) {
      return { machineId: reader.machineId, reach: [null, null] };
    }
    const { instance } = reader;
    const machineId = reader.machineId ?? instance.machineId;
    return {
      machineId,
      reach: [
        machineId === instance.machineId
          ? (deps.workspaceOf(instance) ?? null)
          : null,
        instance.projectId ?? null,
      ],
    };
  };
  /** Every file of folder `dir` as `reader` reads it, by its path from `dir`, within `limits`; refused in words. */
  return async (
    reader: FolderReader,
    dir: string,
    limits: FolderLimits = DESIGN_LIMITS
  ) => {
    const { machineId, reach } = placeOf(reader);
    try {
      const admitted = await deps.call(machineId, CONTROL_INPUTS_ADMIT, [
        [dir],
        ...reach,
      ]);
      if ("refused" in admitted) {
        return unread(dir, admitted.refused);
      }
      const { files } = admitted;
      const over = tooMuch(files, limits);
      if (over) {
        return unread(dir, over);
      }
      const pieces = await readAll(machineId, reach, files);
      if (typeof pieces === "string") {
        return unread(dir, pieces);
      }
      // Each lands as `<folder's name>/<its path in it>`: its path from the folder.
      return files.map((file): DesignFile => ({
        path: file.name.split("/").slice(1).join("/"),
        bytes: Buffer.concat(pieces.get(file.name) ?? []),
      }));
    } catch (error) {
      if (error instanceof MachineProblem) {
        return error.problem;
      }
      throw error;
    }
  };
};
