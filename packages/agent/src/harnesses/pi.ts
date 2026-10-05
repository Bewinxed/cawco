/** Pi's agent adapter owns only custody and transport, never a running SDK turn. */
import { resumeCursor, type SpawnPayload } from "@cawco/core";
import type { Harness, HarnessContext, HarnessSession } from "../harness";
import { parseProcId, procIdFor } from "../proc-id";
import { procEpoch } from "../sessiond-client";
import { PiProfile } from "./pi-services";
import { adoptPi, piSessiond, piSnapshot, spawnPi } from "./pi-sessiond";

export class PiHarness extends PiProfile implements Harness {
  async spawn(
    spec: SpawnPayload,
    ctx: HarnessContext
  ): Promise<HarnessSession> {
    const credential = await this.checkCredential(spec.model);
    if (credential?.state === "dead") {
      throw new Error(credential.reason);
    }
    return await spawnPi(spec, ctx);
  }

  async custodyCandidates() {
    const welcome = await (await piSessiond()).list();
    return {
      ...welcome,
      procs: welcome.procs.filter(
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
    const welcome = await this.custodyCandidates();
    const proc = welcome.procs.find(
      (one) => one.alive && one.procId === procIdFor("pi", spec.instanceId)
    );
    return proc
      ? await this.adopt(spec.instanceId, ctx, {
          head: proc.head,
          afterSeq: resumeCursor(
            procEpoch(welcome.epoch, proc.pid),
            ctx.ingested
          ),
        })
      : undefined;
  }
}

export const piHarness: Harness = new PiHarness();
