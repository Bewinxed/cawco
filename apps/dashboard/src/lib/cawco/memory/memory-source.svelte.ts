/**
 * A project's memory as its Memory view and fact-file card read it (core
 * memory-view.ts): the hub's page, one file line by line, one note whole,
 * and what the person does from there. One seam (`MemorySource`) with two
 * sides: `LiveMemory`, the hub's, kept live by `memory.changed`, reconnects,
 * the tab coming back and a five-second read while the curator runs; and
 * `FixtureMemory`, the states file's, drawn from fixture project folders
 * run through the hub's own parsers (scripts/memory-fixtures.ts).
 *
 * Nothing is optimistic: an answer to a proposal is the same
 * `permission.answer` command every card sends, and a row becomes its
 * result when the hub says so (DESIGN.md, The Stay In Context Rule).
 */
import {
  MEMORY_PROPOSAL_TOOL,
  type MemoryArchiveProposed,
  type MemoryFileView,
  type MemoryPage,
  type MemoryRunStarted,
  memoryViewWords,
} from "@cawco/core";
import { untrack } from "svelte";
import {
  answerFor,
  cawco,
  type PendingPermission,
  type PermissionAnswer,
  permissionAnswer,
  startThread,
  submitCommand,
} from "#lib/cawco/client.svelte.js";
import { failureWords } from "#lib/cawco/hub-read.js";
import { json, send } from "#lib/cawco/project-tasks.js";

/** One commit of a memory file, as the folder's history answers it (hub project-folder.ts `FolderChange`). */
export interface MemoryChange {
  author: string;
  /** ISO time. */
  date: string;
  message: string;
  sha: string;
}

/** Where an answer to a proposal stands, as its card draws it. */
export interface AnswerState {
  /** The pressed peer, while its answer is out. */
  pending: PermissionAnswer | null;
  /** The hub's refusal of the last answer, in its words. */
  refused: string | null;
}

/** What the Memory view and its file card read, and what they ask the hub to do. */
export interface MemorySource {
  /** The person's answer to a proposal's card. */
  answer: (proposal: string, kind: "allow" | "deny") => void;
  answerOf: (proposal: string) => AnswerState;
  /** Archive unused: a proposal for one file, or every file. */
  archive: (path?: string) => Promise<MemoryArchiveProposed>;
  /** The proposal's card as the hub parked it: its presentation, its diff. */
  ask: (proposal: string) => PendingPermission | null;
  /** Curate now: the curator's run, started. */
  curate: () => Promise<MemoryRunStarted>;
  /** One memory file, line by line. */
  file: (path: string) => Promise<MemoryFileView>;
  /** Fold one fact file: the curator's run, asked for it. */
  fold: (path: string) => Promise<MemoryRunStarted>;
  /** How many times the page has been read: a file card reads again with it. */
  readonly generation: number;
  /** A file's commits, newest first: who changed it, when, and why. */
  history: (path: string) => Promise<MemoryChange[]>;
  /** Keeps the page live while a view shows it; the cleanup stops it. */
  keep: () => () => void;
  /** Make a note: the person's words into AGENTS.md's `## Notes`, as the Caw thread message that says so ({@link tellCaw}). */
  makeNote: (text: string) => Promise<void>;
  readonly page: MemoryPage | null;
  /** Why the last read failed while nothing has been read. */
  readonly problem: string | null;
  read: () => Promise<void>;
  /** Reshape the fact files: the curator's run, asked for one. */
  reshape: () => Promise<MemoryRunStarted>;
  /** How far this device's clock runs ahead of the hub's as the page was read, ms: ages are told on the hub's clock. */
  readonly skew: number;
  /**
   * Words to Caw in a new thread of the project, under the id the composer
   * chose for them: "Make a note: …" is kept in AGENTS.md, waking no one.
   * Answers the thread.
   */
  tellCaw: (text: string, id?: string) => Promise<string>;
  /** Withdraw an inbox note: it leaves for the notes archive, its lone facts proposed with it. */
  withdraw: (note: string) => Promise<void>;
  /** Withdraw one of the person's own notes from AGENTS.md. */
  withdrawYours: (text: string) => Promise<void>;
}

const base = (projectId: string) =>
  `/api/projects/${encodeURIComponent(projectId)}/memory`;

/** While the curator's run goes, the page is read every this many ms (a delegate's run notes nothing on the socket). */
const RUN_READ_MS = 5000;

/** The memory proposals parked for one project: their input names it (hub memory.ts `proposalInput`). */
export const memoryAsksOf = (projectId: string): PendingPermission[] =>
  cawco.blocked
    .map((blocked) => blocked.request)
    .filter(
      (request) =>
        request.toolName === MEMORY_PROPOSAL_TOOL &&
        request.input.projectId === projectId
    );

/** The hub's project memory, read and kept live. */
export class LiveMemory implements MemorySource {
  page = $state<MemoryPage | null>(null);
  problem = $state<string | null>(null);
  generation = $state(0);
  skew = $state(0);
  readonly #projectId: () => string;
  /** The project the page holds: a read for another project starts from nothing, a reconnect keeps it. */
  #pageOf = "";
  #reads = 0;
  #pressed = $state<Record<string, PermissionAnswer>>({});

  constructor(projectId: () => string) {
    this.#projectId = projectId;
  }

  async read(): Promise<void> {
    const id = this.#projectId();
    this.#reads += 1;
    const ticket = this.#reads;
    try {
      const next = await send<MemoryPage>(base(id));
      if (id === this.#projectId() && ticket === this.#reads) {
        this.page = next;
        this.#pageOf = id;
        this.skew = Date.now() - next.now;
        this.problem = null;
        this.generation += 1;
      }
    } catch (error) {
      if (id === this.#projectId() && ticket === this.#reads) {
        this.problem = failureWords(error);
      }
    }
  }

