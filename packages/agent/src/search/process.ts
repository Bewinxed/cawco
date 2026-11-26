/**
 * The agent's side of its search processes (search/host.ts): the one place
 * the transcript index is asked, and where a question that runs too long
 * ends, with the process that held it. The agent runs three: the index's
 * writer, which syncs it, and two readers beside it, which answer questions:
 * one a person's typing asks, one agents' `find` asks (search/index.ts).
 *
 * A question of the index (a search, a listing, a conversation's turns) goes
 * to a reader, and is given {@link TRANSCRIPT_READ_LIMIT_MS} from when it is asked,
 * and may be let go sooner by its asker's signal (the hub stopped waiting).
 * Questions go to the reader one at a time, in the order they came: the one
 * there is the one running. One past its limit there is stopped by killing
 * the reader (SIGKILL), and another reader is started at once and opens the
 * index. One let go there is answered as let go at once and left to finish,
 * its answer dropped: the reader stays warm for the next, which a person
 * typing in find asks 60 ms later, each keystroke letting the last go. A
 * question let go that still holds the reader {@link LET_GO_MS} on, while
 * another waits, is stopped as one past its limit is: past that, a new
 * reader answers sooner. One still waiting here is dropped without touching
 * it. The writer is never stopped for a question: a search let go while a
 * sync runs takes nothing of the sync with it.
 *
 * Work (a sync, a forget) goes to the writer, and has no deadline of its
 * own: a catch-up runs for hours. It is bounded by its steps instead: a
 * writer silent for {@link SILENT_MS} while work runs is held in one step
 * (an insert, a commit, a merge, a read of OpenCode's database), and is
 * killed; the sync it held fails, and the next one takes up where its last
 * commit left off. Either process that has not opened the index
 * {@link OPEN_MS} after it started, while anything waits on it, is killed.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TRANSCRIPT_READ_LIMIT_MS } from "@cawco/core/find";
import {
  keepLimitReadings,
  recordLimitReading,
  timed,
} from "@cawco/core/limit-readings";
import { standalone } from "@cawco/core/runtime";
import { unhandled } from "@cawco/core/unhandled";
import { searchWords } from "@cawco/core/words/search";
import { Deferred, Exit, Schema } from "effect";
import { runPromise } from "../daemon-runtime";
import type {
  RoleOp,
  SearchAnswer,
  SearchArg,
  SearchAsk,
  SearchOp,
  SearchRole,
  SearchSaid,
} from "./host";

/**
 * How long a question let go while it runs may go on holding the reader
 * while another waits, ms: about what a new reader takes to start, open the
 * index and answer (62-66 ms on a copy of obelisk's 2.04M-record index,
 * bun 1.4.4), so a question that waits behind one let go waits at most
 * about twice what a restart would have cost it. Our call.
 */
const LET_GO_MS = 100;
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

/** The process in `role`, run as the binary's own verb when compiled, its source under bun otherwise. */
const host = (role: SearchRole): string[] =>
  standalone
    ? [process.execPath, "search-host", role]
    : [
        process.execPath,
        join(dirname(fileURLToPath(import.meta.url)), "host.ts"),
        role,
      ];

/** Why a question of the index got no answer: past its limit, let go, or its process gone. */
class SearchStopped extends Schema.TaggedError<SearchStopped>()(
  "SearchStopped",
  {
    message: Schema.String,
  }
) {}

interface Owed {
  /**
   * Its answer, or why there is none. Platform gap: the answer crosses the
   * process boundary over Bun's IPC, which hands it on as `any` (read as
   * `unknown`, `SearchSaid`), and the asks of every op wait by id, whose op
   * TypeScript cannot correlate with the answer (microsoft/TypeScript#30581).
   * The process answers id `id` with op `op`'s own answer (host.ts
   * `SearchOps`).
   */
  answer: Deferred.Deferred<unknown, unknown>;
  tell?: (value: unknown) => void;
}

