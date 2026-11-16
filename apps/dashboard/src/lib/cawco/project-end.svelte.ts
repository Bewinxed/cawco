/**
 * Ending a project, forgetting it or deleting it for good: one ask for
 * every place that offers it (the project head's `⋯`, a folder's menu in
 * the rail), answered in the page where it was asked (DESIGN.md, The Open
 * Page Rule). Each place draws a `<ProjectEndTray at=…>`; the one whose `at`
 * the ask names draws the tray, under its control, and the rest of the page
 * stays live.
 *
 * Bringing a forgotten project back is here too, for the two places that
 * offer it: the toast after a forget, and each row of Forgotten projects
 * (`/project/forgotten`). It lands in the project's page, which says each
 * row the restore held back (restore-held.svelte.ts). A refusal is never
 * a toast: it is kept (refusals.svelte.ts) and said on its row in Forgotten
 * projects, with Try again, through a reload.
 *
 * So are the rows a restore held back, listed there under their project:
 * Try again puts back what now reads. Every row back, its entry goes and a
 * toast says so; some still held back, or the hub refusing, the words are
 * kept and said under the entry, through a reload, until it is tried again
 * or deleted.
 */
import { detach } from "@cawco/core/detach";
import type { HeldRows } from "@cawco/core/forgotten-project";
import { projectEndWords } from "@cawco/core/words/project-ends";
import { projectTrashWords } from "@cawco/core/words/project-trash";
import { failureWords } from "#lib/platform/hub-read.js";
import { toast } from "#lib/platform/toasts.js";
import { goto } from "$app/navigation";
import type { ProjectRow } from "./projects";
import { refusals } from "./refusals.svelte";
import { restoreHeld } from "./restore-held.svelte";
import {
  discardHeldRows,
  restoreProject,
  retryHeldRows,
  StandingRefusal,
} from "./stores/projects.svelte";

/** The ends of a project itself: forgotten (undoable) or deleted for good. */
export type EndKind = "forget" | "delete";

let asked = $state<{
  at: string;
  kind: EndKind;
  project: ProjectRow;
} | null>(null);

/** What the tray reads and answers through. */
export const endHost = {
  /** Where the end was asked: the tray stands there. */
  get at(): string | null {
    return asked?.at ?? null;
  },
  /** Which end: forgotten or deleted for good. */
  get kind(): EndKind | null {
    return asked?.kind ?? null;
  },
  /** The project being ended, as it was when the end was asked; null: none. */
  get project(): ProjectRow | null {
    return asked?.project ?? null;
  },
  close(): void {
    asked = null;
  },
};

/** The rail's place for a project's end: under its folder row. */
export const endAtRail = (projectId: string): string => `rail:${projectId}`;

/**
 * Asks to end `project` (`kind`) from the place `at` (`head:<id>`,
 * `rail:<id>`); an end already standing gives way to it.
 */
export function askEnd(project: ProjectRow, at: string, kind: EndKind): void {
  asked = { at, kind, project: { ...project, places: [...project.places] } };
}

/** The key a refused bring-back is kept under: its row in Forgotten projects. */
export const bringBackKey = (id: string): string => `restore:${id}`;

/**
 * Brings forgotten project `id` back and opens its page. Refused, the hub's
 * words are kept for its row and the answer is false.
 */
export async function bringBack(
  id: string,
  ask: { forgottenAt?: number; name?: string } = {}
): Promise<boolean> {
  try {
    const restored = await restoreProject(id, ask);
    refusals.delete(bringBackKey(id));
    // What it held back is said on the page it lands in.
    restoreHeld.set(restored.id, restored.held);
    await goto(`/project/${encodeURIComponent(restored.id)}`);
    return true;
  } catch (error) {
    refusals.set(bringBackKey(id), {
      reason: failureWords(error),
      asked: { ...ask, standing: error instanceof StandingRefusal },
    });
    return false;
  }
}

/** A refused bring-back as its row says it: the hub's words, and whether asking again could change it. */
export function bringBackRefusal(
  id: string
): { reason: string; standing: boolean } | null {
  const said = refusals.get(bringBackKey(id));
  if (!said) {
    return null;
  }
  const kept = said.asked;
  return {
    reason: said.reason,
    standing:
      typeof kept === "object" &&
      kept !== null &&
      "standing" in kept &&
      kept.standing === true,
  };
}

/**
 * The toast after a forget, with Bring back for as long as it stands
 * (config/undo.ts, the house's undo after the fact). A refused Bring back
 * opens Forgotten projects, where its row says why.
 */
export function offerBringBack(project: { id: string; name: string }): void {
  const id = `forgot:${project.id}`;
  toast(projectEndWords.forgot(project.name), {
    id,
    action: {
      label: projectEndWords.bringBack,
      onClick: () => {
        detach(
          bringBack(project.id).then((back) =>
            back ? undefined : goto("/project/forgotten")
          ),
          "bring back"
        );
      },
    },
  });
}

/** The key what an entry of held rows' last Try again came to is kept under: the entry in Forgotten projects. */
const heldKey = (one: Pick<HeldRows, "forgottenAt" | "id">): string =>
  `held:${one.id}:${one.forgottenAt}`;

/** Tries an entry's held rows again (as above). */
export async function tryHeldAgain(one: HeldRows): Promise<void> {
  const key = heldKey(one);
  try {
    const retried = await retryHeldRows(one.id, one.forgottenAt);
    if (retried.held.length === 0) {
      refusals.delete(key);
      toast(projectTrashWords.heldAllBack(retried.name, retried.back));
      return;
    }
    refusals.set(key, {
      reason: projectTrashWords.heldStill(retried.back, retried.held.length),
    });
  } catch (error) {
    refusals.set(key, { reason: failureWords(error) });
  }
}

/** Deletes an entry's held rows for good; a refusal is thrown in the hub's words. */
export async function deleteHeld(one: HeldRows): Promise<void> {
  await discardHeldRows(one.id, one.forgottenAt);
  refusals.delete(heldKey(one));
}

/** What an entry's last Try again came to, in words; null: nothing to say. */
export const heldSaid = (one: HeldRows): string | null =>
  refusals.reason(heldKey(one));
