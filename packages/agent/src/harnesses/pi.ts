/** Pi's agent adapter owns only custody and transport, never a running SDK turn. */

import type { RestartHold } from "@cawco/core/binary-updates";
import type { SignInFault } from "@cawco/core/harness";
import { workspaceSpillDir } from "@cawco/core/paths/workspace";
import type { SpawnPayload } from "@cawco/core/protocol";
import { resumeCursor } from "@cawco/core/stream";
import { toolVersion } from "../capabilities";
import { sessionFleetDenials } from "../denied-tools";
import type {
  Harness,
  HarnessContext,
  HarnessSession,
  KeeperCustody,
  SessionCarry,
} from "../harness";
import { cannot, noCarry } from "../harness";
import type { HarnessCli } from "../harness-cli";
import { withAccountReads } from "../provider-usage";
import { procEpoch } from "../sessiond-client";
import { resolveBin, toolGate } from "../tools";
import { keeperCustody, liveChild } from "./keeper-custody";
import { neutralSubagentChange } from "./neutral-subagents";
import { piFolderCarry } from "./pi-folder";
import { PI_SPEC, PiProfile } from "./pi-services";
import { adoptPi, piKeepers, piSnapshot, spawnPi } from "./pi-sessiond";

class PiHarness extends PiProfile implements Harness<"pi"> {
  readonly subagentChange = neutralSubagentChange;
  /** The `pi` on the machine's PATH, its version its `--version`. */
  readonly cli: HarnessCli = {
    find: () => Promise.resolve(resolveBin("pi")),
    missing: undefined,
    version: toolVersion,
  };
  /** Its stored conversations are session files, read from disk. */
  readonly catalogFromServer = false;
  /** A spawn checks its sign-in, which can move its word between reports. */
  readonly authMovesLive = true;
  /** Its `detect` reads its registry and sign-ins in-process, which a tool move does not re-read unasked. */
  readonly detectStartsNothing = false;
  /** No heal control reaches its sessions: each reconnects its fleet servers through its own `/mcp reconnect`. */
  readonly healsFleetMcp = false;
  /** Its `/compact` runs in its session's own pi host, which holds no epoch to replay. */
  readonly relaunchesOnManualCompact = false;
  /** Its sign-in faults are its credential checks' ({@link authReason}); no home sign-in of its own is refused apart. */
  readonly signInFaults: SignInFault[] = [];

  /** Each session reads its account's credential at its start; nothing of the harness holds the machine's provider accounts. */
  accountsChanged(): Promise<void> {
    return Promise.resolve();
  }

  readonly folderCarry = piFolderCarry;

  /** Its sessions keep no account dir: a session on another account runs its provider from that account's credential (descriptor `accountDir`). */
  carrier(): SessionCarry {
    return noCarry(
      "A pi session keeps no account dir: it runs on another account's credential with its conversation where it is."
    );
  }

  /** Its sessions' MCP servers reconnect to a restarted hub by themselves. */
  hubRestarted(): Promise<void> {
    return Promise.resolve();
  }

  /** Every turn runs in its session's own keeper-held pi host, which an agent's restart leaves running. */
  restartHolds(): RestartHold[] {
    return [];
  }

  readonly providerList = cannot(
    "pi's providers are its registry's, read with how each signs in (provider-accounts.ts `piProviders`)"
  );

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
    // THE VERSION FLOOR: no pi session starts beside a pi CLI that reads the
    // shared `~/.pi/agent/` files by other rules (core PI_VERSION_FLOOR), on
    // a start, a wake or a relaunch alike.
    const gate = await toolGate(PI_SPEC);
    if (gate.refused) {
      throw new Error(gate.words);
    }
    // pi's sign-in check is the machine's store's; a session on an account
    // runs its provider from the account's one credential.
    if (!spec.accountDir) {
      const credential = await this.checkCredential(spec.model);
      if (credential?.state === "signed-out") {
        throw new Error(credential.reason);
      }
    }
    // The fleet's baseline and the own-list set beside the spawn's own
    // denials, as every harness takes them (denied-tools.ts
    // `sessionFleetDenials`): its host maps them to pi's names (core
    // `piToolsFor`), and pi has no list or plan mode, so the set maps to none.
    const fleet = await sessionFleetDenials();
    return await spawnPi(
      {
        ...spec,
        denyTools: [...new Set([...fleet, ...(spec.denyTools ?? [])])],
      },
      withAccountReads(spec, ctx)
    );
  }

  /** The children every keeper holds of pi's; {@link adopt} takes one back. */
  readonly custody: KeeperCustody = {
    kind: "keeper",
    ...keeperCustody("pi", piKeepers),
    adopt: (spec, ctx, options) => this.adopt(spec, ctx, options),
    turnRunning: (instanceId, head) => this.turnRunning(instanceId, head),
  };

  async turnRunning(instanceId: string, _head: number): Promise<boolean> {
    return (await piSnapshot(instanceId)).busy;
  }

  /**
   * A pi host taken back after an agent restart. Its gate, denials and
   * model are the host's own, set as it started and kept in its process;
   * the agent's side reads its account as a launch does, from the spawn the
   * hub sent ({@link withAccountReads}).
   */
  adopt(
    spec: SpawnPayload,
    ctx: HarnessContext,
    options: { afterSeq?: number; head: number }
  ): Promise<HarnessSession> {
    return adoptPi(spec.instanceId, withAccountReads(spec, ctx), options);
  }

  async reattach(
    spec: SpawnPayload,
    ctx: HarnessContext
  ): Promise<HarnessSession | undefined> {
    const proc = await liveChild(this.custody, "pi", spec.instanceId);
    return proc
      ? await this.adopt(spec, ctx, {
          head: proc.head,
          afterSeq: resumeCursor(procEpoch(proc.epoch, proc.pid), ctx.ingested),
        })
      : undefined;
  }
}

export const piHarness: Harness<"pi"> = new PiHarness();
