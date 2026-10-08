/**
 * What each Configure editor has changed and not saved, by the editor's
 * path (`/config/rules/<id>`, `/config/hooks/new`, `/config/memory/CLAUDE.md`).
 * Leaving an editor, for another page or by a reload, and coming back puts
 * the edits back where they were; a save or Cancel ends them.
 *
 * Kept the way the composer keeps a conversation's unsent message
 * (transcript/draft-store.ts): IndexedDB, one record per key, read back
 * before anything is written (the untouched form an editor opens with never
 * replaces what was stored), written at most every 250ms and at once when
 * the page goes away or the editor closes, and held under a byte cap by
 * dropping the drafts edited longest ago. It is its own database rather than
 * a second store in the composer's: adding a store to that one is a version
 * upgrade, which a tab still open on the previous build blocks until it
 * reloads.
 */
import { untrack } from "svelte";
import { SvelteSet } from "svelte/reactivity";
import { browser } from "$app/env";
import { keepsDrafts } from "../reload.svelte";
import { MAIN } from "./memory";
import type { SectionSlug } from "./sections";
import type { ConfigStore } from "./store.svelte";

const DB_NAME = "cawco-editors";
const DB_VERSION = 1;
const STORE = "drafts";
/** The most the stored drafts may weigh together, in bytes. */
const CAP_BYTES = 5 * 1024 * 1024;
/** How long an edit waits to be written, so typing writes once. */
const WRITE_MS = 250;

interface DraftRecord {
  fields: unknown;
  path: string;
  /** What the record weighs, for the cap: two bytes per character. */
  size: number;
  /** When it was last written, for eviction. */
  updatedAt: number;
}

let opening: Promise<IDBDatabase> | null = null;

function database(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: "path" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return opening;
}

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Every editor's unsaved fields, as read back and as edited since. */
class EditorDrafts {
  /** The paths holding a draft: what the rail and the lists read. */
  readonly paths = new SvelteSet<string>();
  /** The stored drafts have been read back. */
  ready = $state(false);
  readonly #fields = new Map<string, unknown>();
  /** Changes not written yet, by path; null is a deletion. */
  readonly #unwritten = new Map<string, unknown>();
  #timer: ReturnType<typeof setTimeout> | undefined;
  /** The write in flight, settled once its transaction has committed. */
  #writing: Promise<void> = Promise.resolve();

  constructor() {
    if (!browser) {
      return;
    }
    database()
      .then((db) =>
        result<DraftRecord[]>(db.transaction(STORE).objectStore(STORE).getAll())
      )
      .then(
        (records) => {
          for (const record of records) {
            // Forgotten while the read was in flight (a Cancel that quick).
            if (this.#unwritten.get(record.path) !== null) {
              this.#fields.set(record.path, record.fields);
              this.paths.add(record.path);
            }
          }
          this.ready = true;
          this.flush();
        },
        (error: unknown) => {
          // A browser that refuses the database (private mode) keeps no
          // editor drafts: nothing is restored and nothing is written.
          console.warn(
            "[drafts] IndexedDB refused to open; drafts are off",
            error
          );
        }
      );
    window.addEventListener("pagehide", () => this.flush());
    // A reload this tab does itself waits for every edit to be written.
    keepsDrafts(() => this.settled());
  }

  /** Writes every change waiting; resolves once the write has committed. */
  settled(): Promise<void> {
    this.flush();
    return this.#writing;
  }

  get(path: string): unknown {
    return this.#fields.get(path);
  }

  /** Holds `fields` as `path`'s draft, or drops it for null; written shortly. */
  put(path: string, fields: unknown): void {
    if (fields === null) {
      if (this.#fields.has(path)) {
        this.forget(path);
      }
      return;
    }
    this.#fields.set(path, fields);
    this.paths.add(path);
    this.#unwritten.set(path, fields);
    this.#timer ??= setTimeout(() => this.flush(), WRITE_MS);
  }

  /** Drops `path`'s draft, stored or not yet read back. */
  forget(path: string): void {
    this.#fields.delete(path);
    this.paths.delete(path);
    this.#unwritten.set(path, null);
    this.#timer ??= setTimeout(() => this.flush(), WRITE_MS);
  }

