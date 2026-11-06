import { getContext, setContext } from "svelte";

/** A group's look (InputGroup `look`), for the controls standing in it. */
export type GroupLook = "field" | "bar";

const KEY = Symbol("input-group-look");

/** The group gives its look to what stands in it, read as it changes. */
export const provideLook = (look: () => GroupLook): void => {
  setContext(KEY, look);
};

/** The look of the group a control stands in: `field` outside one. */
export const groupLook = (): GroupLook =>
  getContext<(() => GroupLook) | undefined>(KEY)?.() ?? "field";
