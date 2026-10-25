/**
 * The update toast: what an open page does once the dashboard's server runs
 * a newer build than the page (served-build.svelte.ts `newerBuild`). Owner:
 * "update toast, update now, update when idle? default to idle". It used to
 * reload every open tab by itself 30 s after the last input, under whatever
 * the person was doing.
 *
 * One house toast (../toasts), by one id, so a second build landing while it
 * stands changes it in place and never stacks a second. It stands until it
 * is acted on or the page goes, with two acts:
 *
 * - **Update now** reloads at once (reload.svelte.ts `leaveForBuild`);
 * - **Update when idle** puts the toast away and leaves the page to the idle
 *   reload, which runs whatever was chosen, so no choice (or the toast swiped
 *   away) is the same as this one.
 *
 * Idle is the page in the background (`document.visibilityState` hidden) or
 * the person away by the presence model's own clock: the hub's rollup of
 * every device's input against the person's away clock (hub notifications.ts
 * `rollup`, its 10 s sweep), told to every page as its `person` frame
 * (person.svelte.ts `person.view`). Owner: "hook it into the idle timer that
 * is already there"; this page keeps no timer of its own. Appear away is the
 * person's word, not their absence (they may be at the page), so it is not
 * idle. Words a reload would lose (reload.svelte.ts `unsavedWords`) hold the
 * idle reload until the next time the page goes idle: DESIGN.md, "Don't let
 * a reload … cancel or lose work a surface started".
 *
 * A page whose wire is older than the hub's reloads by itself regardless
 * (client.svelte.ts `olderThanHub`, the connection band says it), so the
 * toast stands aside for it. A page reloaded once for this build that came
 * back on its own build is not offered it again ({@link reloadedFor}): the
 * reload would only load this build again.
 */
import { AWAY_AFTER_DEFAULT_MS } from "@cawco/core/notifications";
import { updatesWords } from "@cawco/core/words/updates";
import { untrack } from "svelte";
import { createSubscriber } from "svelte/reactivity";
import { cawco } from "../client.svelte";
import { person } from "../person.svelte";
import { leaveForBuild, reloadedFor, unsavedWords } from "../reload.svelte";
import { newerBuild } from "../served-build.svelte";
import { toast } from "../toasts";

/** The toast's one id: a second build changes it in place. */
export const UPDATE_TOAST = "cawco-update-ready";

/** The page's visibility, read reactively. */
const visibility = createSubscriber((changed) => {
  document.addEventListener("visibilitychange", changed);
  return () => document.removeEventListener("visibilitychange", changed);
});

const inBackground = (): boolean => {
  visibility();
  return document.visibilityState === "hidden";
};

/** The person is away by the presence model's clock, not by Appear away. */
const away = (): boolean =>
  person.view?.state === "away" && !person.view.manual;

/** A reload for the new build is on its way. */
let going = false;
/** The toast was put away (Update when idle, or swiped): it is not put up again on this page. */
let waived = false;

async function go(build: string, chosen: boolean): Promise<void> {
  if (going) {
    return;
  }
  going = true;
  going = await leaveForBuild(build, chosen);
}

/** Puts the toast up, or changes it in place, saying the away clock in `minutes`. */
function offer(minutes: number): void {
  toast(updatesWords.pageReady, {
    id: UPDATE_TOAST,
    description: updatesWords.pageUpdatesItself(minutes),
    duration: Number.POSITIVE_INFINITY,
    // The words take the toast's first line whole, the two acts the second
    // at its trailing edge, together: sonner gives each button an auto
    // leading margin, so the second's is taken back.
    classes: {
      toast: "flex-wrap",
      content: "basis-full",
      actionButton: "[--toast-button-margin-start:0]",
    },
    cancel: {
      label: updatesWords.updateWhenIdle,
      onClick: () => {
        waived = true;
      },
    },
    action: {
      label: updatesWords.updateNow,
      onClick: (event) => {
        // The toast stands until the page goes.
        event.preventDefault();
        const build = newerBuild();
        if (build !== null) {
          // biome-ignore lint/complexity/noVoid: the page goes once the drafts are written down
          void go(build, true);
        }
      },
    },
    onDismiss: () => {
      waived = true;
    },
  });
}

/** Runs the toast and the idle reload; called inside the root layout's update watch (`$effect.root`). */
export function watchUpdateToast(): void {
  /** The build the page is offered, or null. */
  const due = $derived.by(() => {
    const build = newerBuild();
    return build === null || cawco.olderWire || reloadedFor(build)
      ? null
      : build;
  });

  $effect(() => {
    const build = due;
    const minutes = Math.round(
      (person.view?.awayAfterMs ?? AWAY_AFTER_DEFAULT_MS) / 60_000
    );
    untrack(() => {
      if (build === null) {
        toast.dismiss(UPDATE_TOAST);
      } else if (!waived) {
        offer(minutes);
      }
    });
  });

  // The idle reload: each time the page goes idle while a build is due.
  $effect(() => {
    const build = due;
    if (build === null || !(inBackground() || away())) {
      return;
    }
    untrack(() => {
      if (!unsavedWords()) {
        // biome-ignore lint/complexity/noVoid: a reload ends this page
        void go(build, false);
      }
    });
  });
}
