/**
 * Which form a frame draws: Caw's panel as the desk's floating popover, or
 * as the sheet a phone opens. The frame says it, never the window, so the
 * owner sees either form at any window width. The page keeps the choice in
 * its address (`?form=phone`); desk when it says nothing.
 */
export type Form = "desk" | "phone";

export const FORMS: { id: Form; name: string; panel: string }[] = [
  { id: "desk", name: "Desk", panel: "floating panel" },
  { id: "phone", name: "Phone", panel: "sheet" },
];

export const formIn = (search: string): Form =>
  new URLSearchParams(search).get("form") === "phone" ? "phone" : "desk";

/** The form's words on a frame: "Desk · floating panel", "Phone · sheet". */
export const formWords = (form: Form): string => {
  const one = FORMS.find((each) => each.id === form) ?? FORMS[0];
  return `${one.name} · ${one.panel}`;
};
