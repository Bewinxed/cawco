/**
 * Who decides' routes (build spec §2.1, core decides.ts): the fleet's
 * members, kinds and routes, a project's table, and a member's record.
 * Every write that names an unknown member or kind is refused, whichever
 * way it comes (here, a session's `folder_write`, the folder's `PUT`): a
 * project's decides.md passes core `decidesFileProblems` at every write
 * (project-folder.ts `guardFolderFile`, mounted in server.ts).
 *
 * A member he adds is an agent that runs as the fleet delegate type of the
 * same name: its Runs on and Knows are the type's, its standing
 * instructions the type's description. Both are written together.
 */
import type { DelegateType, EffortLevel, HarnessKind } from "@cawco/core";
import { EFFORT_LEVELS, HARNESSES } from "@cawco/core";
import {
  BUILT_IN_MEMBERS,
  CAW_POSE_IDS,
  DECIDES_ID,
  type DecidesOwn,
  decidesFileOf,
  type FleetDecides,
  type FlockMember,
  HEARS,
  type Hear,
  type Kind,
  kindOf,
  type Member,
  memberOf,
  readDecides,
  slugOf,
} from "@cawco/core/decides";
import { decidesWords } from "@cawco/core/words/decides";
import { Elysia, status, t } from "elysia";
import type { DecidesDb } from "./db/decides";
import { DECIDES_FILE, decidesTable, decidesText } from "./decides-file";
import type { DelegateTypesShape } from "./delegate-types";
import {
  FolderRefusal,
  MESSAGE_LIMIT,
  refused,
  writeFolderFile,
  YOU,
} from "./project-folder";

/** A harness on the fleet, as the page draws setup from it. */
export interface HarnessOffer {
  id: string;
  /** The online machines it runs on, by name. */
  machines: string[];
  models: { default: boolean; id: string; name: string }[];
  name: string;
}

export interface DecidesDeps {
  readonly db: DecidesDb;
  /** The harnesses on online machines, with their models (`agent_harnesses`). */
  readonly harnesses: () => HarnessOffer[];
  /** Whether work item `id` is still starting or running. */
  readonly live: (workItemId: string) => boolean;
  /** Project `id`, by its name; undefined when the hub keeps none. */
  readonly project: (id: string) => { id: string; name: string } | undefined;
  /** Every project, for the files a removal rewrites. */
  readonly projects: () => { id: string; name: string }[];
  /** Refiles open cards of page `artifactId` from kind `from` to `to` through the page's revision path; answers whether it took. */
  readonly refile: (
    artifactId: string,
    program: string,
    cards: string[],
    from: string,
    to: string
  ) => Promise<boolean>;
  /** The fleet's skills catalog. */
  readonly skills: () => { id: string; note: string }[];
  /** The cost of `instances`' turns since `since`, in dollars. */
  readonly spend: (instances: string[], since: Date) => number;
  /** Puts delegate type `name` in the trash for its Undo (db/trash.ts). */
  readonly trashType: (name: string) => number | undefined;
  readonly types: DelegateTypesShape;
  /** The open decision pages' cards under kind `kind`, by page (artifacts/service.ts `waitingUnder`). */
  readonly waitingUnder: (kind: string) => {
    cards: string[];
    program: string;
    row: { id: string; projectId: string | null };
  }[];
}

/** A refusal in Who decides' words, with its status. */
class DecidesRefusal extends Error {
  readonly status: 403 | 404 | 409 | 422;
  constructor(code: 403 | 404 | 409 | 422, message: string) {
    super(message);
    this.status = code;
  }
}

/** A route's work, its refusal answered in its status and words. */
const answered = async <T>(work: () => T | Promise<T>) => {
  try {
    return await work();
  } catch (error) {
    if (error instanceof DecidesRefusal) {
      return status(error.status, error.message);
    }
    return refused(error);
  }
};

