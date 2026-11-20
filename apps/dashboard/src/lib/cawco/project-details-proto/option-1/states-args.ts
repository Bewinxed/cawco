/**
 * What every part's states file shares: hyucksfield as the hub holds it, no
 * change waiting or refused, the frames' clock, and callbacks that answer
 * nothing (a part's states are read at rest; the live story answers).
 */
import { HYUCKSFIELD, NOW, type Situation, situated } from "./fixtures";
import type { ChangeId, Changes, GovernedRecord } from "./records";

const QUIET: Changes = { pending: [], refused: {} };

const nothing = () => undefined;

/** The args a part takes, in one situation. */
export const partArgs = (situation: Situation = "As it stands") => ({
  record: situated(HYUCKSFIELD, situation),
  changes: QUIET,
  now: NOW,
  onchange: nothing,
  onplace: nothing,
  onreread: nothing,
  onsyncnow: nothing,
  onview: nothing,
});

/** A change the hub has not answered yet. */
export const waitingOn = (id: ChangeId): Changes => ({
  pending: [id],
  refused: {},
});

/** A change the hub refused, in its words. */
export const refused = (id: ChangeId, words: string): Changes => ({
  pending: [],
  refused: { [id]: words },
});

/** hyucksfield following the fleet on every kind of choice. */
export const followingFleet = (record: GovernedRecord): GovernedRecord =>
  record.decides.state === "read"
    ? {
        ...record,
        decides: {
          state: "read",
          value: {
            ...record.decides.value,
            scope: { member: "you", fleet: "you", own: false },
          },
        },
      }
    : record;
