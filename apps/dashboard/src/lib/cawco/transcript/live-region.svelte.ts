import { bringIntoView } from "@cawco/core/bring-into-view";
import { questionsOf } from "@cawco/core/question";
import { askWords } from "@cawco/core/words/asks";
/**
 * The scrolling transcript: the folded rows, virtualized. The live tail rides
 * as rows of its own (see `buildRowsFrom`), so streaming text, an open reasoning
 * block and the tool in flight all scroll with the conversation. Announces
 * genuine arrivals — and blocked-on-you — through a dedicated live region
 * beside the log, never through the virtualized container itself.
 */
import { untrack } from "svelte";
import type { VirtualizerHandle } from "virtua/svelte";
import { LIVE_REPLY } from "../markdown-blocks";
import { type SessionState, sessionsStore } from "../stores/sessions.svelte";
import { connectReveal } from "./connect-sign-ins.svelte";
import { blockKey, blockReveal } from "./inline-blocks.svelte";
import type { Built } from "./row-build.svelte";
import type { Row } from "./rows";
import { trayNews, trayReveal } from "./tray.svelte";

export interface LiveRegionHost {
  readonly active: boolean;
  readonly agentName: string;
  readonly landed: boolean;
  readonly pin: {
    readonly list: VirtualizerHandle | undefined;
    readonly scroller: HTMLElement | undefined;
  };
  readonly rowBuild: {
    readonly built: Built;
    readonly rows: Row[];
  };
  readonly rowDraw: {
    readonly renderedRows: Row[];
  };
  readonly session: SessionState;
}

export class LiveRegion {
  readonly #host: LiveRegionHost;

  // The live region
  // The scroll container is NOT the live region. virtua mounts and unmounts
  // rows as they cross the viewport, so `aria-live` on it re-reads history the
  // moment the operator scrolls, and re-reads the streaming turn on every token.
  // Instead: rows the transcript has not announced before, once it has landed
  // and is being read, get one coarse sentence each.

  /**
   * What identifies a row for announcement purposes. The streaming rows are
   * deliberately unannounceable — their text arrives token by token, and a live
   * region fed from it is a stutter. The settled `single` row the turn becomes
   * is what says "replied". The in-flight tool is keyed by its call id rather
   * than its row key, which virtua reuses for every tool in turn.
   */
  announceKeyOf(row: Row): string {
    if (
      row.kind === "stream" ||
      row.kind === "thinking" ||
      row.kind === "live"
    ) {
      return "";
    }
    // A harness notification is plumbing the operator never asked for. It is
    // worth a line on the rail and nothing at all in the ear.
    if (row.kind === "harness") {
      return "";
    }
    // Nor a queued message: the operator just sent it. Reading their own words
    // back to them, then again when the session starts on them, is noise.
    if (row.kind === "queued") {
      return "";
    }
    if (row.kind === "livetool") {
      return `livetool:${row.glance.toolId}`;
    }
    return row.key;
  }

  /**
   * The whole announceable vocabulary, and it is five phrases long. A row that
   * maps to nothing says nothing — a settled tool run, a prepended history
   * chunk and the operator's own message are all visible on a surface the
   * operator is looking at.
   */
  phraseOf(row: Row): string {
    if (row.kind === "single") {
      // The operator's own message needs no reading back to them.
      return row.message.type === "user" ? "" : "Agent replied";
    }
    if (row.kind === "livetool") {
      return `${row.glance.name} running`;
    }
    return "";
  }

  /** What the polite region currently holds. Replaced, never appended to. */
  announcement = $state("");

  readonly announced = new Set<string>();

  // The delegate tray's news: a delegate started, finished or failed (polite),
  // or has a question for the reader (assertive, cleared once it is said).
  trayAlert = $state("");

  wasBusy: boolean;

