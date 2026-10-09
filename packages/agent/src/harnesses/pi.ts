/** Pi's agent adapter owns only custody and transport, never a running SDK turn. */
import { resumeCursor, type SpawnPayload } from "@cawco/core";
import type { Harness, HarnessContext, HarnessSession } from "../harness";
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
