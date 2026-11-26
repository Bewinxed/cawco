/**
 * What a session put to the person outside a tool call (core parked.ts),
 * as its pane holds it: the hub's list, read while the pane is on screen
 * and again whenever what needs him may have moved (`questionsMoved`: a
 * pick, a note, a new ask, a withdrawal), the same moments its list of what
 * waits is read (waiting/session-waiting.svelte.ts).
 *
 * Each still open parks in the composer, after the asks that hold an
 * agent's turn (SessionPane `composerAsks`), and the pane holds the doc of
 * the one the composer stands at while it does (preview/artifact-doc.ts
 * `joinArtifact`), as the panel holds it: a pick or a note made on the
 * graph or the page shows in the composer at once, and the composer's pick
 * is written there exactly as the graph's head or the page's option writes
 * it; an answer in his own words (core choices.ts `ownWordsEntry`) is
 * written there too, on the same key.
 * Answered here, an item leaves the queue at once. Answered where it
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

/** The key on its artifact that `item`'s answer or dismissal is kept under: its graph's `picked`, or its card's id. */
const keyOf = (item: ParkedItem): string =>
  item.kind === "directions" ? "picked" : item.card.id;

/** What picked item `item` in `choices`, by its options' names; null while nothing is. */
const pickedIn = (item: ParkedItem, entry: ChoiceEntry): string | null => {
  if (item.kind === "directions") {
    return (
      item.directions.find((one) => one.file === entry.value)?.name ?? null
    );
  }
  if (pickMade(item.card, entry)) {
    return entry.options
      .map((id) => item.card.options.find((option) => option.id === id)?.label)
      .filter((label) => label !== undefined)
      .join(", ");
  }
  return entry.note?.trim() ? parkedWords.yourNote : null;
};

/** What the composer says of item `item` answered in `choices` where it lives; null while it is not. */
const answeredIn = (
  item: ParkedItem,
  choices: Readonly<Record<string, ChoiceEntry>>
): string | null => {
  const entry: ChoiceEntry | undefined = choices[keyOf(item)];
  if (!entry) {
    return null;
  }
  if (entry.ownWords) {
    return parkedWords.answeredThere;
  }
  if (entry.dismissed) {
    return parkedWords.dismissedThere;
  }
  const picked = pickedIn(item, entry);
  return picked === null
    ? null
    : parkedWords.pickedThere(
        item.kind === "directions" ? "graph" : "page",
        picked
      );
};

export interface ParkedQueueInput {
  /** The session the pane shows. */
  instanceId: () => string;
  /** The pane is on screen and the hub holds the session's row: only then is the list read. */
  onScreen: () => boolean;
  /**
   * Other sessions whose open picks this pane's composer parks too, its
   * conversation being the one he is in (tsk-521, home/chat-asks): each
   * artifact of theirs waiting on him. Empty while it is not his.
   */
  others?: () => string[];
  /** The item the composer stands at, by its id (core `parkedId`); null while it stands at none of these. */
  standing: () => string | null;
}

export class ParkedQueue {
  /** The hub's last list, oldest first; empty before the first read lands. */
  items = $state<ParkedItem[]>([]);
  /** The hub's last list of each other session it parks the picks of, by that session. */
  othersItems = $state<Record<string, ParkedItem[]>>({});
  /** Every other session it parks the picks of has been read since they were named. */
  othersRead = $state(true);
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

  /** Other sessions' items still waiting on him, each with its session: what the composer parks after its own. */
  readonly othersOpen = $derived.by(() =>
    Object.entries(this.othersItems).flatMap(([instance, items]) =>
      items
        .filter((item) => {
          const id = parkedId(item);
          return (
            parkedOpen(item) &&
            !this.#answeredHere.has(id) &&
            !this.#answeredThere.has(id)
          );
        })
        .map((item) => ({ instance, item }))
    )
  );

