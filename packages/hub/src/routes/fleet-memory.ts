/**
 * The fleet's memory and its linked documents.
 */

import {
  MEMORY_ROLES,
  memoryDocProblem,
  memoryScopeProblem,
} from "@cawco/core/fleet";
import { areaWords } from "@cawco/core/words/areas";
import { Elysia, ElysiaStatus, t } from "elysia";
import { MEMORY_ID } from "../db/schema";
import { undoable } from "../db/trash";
import type { HubContext } from "../hub-context";
import type { MachineReadsContext } from "../machine-reads";
import { pushTarget, readMachineMemory } from "../machine-reads";
import { refusal } from "../refusal";

export const fleetMemoryRoutes = (
  ctx: Pick<
    HubContext,
    | "db"
    | "delegateTypes"
    | "fleetChanged"
    | "fleetSyncs"
    | "keepRemovedMemory"
    | "keepReplacedDoc"
    | "keepReplacedMemory"
    | "machineName"
    | "projectTypes"
    | "publishInstances"
    | keyof MachineReadsContext
  >
) => {
  const {
    db,
    delegateTypes,
    fleetChanged,
    fleetSyncs,
    keepRemovedMemory,
    keepReplacedDoc,
    keepReplacedMemory,
    machineName,
    projectTypes,
    publishInstances,
  } = ctx;
  return (
    new Elysia()
      // The fleet's user-scope memory (NEW.md §11): the main CLAUDE.md every
      // session loads flat, and the documents it links under
      // `~/.claude/memories/` — each hash-synced to every machine like a skill's
      // files are, and each drifting on its own.
      //
      // `expectedHash` is what the writer had in front of them. A save against a
      // row somebody else has moved answers with what is really there rather than
      // taking the last writer's word for it — two dashboards on one document is
      // the ordinary case here, not the exotic one.
      .put(
        "/api/fleet/memory",
        {
          body: t.Object({
            content: t.String(),
            expectedHash: t.Optional(t.String()),
          }),
        },
        ({ body, status }) => {
          const current = db.getFleetMemory();
          if (
            body.expectedHash !== undefined &&
            current &&
            current.hash !== body.expectedHash
          ) {
            return status(409, current);
          }
          keepReplacedMemory(body.content);
          const memory = db.setFleetMemory(body.content);
          fleetChanged();
          return memory;
        }
      )
      // The machines take back only what their own sidecar says cawco wrote:
      // one edited by hand on a machine stays there, unmanaged. The set goes with
      // it — a linked document with no main file to link it is not a memory, and
      // the machines would keep converging on documents nothing points at.
      // A scoped document is loaded on its own, linked by nothing, so it stays.
      // Each is kept in the history, and the set goes into the trash together.
      .delete("/api/fleet/memory", () => {
        const main = db.getFleetMemory();
        if (!main) {
          return refusal(404, "no-memory", "the fleet keeps no memory");
        }
        const linked = db.listFleetMemoryDocs().filter((doc) => !doc.scope);
        keepRemovedMemory(main);
        for (const doc of linked) {
          keepRemovedMemory(doc);
        }
        const trashed = db.trash.put(
          {
            kind: "memory",
            key: MEMORY_ID,
            docs: linked.map((doc) => doc.path),
          },
          Date.now()
        );
        if (trashed === undefined) {
          return refusal(404, "no-memory", "the fleet keeps no memory");
        }
        fleetChanged();
        return undoable(trashed);
      })
      // One document. Same save as the main file's, keyed by its path —
      // `models/claude-opus-5.md` is the same string on every machine, which
      // is what makes it the row's identity. `scope` names the sessions it is
      // loaded into (core fleet.ts `MemoryScope`): a role, projects, or both;
      // `{}` makes it a linked document again, and left out it stays.
      .put(
        "/api/fleet/memory/docs",
        {
          body: t.Object({
            path: t.String(),
            content: t.String(),
            expectedHash: t.Optional(t.String()),
            scope: t.Optional(
              t.Object({
                role: t.Optional(t.UnionEnum(MEMORY_ROLES)),
                projectIds: t.Optional(t.Array(t.String(), { minItems: 1 })),
                areaIds: t.Optional(t.Array(t.String(), { minItems: 1 })),
                delegateTypes: t.Optional(t.Array(t.String(), { minItems: 1 })),
                model: t.Optional(t.String({ minLength: 1 })),
                briefer: t.Optional(t.Literal(true)),
              })
            ),
          }),
        },
        ({ body, status }) => {
          const problem =
            memoryDocProblem(body.path) ??
            (body.scope ? memoryScopeProblem(body.scope) : undefined);
          if (problem) {
            return refusal(400, "memory-doc-invalid", problem);
          }
          const unknown = body.scope?.projectIds?.find((id) => !db.project(id));
          if (unknown) {
            return refusal(400, "no-project", `there is no project ${unknown}`);
          }
          const noArea = body.scope?.areaIds?.find((id) => !db.areas.get(id));
          if (noArea) {
            return refusal(400, "scope-no-area", areaWords.scopeNoArea(noArea));
          }
          const typeNames = new Set([
            ...delegateTypes.list().map((type) => type.name),
            ...db
              .listProjects()
              .flatMap((project) => projectTypes.typesFor(project.id))
              .map((type) => type.name),
          ]);
          const unknownType = body.scope?.delegateTypes?.find(
            (name) => !typeNames.has(name.trim())
          );
          if (unknownType) {
            return refusal(
              400,
              "no-delegate-type",
              `there is no delegate type ${unknownType}; the catalog has ${[...typeNames].sort().join(", ")}`
            );
          }

          const current = db.getFleetMemoryDoc(body.path);
          if (
            body.expectedHash !== undefined &&
            current &&
            current.hash !== body.expectedHash
          ) {
            return status(409, current);
          }
          keepReplacedDoc(body.path, body.content);
          const doc = db.putFleetMemoryDoc({
            path: body.path,
            content: body.content,
            ...(body.scope ? { scope: body.scope } : {}),
          });
          fleetChanged();
          return doc;
        }
      )
      // Kept before it goes, like every other version this hub replaces: the
      // machines give the file back, and the fleet's copy of it was the last one.
      .delete(
        "/api/fleet/memory/docs",
        { body: t.Object({ path: t.String() }) },
        ({ body }) => {
          const current = db.getFleetMemoryDoc(body.path);
          if (!current) {
            return refusal(
              404,
              "no-memory-doc",
              `the fleet keeps no ${body.path}`
            );
          }

          keepRemovedMemory(current);
          const trashed = db.trash.put(
            { kind: "memoryDoc", key: body.path },
            Date.now()
          );
          if (trashed === undefined) {
            return refusal(
              404,
              "no-memory-doc",
              `the fleet keeps no ${body.path}`
            );
          }
          fleetChanged();
          return undoable(trashed);
        }
      )
      // What one machine really has, without touching anything: the read behind
      // "compare", so a reader chooses between two documents by looking at them.
      .post(
        "/api/fleet/memory/peek",
        { body: t.Object({ machineId: t.String() }) },
        async ({ body, set, status }) => {
          const read = await readMachineMemory(ctx, body.machineId, set);
          if (read instanceof ElysiaStatus) {
            return read;
          }
          // 204: the machine has no user CLAUDE.md.
          return read.copy ?? status(204);
        }
      )
      // The first document has to come from somewhere, and a machine that has been
      // collecting one for a year is where it is. Read off that machine and stored
      // as the fleet's, which every other machine then gets.
      //
      // Whole set by default: the main file and every document beside it, with
      // the fleet's own leftovers taken away — an adoption that left them behind
      // would push them straight back at the machine they were adopted from.
      // `path` narrows it to the one document, for the drifted row that is the
      // only thing being settled.
      .post(
        "/api/fleet/memory/adopt",
        {
          body: t.Object({
            machineId: t.String(),
            path: t.Optional(t.String()),
          }),
        },
        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: validates and merges every field of an adopted memory doc in one place; splitting it would scatter the validation order this route depends on.
        async ({ body, set }) => {
          const read = await readMachineMemory(ctx, body.machineId, set);
          if (read instanceof ElysiaStatus) {
            return read;
          }
          if (!read.copy) {
            return refusal(
              404,
              "has-no-user-claude",
              `${machineName(body.machineId)} has no user CLAUDE.md`
            );
          }

          if (body.path !== undefined) {
            const problem = memoryDocProblem(body.path);
            if (problem) {
              return refusal(400, "memory-doc-invalid", problem);
            }

            const theirs = read.copy.docs.find(
              (entry) => entry.path === body.path
            );
            if (!theirs) {
              return refusal(
                404,
                "no-memory-file",
                `${machineName(body.machineId)} has no ${body.path}`
              );
            }

            keepReplacedDoc(body.path, theirs.content);
            const doc = db.putFleetMemoryDoc({
              path: body.path,
              content: theirs.content,
            });
            fleetChanged();
            return doc;
          }

          keepReplacedMemory(read.copy.content);
          for (const doc of read.copy.docs) {
            if (memoryDocProblem(doc.path)) {
              continue;
            }
            keepReplacedDoc(doc.path, doc.content);
            db.putFleetMemoryDoc({ path: doc.path, content: doc.content });
          }
          const theirs = new Set(read.copy.docs.map((doc) => doc.path));
          for (const doc of db.listFleetMemoryDocs()) {
            // A machine's `memories/` holds the linked documents alone.
            if (theirs.has(doc.path) || doc.scope) {
              continue;
            }
            keepRemovedMemory(doc);
            db.deleteFleetMemoryDoc(doc.path);
          }

          const memory = db.setFleetMemory(read.copy.content);
          fleetChanged();
          return memory;
        }
      )
      // And the other direction, for the machine whose copy was edited: a sync
      // that is allowed to overwrite it, sent at that machine alone.
      //
      // The machine is read first, and a machine that will not answer stops the
      // push: what an overwrite destroys exists nowhere else, so it is kept here
      // before it goes rather than mourned afterwards. `path` forces the one
      // document, so settling a drifted `models/…` does not also overwrite a main
      // file the reader never looked at.
      .post(
        "/api/fleet/memory/push",
        {
          body: t.Object({
            machineId: t.String(),
            path: t.Optional(t.String()),
          }),
        },
        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: validates and pushes every field of a memory write in one place; splitting it would scatter the validation order this route depends on.
        async ({ body, set }) => {
          const target = pushTarget(ctx, body);
          if (target instanceof ElysiaStatus) {
            return target;
          }
          const { config } = target;
          if (!config.memory) {
            return refusal(
              400,
              "no-memory",
              "the fleet keeps no memory to push"
            );
          }

          const read = await readMachineMemory(ctx, body.machineId, set);
          if (read instanceof ElysiaStatus) {
            return read;
          }

          const kept = (
            path: string | undefined,
            hash: string,
            content: string
          ): void => {
            db.recordFleetMemory({
              content,
              hash,
              source: `machine:${body.machineId}`,
              ...(path ? { path } : {}),
            });
          };
          const forced = body.path;
          if (
            read.copy &&
            forced === undefined &&
            read.copy.hash !== config.memory.hash
          ) {
            kept(undefined, read.copy.hash, read.copy.content);
          }
          for (const theirs of read.copy ? read.copy.docs : []) {
            if (forced !== undefined && theirs.path !== forced) {
              continue;
            }
            const ours = config.memory.docs.find(
              (doc) => doc.path === theirs.path
            );
            if (ours && ours.hash !== theirs.hash) {
              kept(theirs.path, theirs.hash, theirs.content);
            }
          }

          fleetSyncs.force(
            body.machineId,
            forced === undefined
              ? [
                  "memory",
                  ...config.memory.docs.map((doc) => `memoryDoc:${doc.path}`),
                ]
              : [`memoryDoc:${forced}`]
          );
          fleetSyncs.changed(`an overwrite of ${forced ?? "the memory"}`, {
            machineId: body.machineId,
          });
          publishInstances(body.machineId);
          return { ok: true };
        }
      )
      // What the memory used to say, newest first. Without the content: the list
      // is read on every open of the panel, and a version is read on a click.
      //
      // One document at a time: `?path=` for a linked one, and the main file when
      // nothing is named — which is what every version written before the set is.
      .get(
        "/api/fleet/memory/history",
        { query: t.Object({ path: t.Optional(t.String()) }) },
        ({ query }) => db.listFleetMemoryHistory(query.path)
      )
      .get("/api/fleet/memory/history/:id", ({ params }) => {
        const version = db.fleetMemoryVersion(Number(params.id));
        return (
          version ??
          refusal(404, "no-memory-version", `no memory version ${params.id}`)
        );
      })
      // Undo, through the same door as a save — so what restoring replaces is
      // itself kept, and a restore of the wrong version is undone the same way.
      // A version goes back where it came from: the document it was a version of,
      // or the main file, which is what a version with no path is.
      .post(
        "/api/fleet/memory/restore",
        { body: t.Object({ id: t.Number() }) },
        ({ body }) => {
          const version = db.fleetMemoryVersion(body.id);
          if (!version) {
            return refusal(
              404,
              "no-memory-version",
              `no memory version ${body.id}`
            );
          }

          if (version.path !== undefined) {
            keepReplacedDoc(version.path, version.content);
            const doc = db.putFleetMemoryDoc({
              path: version.path,
              content: version.content,
            });
            fleetChanged();
            return doc;
          }

          keepReplacedMemory(version.content);
          const memory = db.setFleetMemory(version.content);
          fleetChanged();
          return memory;
        }
      )
  );
};
