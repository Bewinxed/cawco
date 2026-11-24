/**
 * What a session put to the person outside a tool call (core parked.ts),
 * as its pane holds it: the hub's list, read while the pane is on screen
 * and again whenever what needs him may have moved (`questionsMoved`: a
 * pick, a note, a new ask, a withdrawal), the same moments its list of what
 * waits is read (waiting/session-waiting.svelte.ts).
 *
 * The first still open parks in the composer (SessionPane `firstAsk`), and
 * the pane holds its artifact's doc while it does (preview/artifact-doc.ts
 * `joinArtifact`), as the panel holds it: a pick or a note made on the
 * graph or the page shows in the composer at once, and the composer's pick
 * is written there exactly as the graph's head or the page's option writes
 * it. Answered here, an item leaves the queue at once. Answered where it
 * lives while it stands here, the composer says what was picked for a beat
 * ({@link ELSEWHERE_MS}) before it folds back.
 *
 * The transcript reads every item, answered ones too, to keep each where
 * its call opened it (ParkedRecord): {@link of}.
 */
import type { ChoiceEntry } from "@cawco/core/choices";
import { pickMade } from "@cawco/core/decisions";
import { detach } from "@cawco/core/detach";
import { type ParkedItem, parkedId, parkedOpen } from "@cawco/core/parked";
import { parkedWords } from "@cawco/core/words/parked";
import { getContext, setContext, untrack } from "svelte";
import { SvelteSet } from "svelte/reactivity";
import { hub } from "#lib/platform/hub.js";
import { hubData } from "#lib/platform/hub-read.js";
import { type ArtifactDoc, joinArtifact } from "../preview/artifact-doc";
import { needsStore } from "../stores/needs.svelte";

/** How long a pick made where it lives is said in the composer before it folds back, ms. Our call: long enough to read four words. */
const ELSEWHERE_MS = 1600;

/** What item `item` was answered with in `choices`, in words; null while it is not. */
const answeredIn = (
  item: ParkedItem,
  choices: Readonly<Record<string, ChoiceEntry>>
): string | null => {
  if (item.kind === "directions") {
    const picking: ChoiceEntry | undefined = choices.picked;
    const kept = picking?.value;
    const picked = item.directions.find((one) => one.file === kept);
    return picked ? picked.name : null;
  }
  const entry = choices[item.card.id];
  if (!entry) {
    return null;
  }
  if (pickMade(item.card, entry)) {
    return entry.options
      .map((id) => item.card.options.find((option) => option.id === id)?.label)
      .filter((label) => label !== undefined)
      .join(", ");
  }
  return entry.note?.trim() ? parkedWords.yourNote : null;
};

export interface ParkedQueueInput {
  /** The session the pane shows. */
  instanceId: () => string;
  /** The pane is on screen and the hub holds the session's row: only then is the list read. */
  onScreen: () => boolean;
}

export class ParkedQueue {
  /** The hub's last list, oldest first; empty before the first read lands. */
  items = $state<ParkedItem[]>([]);
  /** The artifact whose doc the pane holds, and its choices as the doc says them now. */
  held = $state<{
    artifactId: string;
    choices: Record<string, ChoiceEntry>;
  } | null>(null);
  /** Items answered in the composer: gone from the queue before the hub's next list says so. */
  readonly #answeredHere = new SvelteSet<string>();
  /** Items the person pressed on here: a several-pick card picked here waits for its Answer, not the doc. */
  readonly #touched = new SvelteSet<string>();
  /** Items answered where they live, whose beat in the composer has run. */
  readonly #answeredThere = new SvelteSet<string>();
  /** The item answered where it lives while it stands here, and what with: said until its beat runs. */
  elsewhere = $state<{ id: string; said: string } | null>(null);
  readonly #input: ParkedQueueInput;
  /** The newest read asked: an older one landing after it is let go. */
  #asked = 0;
  #doc: ArtifactDoc | null = null;

  /** The items still waiting on the person, oldest first: what the composer parks. */
  readonly open = $derived.by(() =>
    this.items.filter((item) => {
      const id = parkedId(item);
      return (
        parkedOpen(item) &&
        !this.#answeredHere.has(id) &&
        !this.#answeredThere.has(id)
      );
    })
  );

