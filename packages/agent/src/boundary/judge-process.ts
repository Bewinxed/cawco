/**
 * The workspace's judge process, as the agent starts and follows it: one start
 * of each form however many ask, its exit answered, and whether a workspace is
 * between states its hook and judge move through.
 */

import { createHash } from "node:crypto";
import { basename, join } from "node:path";
import { currentEndpoint } from "@cawco/core/keepers";
import { workspaceDoorDir } from "@cawco/core/paths/workspace";
import { trustedPath } from "@cawco/core/workspace-needs";
import { BUN_SCRIPT_ENV } from "../bun-runtime";
import { isJudgeOf, JUDGE_FORM_LENGTH, judgeProcId } from "../proc-id";
import type { SessiondClient } from "../sessiond-client";
import { socketPlace } from "../tool-door";
import { ready } from "./exec";
import {
  bunRuntime,
  JUDGE_SCRIPT,
  JUDGE_SERVER,
  type JudgeAt,
  judgeBuildOf,
  judgeHanded,
  judgeScripts,
  socketAddress,
} from "./hook-judge";
import { JUDGE_PROTOCOL_FILE, JUDGE_READY, judgeArgv } from "./protocol";
import {
  type Held,
  holding,
  isClosing,
  isStarting,
  readHeld,
  refusal,
  sessiond,
  sessiondPath,
  stateDir,
  type UnaskedCalls,
  writeWhole,
} from "./state";

/** The judges starting now, by their sessiond id: one start each, however many ask. */
const judging = new Map<string, Promise<void>>();

/**
 * How many arms of each workspace's hook are under way ({@link armHook}),
 * from a judge's exit to its start again too ({@link watchJudge}): its hook
 * may name a judge that is going while it is.
 */
const arming = new Map<string, number>();

/** Runs `arm` with workspace `id` counted as {@link arming}. */
export const whileArming = async <T>(
  id: string,
  arm: () => Promise<T>
): Promise<T> => {
  arming.set(id, (arming.get(id) ?? 0) + 1);
  try {
    return await arm();
  } finally {
    const left = (arming.get(id) ?? 1) - 1;
    if (left > 0) {
      arming.set(id, left);
    } else {
      arming.delete(id);
    }
  }
};

/** The judges whose exit this agent watches, by their sessiond id, each with the connection it watches on. */
const watchedJudges = new Map<string, SessiondClient>();

/**
 * Whether workspace `id` is between states its hook and judge move through:
 * its boundary starting or closing, its hook being armed, its judge starting.
 */
export const settling = (id: string): boolean =>
  isStarting(id) ||
  isClosing(id) ||
  arming.has(id) ||
  [...judging.keys()].some((procId) => isJudgeOf(procId, id));

/**
 * The workspace's judge, running: `boundary-judge.ts` on {@link bunRuntime},
 * held by sessiond like the boundary, so it outlives the agent and every CLI
 * keeps asking it. It and the judge beside it (which OpenCode's plugin
 * imports too) are written into the state dir first.
 *
 * Its form is a hash of what it runs and is handed, the keeper it runs on and
 * the dir it listens in; one of each form runs,
 * on its own socket (`judge-<form>.sock` in `workspaceDoorDir`), under its own sessiond id. So a new
 * build's judge starts beside the old one, and the hook is pointed at it only
 * once it answers: a hook already running still reaches the old one, which
 * leaves on its own once the hook has not named it for as long as a hook
 * lives (`boundary-judge.ts`). One that exits otherwise is started again
 * ({@link watchJudge}). Refuses the workspace when it cannot start.
 */
