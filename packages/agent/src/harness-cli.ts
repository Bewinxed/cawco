/**
 * A harness's CLI as the machine's capability probe reads it (agent
 * capabilities.ts `probeCapabilities`), each adapter's `cli`
 * (harness.ts `Harness.cli`). Apart from harness.ts, so the probe reads it
 * without the adapter's contract.
 */
import type { Bounded } from "@cawco/core/bounded";
import type { HarnessKind } from "@cawco/core/harness/kinds";

/** A harness's CLI on this machine, as the capability probe reads it. */
export interface HarnessCli {
  /** Where its CLI is, found as its sessions find it; undefined when it is not installed. */
  find: () => Promise<string | undefined>;
  /** What the probe says of a missing CLI beyond the catalog's install advice; undefined for nothing more. */
  readonly missing: string | undefined;
  /** Its version, read as its version gate reads it, for the CLI found at `path`. */
  version: (path: string) => Promise<Bounded<string | undefined>>;
}

/** What the probe reads of a harness: its kind, and its CLI. */
export interface HarnessCliRead {
  readonly cli: HarnessCli;
  readonly kind: HarnessKind;
}
