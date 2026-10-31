/**
 * What every stop job's tray does while it stands in the page, a forget's
 * (StopTray) and Caw off's (CawOffTray) alike: it counts a slow stop's
 * seconds, parks its job when its place leaves the page, and keeps itself
 * in view and in hand as it unfolds and grows.
 */

import { untrack } from "svelte";
import { bringIntoView } from "#lib/cawco/bring-into-view.js";
import { cawco } from "./client.svelte";
import { frameObserver } from "./frame-observer";
import { span } from "./home/home-state.svelte";
import { type StopJob, type StopRow, stopWork } from "./stop-work.svelte";

/**
 * Called in a tray's script: the clock its slow rows read while the stops
 * land, and, taken off the page while its job still stands here (Caw's
 * settings put away, the page left), the tray put away as Escape puts it,
 * so stops under way park and are said where they are parked, never left
 * standing in a place no one can see.
 */
export function standing(job: () => StopJob): { readonly now: number } {
  let now = $state(Date.now());
  $effect(() => {
    if (job().phase !== "stopping") {
      return;
    }
    now = Date.now();
    const ticker = setInterval(() => {
      now = Date.now();
    }, 1000);
    return () => clearInterval(ticker);
  });
  $effect(() => {
    const held = untrack(job);
    const place = untrack(() => held.at);
    return () => {
      if (held.open && held.at === place) {
        stopWork.dismiss(held);
      }
    };
  });
  return {
    get now() {
      return now;
    },
  };
}

/** A row's trail: how long its turn has run, or, stopping past 5s, the seconds waited. */
export function trailOf(job: StopJob, row: StopRow, now: number): string {
  const waited = Math.floor((now - job.pressedAt) / 1000);
  if (row.state === "stopping" && waited >= 5) {
    return `${waited}s`;
  }
  const since = cawco.turnSince(row.s.id);
  return row.state === "running" && since ? span(Date.now() - since) : "";
}

/**
 * The tray's attachment: in view and in hand as it unfolds. The menu that
 * asked hands focus back to its trigger as it closes, so the focus moves
 * to its Cancel a frame later. While it stands it keeps itself in view as
 * its own size changes (it opens on its list and grows to each stop as its
 * machine confirms it), so its foot never rests under what stands over the
 * page's foot (the scroller's scroll padding). Escape inside it runs
 * `leave` and goes no further (a popover it stands in stays open).
 */
export function trayHere(job: () => StopJob, leave: () => void) {
  return (node: HTMLElement) => {
    const frame = requestAnimationFrame(() => {
      node.querySelector<HTMLElement>("[data-stop-cancel]")?.focus();
    });
    // Its size read in the delivery, and the scroll in the next frame
    // (frame-observer): nothing resizes inside the delivery.
    let height = -1;
    let measured = 0;
    const sized = frameObserver(
      () => {
        if (measured !== height && job().open) {
          height = measured;
          bringIntoView(node);
        }
      },
      {
        read: ([entry]) => {
          measured = entry?.borderBoxSize[0]?.blockSize ?? 0;
        },
      }
    );
    sized.observe(node);
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        leave();
      }
    };
    node.addEventListener("keydown", onEscape);
    return () => {
      cancelAnimationFrame(frame);
      sized.disconnect();
      node.removeEventListener("keydown", onEscape);
    };
  };
}