  /**
   * The blocked-on-you line, which interrupts: it is the one state where the
   * run has stopped and only the operator can restart it. Empty otherwise, so
   * clearing the block does not itself announce anything.
   */
  readonly blockedNote = $derived.by(() => {
    if (!this.#host.landed) {
      return "";
    }
    const [parked] = this.#host.session.pending;
    if (parked) {
      // Said as its card names it: a question is not a permission.
      if (parked.browserAsk) {
        return askWords.browserAskFrom(this.#host.agentName);
      }
      return questionsOf(parked.toolName, parked.input)
        ? askWords.questionFrom(this.#host.agentName)
        : askWords.permissionFrom(this.#host.agentName);
    }
    if (this.#host.rowBuild.rows.at(-1)?.kind === "question") {
      return `Question from ${this.#host.agentName}`;
    }
    return "";
  });

  /**
   * Why a read again over these rows failed; null while the transcript is
   * caught up. Only over rows drawn: with none, the pane says why in their
   * place.
   */
  readonly behind = $derived.by(() =>
    this.#host.rowDraw.renderedRows.length > 0
      ? (sessionsStore.session(this.#host.session.instanceId)?.behind ?? null)
      : null
  );

  constructor(host: LiveRegionHost) {
    this.#host = host;
    this.wasBusy = false;

    $effect(() => {
      // Before the transcript lands, everything on it is history, not an arrival.
      // A pane that is off screen is the same case twice over: it has no business
      // speaking about a surface the reader cannot see, and its rows are frozen
      // anyway. Both branches still SEED `announced`, so coming back to a tab
      // announces what arrived while it was away exactly once, rather than
      // re-reading the whole transcript. An older page put in front is history
      // too, however long the pane has been read.
      if (
        !(this.#host.landed && this.#host.active) ||
        this.#host.rowBuild.built.shifted
      ) {
        for (const r of this.#host.rowBuild.rows) {
          this.announced.add(this.announceKeyOf(r));
        }
        return;
      }
      let phrase = "";
      for (const r of this.#host.rowBuild.rows) {
        const key = this.announceKeyOf(r);
        if (!key || this.announced.has(key)) {
          continue;
        }
        this.announced.add(key);
        const said = this.phraseOf(r);
        if (said) {
          phrase = said;
        }
      }
      // A batch that lands in one frame says only its last line: three sentences
      // read back-to-back is the spam this region exists to stop.
      if (phrase) {
        this.announcement = phrase;
      }
    });

    // The end of a turn is a state change, not a row: the last thing the agent
    // said may have landed several frames before it stopped working. `busy`
    // falling is the only honest signal for it.
    // `busy` is still TRACKED off screen — it flips once a turn, not once a
    // frame, so it costs nothing — but only a pane on screen says so out loud.
    // Following it either way is what keeps `wasBusy` honest: dropping the
    // bookkeeping while hidden would make the next switch announce a turn that
    // finished minutes ago.
    // A finished chip pressed while its delegate's report is off screen: the
    // report comes into view (and the chip, seeing it, flies there).
    $effect(() => {
      const want = trayReveal.get(this.#host.session.instanceId);
      if (!(want && this.#host.active)) {
        return;
      }
      untrack(() => {
        trayReveal.delete(this.#host.session.instanceId);
        const index = this.#host.rowDraw.renderedRows.findIndex(
          (row) => row.kind === "single" && row.message.id === want
        );
        if (index >= 0) {
          this.#host.pin.list?.scrollToIndex(index, {
            align: "center",
            smooth: true,
          });
        }
      });
    });

    // Jump to latest version pressed on a replaced block: the newest
    // version's row comes into view, unless its block is drawn already, and
    // the block itself is brought to the view's middle and marked once drawn
    // (TranscriptBlock).
    $effect(() => {
      const want = blockReveal.get(this.#host.session.instanceId);
      if (!(want && this.#host.active)) {
        return;
      }
      untrack(() => {
        blockReveal.delete(this.#host.session.instanceId);
        const drawn = this.#host.pin.scroller?.querySelector(
          `[data-block-key="${CSS.escape(blockKey(this.#host.session.instanceId, want))}"]`
        );
        if (drawn) {
          return;
        }
        const index = this.#host.rowDraw.renderedRows.findIndex((row) =>
          want.at === LIVE_REPLY
            ? row.kind === "live"
            : row.kind === "single" && row.message.id === want.at
        );
        if (index >= 0) {
          this.#host.pin.list?.scrollToIndex(index, { align: "center" });
        }
      });
    });

    // A sign-in's row pressed in the list of what waits on the reader: the
    // open connect card comes into view, and its Connect takes the keys once
    // it is drawn there. A delegate's card stands after the rows.
    $effect(() => {
      if (!(
        connectReveal.has(this.#host.session.instanceId) && this.#host.active
      )) {
        return;
      }
      untrack(() => {
        connectReveal.delete(this.#host.session.instanceId);
        const index = this.#host.rowDraw.renderedRows.findLastIndex(
          (row) => row.kind === "connect" && row.answer === null
        );
        if (index < 0) {
          // No open card of its own among the rows: a delegate's, after them.
          const under = this.#host.pin.scroller?.querySelector<HTMLElement>(
            "[data-connect-stage]"
          );
          if (under) {
            bringIntoView(under, { behavior: "smooth" });
            under
              .querySelector<HTMLElement>("button")
              ?.focus({ preventScroll: true });
          }
          return;
        }
        this.#host.pin.list?.scrollToIndex(index, {
          align: "center",
          smooth: true,
        });
        const { key } = this.#host.rowDraw.renderedRows[index];
        requestAnimationFrame(() => {
          document
            .querySelector(`[data-row="${CSS.escape(key)}"]`)
            ?.querySelector<HTMLElement>("[data-connect]")
            ?.focus({ preventScroll: true });
        });
      });
    });

    $effect(() => {
      const news = trayNews.get(this.#host.session.instanceId);
      if (!(news && this.#host.active && this.#host.landed)) {
        return;
      }
      untrack(() => {
        if (news.polite) {
          this.announcement = news.polite;
        }
        this.trayAlert = news.assertive;
      });
      if (news.assertive) {
        const clear = setTimeout(() => {
          this.trayAlert = "";
        }, 5000);
        return () => clearTimeout(clear);
      }
    });

    $effect(() => {
      const { busy } = this.#host.session;
      if (this.#host.active && this.#host.landed && this.wasBusy && !busy) {
        this.announcement = "Turn finished";
      }
      this.wasBusy = busy;
    });
  }
}
