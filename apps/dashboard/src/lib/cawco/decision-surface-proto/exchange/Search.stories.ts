/**
 * The Exchange, Search and decided: every thread's asks, picks and reasons,
 * searched by their words. The records are the six decided on 31 Oct in
 * "A project conversation is just a session", five by the owner and one by
 * the advisor. A result opens its thread at that message.
 */
import Exchange from "./Exchange.svelte";
import type { Play } from "./play.js";
import { DECIDED, OPEN, STRIP } from "./records.js";

const BRIEF = /8,000-character brief/u;

export default {
  title: "The Exchange/Search and decided",
  component: Exchange,
  args: {
    threads: OPEN,
    strip: STRIP,
    view: "search",
    records: DECIDED,
    query: "Caw",
  },
};

/** "Caw": five decided records, the matched words marked. */
export const Results = { parameters: { viewport: 390 } };

/** The results at 680. */
export const ResultsTablet = { parameters: { viewport: 680 } };

/** At a desk: results in the list's column, the first result's thread beside them at that message. */
export const ResultsDesk = {
  args: { found: "name" },
  parameters: { viewport: 1440 },
};

/** In the owner's 1540 window. */
export const ResultsWide = {
  args: { found: "name" },
  parameters: { viewport: 1540 },
};

/** He opens "No brief": its thread comes up beside the results, at that record with his note. */
export const OpenedAtRecord = {
  from: "ResultsDesk",
  args: { found: "brief" },
  parameters: { viewport: 1440 },
  play: (async ({ canvas, userEvent, update }) => {
    await userEvent.click(canvas.getByText(BRIEF));
    await update({ found: "brief" });
  }) satisfies Play,
};

/** Every record, no words typed yet. */
export const EveryRecord = {
  args: { query: "" },
  parameters: { viewport: 390 },
};

/** Nothing matches: the query verbatim, and a way on. */
export const NothingMatches = {
  args: { query: "retry policy" },
  parameters: { viewport: 390 },
};

/** Nothing decided at all yet: what will land here. */
export const NothingDecided = {
  args: { records: [], query: "" },
  parameters: { viewport: 390 },
};

/** Searching: skeleton rows at the results' size. */
export const Searching = {
  args: { searchLoad: "searching" },
  parameters: { viewport: 390 },
};

/** The search failed: said where the results stand, with Try again. */
export const SearchFailed = {
  args: { searchLoad: "failed" },
  parameters: { viewport: 1440 },
};
