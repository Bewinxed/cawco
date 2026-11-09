/**
 * Spin-offs: sessions that run in a detached worktree of their own and are
 * kept out of the catalogs the rails read. Their worktrees and their
 * transcripts outlive the session, so a discard that comes after its
 * process ended still finds them.
 */

import { mkdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { detach } from "@cawco/core/detach";
import type { HarnessKind } from "@cawco/core/harness/kinds";
import { CAWCO_SCRATCH_TAG } from "@cawco/core/scratch-tag";
import type { SpinOffHeld } from "@cawco/core/session/controls";
import { CONTROL_SPIN_OFF_HELD } from "@cawco/core/session/controls";
import { holdingWords } from "@cawco/core/words/workspace-holding";
import { WORKSPACE_GIT_TIMEOUT_MS } from "@cawco/core/workspace/controls";
import { carryWorktree, worktreeHeld } from "./carry";
import { hashText } from "./fleet";
import type { FrameSink } from "./frame-sink";
import { expandHome } from "./fs";
import { fetchDefaultBranch, hostGit } from "./git/run";
import type { Harness } from "./harness";
import { harness as harnessOf } from "./harnesses";
import { isDirectory } from "./is-directory";
import { readJson, writeJson } from "./json-file";
import { gaugeTables } from "./memory";
import { repoTop } from "./repo-top";
import { warn } from "./session-log";

/** What the spin-offs say to the hub and read of the sessions around them. */
export interface SpinOffHost {
  /** The launch a session runs under now, by the generation its spawn named. */
  generationOf: (instanceId: string) => string | undefined;
  /** A frame to the hub. */
  sink: FrameSink;
  /** Tells the transcript index a transcript this machine deleted. */
  transcriptDeleted: (sessionId: string) => Promise<void>;
}

/** The checkout a spin-off ran in, kept until the spin-off is discarded. */
export interface Worktree {
  /**
   * The requested cwd and the default branch it was cut from (none for a
   * repository with no remote), until the opening message says whose
   * worktree this is.
   */
  announce?: { cwd: string; base: string | undefined };
  /** Where the session runs: `path`, or the same subdirectory of it. */
  dir: string;
  path: string;
  root: string;
}

/**
 * A spin-off's transcript, kept out of the catalogs the rails read. The tag
 * is the whole test there, so the harness that owns the session applies it.
 */
interface SpinOff {
  dir: string;
  harness: HarnessKind;
  sessionId?: string;
  /** Whether the tag question is closed: applied, or moved by whoever kept it. */
  tagged?: boolean;
}

export class SpinOffs {
  readonly #host: SpinOffHost;

  constructor(host: SpinOffHost) {
    this.#host = host;
    gaugeTables("supervisor", {
      worktrees: this.#worktrees,
      spinOffs: this.#running,
    });
  }

  /** Outlives its session: a discard can arrive after the query already ended. */
  readonly #worktrees = new Map<string, Worktree>();
  /** Spin-offs running here, by instance — for the same reason, same lifetime. */
  readonly #running = new Map<string, SpinOff>();

  /** The checkout `instanceId` runs in, when it is a spin-off this agent knows. */
  worktree(instanceId: string): Worktree | undefined {
    return this.#worktrees.get(instanceId);
  }

  /** The hub's record names `worktree` as `instanceId`'s checkout. */
  worktreeRecorded(instanceId: string, worktree: Worktree): void {
    this.#worktrees.set(instanceId, worktree);
  }

  /**
   * `instanceId` is spawned in `dir` on `harness`, as a spin-off or not
   * (`scratch`): each spawn says for itself, so a relaunch of one that has
   * since been kept stops being tagged as scratch.
   */
  spawned(
    instanceId: string,
    {
      dir,
      harness,
      scratch,
    }: { dir: string; harness: HarnessKind; scratch: boolean }
  ): void {
    if (scratch) {
      this.#running.set(instanceId, {
        ...this.#running.get(instanceId),
        dir,
        harness,
      });
    } else {
      this.#running.delete(instanceId);
    }
  }

  /**
   * A discarded spin-off: its worktree removed ({@link #removeWorktree}), and
   * its transcript with it unless `keepTranscript`. `worktree` and
   * `transcript` are what the stop names of it, for a spin-off this agent
   * no longer holds.
   */
  async discard(
    instanceId: string,
    {
      worktree,
      transcript,
      keepTranscript,
    }: {
      worktree: Worktree | undefined;
      transcript:
        { dir: string; sessionId: string; harness: HarnessKind } | undefined;
      keepTranscript: boolean;
    }
  ): Promise<void> {
    if (worktree) {
      this.#worktrees.set(instanceId, worktree);
    }
    await this.#removeWorktree(instanceId);
    if (!this.#running.has(instanceId) && transcript) {
      this.#running.set(instanceId, transcript);
    }
    if (!keepTranscript) {
      await this.#removeQuestSession(instanceId);
    }
  }
  /** The harness session a spin-off turned out to be writing, from its init frame. */
  noteQuestSession(
    instanceId: string,
    sessionId: string,
    harness: HarnessKind
  ): void {
    const spinOff = this.#running.get(instanceId);
    if (!spinOff || spinOff.sessionId === sessionId) {
      return;
    }
    spinOff.sessionId = sessionId;
    spinOff.harness = harness;
    spinOff.tagged = false;
  }
  /**
   * Keeps a spin-off out of the catalogs the rails read. Applied at the end of
   * the first turn rather than at init, because until the session has said
   * something there may be no transcript for a tag to live on. Fire-and-forget,
   * tried again next turn if it does not land.
   */
  tagQuest(instanceId: string, adapter: Harness): void {
    const spinOff = this.#running.get(instanceId);
    if (!spinOff?.sessionId || spinOff.tagged) {
      return;
    }
    const { sessionId, dir } = spinOff;
    spinOff.tagged = true;
    detach(
      adapter
        .tagSession(sessionId, CAWCO_SCRATCH_TAG, dir)
        .catch((error: unknown) => {
          spinOff.tagged = false;
          warn(`could not tag spin-off ${sessionId}: ${error}`);
        }),
      "adapter"
    );
  }
  /** A session whose tag someone has just set by hand is no longer ours to set. */
  closeTagging(sessionId: unknown): void {
    for (const spinOff of this.#running.values()) {
      if (spinOff.sessionId === sessionId) {
        spinOff.tagged = true;
      }
    }
  }
  /**
   * A detached checkout of `baseCwd`'s repo at `~/.worktrees/<repo>-<id8>`,
   * outside the repo so its own `git status` never sees it. A directory with
   * no commit to check out runs as it is: one in no repository, by the one
   * reading of that (repo-top.ts `repoTop`), or in a checkout with no commit
   * yet. A folder in a repository git does not read as a checkout (its
   * config says bare, its `.git` unreadable) is refused as a workspace's is,
   * never run in as it is: the spin-off would work in the live folder.
   */
  async addWorktree(instanceId: string, baseCwd: string): Promise<string> {
    const recorded = await readJson<Worktree>(worktreeRecord(instanceId));
    if (recorded) {
      this.#worktrees.set(instanceId, recorded);
      this.#recordWorktree(instanceId, recorded);
      return recorded.dir;
    }
    const root = await repoTop(baseCwd, Date.now() + WORKSPACE_GIT_TIMEOUT_MS);
    if (root === undefined) {
      return baseCwd;
    }
    // In a checkout git reads, this fails for one reason: HEAD names no commit yet.
    const at = await hostGit(baseCwd, ["rev-parse", "--show-prefix", "HEAD"]);
    if (at.exitCode !== 0) {
      return baseCwd;
    }
    const [prefix = ""] = at.text().split("\n");
    const path = expandHome(
      `~/.worktrees/${basename(root)}-${instanceId.slice(0, 8)}`
    );
    // A relaunch after a daemon restart finds its worktree already there.
    const listed = (
      await hostGit(root, ["worktree", "list", "--porcelain"])
    ).text();
    const reused = listed.split("\n").includes(`worktree ${path}`);
    if (reused) {
      throw new Error(
        `Refusing to claim an unrecorded existing worktree: ${path}`
      );
    }
    let base: string | undefined;
    if (!reused) {
      // The remote's default branch as the remote has it now, not the local
      // checkout (a shared clone's HEAD is whatever nobody updated) and not a
      // remote-tracking ref nobody fetched. A repository with no remote has
      // nothing to land on, and starts from its own HEAD.
      const hasOrigin =
        (await hostGit(root, ["remote", "get-url", "origin"])).exitCode === 0;
      base = hasOrigin ? await fetchDefaultBranch(root) : undefined;
      const commit = base ? `origin/${base}` : "HEAD";
      const added = await hostGit(root, [
        "worktree",
        "add",
        "--detach",
        path,
        commit,
      ]);
      if (added.exitCode !== 0) {
        throw new Error(
          `git worktree add failed: ${added.stderr.toString().trim()}`
        );
      }
    }

    const dir = join(path, prefix);
    const worktree = {
      path,
      root,
      dir,
      ...(reused ? {} : { announce: { cwd: baseCwd, base } }),
    };
    await mkdir(dirname(worktreeRecord(instanceId)), { recursive: true });
    await writeJson(worktreeRecord(instanceId), worktree);
    this.#worktrees.set(instanceId, worktree);
    this.#recordWorktree(instanceId, worktree);
    return dir;
  }
  /**
   * The hub's record of a spin-off's worktree: where it is, never what this
   * agent keeps of it until its opening message (`announce`), which the hub
   * does not store (core `ScratchWorktree`).
   */
  #recordWorktree(instanceId: string, { dir, path, root }: Worktree): void {
    const processGeneration = this.#host.generationOf(instanceId);
    if (processGeneration) {
      this.#host.sink({
        kind: "scratch_worktree",
        instanceId,
        processGeneration,
        worktree: { dir, path, root },
      });
    }
  }
  /** A spin-off's worktree, as this agent holds it or its record names it. */
  async #worktreeOf(instanceId: string): Promise<Worktree | undefined> {
    return (
      this.#worktrees.get(instanceId) ??
      (await readJson<Worktree>(worktreeRecord(instanceId))) ??
      undefined
    );
  }
  /** {@link CONTROL_SPIN_OFF_HELD}: what discarding the spin-off would take with its worktree. */
  async spinOffHeld(instanceId: string): Promise<SpinOffHeld | null> {
    const worktree = await this.#worktreeOf(instanceId);
    if (!(worktree && (await isDirectory(worktree.path)))) {
      return null;
    }
    const held = await worktreeHeld(worktree.path);
    return {
      ahead: held.ahead,
      dirty: held.dirty,
      holds: holdingWords({ ...held, bytes: 0 }),
      path: worktree.path,
    };
  }
  /**
   * A discarded spin-off's worktree removed, after what it holds that is
   * nowhere else (commits past every branch and remote, uncommitted and
   * untracked files) is saved to a carry (carry.ts). A carry that cannot be
   * written refuses the removal, and the worktree stays.
   */
  async #removeWorktree(instanceId: string): Promise<void> {
    const worktree = await this.#worktreeOf(instanceId);
    if (!worktree) {
      return;
    }
    if (!(await isDirectory(worktree.path))) {
      this.#worktrees.delete(instanceId);
      await rm(worktreeRecord(instanceId), { force: true });
      return;
    }

    await carryWorktree(instanceId, worktree.path);
    const removed = await hostGit(worktree.root, [
      "worktree",
      "remove",
      "--force",
      worktree.path,
    ]);
    if (removed.exitCode !== 0) {
      throw new Error(
        `git worktree remove failed: ${removed.stderr.toString().trim()}`
      );
    }
    await hostGit(worktree.root, ["worktree", "prune"]);
    this.#worktrees.delete(instanceId);
    await rm(worktreeRecord(instanceId), { force: true });
  }
  /** Discarding a spin-off throws its transcript away too. */
  async #removeQuestSession(instanceId: string): Promise<void> {
    const spinOff = this.#running.get(instanceId);
    if (!spinOff?.sessionId) {
      return;
    }
    const adapter = harnessOf(spinOff.harness);
    if (await adapter?.getSessionInfo(spinOff.sessionId, spinOff.dir)) {
      await adapter?.deleteSession(spinOff.sessionId, spinOff.dir);
      await this.#host.transcriptDeleted(spinOff.sessionId);
    }
    this.#running.delete(instanceId);
  }
}

function worktreeRecord(instanceId: string): string {
  return join(
    homedir(),
    ".cawco",
    "scratch-worktrees",
    `${hashText(instanceId)}.json`
  );
}
