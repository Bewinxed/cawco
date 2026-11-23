/**
 * The project's account picker as its popover lists it (AccountPickRows,
 * the session card's own rows): Any available first, then each fleet
 * account with the room it has left, or the limit it is at, or signed out.
 */

import { settingsViewWords as words } from "@cawco/core/words/settings-view";
import AccountPickRows from "#lib/cawco/accounts/AccountPickRows.svelte";
import { pickAccounts } from "./changes";
import { SITUATIONS } from "./settings.fixtures";
import { shellFrame } from "./shell-seed";

const record = SITUATIONS["At rest"];

export default {
  ...shellFrame,
  title: "The project's account",
  component: AccountPickRows,
  parameters: { viewport: 360 },
  args: {
    situation: "At rest",
    accounts: pickAccounts(record),
    auto: { name: words.account.fleetRouting, onpick: () => undefined },
    note: (id: string) =>
      record.accounts.find((one) => one.id === id)?.signedIn === false
        ? words.account.signedOut
        : null,
    pick: () => undefined,
    picked: record.account.chosen,
  },
};

/** Studio Max named for the project, each account with what it has left. */
export const StudioMaxNamed = {};

/** Left to any available account: it stands checked, its name alone. */
export const AnyAvailable = { args: { picked: null } };
