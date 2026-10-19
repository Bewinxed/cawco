import Ledger from "./Ledger.svelte";

export default { title: "Embed/Ledger", component: Ledger, args: { rows: 10 } };

/**
 * Six months of ten 48px lines, each frame inside a window: the section is
 * near 3000px tall, so the note's section under it stands past three
 * heights of an embed's frame (runtime.ts UNMOUNT_MARGIN).
 */
export const January = { args: { month: "January" } };
export const February = { args: { month: "February" } };
export const March = { args: { month: "March" } };
export const April = { args: { month: "April" } };
export const May = { args: { month: "May" } };
export const June = { args: { month: "June" } };
