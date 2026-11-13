/**
 * The scrolling transcript: the folded rows, virtualized. The live tail rides
 * as rows of its own (see `buildRowsFrom`), so streaming text, an open reasoning
 * block and the tool in flight all scroll with the conversation. Announces
 * genuine arrivals — and blocked-on-you — through a dedicated live region
 * beside the log, never through the virtualized container itself.
 */
import { untrack } from "svelte";
import { type Keys, perSettled } from "./row-presentation.svelte";
import { type Row, wellRunsFrom } from "./rows";

/**
 * Which rows draw a rail, and which of them continue the one above.
 *
 * The rail is painted per row, because rows are virtualised siblings and
 * there is no element spanning a run to hang one line on. Consecutive rail
 * rows therefore have to abut and paint the continuation weight rather than
 * each restarting the head gradient — otherwise a run reads as a stack of
 * stubs, which is exactly how the in-flight tool looked against the
 * completed calls above it.
 */
const NO_RAIL = new Set<Extract<Row, { kind: "single" }>["message"]["type"]>([
  "user",
  "assistant",
  "user.peer",
  "user.rule",
  "user.delegate_ask",
  "ui.command_output",
  "ui.error",
  "ui.session_error",
  "result.error",
]);

/**
 * Read off what the row draws. The live row draws its reasoning block —
 * the rail's own head — for as long as it has no answer, the indicator
 * before any reasoning included: reading it off `thinking` flipped the
 * row's gap 14px in one frame as the first reasoning arrived, and every row
 * above jumped.
 */
function railLed(row: Row): boolean {
  if (row.kind === "single") {
    return !NO_RAIL.has(row.message.type);
  }

  return (
    row.kind === "tools" ||
    row.kind === "harness" ||
    row.kind === "thinking" ||
    (row.kind === "live" && !row.text) ||
    row.kind === "livetool" ||
    row.kind === "subagent" ||
    row.kind === "delegate" ||
    row.kind === "connect"
  );
}

/**
 * A row the ledger emits but never paints: a successful result, an assistant
 * frame that carried nothing but a tool call, a thinking block with no text.
 * `MessageRow` renders nothing for these, so they stand between two rail rows
 * at zero height — adjacent on screen, one apart in the list. Reading the
 * list literally is why a run of tool calls kept drawing its line in
 * disconnected stubs.
 */
function unpainted(row: Row): boolean {
  if (row.kind !== "single") {
    return false;
  }
  const m = row.message;
  if (m.type === "result.success") {
    return true;
  }

  return (m.type === "assistant" || m.type === "thinking") && !m.content.trim();
}

/** The keys of `rowList`'s rows from `from` on that continue the line above them. */
function continuesAbove(rowList: Row[], from: number): Set<string> {
  const keys = new Set<string>();
  for (let i = Math.max(1, from); i < rowList.length; i += 1) {
    if (!railLed(rowList[i])) {
      continue;
    }
    let above = i - 1;
    while (above >= 0 && unpainted(rowList[above])) {
      above -= 1;
    }
    if (above >= 0 && railLed(rowList[above])) {
      keys.add(rowList[i].key);
    }
  }
  return keys;
}
export interface RowRailsHost {
  readonly rowDraw: {
    readonly presentation: {
      readonly leaving: ReadonlySet<string>;
      readonly settled: Row[];
    };
    readonly renderedRows: Row[];
  };
}

export class RowRails {
  readonly #host: RowRailsHost;

  /**
   * The reader's rows whose well runs on into the next. A row folding away is
   * already out of its run: the rows either side close or join over its fold.
   */
  readonly runsOn = $derived.by((): Keys => {
    const drawn = this.#host.rowDraw.renderedRows;
    const { leaving: gone, settled } = this.#host.rowDraw.presentation;
    return untrack(() => {
      // No row folding away stands among the settled rows (`withLeaving`).
      const before = this.settledRuns(settled);
      const after = wellRunsFrom(
        drawn.slice(settled.length),
        (key) => gone.has(key),
        before.above
      ).runs;
      return { has: (key) => before.runs.has(key) || after.has(key) };
    });
  });

  readonly settledRuns = perSettled((settled) =>
    wellRunsFrom(settled, () => false, null)
  );

  /**
   * Keys of rows whose line is the same line as the row above them ON SCREEN
   * — read off the rows drawn, so a row folding shut keeps its gap, and the
   * rows around it theirs, until it is gone.
   */
  readonly continued = $derived.by((): Keys => {
    const rowList = this.#host.rowDraw.renderedRows;
    const { settled } = this.#host.rowDraw.presentation;
    return untrack(() => {
      const before = this.settledContinued(settled);
      const after = continuesAbove(rowList, settled.length);
      return { has: (key) => before.has(key) || after.has(key) };
    });
  });

  readonly settledContinued = perSettled((settled) =>
    continuesAbove(settled, 1)
  );

  constructor(host: RowRailsHost) {
    this.#host = host;
  }
}