/** `owed` answered with `value`. */
const answer = (owed: Owed, value: unknown): void => {
  Deferred.doneUnsafe(owed.answer, Exit.succeed(value));
};

/** `owed` refused with `error`. */
const refuse = (owed: Owed, error: unknown): void => {
  Deferred.doneUnsafe(owed.answer, Exit.fail(error));
};

/** The promise edge of `owed`'s answer, as op `K`'s (the platform gap in {@link Owed}). */
const answered = <A>(owed: Owed): Promise<A> =>
  runPromise(Deferred.await(owed.answer)) as Promise<A>;

interface Work extends Owed {
  ask: SearchAsk;
  /** Sent to the process: work asked before it opened the index waits for that. */
  sent: boolean;
}

interface Question extends Owed {
  arg: SearchArg<SearchOp>;
  /** Ends its timers and its signal's listener. */
  done: () => void;
  id: number;
  /** When its asker let it go while it ran, ms epoch: answered as let go, its answer dropped when it comes. */
  letGoAt?: number;
  op: SearchOp;
}

interface Running {
  child: Bun.Subprocess<"ignore", "inherit", "inherit">;
  /** When it last said anything, ms epoch. */
  heardAt: number;
  /** Set once it has opened the index. */
  ready: boolean;
}

export class SearchProcess<R extends SearchRole> {
  readonly #role: R;
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