const AGENT = t.Object({
  harness: t.Union(HARNESSES.map((harness) => t.Literal(harness))),
  model: t.String({ minLength: 1 }),
  effort: t.Optional(t.Union(EFFORT_LEVELS.map((level) => t.Literal(level)))),
  skills: t.Array(t.String()),
  instructions: t.String(),
  delegates: t.Boolean(),
});
/** An agent member's Runs on and Knows, as the page sends them. */
interface AgentBody {
  delegates: boolean;
  effort?: EffortLevel;
  harness: HarnessKind;
  instructions: string;
  model: string;
  skills: string[];
}
const HEAR = t.Union(HEARS.map((hear) => t.Literal(hear)));
const HUE = t.Integer({ minimum: 1, maximum: 8 });

/** The first of `ids` the fleet knows no member by, refused. */
const knownMembers = (fleet: FleetDecides, ids: string[]): void => {
  const unknown = ids.find((id) => !memberOf(fleet, id));
  if (unknown !== undefined) {
    throw new DecidesRefusal(422, decidesWords.unknownMember(unknown));
  }
};

/** The first of `ids` the fleet knows no kind by, refused. */
const knownKinds = (fleet: FleetDecides, ids: string[]): void => {
  const unknown = ids.find((id) => !kindOf(fleet, id));
  if (unknown !== undefined) {
    throw new DecidesRefusal(422, decidesWords.unknownKind(unknown));
  }
};

/** A project's decides.md as read now: its own lines and its text; undefined when it has none or it doesn't read. */
const projectOwn = async (
  projectId: string,
  fleet: FleetDecides
): Promise<{ own: DecidesOwn; text: string } | undefined> => {
  const text = await decidesText(projectId);
  if (text === undefined) {
    return;
  }
  const reading = readDecides(text, fleet);
  return reading.ok
    ? { own: { routes: reading.routes, yours: reading.yours }, text }
    : undefined;
};

