/**
 * Whether this agent is the machine's own — the one allowed to write
 * machine-wide harness config (`~/.config/opencode/opencode.json` and its
 * plugins, and everything a fleet sync converges for claude, opencode and pi)
 * and to start the machine's OpenCode server.
 *
 * The signal is the machine's own cawco config: `config.json` names the hub
 * this machine joined (`cawco up` writes it). An agent talking to that hub is
 * the machine's agent; one started from a worktree against a test hub is not,
 * and must not repoint the machine's harnesses at its hub. It keeps its
 * sessions on its own hub by passing the hub per session instead.
 *
 * "That hub" is the hub, not its address. A machine reaches one hub by more
 * than one address (its LAN address, a Tailscale name, its mDNS name, an
 * address a service unit or `--hub` names that `config.json` does not), and
 * comparing addresses alone told such a machine's own agent it was not, so it
 * never started OpenCode. So the same address as the one joined is the
 * machine's agent at once; any other is when the hub at it has the id of the
 * hub the machine joined (hub hub-id.ts, said by each hub's `/health`).
 *
 * NEVER AN UNDECIDED ANSWER. Every caller acts on the answer it gets once
 * (OpenCode's server takes its config from it as it starts), so an answer
 * given before both ids were read would stick. Until both hubs have said
 * their ids, the answer waits, asking again every few seconds; the joined
 * hub's id is recorded in `config.json` (`hubId`) once read, so a joined
 * address that stops answering later still decides it.
 */

import { readConfig, writeConfig } from "./config";
import { delegationHubUrl } from "./delegation";

const WS_SCHEME = /^ws/;

const originOf = (url: string): string =>
  new URL(url.replace(WS_SCHEME, "http")).origin;

/** How long a hub that did not say its id is left before it is asked again. */
const ASK_AGAIN_MS = 5000;

/** A hub's id, off its `/health`; undefined when it does not answer. */
const idAt = async (origin: string): Promise<string | undefined> => {
  const answer = await fetch(`${origin}/health`, {
    signal: AbortSignal.timeout(3000),
  })
    .then((response) => response.json() as Promise<{ hubId?: unknown }>)
    .catch(() => undefined);
  return typeof answer?.hubId === "string" && answer.hubId
    ? answer.hubId
    : undefined;
};

/** The hubs that have not said their ids yet, in words. */
const silent = (
  own: string,
  ownId: string | undefined,
  joined: string,
  joinedId: string | undefined
): string =>
  [
    ownId ? undefined : `the hub at ${own}`,
    joinedId ? undefined : `the hub it joined at ${joined}`,
  ]
    .filter(Boolean)
    .join(" and ");

/** The answer for one (hub address, joined address) pair, decided once. */
let decided: { answer: Promise<boolean>; key: string } | undefined;

/** Both hubs' ids, asked until both have answered, then compared. */
const decide = async (
  own: string,
  joined: string,
  recorded: string | undefined
): Promise<boolean> => {
  let waited = false;
  for (;;) {
    // biome-ignore lint/performance/noAwaitInLoops: each ask waits for the one before it, until both hubs answer
    const [ownId, joinedId] = await Promise.all([
      idAt(own),
      recorded ?? idAt(joined),
    ]);
    if (ownId && joinedId) {
      if (!recorded) {
        await writeConfig({ hubId: joinedId });
      }
      const same = ownId === joinedId;
      console.warn(
        same
          ? `[agent] this machine's agent: the hub at ${own} is the one it joined at ${joined} (hub ${joinedId.slice(0, 8)})`
          : `[agent] not this machine's agent (hub ${own} ${ownId.slice(0, 8)}; the machine joined ${joined} ${joinedId.slice(0, 8)}): leaving machine-wide harness config alone`
      );
      return same;
    }
    if (!waited) {
      waited = true;
      console.warn(
        `[agent] whether this is the machine's agent waits for ${silent(own, ownId, joined, joinedId)} to say its id`
      );
    }
    await Bun.sleep(ASK_AGAIN_MS);
  }
};

export const isMachineAgent = async (): Promise<boolean> => {
  const config = await readConfig();
  const own = originOf(delegationHubUrl());
  const joined = config?.hubUrl ? originOf(config.hubUrl) : undefined;
  if (own === joined) {
    return true;
  }
  if (!joined) {
    return false;
  }
  const key = `${own} ${joined}`;
  if (decided?.key !== key) {
    decided = { key, answer: decide(own, joined, config?.hubId) };
  }
  return await decided.answer;
};