  /** The item the composer stands at, with the session that holds it; null while it stands at none of these. */
  readonly #standing = $derived.by(() => {
    const id = this.#input.standing();
    const own = this.open.find((item) => parkedId(item) === id);
    if (own) {
      return { instance: this.#input.instanceId(), item: own };
    }
    return this.othersOpen.find((one) => parkedId(one.item) === id) ?? null;
  });

  /** The artifact of the item the composer stands at, and its session: its doc is held while it does. */
  readonly #heldArtifact = $derived(
    this.#standing
      ? `${this.#standing.instance}\n${this.#standing.item.artifact.id}`
      : null
  );

  /** The item the composer stands at, by its id, and what it was answered with where it lives; null while it wasn't. */
  readonly #standingAnswered = $derived.by(() => {
    const item = this.#standing?.item;
    if (!item) {
      return null;
    }
    const said = answeredIn(item, this.choicesOf(item));
    if (said === null) {
      return null;
    }
    return { id: parkedId(item), said };
  });
  /** Its words, one string, so the beat starts once per answer and not on every change of the doc. */
  readonly #standingAnsweredKey = $derived(
    this.#standingAnswered
      ? `${this.#standingAnswered.id}\n${this.#standingAnswered.said}`
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
    // Each other session whose picks it parks, read with its own.
    $effect(() => {
      const others = input.others?.() ?? [];
      if (!input.onScreen()) {
        return;
      }
      needsStore.questionsMoved();
      this.#readOthers(others);
    });
    // The doc of the item the composer stands at, held while it does, from
    // the session that holds it.
    $effect(() => {
      const held = this.#heldArtifact;
      if (!held) {
        return;
      }
      const [instanceId = "", artifactId = ""] = held.split("\n");
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
      if (this.#standingAnsweredKey === null) {
        return;
      }
      const answered = untrack(() => this.#standingAnswered);
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
    // A write kept answers null: only a doc not held yet is "joining".
    const doc = this.#docOf(item);
    return doc ? doc.keep("picked", file) : parkedWords.joining;
  };

  /** A card of `item` picked or noted here, as its page's option and note write it; a sentence when it was not kept. */
  choose = (
    item: ParkedItem,
    card: string,
    change: { options: string[] } | { note: string }
  ): string | null => {
    this.#touched.add(parkedId(item));
    const doc = this.#docOf(item);
    return doc ? doc.choose(card, change) : parkedWords.joining;
  };

  /**
   * `item` answered here in the person's own words, with no pick: kept on
   * its artifact as its graph's head or its page's card would keep an
   * answer, which tells its session as a pick does; a sentence when it was
   * not kept.
   */
  answerInWords = (item: ParkedItem, words: string): string | null => {
    this.#touched.add(parkedId(item));
    const doc = this.#docOf(item);
    return doc ? doc.answerInWords(keyOf(item), words) : parkedWords.joining;
  };

  /** The doc held here when it is `item`'s artifact's; null while none is. */
  readonly #docOf = (item: ParkedItem): ArtifactDoc | null =>
    this.held?.artifactId === item.artifact.id ? this.#doc : null;

  /** `item` answered here: it leaves the queue now. */
  answered = (item: ParkedItem): void => {
    this.#answeredHere.add(parkedId(item));
  };

  /** Reads again now. */
  again = (): void => {
    this.#read(this.#input.instanceId());
  };

  /** The newest read of the others asked: an older one landing after it is let go. */
  #askedOthers = 0;

  /**
   * Each other session's list read again; a session no longer named drops
   * out, and one whose read fails keeps its last list, said in the log.
   */
  #readOthers(others: string[]): void {
    this.#askedOthers += 1;
    const asked = this.#askedOthers;
    this.othersItems = Object.fromEntries(
      others.map((id) => [id, untrack(() => this.othersItems[id]) ?? []])
    );
    let waiting = others.length;
    this.othersRead = waiting === 0;
    for (const id of others) {
      detach(
        hubData(hub.api.instances({ id }).parked.get({ query: { every: "1" } }))
          .then((read) => {
            if (asked === this.#askedOthers) {
              this.othersItems = { ...this.othersItems, [id]: read.items };
            }
          })
          .finally(() => {
            waiting -= 1;
            if (asked === this.#askedOthers && waiting === 0) {
              this.othersRead = true;
            }
          }),
        "read another session's parked picks"
      );
    }
  }

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
