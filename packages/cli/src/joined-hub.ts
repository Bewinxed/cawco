import { writeConfig } from "@cawco/agent/config";
import { hubIdAt } from "@cawco/agent/discovery";

/**
 * The hub this install joins, kept in the machine's `config.json` as the
 * one it joined: its address, and its id as its `/health` says it now
 * (nothing when it does not answer, as a hub's own install before its hub
 * is up). What makes this machine's agent its own (agent machine-agent.ts),
 * the one a fleet sync is applied by, and the hub its first HTTP proofs
 * name before its socket has heard a challenge (agent hub-proof.ts). An
 * install named its hub outright, which discovery never saves (discover.ts
 * `settle`), so nothing else records it: without this, a machine added over
 * SSH refused every fleet sync and started no session (niftybot, uwucloud,
 * 2026-10-22).
 */
export async function keepJoinedHub(hubUrl: string): Promise<void> {
  const read = await hubIdAt(hubUrl);
  await writeConfig({
    hubUrl,
    hubId: read.kind === "answered" ? read.value : undefined,
  });
}
