/**
 * The Memory view's fixture side (memory-source.svelte.ts `MemorySource`):
 * a source standing still on one state the hub answered for a fixture
 * project folder (scripts/memory-fixtures.ts). What the states file draws;
 * it imports nothing of the live app, so a sheet loads the view alone.
 */
import type {
  MemoryArchiveProposed,
  MemoryFileView,
  MemoryPage,
  MemoryRunStarted,
} from "@cawco/core";
import type { PendingPermission } from "#lib/cawco/client.svelte.js";
import type {
  AnswerState,
  MemoryChange,
  MemorySource,
} from "./memory-source.svelte";

/** A fixture state as scripts/memory-fixtures.ts writes it: the hub's own answers for one project folder. */
export interface MemoryFixture {
  /** Each open proposal's card, as the hub parks it (core `presentPermission`). */
  asks: Record<string, PendingPermission>;
  files: Record<string, MemoryFileView>;
  /** Each file's commits, as the fixture folder's git answers them. */
  histories: Record<string, MemoryChange[]>;
  /** The page; null for a state the hub did not answer (`problem`). */
  page: MemoryPage | null;
  problem: string | null;
}

/** A source standing still on one fixture: what the states file draws. Its acts do nothing. */
export class FixtureMemory implements MemorySource {
  readonly page: MemoryPage | null;
  readonly problem: string | null;
  readonly generation = 1;
  readonly skew: number;
  readonly #fixture: MemoryFixture;

  constructor(fixture: MemoryFixture) {
    this.#fixture = fixture;
    this.page = fixture.page;
    this.skew = fixture.page ? Date.now() - fixture.page.now : 0;
    this.problem = fixture.problem;
  }

  read = (): Promise<void> => Promise.resolve();
  keep = (): (() => void) => () => undefined;
  ask = (proposal: string): PendingPermission | null =>
    this.#fixture.asks[proposal] ?? null;
  answerOf = (): AnswerState => ({ pending: null, refused: null });
  answer = (): void => undefined;
  readonly #started = (): Promise<MemoryRunStarted> =>
    Promise.resolve({
      routineId: this.page?.curator?.routineId ?? "",
      runId: "",
      state: "starting",
      reason: null,
    });
  curate = (): Promise<MemoryRunStarted> => this.#started();
  fold = (): Promise<MemoryRunStarted> => this.#started();
  reshape = (): Promise<MemoryRunStarted> => this.#started();
  archive = (): Promise<MemoryArchiveProposed> =>
    Promise.resolve({ proposals: [] });
  withdraw = (): Promise<void> => Promise.resolve();
  withdrawYours = (): Promise<void> => Promise.resolve();
  makeNote = (): Promise<void> => Promise.resolve();
  tellCaw = (): Promise<string> => Promise.resolve("");
  file = (path: string): Promise<MemoryFileView> => {
    const view = this.#fixture.files[path];
    return view
      ? Promise.resolve(view)
      : Promise.reject(new Error(`${path} is no memory file of this project.`));
  };
  history = (path: string): Promise<MemoryChange[]> =>
    Promise.resolve(this.#fixture.histories[path] ?? []);
}
