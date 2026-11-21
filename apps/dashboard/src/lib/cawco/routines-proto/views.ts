/**
 * The project page's view strip as both Routines prototypes draw it,
 * Routines among Board, Table and Decisions; `decisions` is how many
 * decisions wait in that prototype's Harbor.
 */
export const routineViews = (decisions: number) => [
  { value: "board", label: "Board", draft: false, count: 0 },
  { value: "table", label: "Table", draft: false, count: 0 },
  { value: "routines", label: "Routines", draft: false, count: 0 },
  { value: "decisions", label: "Decisions", draft: false, count: decisions },
];