export const decidesRoutes = (deps: DecidesDeps) => {
  const { db, types } = deps;

  /** The project `id`, refused when the hub keeps none. */
  const known = (id: string) => {
    const project = deps.project(id);
    if (!project) {
      throw new FolderRefusal(404, `The hub keeps no project ${id}.`);
    }
    return project;
  };

  /** A member he added, or refused: unknown, or built in. */
  const added = (id: string): Member => {
    const member = memberOf(db.fleet(), id);
    if (!member) {
      throw new DecidesRefusal(404, decidesWords.unknownMember(id));
    }
    if (member.builtIn) {
      throw new DecidesRefusal(403, decidesWords.builtInMember);
    }
    return member;
  };

  /** The agent body as the fleet delegate type `name`, refused when its harness runs nowhere or the type doesn't read. */
  const typeOf = (
    name: string,
    agent: AgentBody,
    was?: DelegateType
  ): DelegateType => {
    const offer = deps.harnesses().find((one) => one.id === agent.harness);
    if (!offer || offer.machines.length === 0) {
      throw new DecidesRefusal(
        422,
        decidesWords.noMachine(offer?.name ?? agent.harness)
      );
    }
    const type: DelegateType = {
      ...was,
      name,
      description: agent.instructions.trim() || (was?.description ?? ""),
      harness: agent.harness,
      model: agent.model,
      ...(agent.effort ? { effort: agent.effort } : {}),
      skills: agent.skills,
      canDelegate: agent.delegates,
    };
    if (!type.description.trim()) {
      throw new DecidesRefusal(422, decidesWords.instructionsMissing);
    }
    return type;
  };

  /** A member whose settings he changes here, or refused: unknown, Caw (his are the project's), You or The agent (none). */
  const editable = (id: string): Member => {
    const member = memberOf(db.fleet(), id);
    if (!member) {
      throw new DecidesRefusal(404, decidesWords.unknownMember(id));
    }
    if (member.type === "caw") {
      throw new DecidesRefusal(403, decidesWords.cawRunsOn);
    }
    if (member.type === "you" || member.type === "asker") {
      throw new DecidesRefusal(403, decidesWords.builtInMember);
    }
    return member;
  };

  /** An agent member's settings saved: its delegate type, and how he hears (the built-ins') or its row (one he added). */
  const saveMember = (
    member: Member,
    body: { agent: AgentBody; hear: Hear; hue?: number; job?: string }
  ): Member => {
    const typeName = member.delegateType as string;
    const type = typeOf(typeName, body.agent, types.get(typeName));
    if (member.type === "advisor" || member.type === "practice") {
      types.put(type);
      db.setBuiltIn({ hear: { [member.type]: body.hear } });
      return memberOf(db.fleet(), member.id) as Member;
    }
    const row = db.members().find((one) => one.id === member.id);
    if (!row) {
      throw new DecidesRefusal(404, decidesWords.unknownMember(member.id));
    }
    db.putMember(
      {
        ...row,
        job: body.job?.trim() ?? row.job,
        hue: body.hue ?? row.hue,
        hear: body.hear,
      },
      type
    );
    return memberOf(db.fleet(), member.id) as Member;
  };

  /** A kind's name and example as given, refused when either is empty or the name is another kind's. */
  const kindFields = (
    fleet: FleetDecides,
    body: { example: string; name: string },
    except?: string
  ): { example: string; name: string } => {
    const name = body.name.trim();
    const example = body.example.trim();
    if (!(name && slugOf(name) && example)) {
      throw new DecidesRefusal(422, decidesWords.kindFields);
    }
    const taken = fleet.kinds.some(
      (one) =>
        one.id !== except &&
        (one.name.toLowerCase() === name.toLowerCase() ||
          (except === undefined && one.id === slugOf(name)))
    );
    if (taken) {
      throw new DecidesRefusal(409, decidesWords.kindTaken(name));
    }
    return { name, example };
  };

  /** Kind `id` as one he may remove into `moveTo`, or refused: unknown, built in, or moved into itself or no kind. */
  const removable = (fleet: FleetDecides, id: string, moveTo: string): Kind => {
    const kind = kindOf(fleet, id);
    if (!kind) {
      throw new DecidesRefusal(404, decidesWords.unknownKind(id));
    }
    if (kind.builtIn) {
      throw new DecidesRefusal(403, decidesWords.builtInKind);
    }
    if (moveTo === kind.id) {
      throw new DecidesRefusal(422, decidesWords.moveToSelf);
    }
    knownKinds(fleet, [moveTo]);
    return kind;
  };

  /** Every open card under kind `from` refiled as `to`, page by page; answers how many moved and the projects they are in. */
  const refileAll = async (
    from: string,
    to: string
  ): Promise<{ moved: number; projects: Set<string> }> => {
    let moved = 0;
    const projects = new Set<string>();
    for (const page of deps.waitingUnder(from)) {
      const took = await deps.refile(
        page.row.id,
        page.program,
        page.cards,
        from,
        to
      );
      if (took) {
        moved += page.cards.length;
        if (page.row.projectId) {
          projects.add(page.row.projectId);
        }
      }
    }
    return { moved, projects };
  };

  /** Project `projectId`'s decides.md with `routes` set over its own (null: back to the fleet's), refused when the file doesn't read. */
  const projectFile = async (
    projectId: string,
    fleet: FleetDecides,
    routes: Record<string, string | null>
  ): Promise<string> => {
    const text = (await decidesText(projectId)) ?? null;
    const reading = text === null ? undefined : readDecides(text, fleet);
    if (reading && !reading.ok) {
      throw new DecidesRefusal(
        409,
        decidesWords.fileUnread(reading.problems.join(" "))
      );
    }
    const own = { ...(reading?.routes ?? {}) };
    for (const [kind, member] of Object.entries(routes)) {
      if (member === null) {
        delete own[kind];
      } else {
        own[kind] = member;
      }
    }
    return decidesFileOf(
      { routes: own, yours: reading?.yours ?? [] },
      fleet.kinds,
      text
    );
  };

  /** Writes each project's decides.md that `change` rewrites, one commit each; answers the projects written. */
  const rewriteProjects = async (
    fleet: FleetDecides,
    change: (own: DecidesOwn) => DecidesOwn | undefined,
    message: string
  ): Promise<{ id: string; write: () => Promise<unknown> }[]> => {
    const writes: { id: string; write: () => Promise<unknown> }[] = [];
    for (const project of deps.projects()) {
      const read = await projectOwn(project.id, fleet);
      const next = read ? change(read.own) : undefined;
      if (read && next) {
        const content = decidesFileOf(next, fleet.kinds, read.text);
        writes.push({
          id: project.id,
          write: () =>
            writeFolderFile(project.id, DECIDES_FILE, content, {
              author: YOU,
              message,
            }),
        });
      }
    }
    return writes;
  };

  return new Elysia()
    .get("/api/decides", () => ({
      ...db.fleet(),
      harnesses: deps.harnesses(),
      skills: deps.skills(),
      connections: { slack: false, email: false },
    }))
    .put(
      "/api/decides/routes",
      { body: t.Object({ routes: t.Record(t.String(), t.String()) }) },
      ({ body }) =>
        answered(() => {
          const fleet = db.fleet();
          knownKinds(fleet, Object.keys(body.routes));
          knownMembers(fleet, Object.values(body.routes));
          db.setRoutes(body.routes);
          return db.fleet();
        })
    )
    .post(
      "/api/decides/members",
      {
        body: t.Object({
          name: t.String(),
          job: t.String(),
          hue: HUE,
          hear: HEAR,
          agent: AGENT,
        }),
      },
      ({ body }) =>
        answered(() => {
          const name = body.name.trim();
          const id = slugOf(name);
          if (!(name && id)) {
            throw new DecidesRefusal(422, decidesWords.nameMissing);
          }
          const fleet = db.fleet();
          if (
            memberOf(fleet, id) ||
            (BUILT_IN_MEMBERS as readonly string[]).includes(id) ||
            types.get(id) ||
            !DECIDES_ID.test(id)
          ) {
            throw new DecidesRefusal(409, decidesWords.nameTaken(name));
          }
          db.putMember(
            {
              id,
              type: "agent",
              name,
              job: body.job.trim(),
              subject: name,
              hue: body.hue,
              hear: body.hear,
              delegateType: id,
              reach: null,
            },
            typeOf(id, body.agent)
          );
          return memberOf(db.fleet(), id) as Member;
        })
    )
    .put(
      "/api/decides/members/:id",
      {
        body: t.Object({
          job: t.Optional(t.String()),
          hue: t.Optional(HUE),
          hear: HEAR,
          agent: AGENT,
        }),
      },
      ({ params, body }) =>
        answered(() => saveMember(editable(params.id), body))
    )
    .put(
      "/api/decides/members/:id/picture",
      {
        body: t.Union([
          t.Object({
            pose: t.Union(CAW_POSE_IDS.map((pose) => t.Literal(pose))),
          }),
          t.Object({ hue: HUE }),
        ]),
      },
      ({ params, body }) =>
        answered(() => {
          const member = memberOf(db.fleet(), params.id);
          if (!member) {
            throw new DecidesRefusal(
              404,
              decidesWords.unknownMember(params.id)
            );
          }
          if ("pose" in body) {
            if (member.pose === null) {
              throw new DecidesRefusal(
                422,
                decidesWords.wearsMark(member.name)
              );
            }
            db.setBuiltIn({
              pictures: { [member.id as FlockMember]: body.pose },
            });
          } else {
            const row = db.members().find((one) => one.id === member.id);
            if (!row) {
              throw new DecidesRefusal(
                422,
                decidesWords.wearsPose(member.name)
              );
            }
            db.putMember({ ...row, hue: body.hue }, null);
          }
          return memberOf(db.fleet(), member.id) as Member;
        })
    )
    .delete("/api/decides/members/:id", ({ params }) =>
      answered(async () => {
        const member = added(params.id);
        const fleet = db.fleet();
        const writes = await rewriteProjects(
          fleet,
          (own) => {
            const kinds = Object.keys(own.routes).filter(
              (kind) => own.routes[kind] === member.id
            );
            return kinds.length > 0
              ? {
                  ...own,
                  routes: {
                    ...own.routes,
                    ...Object.fromEntries(kinds.map((kind) => [kind, "you"])),
                  },
                }
              : undefined;
          },
          decidesWords.removedCommit(
            member.name,
            fleet.kinds
              .filter((kind) => fleet.routes[kind.id] === member.id)
              .map((kind) => kind.name)
          )
        );
        // Its delegate type goes to the trash, as a type's delete does.
        if (member.delegateType) {
          deps.trashType(member.delegateType);
        }
        const kindsReturned = db.removeMember(member.id);
        for (const one of writes) {
          await one.write();
        }
        return {
          kindsReturned,
          projectsRewritten: writes.map((one) => one.id),
        };
      })
    )
    .post(
      "/api/decides/kinds",
      {
        body: t.Object({
          name: t.String(),
          example: t.String(),
          to: t.String(),
        }),
      },
      ({ body }) =>
        answered(() => {
          const fleet = db.fleet();
          const { name, example } = kindFields(fleet, body);
          const id = slugOf(name);
          knownMembers(fleet, [body.to]);
          const kind: Kind = {
            id,
            name,
            example,
            builtIn: false,
            position:
              fleet.kinds.reduce(
                (most, one) => Math.max(most, one.position),
                -1
              ) + 1,
          };
          db.putKind(kind);
          db.setRoutes({ ...fleet.routes, [id]: body.to });
          return kind;
        })
    )
    .put(
      "/api/decides/kinds/:id",
      { body: t.Object({ name: t.String(), example: t.String() }) },
      ({ params, body }) =>
        answered(() => {
          const fleet = db.fleet();
          const kind = kindOf(fleet, params.id);
          if (!kind) {
            throw new DecidesRefusal(404, decidesWords.unknownKind(params.id));
          }
          const { name, example } = kindFields(fleet, body, kind.id);
          const renamed = { ...kind, name, example };
          db.putKind(renamed);
          return renamed;
        })
    )
    .delete(
      "/api/decides/kinds/:id",
      { body: t.Object({ moveTo: t.String() }) },
      ({ params, body }) =>
        answered(async () => {
          const fleet = db.fleet();
          const kind = removable(fleet, params.id, body.moveTo);
          // Read every project's file while the kind still reads in it.
          const writes = await rewriteProjects(
            fleet,
            (own) => {
              if (!(kind.id in own.routes)) {
                return;
              }
              const { [kind.id]: _gone, ...routes } = own.routes;
              return { ...own, routes };
            },
            decidesWords.kindRemovedCommit(kind.name)
          );
          const { moved, projects } = await refileAll(kind.id, body.moveTo);
          db.removeKind(kind.id, body.moveTo);
          for (const one of writes) {
            await one.write();
            projects.add(one.id);
          }
          return { moved, projects: [...projects] };
        })
    )
    .get("/api/decides/kinds/:id/waiting", ({ params }) =>
      answered(() => {
        const pages = deps.waitingUnder(params.id);
        return {
          count: pages.reduce((sum, page) => sum + page.cards.length, 0),
          projects: [
            ...new Set(
              pages.flatMap((page) =>
                page.row.projectId ? [page.row.projectId] : []
              )
            ),
          ],
        };
      })
    )
    .get("/api/decides/members/:id/record", ({ params }) =>
      answered(() => {
        if (!memberOf(db.fleet(), params.id)) {
          throw new DecidesRefusal(404, decidesWords.unknownMember(params.id));
        }
        const record = db.record(params.id);
        const month = new Date();
        month.setDate(1);
        month.setHours(0, 0, 0, 0);
        return {
          decided: record.decided,
          lastAt: record.lastAt?.toISOString() ?? null,
          takenBack: record.takenBack,
          waiting: record.unsettled.filter((row) =>
            row.workItemId ? deps.live(row.workItemId) : row.signed === null
          ).length,
          spendUsd: deps.spend(record.instances, month),
        };
      })
    )
    .get("/api/projects/:id/decides", ({ params }) =>
      answered(async () => {
        known(params.id);
        return {
          file: DECIDES_FILE,
          decides: await decidesTable(params.id, db.fleet()),
        };
      })
    )
    .put(
      "/api/projects/:id/decides",
      {
        body: t.Object({
          routes: t.Record(t.String(), t.Nullable(t.String())),
          message: t.String({ minLength: 1, maxLength: MESSAGE_LIMIT }),
        }),
      },
      ({ params, body }) =>
        answered(async () => {
          known(params.id);
          const fleet = db.fleet();
          knownKinds(fleet, Object.keys(body.routes));
          knownMembers(
            fleet,
            Object.values(body.routes).filter((id): id is string => id !== null)
          );
          await writeFolderFile(
            params.id,
            DECIDES_FILE,
            await projectFile(params.id, fleet, body.routes),
            { author: YOU, message: body.message }
          );
          return {
            file: DECIDES_FILE,
            decides: await decidesTable(params.id, db.fleet()),
          };
        })
    );
};
