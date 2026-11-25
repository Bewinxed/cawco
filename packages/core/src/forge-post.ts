/**
 * A write made on a machine with its own sign-in (provider spec §2.8, D4):
 * a session's `forge_post`, a landing's pull or merge request, usability
 * feedback. The hub's write door (hub writes.ts) sends the machine one
 * {@link MachineWriteOp} for a repository; the machine finds the forge its
 * host is on and its CLI's sign-in there (agent forges/forge.ts `forgeOn`),
 * makes that provider's client, runs its `writes.run`, and answers what it
 * made, which the door records.
 */
import type { ProviderId, WriteMade, WriteOp } from "@cawco/providers/provider";
import { ForgeAskSchema } from "./stored-shapes";

/** The writes a machine makes with its own sign-in. */
const MACHINE_WRITE_OPS = [
  "issue.create",
  "comment.create",
  "change-request.open",
  "issue.find-marked",
] as const;
export type MachineWriteOp = Extract<
  WriteOp,
  { op: (typeof MACHINE_WRITE_OPS)[number] }
>;

/** Whether a write is one a machine makes with its own sign-in. */
export const isMachineWrite = (op: WriteOp): op is MachineWriteOp =>
  MACHINE_WRITE_OPS.some((one) => one === op.op);

/** The forges CawCo posts to with a machine's sign-in. */
export const FORGES = ["github", "gitlab", "gitea"] as const;
export type Forge = (typeof FORGES)[number];

/** Each forge as a person names it. */
export const FORGE_NAMES: Readonly<Record<Forge, string>> = {
  github: "GitHub",
  gitlab: "GitLab",
  gitea: "Gitea",
};

/**
 * The machine control the write door reaches (agent forges/forge.ts
 * `forgePost`): args `[ForgeAsk]`; answers what the write came to there.
 */
export const CONTROL_FORGE_POST = "forgePost";

/**
 * A write as the hub sends it to a machine: the repository by URL or
 * `host/path`, and the write, one of {@link MACHINE_WRITE_OPS} (the write
 * door sends no other; the provider refuses one it has none of).
 */
export interface ForgeAsk {
  readonly op: WriteOp;
  readonly repo: string;
}

/** A forge ask read off the wire; undefined when it is none. */
export const readForgeAsk = (value: unknown): ForgeAsk | undefined => {
  const read = ForgeAskSchema.safeParse(value);
  return read.success ? read.data : undefined;
};

/**
 * What a write came to on the machine: written on `provider`'s `host`, in
 * `container` (as the mirror keys it: lower case), with what it made; or
 * refused before it reached a forge (no repository named, no sign-in
 * there), or by the forge, in words.
 */
export type ForgeVerdict =
  | {
      readonly container: string;
      readonly host: string;
      readonly kind: "written";
      readonly made: WriteMade;
      readonly provider: ProviderId;
    }
  | { readonly kind: "refused"; readonly why: string };