  /** The curator's run goes now: the page is read every few seconds. */
  get #running(): boolean {
    const state = this.page?.curator?.last?.state;
    return state === "starting" || state === "running" || state === "queued";
  }

  keep(): () => void {
    let readFor = "";
    let seen = -1;
    const stops = [
      $effect.root(() => {
        // On arrival, on every reconnect, and for another project; only
        // another project's read starts from nothing (a reconnect keeps
        // the page and its scroll while it reads again).
        $effect(() => {
          const id = this.#projectId();
          if (cawco.status !== "connected") {
            readFor = "";
            return;
          }
          if (readFor !== id) {
            readFor = id;
            untrack(() => {
              if (this.#pageOf !== id) {
                this.page = null;
                this.problem = null;
              }
              this.read();
            });
          }
        });
        // The hub says the project's memory changed.
        $effect(() => {
          const changes = cawco.memoryChangedOf(this.#projectId());
          if (seen !== -1 && changes !== seen) {
            untrack(() => this.read());
          }
          seen = changes;
        });
        // A proposal parked or answered elsewhere.
        let asksSeen: string | null = null;
        $effect(() => {
          const asks = memoryAsksOf(this.#projectId())
            .map((ask) => ask.requestId)
            .join();
          if (asksSeen !== null && asks !== asksSeen) {
            untrack(() => this.read());
          }
          asksSeen = asks;
        });
        $effect(() => {
          if (!this.#running) {
            return;
          }
          const tick = setInterval(() => {
            // biome-ignore lint/complexity/noVoid: the re-read sets its own state
            void this.read();
          }, RUN_READ_MS);
          return () => clearInterval(tick);
        });
      }),
    ];
    const back = () => {
      if (document.visibilityState === "visible") {
        // biome-ignore lint/complexity/noVoid: the re-read sets its own state
        void this.read();
      }
    };
    document.addEventListener("visibilitychange", back);
    return () => {
      for (const stop of stops) {
        stop();
      }
      document.removeEventListener("visibilitychange", back);
    };
  }

  ask(proposal: string): PendingPermission | null {
    return (
      memoryAsksOf(this.#projectId()).find(
        (request) => request.requestId === proposal
      ) ?? null
    );
  }

  answerOf(proposal: string): AnswerState {
    const sent = answerFor(proposal);
    const out =
      sent !== null && sent.stage !== "failed" && sent.stage !== "applied";
    return {
      pending: out ? (this.#pressed[proposal] ?? null) : null,
      refused:
        sent?.stage === "failed"
          ? `${memoryViewWords.answerRefused}${sent.reason ? ` ${sent.reason}` : ""}`
          : null,
    };
  }

  answer(proposal: string, kind: "allow" | "deny"): void {
    const request = this.ask(proposal);
    if (!request || this.answerOf(proposal).pending) {
      return;
    }
    this.#pressed = { ...this.#pressed, [proposal]: kind };
    submitCommand(request.instanceId, "hub", "permission.answer", {
      requestId: request.requestId,
      result: permissionAnswer(request, kind),
    });
  }

  /** An act, then the page read again; a refusal is thrown in the hub's words. */
  async #act<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } finally {
      // biome-ignore lint/complexity/noVoid: the re-read sets its own state
      void this.read();
    }
  }

  curate(): Promise<MemoryRunStarted> {
    return this.#act(() =>
      send<MemoryRunStarted>(
        `${base(this.#projectId())}/curate`,
        json("POST", {})
      )
    );
  }

  fold(path: string): Promise<MemoryRunStarted> {
    return this.#act(() =>
      send<MemoryRunStarted>(
        `${base(this.#projectId())}/propose/fold`,
        json("POST", { path })
      )
    );
  }

  reshape(): Promise<MemoryRunStarted> {
    return this.#act(() =>
      send<MemoryRunStarted>(
        `${base(this.#projectId())}/propose/reshape`,
        json("POST", {})
      )
    );
  }

  archive(path?: string): Promise<MemoryArchiveProposed> {
    return this.#act(() =>
      send<MemoryArchiveProposed>(
        `${base(this.#projectId())}/propose/archive`,
        json("POST", path ? { path } : {})
      )
    );
  }

  async withdraw(note: string): Promise<void> {
    await this.#act(() =>
      send(
        `${base(this.#projectId())}/notes/${encodeURIComponent(note)}/withdraw`,
        json("POST", {})
      )
    );
  }

  async withdrawYours(text: string): Promise<void> {
    await this.#act(() =>
      send(
        `${base(this.#projectId())}/agents-notes/withdraw`,
        json("POST", { text })
      )
    );
  }

  async tellCaw(text: string, id?: string): Promise<string> {
    const said = await this.#act(() =>
      startThread(this.#projectId(), text, id)
    );
    return said.thread.id;
  }

  async makeNote(text: string): Promise<void> {
    await this.tellCaw(`${memoryViewWords.notePrefix}${text}`);
  }

  file(path: string): Promise<MemoryFileView> {
    return send<MemoryFileView>(
      `${base(this.#projectId())}/file?${new URLSearchParams({ path })}`
    );
  }

  async history(path: string): Promise<MemoryChange[]> {
    const read = await send<{ commits: MemoryChange[] }>(
      `/api/projects/${encodeURIComponent(this.#projectId())}/folder/history?${new URLSearchParams({ path, limit: "20" })}`
    );
    return read.commits;
  }
}
