/**
 * What this browser remembers about the conversations it has had open: what
 * each one is called, and where a stored one was last known to live, so a tab
 * is named before the fleet and the transcript have answered.
 *
 * It is memory, not a list of what is open — the workspace's tabs are that,
 * and they are what the dashboard subscribes to. Kept per browser rather than
 * on the hub: it is a record of what *this* reader has been looking at, not a
 * property of the fleet.
 */
import { workspace } from "./workspace/workspace.svelte";

export const WORKING_SET_KEY = "whiffle-working-set";
const KEY = WORKING_SET_KEY;

/** Past this, the coldest conversation that is not open is forgotten. */
const LIMIT = 10;

export interface Visit {
  /** Only eviction reads this: the entry that goes is the coldest one. */
  at: number;
  cwd?: string;
  harness?: string;
  id: string;
  /**
   * Where a STORED session was last known to live. Not part of its address —
   * a tab link is the bare `/session/{id}`, and the hub locates the id across
   * the fleet — but what names the pane (machine, folder, harness) before the
   * transcript has answered, and what `contextOf` falls back to when neither
   * the hub's instances nor a machine's catalogue list the id. Live sessions
   * leave these undefined; their row on the hub says all of this.
   */
  machine?: string | null;
  /**
   * What this conversation resolved to being CALLED, last time a strip
   * resolved it. A tab is drawn before the fleet and the transcript have
   * answered; without this it was drawn as its folder and renamed itself the
   * moment they did. Only ever a name derived from what the session IS (a
   * given title, or what it was first asked), never the folder or id
   * placeholder.
   */
  title?: string;
}

/** The last-known machine, folder and harness of a stored session's tab. */
export interface VisitContext {
  cwd: string;
  harness: string;
  machine: string;
}

const parse = (raw: string | null | undefined): Visit[] => {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as Visit[];
    return Array.isArray(parsed)
      ? parsed.filter(
          (visit) =>
            typeof visit?.id === "string" && typeof visit?.at === "number"
        )
      : [];
  } catch {
    return [];
  }
};

const load = (): Visit[] => {
  try {
    if (typeof localStorage !== "undefined") {
      return parse(localStorage.getItem(KEY));
    }
  } catch {
    // A browser that will not read storage starts the set over.
  }
  return [];
};

const visits = $state<Visit[]>(load());

const save = () => {
  if (typeof localStorage === "undefined") {
    return;
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(visits));
  } catch {
    // A browser that will not store just starts the set over next time.
  }
};

export const workingSet = {
  /** Where a stored session's tab last knew it to live, or null for a live
      session, whose row on the hub answers instead. */
  contextOf(id: string): VisitContext | null {
    const visit = visits.find((v) => v.id === id);
    if (!visit?.machine) {
      return null;
    }
    return {
      machine: visit.machine,
      cwd: visit.cwd ?? "",
      harness: visit.harness ?? "claude",
    };
  },

  /** Notes that a conversation is on screen, keeping where a stored session
      was last known to live so its tab can be named before the fleet answers. */
  visit(
    id: string,
    ctx?: { machine?: string | null; cwd?: string; harness?: string }
  ): void {
    if (!id) {
      return;
    }
    const at = Date.now();
    const existing = visits.findIndex((visit) => visit.id === id);
    if (existing !== -1) {
      visits[existing] = { ...visits[existing], id, at, ...(ctx ?? {}) };
      save();
      return;
    }
    visits.push({ id, at, ...(ctx ?? {}) });
    // The coldest conversation that is no longer open makes room. An open tab
    // is never forgotten — its name and address are what draw it — so with
    // more tabs open than the limit, the set simply holds them all.
    if (visits.length > LIMIT) {
      const open = new Set(workspace.openIds);
      let coldest = -1;
      for (let i = 0; i < visits.length; i += 1) {
        if (visits[i].id === id || open.has(visits[i].id)) {
          continue;
        }
        if (coldest === -1 || visits[i].at < visits[coldest].at) {
          coldest = i;
        }
      }
      if (coldest !== -1) {
        visits.splice(coldest, 1);
      }
    }
    save();
  },

  /** The remembered name, or `null` for a conversation nothing has named yet. */
  titleOf(id: string): string | null {
    return visits.find((visit) => visit.id === id)?.title ?? null;
  },

  /**
   * Remembers what a conversation is called, so the next load names it the
   * same. Written only when the name actually changed — this is called from
   * a render effect, and a write every pass would be a write every frame.
   */
  setTitle(id: string, title: string): void {
    const at = visits.findIndex((visit) => visit.id === id);
    if (at === -1) {
      return;
    }
    const named = title.trim();
    if (!named || visits[at].title === named) {
      return;
    }
    visits[at].title = named;
    save();
  },

  /** Forgets a conversation whose tab was closed or re-addressed. */
  forget(id: string): void {
    const at = visits.findIndex((visit) => visit.id === id);
    if (at === -1) {
      return;
    }
    visits.splice(at, 1);
    save();
  },
};
