/**
 * The agent's side of its search process (search/host.ts): the one place
 * the transcript index is asked, and where a question that runs too long
 * ends, with the process that held it.
 *
 * A question of the index (a search, a listing, a conversation's turns) is
 * given {@link READ_LIMIT_MS} from when it is asked, and may be let go
 * sooner by its asker's signal (the hub stopped waiting). Questions go to
 * the process one at a time, in the order they came: the one there is the
 * one running, so a question past its limit or let go while there is
 * stopped by killing the process (SIGKILL), and one still waiting here is
 * dropped without touching it. A killed process takes what it was doing with
 * it: the sync in flight fails, and the next one takes up where its last
 * commit left off. Another process is started at once, and opens the index.
 *
 * Work (a sync, a forget) has no deadline of its own: a catch-up runs for
 * hours. It is bounded by its steps instead: a process silent for
 * {@link SILENT_MS} while work runs is held in one step (an insert, a commit,
 * a merge, a read of OpenCode's database), and is killed; so is one that has
 * not opened the index {@link OPEN_MS} after it started, while anything
 * waits on it.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { standalone } from "@cawco/core/runtime";
import { searchWords } from "@cawco/core/words/search";
import type {
  SearchAnswer,
  SearchArg,
  SearchAsk,
  SearchOp,
  SearchSaid,
} from "./host";

/**
 * How long a question of the index is given, ms, from its ask: past it, it
 * is refused, and stopped where it runs. The hub waits 1.5 s on a machine's
 * search and 5 s on its turns (hub find.ts `TRANSCRIPT_ANSWER_MS`, server.ts
 * `FIND_TURNS_MS`) and tells the agent when it stops waiting; this bounds
 * every asker. A search of obelisk's 1.47M-document index answers in under
 * 0.8 s (fts5.ts `MARKED_CHARS`). Our call.
 */
export const READ_LIMIT_MS = 5000;
/**
 * How long the process may say nothing while work runs, ms: it beats every
 * second its thread is free (host.ts), and each step of a sync is tens of
 * ms. Our call: far past a step on a loaded disk.
 */
const SILENT_MS = 30_000;
/**
 * How long a process may take to open the index while something waits on
 * it, ms. An open reads the index's layout and its strings, and once per
 * rules version re-reads who said what (fts5.ts `#reattribute`): 986 ms on
 * obelisk's 1.47M documents. Our call: a process past this is held, never
 * still opening.
 */
const OPEN_MS = 120_000;
/** How often the silence is looked at. */
const LOOK_MS = 1000;

/** The process, run as the binary's own verb when compiled, its source under bun otherwise. */
const HOST = standalone
  ? [process.execPath, "search-host"]
  : [
      process.execPath,
      join(dirname(fileURLToPath(import.meta.url)), "host.ts"),
    ];

/** Why a question of the index got no answer: past its limit, let go, or its process gone. */
class SearchStopped extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SearchStopped";
  }
}

interface Owed {
  reject: (error: unknown) => void;
  resolve: (value: unknown) => void;
  tell?: (value: unknown) => void;
}

interface Work extends Owed {
  ask: SearchAsk;
  /** Sent to the process: work asked before it opened the index waits for that. */
  sent: boolean;
}

interface Question extends Owed {
  arg: unknown;
  /** Ends its limit's timer and its signal's listener. */
  done: () => void;
  id: number;
  op: SearchOp;
}

interface Running {
  child: Bun.Subprocess<"ignore", "inherit", "inherit">;
  /** When it last said anything, ms epoch. */
  heardAt: number;
  /** Set once it has opened the index. */
  ready: boolean;
}

export class SearchProcess {
  #running: Running | null = null;
  /** Closed: no process is started again. */
  #closed = false;
  #nextId = 0;
  /** Questions not yet sent, oldest first. */
  readonly #waiting: Question[] = [];
  /** The question the process has, if any. */
  #asked: Question | null = null;
  /** Work the process has or will have once it opens the index, by id. */
  readonly #work = new Map<number, Work>();
  readonly #look: ReturnType<typeof setInterval>;
  /** Hears how far the index is whole (ms epoch) each time a process opens it. */
  readonly #opened: (through: number) => void;

  constructor(opened: (through: number) => void) {
    this.#opened = opened;
    this.#look = setInterval(() => this.#lookAtSilence(), LOOK_MS);
    this.#look.unref();
  }

