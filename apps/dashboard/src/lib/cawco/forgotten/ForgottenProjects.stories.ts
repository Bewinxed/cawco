/**
 * Forgotten projects (Component Story Format 3, live): the list the rail's
 * Projects head opens, drawn from what this hub's trash held on 2026-11-04:
 * two projects forgotten with their names and eighteen folders forgotten
 * before the hub kept names, each needing one to come back.
 */

import type {
  ForgottenBrings,
  ForgottenProject,
} from "@cawco/core/forgotten-project";
import { projectTrashWords } from "@cawco/core/words/project-trash";
import ForgottenProjects from "./ForgottenProjects.svelte";

/** The clock the dates read against: the evening the list was read. */
const NOW = Date.parse("2026-11-04T21:00:00Z");

/** Nothing but its folder, as a folder forgotten before names brings. */
const brings = (over: Partial<ForgottenBrings> = {}): ForgottenBrings => ({
  folder: true,
  tasks: 0,
  pages: 0,
  sessions: 0,
  routines: 0,
  places: 0,
  rows: 0,
  settings: false,
  account: null,
  browsers: 0,
  memoryDocs: 0,
  notes: 0,
  rules: 0,
  tasksIn: null,
  ...over,
});

const named = (
  id: string,
  name: string,
  at: string,
  over: Partial<ForgottenBrings>
): ForgottenProject => ({
  id,
  name,
  by: null,
  forgottenAt: Date.parse(at),
  brings: brings({ settings: true, places: 1, ...over }),
});

const folder = (id: string, at: string, tasks = 0): ForgottenProject => ({
  id,
  name: null,
  by: null,
  forgottenAt: Date.parse(at),
  brings: brings({ tasks }),
});

const SPRING = named(
  "ad960668-2b87-4c56-af49-b1339d599a96",
  "Spring move",
  "2026-11-04T20:50:38Z",
  { pages: 1, sessions: 1, rows: 18 }
);
const BALCONY = named(
  "49faef85-c288-40f1-a3b1-1e5c25e035f8",
  "Balcony garden",
  "2026-11-04T20:50:02Z",
  { pages: 1, sessions: 1, rows: 25 }
);

/** Every row this hub's trash held, newest first. */
const ALL: ForgottenProject[] = [
  SPRING,
  BALCONY,
  folder("fc8c6bba-f8da-4492-9a73-1f5fb3434432", "2026-11-04T18:55:50Z"),
  folder("68d9477f-49a4-4eab-a988-90b3224ae56d", "2026-11-04T18:55:34Z"),
  folder("f30edca5-1504-46cf-8b00-3f839668b922", "2026-11-04T18:17:36Z"),
  folder("b0a6d00d-e68d-4574-8677-d045347871a9", "2026-11-04T18:16:59Z"),
  folder("74d6b2c0-476a-408c-9f19-b091dba116eb", "2026-11-04T18:01:17Z"),
  folder("ba60a989-51df-4527-86bb-5edca83773b3", "2026-11-02T14:30:05Z"),
  folder("e04cd486-1bad-4f46-b51e-f83232b7973d", "2026-11-02T13:44:19Z"),
  folder("eeee727d-63a6-4905-835e-e46356116a57", "2026-11-02T11:49:11Z"),
  folder("abe0b29a-1571-4aa5-8710-09f6db620abd", "2026-10-17T23:40:32Z", 2),
  folder("f8a10c41-03a7-4590-8436-a54453635dcc", "2026-10-17T23:39:26Z", 1),
  folder("fa2dc73e-6ace-4690-80cf-bc1d17a5bb71", "2026-10-17T23:39:19Z"),
  folder("7a75ce63-b3e7-4045-8a1b-f652c6b384fc", "2026-10-17T23:39:17Z", 2),
  folder("737110bb-d4ad-408a-944b-2841b01cc67f", "2026-10-17T23:39:16Z"),
  folder("59af646e-e1fc-4447-97c3-a7bc99e0ec01", "2026-10-17T23:39:14Z", 2),
  folder("4f6094e6-835c-48f2-b0a7-d7db6bbf868b", "2026-10-17T23:39:12Z", 2),
  folder("11e2feca-693e-40ae-908f-fb99e1d61862", "2026-10-17T20:34:14Z"),
  folder("2de131b7-1ee4-438e-92c2-9db73a113ebe", "2026-10-17T19:27:14Z"),
  folder("b36f1b08-d678-407f-b492-02a7b9c16132", "2026-10-09T22:25:07Z"),
];

/** A folder whose tasks may live on in Cawco, folded in before the trash kept records. */
const FOLDED: ForgottenProject = {
  ...folder("7a75ce63-b3e7-4045-8a1b-f652c6b384fc", "2026-10-17T23:39:17Z", 2),
  brings: brings({
    tasks: 2,
    tasksIn: { id: "4d2f1968", name: "Cawco", tasks: 2 },
  }),
};

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

/** A folder from before names, named and ready to come back. */
export const Named = {
  args: {
    list: ALL.slice(0, 4),
    names: { "fc8c6bba-f8da-4492-9a73-1f5fb3434432": "Kitchen renovation" },
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

/** Bring back refused: a live project holds its folder's place now. */
export const BringBackRefused = {
  args: {
    list: ALL.slice(0, 4),
    refusalOf: (id: string) =>
      id === BALCONY.id
        ? projectTrashWords.placeTaken(
            "Balcony garden",
            "Garden",
            "/home/bewinxed/garden"
          )
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
