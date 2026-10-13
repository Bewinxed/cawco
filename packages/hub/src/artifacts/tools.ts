/**
 * The four artifact tools' names, words and inputs (Projects spec §5.10),
 * written for the agent that reads them: one trigger per branch, every field
 * bounded, answers that say only what the hub stored. Their handlers call
 * the artifact routes (delegation-actions.ts).
 */
import { ARTIFACT_NAME, PREVIEW_START_PATH } from "@cawco/core";
import { z } from "zod";
import { PAGE_LIMIT } from "../decision-page";

/** A workspace id, or the 8-character prefix delegate reports. */
export const WORKSPACE_ID = /^[0-9a-f][0-9a-f-]{7,35}$/;

/** Patch operations one update may hold. Our bound. */
export const PATCH_LIMIT = 200;

export const ARTIFACT_TOOLS = [
  "artifact_create",
  "artifact_update",
  "artifact_read",
  "artifact_show",
] as const;

const id = z
  .string()
  .regex(/^[0-9a-f-]{36}$/)
  .describe("The artifact's id, from artifact_create.");

export const artifactCreate = {
  name: "artifact_create",
  description:
    "Make an artifact and open it in your panel beside the transcript. A page is HTML you wrote: `html`, or `dir` " +
    "holding a decision page's page.html (decision-page skill); in a project, neither builds decisions/<name>/page.html " +
    "from its folder. A preview is your dev server (`port`) or a folder (`dir`). The same kind and name again replaces " +
    "it in place and keeps the person's picks. Answers its id and whether the panel opened it.",
  input: {
    kind: z.enum(["page", "preview"]),
    name: z
      .string()
      .regex(ARTIFACT_NAME)
      .describe("Lowercase letters, digits and dashes, like onboarding."),
    html: z.string().min(1).max(PAGE_LIMIT).optional(),
    dir: z
      .string()
      .startsWith("/")
      .max(4096)
      .optional()
      .describe("An absolute folder on the machine."),
    port: z.number().int().min(1).max(65_535).optional(),
    path: z
      .string()
      .regex(PREVIEW_START_PATH)
      .max(2000)
      .optional()
      .describe("A preview's start page, like /motion/mac-readiness."),
    machine: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe(
        "The machine a preview runs on; omitted, yours. With a port, that machine's host port, outside any workspace."
      ),
    workspace: z
      .string()
      .regex(WORKSPACE_ID)
      .optional()
      .describe(
        "The workspace whose server a port is: yours, or a delegate's id as delegate returned it; omitted, your own."
      ),
  },
};

export const artifactUpdate = {
  name: "artifact_update",
  description:
    "Change one of your artifacts in place. `html` replaces a page (the panel reloads it; picks stay). `patch` is a " +
    'JSON Patch (RFC 6902) over its state, keyed by choice id, like [{"op":"replace","path":"/hero/options","value":["b"]}]; ' +
    "all of it applies or none. Answers the state after the change.",
  input: {
    id,
    html: z.string().min(1).max(PAGE_LIMIT).optional(),
    patch: z
      .array(
        z.object({
          op: z.enum(["add", "remove", "replace", "move", "copy", "test"]),
          path: z.string().max(1000),
          from: z.string().max(1000).optional(),
          value: z.unknown().optional(),
        })
      )
      .min(1)
      .max(PATCH_LIMIT)
      .optional(),
  },
};

export const artifactRead = {
  name: "artifact_read",
  description:
    "Read the person's picks, notes and values on one of your artifacts, each with the page hash it was made on. " +
    "`since` (the `seq` of your last read or delivery) returns only what changed after it. No id: your newest. " +
    "Their changes also reach you as a message once they pause, and at once while your turn runs.",
  input: {
    id: id.optional(),
    since: z.number().int().min(0).optional(),
  },
};

export const artifactShow = {
  name: "artifact_show",
  description:
    "Bring one of your artifacts to the front of your panel when the person should look at it again. Answers opened, or why not.",
  input: { id },
};
