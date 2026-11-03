/**
 * Which drawing of the setup page the person is choosing between, while the
 * cards `stage-rest` and `setup-groups` on `onboarding-design` are open:
 * each option is the real `Setup` on the house's components, drawn by the
 * bench (`routes/dev/setup-page`, `?stages=` and `?groups=`). The pick keeps
 * one drawing and this context goes with the other; the hub's page build
 * sets none, so a project's page draws the default.
 *
 * - `stages`: `reminders` follows Apple's Reminders in edit mode (one list
 *   in the board's order; remove, mark, name, kind, info and the reorder
 *   handle on every row); `notion` follows Notion's status options (the
 *   stages under their kind's head, each a handle, its mark and name, and
 *   a press that opens its editor).
 * - `groups`: `document` stands the stages and the delegate types on the
 *   page's ground under their heads; `cards` frames the aim, the stages and
 *   the types each in a raised card.
 */
import { getContext, setContext } from "svelte";

export interface SetupLook {
  groups: "document" | "cards";
  stages: "reminders" | "notion";
}

const KEY = Symbol("setup-look");
const DEFAULT: SetupLook = { stages: "reminders", groups: "document" };

export const setSetupLook = (look: SetupLook): void => {
  setContext(KEY, look);
};

export const setupLook = (): SetupLook =>
  getContext<SetupLook | undefined>(KEY) ?? DEFAULT;
