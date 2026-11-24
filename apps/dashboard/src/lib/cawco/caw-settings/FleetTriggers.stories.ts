/**
 * Configure › Caw's triggers, the fleet's defaults for each kind of
 * trigger (Component Story Format 3, live components): the section fed the
 * fixtures' fleet layer. The meta's `beforeEach` feeds the machines and the
 * accounts through their stores' own writers.
 */

import {
  triggerKindWords,
  cawSettingsWords as words,
} from "@cawco/core/words/caw-settings";
import {
  FLEET,
  INSTALLED,
  KINDS_UNSET,
  MACHINE,
  REFUSED,
} from "./caw-settings.fixtures.svelte";
import { seedStores } from "./caw-settings-play";
import FleetTriggers from "./FleetTriggers.svelte";

export default {
  title: "Configure/Triggers",
  component: FleetTriggers,
  args: {
    installed: INSTALLED,
    kinds: FLEET,
    machine: MACHINE,
    onkind: () => undefined,
  },
  beforeEach: seedStores,
};

/** Comments run on Sonnet in Accept edits fleet-wide; routine results set their mode; the rest are each project's Caw's. */
export const Defaults = {};

/** Nothing set fleet-wide: every kind runs as each project's Caw. */
export const NothingSet = { args: { kinds: KINDS_UNSET } };

/** A kind's change refused: it keeps its default, and its row says why. */
export const KindRefused = {
  args: {
    refusedKind: {
      kind: "comments",
      words: words.refused(
        words.kindUnchanged(triggerKindWords.comments.name),
        REFUSED
      ),
    },
  },
};

/** The fleet's settings not read yet: the section holds its place. */
export const Reading = { args: { kinds: null } };