  /** Done once a process of this role has first opened the index, or failed to. */
  readonly #firstOpen = Deferred.makeUnsafe<void>();
  /** The promise edge of {@link #firstOpen}. */
  readonly firstOpen = runPromise(Deferred.await(this.#firstOpen));
  /** No process is started until `after` settles: what is asked meanwhile waits here. */
  #gated: boolean;

  /**
   * `role`'s process (search/host.ts), started at its first ask once
   * `after` has settled; `opened` hears how far the index is whole each
   * time one opens it. A reader starts after the writer has first opened
   * the index: the writer makes the file, and brings an older layout up to
   * date by making it anew (jsonl-parser fts5.ts `#rebuild`), which a reader
   * opened before would never see.
   */
  constructor(
    role: R,
    opened: (through: number) => void,
    after?: Promise<void>
  ) {
    this.#role = role;
    this.#opened = opened;
    this.#gated = after !== undefined;
    after?.then(() => {
      this.#gated = false;
      if (this.#waiting.length > 0 && !this.#closed) {
        this.#process();
      }
    });
    this.#look = setInterval(() => this.#lookAtSilence(), LOOK_MS);
    this.#look.unref();
  }

  /** The process, started now if none runs. */
  #process(): Running {
    if (this.#running) {
      return this.#running;
    }
    const child = Bun.spawn(host(this.#role), {
      env: process.env,
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
        keepLimitReadings(said.readings ?? []);
        return;
      case "ready":
        from.ready = true;
        this.#opened(said.through);
        Deferred.doneUnsafe(this.#firstOpen, Exit.void);
        for (const work of this.#work.values()) {
          if (!work.sent) {
            work.sent = true;
            from.child.send(work.ask);
          }
        }
        this.#next();
        return;
      case "unopened":
        Deferred.doneUnsafe(this.#firstOpen, Exit.void);
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
      default:
        unhandled("line", said);
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
    if (!owed) {
      return;
    }
    if (said.kind === "answer") {
      answer(owed, said.value);
    } else {
      refuse(
        owed,
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
    const lost = new SearchStopped({ message: why });
    for (const question of [
      ...(this.#asked ? [this.#asked] : []),
      ...(all ? this.#waiting.splice(0) : []),
    ]) {
      question.done();
      refuse(question, lost);
    }
    this.#asked = null;
    for (const owed of this.#work.values()) {
      refuse(owed, lost);
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

  /**
   * The reader freed of a question let go {@link LET_GO_MS} ago or more
   * that still runs, when another waits: stopped, and the next question
   * asked of a new reader.
   */
  #unheld(): void {
    const letGoAt = this.#asked?.letGoAt;
    if (
      letGoAt !== undefined &&
      this.#waiting.length > 0 &&
      Date.now() - letGoAt >= LET_GO_MS
    ) {
      this.#stop(
        `${this.#asked?.op} ${searchWords.letGo}, and held the reader ${LET_GO_MS} ms on`
      );
    }
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
        `its index's ${this.#role === "write" ? "writer" : "reader"} did not open it within ${OPEN_MS / 1000} s`
      );
    } else if (running.ready && this.#work.size > 0 && silent > SILENT_MS) {
      this.#stop(
        `its index's writer was held ${Math.round(silent / 1000)} s in one step of a sync`
      );
    }
  }

  /**
   * `op` asked of the index, given {@link TRANSCRIPT_READ_LIMIT_MS} from now and let go
   * when `signal` aborts: its answer, or a {@link SearchStopped} that says
   * why there is none.
   */
  read<K extends RoleOp<"read">>(
    this: SearchProcess<"read">,
    op: K,
    arg: SearchArg<K>,
    signal?: AbortSignal
  ): Promise<SearchAnswer<K>> {
    if (signal?.aborted) {
      return Promise.reject(
        new SearchStopped({ message: "its asker let it go before it ran" })
      );
    }
    this.#nextId += 1;
    const id = this.#nextId;
    /** Set once it is let go while it runs: when it is looked at again ({@link #unheld}). */
    let held: ReturnType<typeof setTimeout> | undefined;
    /** Its asker answered `why`: dropped while it waits; while it runs, stopped with the reader past its limit, left to finish when let go. */
    const end = (why: string, pastLimit: boolean) => {
      if (this.#asked === question) {
        if (pastLimit) {
          this.#stop(`${op} ${why}`);
          return;
        }
        signal?.removeEventListener("abort", abandoned);
        question.letGoAt = Date.now();
        refuse(question, new SearchStopped({ message: `${why} while it ran` }));
        held = setTimeout(() => this.#unheld(), LET_GO_MS);
        return;
      }
      const at = this.#waiting.indexOf(question);
      if (at >= 0) {
        this.#waiting.splice(at, 1);
        question.done();
        refuse(
          question,
          new SearchStopped({ message: `${why} before it ran` })
        );
      }
    };
    const timer = setTimeout(
      () => end(searchWords.pastLimit(TRANSCRIPT_READ_LIMIT_MS / 1000), true),
      TRANSCRIPT_READ_LIMIT_MS
    );
    const abandoned = () => end(searchWords.letGo, false);
    signal?.addEventListener("abort", abandoned, { once: true });
    const question: Question = {
      id,
      op,
      arg,
      answer: Deferred.makeUnsafe<unknown, unknown>(),
      done: () => {
        clearTimeout(timer);
        clearTimeout(held);
        signal?.removeEventListener("abort", abandoned);
      },
    };
    this.#waiting.push(question);
    if (!this.#gated) {
      this.#process();
      this.#next();
      this.#unheld();
    }
    return timed(answered<SearchAnswer<K>>(question), (ms) =>
      recordLimitReading("agent.search-read-ms", ms)
    );
  }

  /** `op` run in the process to its end, `tell` hearing how far it has come. */
  work<K extends RoleOp<"write">>(
    this: SearchProcess<"write">,
    op: K,
    arg: SearchArg<K>,
    tell?: (value: unknown) => void
  ): Promise<SearchAnswer<K>> {
    const running = this.#process();
    this.#nextId += 1;
    const ask = { id: this.#nextId, op, arg } satisfies SearchAsk;
    const work: Work = {
      ask,
      sent: running.ready,
      answer: Deferred.makeUnsafe<unknown, unknown>(),
      ...(tell ? { tell } : {}),
    };
    this.#work.set(ask.id, work);
    if (running.ready) {
      running.child.send(ask);
    }
    return answered<SearchAnswer<K>>(work);
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
