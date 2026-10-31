/**
 * A member's Record, the last row of its settings, on his real fleet: each
 * member's figures as the hub answered them, Caw's line for Cawco-Dev, and
 * the record still reading or failed. Light and dark are the canvas's.
 */
import SetupFixture from "./preview/SetupFixture.svelte";

export default {
  title: "Who decides/A member's record",
  component: SetupFixture,
};

/** Design reviewer's record: decided, its last, taken back, waiting and its month, each a link, on a phone. */
export const FiguresPhone = {
  args: { open: "design-reviewer" },
  parameters: { viewport: 390 },
};

/** Design reviewer's record: decided, its last, taken back, waiting and its month, each a link, at the two-column width. */
export const FiguresTablet = {
  args: { open: "design-reviewer" },
  parameters: { viewport: 680 },
};

/** Design reviewer's record: decided, its last, taken back, waiting and its month, each a link, four across. */
export const FiguresDesk = {
  args: { open: "design-reviewer" },
  parameters: { viewport: 1440 },
};

/** Design reviewer's record: decided, its last, taken back, waiting and its month, each a link, on a wide screen. */
export const FiguresWide = {
  args: { open: "design-reviewer" },
  parameters: { viewport: 1540 },
};

/** The Advisor's record before its first answer: nothing decided yet, and what its runs spent, on a phone. */
export const NothingYetPhone = {
  args: { open: "advisor" },
  parameters: { viewport: 390 },
};

/** The Advisor's record before its first answer: nothing decided yet, and what its runs spent, at the two-column width. */
export const NothingYetTablet = {
  args: { open: "advisor" },
  parameters: { viewport: 680 },
};

/** The Advisor's record before its first answer: nothing decided yet, and what its runs spent, four across. */
export const NothingYetDesk = {
  args: { open: "advisor" },
  parameters: { viewport: 1440 },
};

/** The Advisor's record before its first answer: nothing decided yet, and what its runs spent, on a wide screen. */
export const NothingYetWide = {
  args: { open: "advisor" },
  parameters: { viewport: 1540 },
};

/** Common practice's record: three decided, all three taken back, on a phone. */
export const TakenBackPhone = {
  args: { open: "practice" },
  parameters: { viewport: 390 },
};

/** Common practice's record: three decided, all three taken back, at the two-column width. */
export const TakenBackTablet = {
  args: { open: "practice" },
  parameters: { viewport: 680 },
};

/** Common practice's record: three decided, all three taken back, four across. */
export const TakenBackDesk = {
  args: { open: "practice" },
  parameters: { viewport: 1440 },
};

/** Common practice's record: three decided, all three taken back, on a wide screen. */
export const TakenBackWide = {
  args: { open: "practice" },
  parameters: { viewport: 1540 },
};

/** Caw's record on Cawco-Dev: his month, his threads and his newest turn, on a phone. */
export const CawRecordPhone = {
  args: { open: "caw" },
  parameters: { viewport: 390 },
};

/** Caw's record on Cawco-Dev: his month, his threads and his newest turn, at the two-column width. */
export const CawRecordTablet = {
  args: { open: "caw" },
  parameters: { viewport: 680 },
};

/** Caw's record on Cawco-Dev: his month, his threads and his newest turn, four across. */
export const CawRecordDesk = {
  args: { open: "caw" },
  parameters: { viewport: 1440 },
};

/** Caw's record on Cawco-Dev: his month, his threads and his newest turn, on a wide screen. */
export const CawRecordWide = {
  args: { open: "caw" },
  parameters: { viewport: 1540 },
};

/** Design reviewer's record still reading, on a phone. */
export const ReadingPhone = {
  args: { open: "design-reviewer", record: "reading" },
  parameters: { viewport: 390 },
};

/** Design reviewer's record still reading, at the two-column width. */
export const ReadingTablet = {
  args: { open: "design-reviewer", record: "reading" },
  parameters: { viewport: 680 },
};

/** Design reviewer's record still reading, four across. */
export const ReadingDesk = {
  args: { open: "design-reviewer", record: "reading" },
  parameters: { viewport: 1440 },
};

/** Design reviewer's record still reading, on a wide screen. */
export const ReadingWide = {
  args: { open: "design-reviewer", record: "reading" },
  parameters: { viewport: 1540 },
};

/** Design reviewer's record didn't load: the hub's words and Try again, on a phone. */
export const FailedPhone = {
  args: { open: "design-reviewer", record: "failed" },
  parameters: { viewport: 390 },
};

/** Design reviewer's record didn't load: the hub's words and Try again, at the two-column width. */
export const FailedTablet = {
  args: { open: "design-reviewer", record: "failed" },
  parameters: { viewport: 680 },
};

/** Design reviewer's record didn't load: the hub's words and Try again, four across. */
export const FailedDesk = {
  args: { open: "design-reviewer", record: "failed" },
  parameters: { viewport: 1440 },
};

/** Design reviewer's record didn't load: the hub's words and Try again, on a wide screen. */
export const FailedWide = {
  args: { open: "design-reviewer", record: "failed" },
  parameters: { viewport: 1540 },
};
