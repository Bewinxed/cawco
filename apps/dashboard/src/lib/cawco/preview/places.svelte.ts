/**
 * What the dashboard holds of the artifacts written links name (core
 * references.ts): each one's name and kind, its pins' states by number and
 * its cards' questions (`GET /api/artifacts/:id/places`), read the first
 * time a chip asks for it. The pane showing an artifact tells its pins as
 * its doc holds them, so a chip for that artifact follows the doc: a resolve,
 * an answer read, a new one.
 */
import type { ArtifactPlaces } from "@cawco/core";
import { type Pin, pinFirstLine, pinUnread } from "@cawco/core/comments";
import { pinName } from "@cawco/core/pin-name";
import { SvelteMap } from "svelte/reactivity";

class Places {
  /** By artifact id: its places, or null once the hub said it holds no such artifact. */
  readonly #held = new SvelteMap<string, ArtifactPlaces | null>();
  readonly #reading = new Set<string>();

  /**
   * Artifact `id`'s places as held now: null when the hub holds no such
   * artifact, undefined until the first read answers (asked for here, in
   * a task of its own, so a chip drawn in a template writes nothing as it
   * draws).
   */
  of(id: string): ArtifactPlaces | null | undefined {
    const held = this.#held.get(id);
    if (held === undefined && !this.#reading.has(id)) {
      this.#reading.add(id);
      queueMicrotask(() => this.#read(id));
    }
    return held;
  }

  async #read(id: string): Promise<void> {
    try {
      const answer = await fetch(
        `/api/artifacts/${encodeURIComponent(id)}/places`
      );
      if (answer.ok) {
        this.#held.set(id, (await answer.json()) as ArtifactPlaces);
      } else if (answer.status === 404) {
        this.#held.set(id, null);
      }
    } catch {
      // Not reached: the chip stands as its label until a later draw reads it again.
    } finally {
      this.#reading.delete(id);
    }
  }

  /** The pane's doc of artifact `id` holds `pins`, the person's last Send at `sentAt`: its chips follow. */
  heard(id: string, pins: Pin[], sentAt: string | null): void {
    const held = this.#held.get(id);
    if (!held) {
      return;
    }
    this.#held.set(id, {
      ...held,
      pins: pins.map((pin) => ({
        id: pin.id,
        number: pin.number,
        name: pinName(pin),
        firstLine: pinFirstLine(pin),
        resolved: !!pin.resolvedAt,
        moved: !!pin.movedAt,
        unread: pinUnread(pin, sentAt),
      })),
    });
  }
}

export const places = new Places();