  /** The artifact of the item the composer parks: its doc is held while it does. */
  readonly #heldArtifact = $derived.by(() => {
    const [first] = this.open;
    return first?.artifact.id ?? null;
  });

  /** The item the composer parks, by its id, and what it was answered with where it lives; null while it wasn't. */
  readonly #firstAnswered = $derived.by(() => {
    const [first] = this.open;
    if (!first) {
      return null;
    }
    const said = answeredIn(first, this.choicesOf(first));
    return said === null
      ? null
      : {
          id: parkedId(first),
          said: parkedWords.pickedThere(
            first.kind === "directions" ? "graph" : "page",
            said
          ),
        };
  });
  /** Its words, one string, so the beat starts once per answer and not on every change of the doc. */
  readonly #firstAnsweredKey = $derived(
    this.#firstAnswered
      ? `${this.#firstAnswered.id}\n${this.#firstAnswered.said}`
      : null
  );

  /** The choices of `item`'s artifact as the doc held here says them, else as the hub listed them. */
  choicesOf = (item: ParkedItem): Record<string, ChoiceEntry> =>
    this.held?.artifactId === item.artifact.id ? this.held.choices : {};

  /** Every item artifact `artifactId` holds, each as it stands now: the transcript's record. */
  of = (artifactId: string): ParkedItem[] =>
    this.items.filter((item) => item.artifact.id === artifactId);

  constructor(input: ParkedQueueInput) {
    this.#input = input;
    $effect(() => {
      if (!input.onScreen()) {
        return;
      }
      needsStore.questionsMoved();
      this.#read(input.instanceId());
    });
    // The doc of the item the composer parks, held while it does.
    $effect(() => {
      const artifactId = this.#heldArtifact;
      const instanceId = input.instanceId();
      if (!artifactId) {
        return;
      }
      this.held = { artifactId, choices: {} };
      const doc = joinArtifact(
        instanceId,
        artifactId,
        (view) => {
          if (this.held?.artifactId === artifactId) {
            this.held = { artifactId, choices: view.choices };
          }
        },
        () => undefined,
        () => undefined
      );
      this.#doc = doc;
      return () => {
        doc.destroy();
        if (this.#doc === doc) {
          this.#doc = null;
        }
      };
    });
    // Answered where it lives while it stands here: said for a beat, then gone.
    $effect(() => {
      if (this.#firstAnsweredKey === null) {
        return;
      }
      const answered = untrack(() => this.#firstAnswered);
      if (!answered || untrack(() => this.#touched.has(answered.id))) {
        return;
      }
      this.elsewhere = answered;
      const beat = setTimeout(() => {
        this.#answeredThere.add(answered.id);
        this.elsewhere = null;
      }, ELSEWHERE_MS);
      return () => clearTimeout(beat);
    });
  }

  /** What the composer says of `item` answered where it lives; null while it isn't. */
  elsewhereOf = (item: ParkedItem): string | null =>
    this.elsewhere?.id === parkedId(item) ? this.elsewhere.said : null;

  /** A direction of `item` picked here: its graph's `picked`, as the head's Pick writes it; a sentence when it was not kept. */
  pick = (item: ParkedItem, file: string): string | null => {
    this.#touched.add(parkedId(item));
    return this.#doc?.keep("picked", file) ?? parkedWords.joining;
  };

  /** A card of `item` picked or noted here, as its page's option and note write it; a sentence when it was not kept. */
  choose = (
    item: ParkedItem,
    card: string,
    change: { options: string[] } | { note: string }
  ): string | null => {
    this.#touched.add(parkedId(item));
    return this.#doc?.choose(card, change) ?? parkedWords.joining;
  };

  /** `item` answered here: it leaves the queue now. */
  answered = (item: ParkedItem): void => {
    this.#answeredHere.add(parkedId(item));
  };

  /** Reads again now. */
  again = (): void => {
    this.#read(this.#input.instanceId());
  };

  /** The hub's list read again; one that fails leaves the last standing, said in the log, and the next move reads again. */
  #read(id: string): void {
    this.#asked += 1;
    const asked = this.#asked;
    detach(
      hubData(hub.api.instances({ id }).parked.get()).then((read) => {
        if (asked === this.#asked) {
          this.items = read.items;
        }
      }),
      "read parked picks"
    );
  }
}

/** The context the transcript finds its session's queue under. */
const PARKED = "cawco-parked";

/** The pane's queue, for the transcript under it. */
export const provideParked = (queue: ParkedQueue): void => {
  setContext(PARKED, queue);
};

/** The queue of the pane this transcript stands in; none outside one. */
export const parkedHere = (): ParkedQueue | undefined =>
  getContext<ParkedQueue | undefined>(PARKED);
