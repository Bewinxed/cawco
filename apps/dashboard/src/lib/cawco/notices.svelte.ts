/**
 * The notices a person has acknowledged, as the hub keeps them (hub
 * notices.ts): one record for every tab and device. It arrives on the board
 * snapshot every socket opens with and on every change after it
 * (`noticesSeen`), so a notice acknowledged anywhere leaves this tab live and
 * is never shown after a reload. Nothing here is kept in the tab.
 */
import type { DamagedHubRecord } from "@cawco/core";
import { SvelteSet } from "svelte/reactivity";

class Notices {
  /** Notice ids acknowledged anywhere, plus this tab's own on their way to the hub. */
  seen = new SvelteSet<string>();
  /**
   * The hub's record has arrived whole: until then no notice can know it
   * was seen, so none is shown.
   */
  known = $state(false);
  /**
   * The hub found its record damaged as it started (`noticesDamaged`):
   * notices are off, and Caw's panel says so with Reset, until it is reset.
   */
  damaged = $state<DamagedHubRecord | null>(null);

  /**
   * Takes the hub's record. The hub only ever adds to it, so what this tab
   * acknowledged and the hub has not echoed yet is kept.
   */
  adopt(ids: readonly string[]): void {
    for (const id of ids) {
      this.seen.add(id);
    }
    this.known = this.damaged === null;
  }

  /** The hub's word on its record: damaged (notices off), or whole again once reset. */
  adoptDamaged(damaged: DamagedHubRecord | null): void {
    this.damaged = damaged;
    this.known = damaged === null;
  }

  /**
   * Reset: the hub writes a fresh record and notices come back on; the board
   * frame that follows says so. The hub's refusal is the error.
   */
  async reset(): Promise<void> {
    const response = await fetch("/api/notices/reset", { method: "POST" });
    if (!response.ok) {
      throw new Error(
        (await response.text()) ||
          `The hub answered ${response.status}, so the notices record was not reset. Try again.`
      );
    }
  }

  /**
   * The person acknowledged a notice: gone here at once, and everywhere once
   * the hub has it. Kept alive past a reload, which is what Reload does next.
   * A hub that did not take it leaves the notice standing here too.
   */
  async acknowledge(ids: readonly string[]): Promise<void> {
    const fresh = ids.filter((id) => !this.seen.has(id));
    if (fresh.length === 0) {
      return;
    }
    for (const id of fresh) {
      this.seen.add(id);
    }
    const response = await fetch("/api/notices/seen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: fresh }),
      keepalive: true,
    }).catch(() => null);
    if (!response?.ok) {
      for (const id of fresh) {
        this.seen.delete(id);
      }
    }
  }
}

export const notices = new Notices();