export const judgeFor = async (
  id: string,
  held: Pick<Held, "exec">,
  hook: string,
  policy: string,
  unasked: UnaskedCalls
): Promise<JudgeAt> => {
  const runtime = await bunRuntime(id);
  const scripts = await judgeScripts();
  const [judgeText, serverText, protocolText] = scripts;
  const server = join(stateDir(id), JUDGE_SERVER);
  const handed = judgeHanded(id, held.exec, hook, policy);
  // The keeper it runs on is part of its form: after a keeper handover, the
  // next arming starts the workspace's judge on the current keeper, beside the
  // one a retiring keeper runs, which leaves once the hook no longer names it.
  // So the retiring keeper is left holding nothing of the workspace.
  const keeper = basename(await currentEndpoint(sessiondPath()));
  // In the workspace's socket dir, not its state dir: under a deep HOME the
  // state dir's path passes a socket's length, and the hook's
  // `pack_sockaddr_un` would cut it to a name nothing listens on.
  const place = workspaceDoorDir(id);
  // Where it listens is part of its form too, as the socket is one of what
  // it is handed: a judge is found running by its form alone, and one an
  // earlier build started with the same scripts on the same keeper but in
  // another place (the state dir, before be056a0e) listens where this hook
  // would not look. Its form differs, so this build's starts at once beside
  // it, and the hook names a judge that answers.
  const form = createHash("sha256")
    .update(
      [
        serverText,
        judgeText,
        protocolText,
        ...Object.values(handed),
        keeper,
        place,
      ].join("\0")
    )
    .digest("hex")
    .slice(0, JUDGE_FORM_LENGTH);
  // A judge of this form may be listening there already, so nothing is removed.
  const socket = join(place, `judge-${form}.sock`);
  await socketPlace(socket, "the workspace's judge");
  const procId = judgeProcId(id, form);
  // Written each time: OpenCode's plugin imports this build's judge from here.
  await Promise.all([
    writeWhole(join(stateDir(id), JUDGE_SCRIPT), judgeText, 0o644),
    writeWhole(join(stateDir(id), JUDGE_PROTOCOL_FILE), protocolText, 0o644),
    writeWhole(server, serverText, 0o644),
  ]);
  let started = judging.get(procId);
  if (!started) {
    started = (async () => {
      const client = await sessiond();
      if (await holding(procId)) {
        return;
      }
      await client.spawnProc(procId, {
        command: runtime,
        // Its build last: what it answers when asked which it runs.
        args: [
          server,
          ...judgeArgv({ socket, ...handed, build: judgeBuildOf(scripts) }),
        ],
        // Bun reads bunfig.toml and .env from where it starts: the state dir,
        // which nothing inside the boundary writes.
        cwd: stateDir(id),
        env: {
          ...BUN_SCRIPT_ENV,
          PATH: trustedPath(),
        },
        workspace: true,
      });
      await ready(client, procId, JUDGE_READY, "its judge").catch(
        (error: Error) => {
          throw refusal(id, error.message);
        }
      );
      console.info(`[workspace] ${id}: its judge (form ${form}) is running`);
    })().finally(() => judging.delete(procId));
    judging.set(procId, started);
  }
  await started;
  await watchJudge(id, procId, unasked);
  return { socket, address: await socketAddress(id, socket) };
};

/**
 * Starts the workspace's judge again when it exits while the workspace is
 * still held, by arming its hook again ({@link armHook}): a crashed judge
 * would refuse every call. One that left because a newer judge took over, or
 * the workspace closed, finds the current one running, or no workspace. A
 * watch lives on its sessiond connection, so a new connection watches again.
 */
const watchJudge = async (
  id: string,
  procId: string,
  unasked: UnaskedCalls
): Promise<void> => {
  const client = await sessiond();
  if (watchedJudges.get(procId) === client) {
    return;
  }
  watchedJudges.set(procId, client);
  let stop = (): void => undefined;
  stop = client.subscribe(procId, {
    line: () => undefined,
    exit: (code, signal, pid) => {
      watchedJudges.delete(procId);
      stop();
      client.release(procId, pid);
      // Counted as arming from its exit until it is started again, as the
      // handover decides ({@link armStep}).
      whileArming(id, async () => {
        const held = await readHeld(id);
        if (held) {
          console.warn(
            `[workspace] ${id}: its judge ${procId} exited (${signal ?? `code ${code}`}); arming its hook again`
          );
        }
        await unasked.judgeExited(id, held !== undefined);
      }).catch((error: unknown) => {
        console.warn(
          `[workspace] ${id}: its judge could not be started again: ${error instanceof Error ? error.message : String(error)}`
        );
      });
    },
  });
};
