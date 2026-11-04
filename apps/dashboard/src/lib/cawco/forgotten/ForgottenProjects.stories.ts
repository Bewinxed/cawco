/**
 * Forgotten projects (Component Story Format 3, live): the list the rail's
 * Projects head opens, drawn from what this hub's trash held on 2026-11-04:
 * two projects forgotten with their names and eighteen folders forgotten
 * before the hub kept names, each needing one to come back.
 */

import { projectTrashWords } from "@cawco/core/words/project-trash";
import ForgottenProjects from "./ForgottenProjects.svelte";
import { ALL, BALCONY, FOLDED, NOW, SPRING } from "./forgotten-fixtures";

const never = () => new Promise<never>(() => undefined);

export default {
  title: "Project/Forgotten projects",
  component: ForgottenProjects,
  args: {
    list: ALL,
    now: NOW,
    reread: () => undefined,
    bringBack: () => Promise.resolve(true),
    remove: () => Promise.resolve(),
    refusalOf: () => null,
  },
  /* Its width on a desk: the house's section width (c-config-max-w) less the card's padding. */
  parameters: { viewport: 948 },
};

/** Twenty forgotten, newest first: two with names, eighteen folders that need one. */
export const Many = {};

/** One forgotten. */
export const One = { args: { list: [SPRING] } };

/** Nothing forgotten. */
export const None = { args: { list: [] } };

/** Reading the list. */
export const Reading = { args: { list: null } };

/** The list could not be read: the hub's words, with Try again. */
export const Unread = {
  args: {
    list: null,
    unread:
      "The hub did not answer (timeout), so the forgotten projects were not listed. Try again.",
  },
};

/** Bring back on a folder from before names: its field starts from the heading the folder gives itself. */
export const Named = {
  args: {
    list: ALL.slice(0, 4),
    names: { "fc8c6bba-f8da-4492-9a73-1f5fb3434432": "ds-probe-landing" },
  },
};

/** Bringing Spring move back: its Bring back pending until the hub answers. */
export const BringingBack = {
  args: {
    list: ALL.slice(0, 4),
    bringBack: never,
    bringing: SPRING.id,
  },
};

/** Bring back refused: Garden holds its checkout now; no Try again, the way to Garden instead. */
export const BringBackRefused = {
  args: {
    list: ALL.slice(0, 4),
    refusalOf: (id: string) =>
      id === BALCONY.id
        ? {
            reason: projectTrashWords.placeTaken(
              "Balcony garden",
              "Garden",
              "/home/bewinxed/garden"
            ),
            standing: true,
          }
        : null,
    holderOf: (one: { id: string }) =>
      one.id === BALCONY.id
        ? { href: "/project/garden", name: "Garden" }
        : null,
  },
};

/** Deleting Spring move from the list: its question, its files kept. */
export const DeleteAsked = {
  args: {
    list: ALL.slice(0, 4),
    asking: { id: SPRING.id, fromDisk: false },
  },
};

/** The same question with its files on disk. */
export const DeleteAskedFromDisk = {
  args: {
    list: ALL.slice(0, 4),
    asking: { id: SPRING.id, fromDisk: true },
  },
};

/** A folder whose tasks may live on in Cawco. */
export const TasksElsewhere = { args: { list: [FOLDED, ...ALL.slice(0, 2)] } };

/** On a phone: the list as one scroller, each row on two lines. */
export const ManyPhone = {
  args: { list: ALL.slice(0, 8) },
  parameters: { viewport: 358 },
};

/** On a phone: deleting with its files. */
export const DeleteAskedPhone = {
  args: {
    list: ALL.slice(0, 4),
    asking: { id: SPRING.id, fromDisk: true },
  },
  parameters: { viewport: 358 },
};