  /** Writes every change waiting, then holds the store under the cap. */
  flush(): void {
    clearTimeout(this.#timer);
    this.#timer = undefined;
    if (this.#unwritten.size === 0 || !this.ready) {
      return;
    }
    const changes = [...this.#unwritten];
    this.#unwritten.clear();
    this.#writing = database().then(async (db) => {
      const transaction = db.transaction(STORE, "readwrite");
      const committed = new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error);
      });
      const store = transaction.objectStore(STORE);
      const now = Date.now();
      for (const [path, fields] of changes) {
        if (fields === null) {
          store.delete(path);
        } else {
          const record: DraftRecord = {
            path,
            fields,
            size: 2 * JSON.stringify(fields).length,
            updatedAt: now,
          };
          store.put(record);
        }
      }
      const all = await result<DraftRecord[]>(store.getAll());
      let total = all.reduce((sum, each) => sum + each.size, 0);
      for (const old of all.sort((a, b) => a.updatedAt - b.updatedAt)) {
        if (total <= CAP_BYTES) {
          break;
        }
        store.delete(old.path);
        total -= old.size;
      }
      await committed;
    });
  }
}

export const drafts = new EditorDrafts();

/**
 * One field set in a canonical text: keys in order, an absent key the same
 * as an undefined one. Two sets with the same text hold the same values.
 */
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, inner: unknown) =>
    inner && typeof inner === "object" && !Array.isArray(inner)
      ? Object.fromEntries(
          Object.entries(inner).sort(([a], [b]) => (a < b ? -1 : 1))
        )
      : inner
  );

/** The fields hold what is saved: nothing of them is a draft. */
export const sameFields = (a: unknown, b: unknown): boolean =>
  canonical(a) === canonical(b);

/**
 * Keeps an editor's unsaved fields under `path` while it is open, and puts
 * a stored draft back when it opens. `unsaved` returns the fields to keep,
 * or null while they are what is saved (reading them all, so any edit is
 * heard); `restore` takes stored fields back into the form. Called while
 * the editor is created. `restored` turns true once the stored draft is
 * back (or there was none); `drop` forgets the draft and stops keeping it,
 * for Cancel and for a new row once it is created.
 */
export function keepDraft<T>(
  path: string,
  unsaved: () => T | null,
  restore: (fields: T) => void
): { drop: () => void; readonly restored: boolean } {
  let restored = $state(false);
  let dropped = false;

  const bringBack = () => {
    const stored = drafts.get(path);
    // Edits made while the stored drafts were being read are the newer ones.
    if (stored !== undefined && unsaved() === null) {
      restore(stored as T);
    }
    restored = true;
  };
  // Read back already (the usual case): the editor's first frame is the
  // draft. Otherwise it comes back as soon as the read lands.
  if (drafts.ready) {
    untrack(bringBack);
  }
  $effect(() => {
    if (drafts.ready && !restored) {
      untrack(bringBack);
    }
  });

  $effect(() => {
    if (!restored) {
      return;
    }
    const fields = unsaved();
    if (!dropped) {
      drafts.put(path, fields === null ? null : $state.snapshot(fields));
    }
  });

  // The editor closing writes what it holds at once.
  $effect(() => () => drafts.flush());

  return {
    drop() {
      dropped = true;
      drafts.forget(path);
      drafts.flush();
    },
    get restored() {
      return restored;
    },
  };
}

const SECTION = /^\/config\/([^/]+)\/(.+)$/;

/** The editor at `path` is for a row that still exists, or for a new one. */
function live(store: ConfigStore, slug: string, key: string): boolean {
  if (key === "new") {
    return slug !== "memory";
  }
  const fleet = store.fleet.value;
  switch (slug) {
    case "rules":
      return store.rules.value?.some((row) => row.id === key) ?? false;
    case "hooks":
      return store.hooks.value?.some((row) => row.id === key) ?? false;
    case "delegate-types":
      return store.types.value?.some((row) => row.name === key) ?? false;
    case "mcp":
      return fleet?.config.mcp.some((row) => row.name === key) ?? false;
    case "subagents":
      return fleet?.agents.some((row) => row.name === key) ?? false;
    case "memory":
      return (
        key === MAIN ||
        (fleet?.memoryDocs.some((doc) => doc.path === key) ?? false)
      );

    default:
      return false;
  }
}

/**
 * A section holds an editor with unsaved changes. A draft left for a row
 * deleted since does not count: there is nothing left to save it to.
 */
export function unsavedIn(store: ConfigStore, slug: SectionSlug): boolean {
  for (const path of drafts.paths) {
    const match = SECTION.exec(path);
    if (
      match?.[1] === slug &&
      live(store, slug, decodeURIComponent(match[2]))
    ) {
      return true;
    }
  }
  return false;
}