  /** The process, started now if none runs. */
  #process(): Running {
    if (this.#running) {
      return this.#running;
    }
    const child = Bun.spawn(HOST, {
      stdin: "ignore",
      stdout: "inherit",
      stderr: "inherit",
      serialization: "json",
      ipc: (said: SearchSaid) => this.#heard(running, said),
      onExit: (_, code, signal) =>
        this.#ended(
          running,
          `its search process ended (${signal ?? `exit ${code}`})`
        ),
    });
    const running: Running = { child, heardAt: Date.now(), ready: false };
    this.#running = running;
    return running;
  }

  #heard(from: Running, said: SearchSaid): void {
    if (from !== this.#running) {
      return;
    }
    from.heardAt = Date.now();
    switch (said.kind) {
      case "beat":
        return;
      case "ready":
        from.ready = true;
        this.#opened(said.through);
        for (const work of this.#work.values()) {
          if (!work.sent) {
            work.sent = true;
            from.child.send(work.ask);
          }
        }
        this.#next();
        return;
      case "unopened":
        // Every ask would meet the same: none waits for another process.
        this.#stop(`its index could not be opened: ${said.message}`, true);
        return;
      case "told":
        (this.#asked?.id === said.id
          ? this.#asked
          : this.#work.get(said.id)
        )?.tell?.(said.value);
        return;
      case "answer":
      case "failed":
        this.#settle(said);
        return;
      default: {
        const unhandled: never = said;
        throw new Error(`unhandled line: ${JSON.stringify(unhandled)}`);
      }
    }
  }

  #settle(
    said: Extract<SearchSaid, { kind: "answer" } | { kind: "failed" }>
  ): void {
    let owed: Owed | undefined;
    if (this.#asked?.id === said.id) {
      owed = this.#asked;
      this.#asked.done();
      this.#asked = null;
      this.#next();
    } else {
      owed = this.#work.get(said.id);
      this.#work.delete(said.id);
    }
    if (said.kind === "answer") {
      owed?.resolve(said.value);
    } else {
      owed?.reject(
        Object.assign(new Error(said.message), {
          ...(said.code ? { code: said.code } : {}),
        })
      );
    }
  }

  /** The next question sent, once the process has opened the index and has none. */
  #next(): void {
    const running = this.#running;
    if (!running?.ready || this.#asked) {
      return;
    }
    const question = this.#waiting.shift();
    if (!question) {
      return;
    }
    this.#asked = question;
    running.child.send({
      id: question.id,
      op: question.op,
      arg: question.arg,
    } satisfies SearchAsk);
  }

  /**
   * The process gone: what it held fails with `why` (and, with `all`, every
   * question still waiting), and what waits starts the next one.
   */
  #ended(which: Running, why: string, all = false): void {
    if (which !== this.#running) {
      return;
    }
    this.#running = null;
    const lost = new SearchStopped(why);
    for (const question of [
      ...(this.#asked ? [this.#asked] : []),
      ...(all ? this.#waiting.splice(0) : []),
    ]) {
      question.done();
      question.reject(lost);
    }
    this.#asked = null;
    for (const owed of this.#work.values()) {
      owed.reject(lost);
    }
    this.#work.clear();
    // The next process opens the index now, so the next question does not
    // wait for it; not when the index could not be opened, which every
    // process would meet again.
    if (!(all || this.#closed)) {
      this.#process();
    }
  }

  /** The process killed, wherever it is, and what it held failed with `why` ({@link #ended}). */
  #stop(why: string, all = false): void {
    const running = this.#running;
    if (!running) {
      return;
    }
    console.warn(searchWords.stopped(why));
    running.child.kill("SIGKILL");
    this.#ended(running, why, all);
  }

  #lookAtSilence(): void {
    const running = this.#running;
    if (!running) {
      return;
    }
    const silent = Date.now() - running.heardAt;
    const owed = this.#work.size > 0 || this.#waiting.length > 0;
    if (!running.ready && owed && silent > OPEN_MS) {
      this.#stop(
        `its index's process did not open it within ${OPEN_MS / 1000} s`
      );
    } else if (running.ready && this.#work.size > 0 && silent > SILENT_MS) {
      this.#stop(
        `its index's process was held ${Math.round(silent / 1000)} s in one step of a sync`
      );
    }
  }

  /**
   * `op` asked of the index, given {@link READ_LIMIT_MS} from now and let go
   * when `signal` aborts: its answer, or a {@link SearchStopped} that says
   * why there is none.
   */
  read<K extends SearchOp>(
    op: K,
    arg: SearchArg<K>,
    signal?: AbortSignal
  ): Promise<SearchAnswer<K>> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new SearchStopped("its asker let it go before it ran"));
        return;
      }
      this.#nextId += 1;
      const id = this.#nextId;
      const letGo = (why: string) => {
        if (this.#asked === question) {
          this.#stop(`${op} ${why}`);
          return;
        }
        const at = this.#waiting.indexOf(question);
        if (at >= 0) {
          this.#waiting.splice(at, 1);
          question.done();
          reject(new SearchStopped(`${why} before it ran`));
        }
      };
      const timer = setTimeout(
        () => letGo(searchWords.pastLimit(READ_LIMIT_MS / 1000)),
        READ_LIMIT_MS
      );
      const abandoned = () => letGo(searchWords.letGo);
      signal?.addEventListener("abort", abandoned, { once: true });
      const question: Question = {
        id,
        op,
        arg,
        resolve: resolve as (value: unknown) => void,
        reject,
        done: () => {
          clearTimeout(timer);
          signal?.removeEventListener("abort", abandoned);
        },
      };
      this.#waiting.push(question);
      this.#process();
      this.#next();
    });
  }

  /** `op` run in the process to its end, `tell` hearing how far it has come. */
  work<K extends SearchOp>(
    op: K,
    arg: SearchArg<K>,
    tell?: (value: unknown) => void
  ): Promise<SearchAnswer<K>> {
    return new Promise((resolve, reject) => {
      const running = this.#process();
      this.#nextId += 1;
      const ask = { id: this.#nextId, op, arg } satisfies SearchAsk;
      this.#work.set(ask.id, {
        ask,
        sent: running.ready,
        resolve: resolve as (value: unknown) => void,
        reject,
        ...(tell ? { tell } : {}),
      });
      if (running.ready) {
        running.child.send(ask);
      }
    });
  }

  close(): void {
    this.#closed = true;
    clearInterval(this.#look);
    const running = this.#running;
    if (running) {
      this.#ended(running, "the agent closed its search", true);
      running.child.kill("SIGKILL");
    }
  }
}
