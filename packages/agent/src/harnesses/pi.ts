/** Pi's agent adapter owns only custody and transport, never a running SDK turn. */
import { resumeCursor, type SpawnPayload } from "@cawco/core";
import { workspaceSpillDir } from "@cawco/core/paths";
import type { Harness, HarnessContext, HarnessSession } from "../harness";
import type { KeeperReading } from "../keepers";
import { parseProcId, procIdFor } from "../proc-id";
import { readAccountSoon } from "../provider-usage";
import { procEpoch } from "../sessiond-client";
import { PiProfile } from "./pi-services";
import { adoptPi, piKeepers, piSnapshot, spawnPi } from "./pi-sessiond";

/** A session on an account: each turn's end reads the account's windows shortly after. */
const withAccountReads = (
  spec: SpawnPayload,
  ctx: HarnessContext
): HarnessContext => {
  const account = spec.accountDir?.accountId;
  return account
    ? {
        ...ctx,
        busy: (active) => {
          ctx.busy(active);
          if (!active) {
            readAccountSoon(account);
          }
        },
      }
    : ctx;
};

export class PiHarness extends PiProfile implements Harness {
  /**
   * pi's bash saves the whole output of a command it cuts to its host's
   * `TMPDIR` ("Full output: <tmpdir>/pi-bash-<id>.log", output-accumulator.js
   * in 1.0.1), and its `read` sends the model to the shell for a line too
   * long to show ("Use bash: sed -n …"). A workspace's pi host runs with the
   * session's own folder as its `TMPDIR` ({@link spawnPi}).
   */
  // biome-ignore lint/suspicious/useAwait: implements Harness.spill's Promise contract
  async spill(
    spec: SpawnPayload,
    _cwd: string,
    workspace: string
  ): Promise<{ dir: string; spec: SpawnPayload }> {
    return { dir: workspaceSpillDir(workspace, spec.instanceId), spec };
  }

  async spawn(
    spec: SpawnPayload,
    ctx: HarnessContext
  ): Promise<HarnessSession> {
    // The proxy's credential check is the machine's store's; a session on an
    // account runs its provider from the account's one credential.
    if (!spec.accountDir) {
      const credential = await this.checkCredential(spec.model);
      if (credential?.state === "dead") {
        throw new Error(credential.reason);
      }
    }
    return await spawnPi(spec, withAccountReads(spec, ctx));
  }

  /** The keepers there for custody to read, the current one first. */
  async custodyKeepers(): Promise<string[]> {
    await piKeepers.current();
    return await piKeepers.endpoints();
  }

  /** One keeper's word on pi's children: its listing of them, its end, or why it could not be read. */
  async custodyReading(keeper: string): Promise<KeeperReading> {
    const reading = await piKeepers.read(keeper);
    return reading.kind === "listed"
      ? {
          kind: "listed",
          procs: reading.procs.filter(
            (proc) => parseProcId(proc.procId).kind === "pi"
          ),
        }
      : reading;
  }

  /** What every keeper holds of pi's, the current keeper's first, each with its keeper's epoch. */
  async custodyCandidates() {
    await piKeepers.current();
    return {
      procs: (await piKeepers.held()).filter(
        (proc) => parseProcId(proc.procId).kind === "pi"
      ),
    };
  }

  async turnRunning(instanceId: string, _head: number): Promise<boolean> {
    return (await piSnapshot(instanceId)).busy;
  }

  adopt(
    instanceId: string,
    ctx: HarnessContext,
    options: { afterSeq?: number; head: number }
  ): Promise<HarnessSession> {
    return adoptPi(instanceId, ctx, options);
  }

  async reattach(
    spec: SpawnPayload,
    ctx: HarnessContext
  ): Promise<HarnessSession | undefined> {
    const { procs } = await this.custodyCandidates();
    const proc = procs.find(
      (one) => one.alive && one.procId === procIdFor("pi", spec.instanceId)
    );
    return proc
      ? await this.adopt(spec.instanceId, withAccountReads(spec, ctx), {
          head: proc.head,
          afterSeq: resumeCursor(procEpoch(proc.epoch, proc.pid), ctx.ingested),
        })
      : undefined;
  }
}

export const piHarness: Harness = new PiHarness();
