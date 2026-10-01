/**
 * Whether this agent is the machine's own — the one allowed to write
 * machine-wide harness config (`~/.config/opencode/opencode.json` and its
 * plugins, and everything a fleet sync converges for claude, opencode and pi).
 *
 * The signal is the machine's own cawco config: `config.json` names the hub
 * this machine joined (`cawco up` writes it). An agent talking to that hub
 * is the machine's agent; one started from a worktree against a test hub is
 * not, and must not repoint the machine's harnesses at its hub. It keeps its
 * sessions on its own hub by passing the hub per session instead.
 */

import { readConfig } from "./config";
import { delegationHubUrl } from "./delegation";

const WS_SCHEME = /^ws/;

const originOf = (url: string): string =>
  new URL(url.replace(WS_SCHEME, "http")).origin;

let decided: Promise<boolean> | undefined;

export const isMachineAgent = (): Promise<boolean> => {
  decided ??= readConfig().then((config) => {
    const own = originOf(delegationHubUrl());
    const joined = config?.hubUrl ? originOf(config.hubUrl) : undefined;
    if (own === joined) {
      return true;
    }
    console.warn(
      `[agent] not this machine's agent (hub ${own}; the machine joined ${joined ?? "no hub"}): leaving machine-wide harness config alone`
    );
    return false;
  });
  return decided;
};
