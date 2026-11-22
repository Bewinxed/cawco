/**
 * A design folder's `dir` read off its session's machine (artifacts
 * design-folder.ts): every file of it admitted as a delegate's inputs are
 * (agent inputs.ts `admitInputs`: a session in a workspace hands only what
 * it reads itself, never what every boundary hides), then read range by
 * range as inputs cross between machines (core `inputBatches`), held to
 * {@link DESIGN_LIMITS} before a byte of it is read.
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

/** What reading a design's folder needs of the hub. */
export interface DesignFilesDeps {
  call: MachineCall;
  /** The workspace a session's commands are bound to, when it runs in one. */
  workspaceOf: (row: InstanceRow) => WorkspaceRef | undefined;
}

/** A folder that wasn't read, in the machine's words. */
const unread = (dir: string, why: string) =>
  problem(400, {
    code: "artifact-design-unread",
    detail: `${dir} wasn't read for the design: ${why}`,
  });

/** Why `files` (admitted) are more than a design holds; null when they fit. */
const tooMuch = (files: readonly InputNamed[]): string | null => {
  const bytes = files.reduce((sum, one) => sum + one.size, 0);
  if (files.length > DESIGN_LIMITS.files) {
    return `it holds ${files.length} files, and a design holds ${DESIGN_LIMITS.files} at most: leave out what its stage installs (node_modules) and what it builds.`;
  }
  return bytes > DESIGN_LIMITS.bytes
    ? `it holds ${Math.ceil(bytes / 1024 / 1024)} MiB, and a design holds ${DESIGN_LIMITS.bytes / 1024 / 1024} MiB at most.`
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
  /** Every file of folder `dir` on `instance`'s machine, by its path from `dir`; refused in words. */
  return async (instance: InstanceRow, dir: string) => {
    const reach: [WorkspaceRef | null, string | null] = [
      deps.workspaceOf(instance) ?? null,
      instance.projectId ?? null,
    ];
    try {
      const admitted = await deps.call(
        instance.machineId,
        CONTROL_INPUTS_ADMIT,
        [[dir], ...reach]
      );
      if ("refused" in admitted) {
        return unread(dir, admitted.refused);
      }
      const { files } = admitted;
      const over = tooMuch(files);
      if (over) {
        return unread(dir, over);
      }
      const pieces = await readAll(instance.machineId, reach, files);
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
