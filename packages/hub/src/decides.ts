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
import type { DelegateType } from "@cawco/core/delegate-types";
import { ANY_TYPE } from "@cawco/core/delegate-types";
import type { EffortLevel, HarnessKind } from "@cawco/core/harness/kinds";
import { EFFORT_LEVELS, HARNESSES } from "@cawco/core/harness/kinds";
import { decidesWords } from "@cawco/core/words/decides";
import { Elysia, ElysiaStatus, problem, t } from "elysia";
import type { DecidesDb } from "./db/decides";
import type { DelegateTypesShape } from "./db/delegate-types";
import { DECIDES_FILE, decidesTable, decidesText } from "./decides-file";
import { MESSAGE_LIMIT, writeFolderFile, YOU } from "./project-folder";

/** A harness on the fleet, as the page draws setup from it. */
export interface HarnessOffer {
  id: string;
  /** The online machines it runs on, by name. */
  machines: string[];
  models: { default: boolean; id: string; name: string }[];
  name: string;
}

export interface DecidesDeps {
  /** Project `projectId`'s Caw: his conversations' cost since `since`, how many he has had, and his newest turn (ms epoch). */
  readonly cawRecord: (
    projectId: string,
    since: Date
  ) => { lastTurnAt: number | null; spendUsd: number; threads: number };
  readonly db: DecidesDb;
  /** The harnesses on online machines, with their models (`agent_harnesses`). */
  readonly harnesses: () => HarnessOffer[];
  /** Whether work item `id` is still starting or running. */
  readonly live: (workItemId: string) => boolean;
  /** Project `id`, by its name; undefined when the hub keeps none. */
  readonly project: (
    id: string
  ) => { areaId: string | null; id: string; name: string } | undefined;
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

const AGENT = t.Object({
  harness: t.UnionEnum(HARNESSES),
  model: t.String({ minLength: 1 }),
  effort: t.Optional(t.UnionEnum(EFFORT_LEVELS)),
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
const HEAR = t.UnionEnum(HEARS);
const HUE = t.Integer({ minimum: 1, maximum: 8 });

/** The refusal of the first of `ids` the fleet knows no member by; none when it knows them all. */
const unknownMembers = (fleet: FleetDecides, ids: string[]) => {
  const unknown = ids.find((id) => !memberOf(fleet, id));
  return unknown === undefined
    ? undefined
    : problem(422, {
        code: "decides-routed-member-unknown",
        detail: decidesWords.unknownMember(unknown),
      });
};

/** The refusal of the first of `ids` the fleet knows no kind by; none when it knows them all. */
const unknownKinds = (fleet: FleetDecides, ids: string[]) => {
  const unknown = ids.find((id) => !kindOf(fleet, id));
  return unknown === undefined
    ? undefined
    : problem(422, {
        code: "decides-routed-kind-unknown",
        detail: decidesWords.unknownKind(unknown),
      });
};

/** The refusal of `routes` naming a kind or a member the fleet does not know; none when it knows them all. */
const unknownRoutes = (
  fleet: FleetDecides,
  routes: Record<string, string | null>
) =>
  unknownKinds(fleet, Object.keys(routes)) ??
  unknownMembers(
    fleet,
    Object.values(routes).filter((id): id is string => id !== null)
  );

/** A project's decides.md as read now: its own lines and its text; undefined when it has none or it doesn't read. */
const projectOwn = async (projectId: string, fleet: FleetDecides) => {
  const text = await decidesText(projectId);
  if (text === undefined || text instanceof ElysiaStatus) {
    return text;
  }
  const reading = readDecides(text, fleet);
  return reading.ok
    ? { own: { routes: reading.routes, yours: reading.yours }, text }
    : undefined;
};

export const decidesRoutes = (deps: DecidesDeps) => {
  const { db, types } = deps;

  /** The refusal of a project the hub does not keep; none for one it does. */
  const unknownProject = (id: string) =>
    deps.project(id)
      ? undefined
      : problem(404, {
          code: "decides-project-unknown",
          detail: `The hub keeps no project ${id}.`,
        });
  /** The area a project sits in, for its table (decides-file.ts); null: none. */
  const areaOf = (id: string): string | null =>
    deps.project(id)?.areaId ?? null;

  /** The member `id`, or its problem: the fleet has none. */
  const known = (id: string) =>
    memberOf(db.fleet(), id) ??
    problem(404, {
      code: "decides-member-unknown",
      detail: decidesWords.unknownMember(id),
    });

  /** A member he added, or refused: unknown, or built in. */
  const added = (id: string) => {
    const member = known(id);
    if (member instanceof ElysiaStatus) {
      return member;
    }
    if (member.builtIn) {
      return problem(403, {
        code: "decides-member-built-in",
        detail: decidesWords.builtInMember,
      });
    }
    return member;
  };

  /** The agent body as the fleet delegate type `name`, refused when its harness runs nowhere or the type doesn't read. */
  const typeOf = (name: string, agent: AgentBody, was?: DelegateType) => {
    const offer = deps.harnesses().find((one) => one.id === agent.harness);
    if (!offer || offer.machines.length === 0) {
      return problem(422, {
        code: "decides-harness-runs-nowhere",
        detail: decidesWords.noMachine(offer?.name ?? agent.harness),
      });
    }
    const type: DelegateType = {
      ...was,
      name,
      description: agent.instructions.trim() || (was?.description ?? ""),
      harness: agent.harness,
      model: agent.model,
      ...(agent.effort ? { effort: agent.effort } : {}),
      skills: agent.skills,
      // Its switch is every type or none of its own choosing: off keeps
      // the types the type's own settings name.
      mayStart: agent.delegates
        ? [ANY_TYPE]
        : (was?.mayStart?.filter((kept) => kept !== ANY_TYPE) ?? []),
    };
    if (!type.description.trim()) {
      return problem(422, {
        code: "decides-instructions-missing",
        detail: decidesWords.instructionsMissing,
      });
    }
    return type;
  };

  /** A member whose settings he changes here, or refused: unknown, Caw (his are the project's), You or The agent (none). */
  const editable = (id: string) => {
    const member = known(id);
    if (member instanceof ElysiaStatus) {
      return member;
    }
    if (member.type === "caw") {
      return problem(403, {
        code: "decides-caw-runs-on",
        detail: decidesWords.cawRunsOn,
      });
    }
    if (member.type === "you" || member.type === "asker") {
      return problem(403, {
        code: "decides-member-built-in",
        detail: decidesWords.builtInMember,
      });
    }
    return member;
  };

  /** An agent member's settings saved: its delegate type, and how he hears (the built-ins') or its row (one he added). */
  const saveMember = (
    member: Member,
    body: { agent: AgentBody; hear: Hear; hue?: number; job?: string }
  ) => {
    const typeName = member.delegateType as string;
    const type = typeOf(typeName, body.agent, types.get(typeName));
    if (type instanceof ElysiaStatus) {
      return type;
    }
    if (member.type === "advisor" || member.type === "practice") {
      types.put(type);
      db.setBuiltIn({ hear: { [member.type]: body.hear } });
      return memberOf(db.fleet(), member.id) as Member;
    }
    const row = db.members().find((one) => one.id === member.id);
    if (!row) {
      return problem(404, {
        code: "decides-member-unknown",
        detail: decidesWords.unknownMember(member.id),
      });
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
  ) => {
    const name = body.name.trim();
    const example = body.example.trim();
    if (!(name && slugOf(name) && example)) {
      return problem(422, {
        code: "decides-kind-fields-missing",
        detail: decidesWords.kindFields,
      });
    }
    const taken = fleet.kinds.some(
      (one) =>
        one.id !== except &&
        (one.name.toLowerCase() === name.toLowerCase() ||
          (except === undefined && one.id === slugOf(name)))
    );
    if (taken) {
      return problem(409, {
        code: "decides-kind-taken",
        detail: decidesWords.kindTaken(name),
      });
    }
    return { name, example };
  };

  /** Kind `id` as one he may remove into `moveTo`, or refused: unknown, built in, or moved into itself or no kind. */
  const removable = (fleet: FleetDecides, id: string, moveTo: string) => {
    const kind = kindOf(fleet, id);
    if (!kind) {
      return problem(404, {
        code: "decides-kind-unknown",
        detail: decidesWords.unknownKind(id),
      });
    }
    if (kind.builtIn) {
      return problem(403, {
        code: "decides-kind-built-in",
        detail: decidesWords.builtInKind,
      });
    }
    if (moveTo === kind.id) {
      return problem(422, {
        code: "decides-kind-moved-to-itself",
        detail: decidesWords.moveToSelf,
      });
    }
    return unknownKinds(fleet, [moveTo]) ?? kind;
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
  ) => {
    const read = await decidesText(projectId);
    if (read instanceof ElysiaStatus) {
      return read;
    }
    const text = read ?? null;
    const reading = text === null ? undefined : readDecides(text, fleet);
    if (reading && !reading.ok) {
      return problem(409, {
        code: "decides-file-unread",
        detail: decidesWords.fileUnread(reading.problems.join(" ")),
      });
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

  /** Each project's decides.md as `change` rewrites it, for one commit each ({@link writeRewrites}); a project it leaves is not among them. */
  const rewriteProjects = async (
    fleet: FleetDecides,
    change: (own: DecidesOwn) => DecidesOwn | undefined
  ) => {
    const rewrites: { content: string; id: string }[] = [];
    for (const project of deps.projects()) {
      const read = await projectOwn(project.id, fleet);
      if (read instanceof ElysiaStatus) {
        return read;
      }
      const next = read ? change(read.own) : undefined;
      if (read && next) {
        rewrites.push({
          id: project.id,
          content: decidesFileOf(next, fleet.kinds, read.text),
        });
      }
    }
    return rewrites;
  };

  /** Writes each of {@link rewriteProjects}' files, one commit each, under `message`; stops at the first the folder refuses. */
  const writeRewrites = async (
    rewrites: { content: string; id: string }[],
    message: string
  ) => {
    for (const one of rewrites) {
      const written = await writeFolderFile(one.id, DECIDES_FILE, one.content, {
        author: YOU,
        message,
      });
      if (written instanceof ElysiaStatus) {
        return written;
      }
    }
  };

  return (
    new Elysia()
      .get("/api/decides", () => ({
        ...db.fleet(),
        harnesses: deps.harnesses(),
        skills: deps.skills(),
        connections: { slack: false, email: false },
      }))
      .put(
        "/api/decides/routes",
        { body: t.Object({ routes: t.Record(t.String(), t.String()) }) },
        ({ body }) => {
          const unknown = unknownRoutes(db.fleet(), body.routes);
          if (unknown) {
            return unknown;
          }
          db.setRoutes(body.routes);
          return db.fleet();
        }
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
        ({ body }) => {
          const name = body.name.trim();
          const id = slugOf(name);
          if (!(name && id)) {
            return problem(422, {
              code: "decides-member-name-missing",
              detail: decidesWords.nameMissing,
            });
          }
          const fleet = db.fleet();
          if (
            memberOf(fleet, id) ||
            (BUILT_IN_MEMBERS as readonly string[]).includes(id) ||
            types.get(id) ||
            !DECIDES_ID.test(id)
          ) {
            return problem(409, {
              code: "decides-member-name-taken",
              detail: decidesWords.nameTaken(name),
            });
          }
          const type = typeOf(id, body.agent);
          if (type instanceof ElysiaStatus) {
            return type;
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
            },
            type
          );
          return memberOf(db.fleet(), id) as Member;
        }
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
        ({ params, body }) => {
          const member = editable(params.id);
          return member instanceof ElysiaStatus
            ? member
            : saveMember(member, body);
        }
      )
      .put(
        "/api/decides/members/:id/picture",
        {
          body: t.Union([
            t.Object({
              pose: t.UnionEnum(CAW_POSE_IDS),
            }),
            t.Object({ hue: HUE }),
          ]),
        },
        ({ params, body }) => {
          const member = known(params.id);
          if (member instanceof ElysiaStatus) {
            return member;
          }
          if ("pose" in body) {
            if (member.pose === null) {
              return problem(422, {
                code: "decides-member-wears-mark",
                detail: decidesWords.wearsMark(member.name),
              });
            }
            db.setBuiltIn({
              pictures: { [member.id as FlockMember]: body.pose },
            });
          } else {
            const row = db.members().find((one) => one.id === member.id);
            if (!row) {
              return problem(422, {
                code: "decides-member-wears-pose",
                detail: decidesWords.wearsPose(member.name),
              });
            }
            db.putMember({ ...row, hue: body.hue }, null);
          }
          return memberOf(db.fleet(), member.id) as Member;
        }
      )
      .delete("/api/decides/members/:id", async ({ params }) => {
        const member = added(params.id);
        if (member instanceof ElysiaStatus) {
          return member;
        }
        const fleet = db.fleet();
        const rewrites = await rewriteProjects(fleet, (own) => {
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
        });
        if (rewrites instanceof ElysiaStatus) {
          return rewrites;
        }
        // Its delegate type goes to the trash, as a type's delete does.
        if (member.delegateType) {
          deps.trashType(member.delegateType);
        }
        const kindsReturned = db.removeMember(member.id);
        const written = await writeRewrites(
          rewrites,
          decidesWords.removedCommit(
            member.name,
            fleet.kinds
              .filter((kind) => fleet.routes[kind.id] === member.id)
              .map((kind) => kind.name)
          )
        );
        if (written instanceof ElysiaStatus) {
          return written;
        }
        return {
          kindsReturned,
          projectsRewritten: rewrites.map((one) => one.id),
        };
      })
      .post(
        "/api/decides/kinds",
        {
          body: t.Object({
            name: t.String(),
            example: t.String(),
            to: t.String(),
          }),
        },
        ({ body }) => {
          const fleet = db.fleet();
          const fields = kindFields(fleet, body);
          if (fields instanceof ElysiaStatus) {
            return fields;
          }
          const unknown = unknownMembers(fleet, [body.to]);
          if (unknown) {
            return unknown;
          }
          const { name, example } = fields;
          const id = slugOf(name);
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
        }
      )
      .put(
        "/api/decides/kinds/:id",
        { body: t.Object({ name: t.String(), example: t.String() }) },
        ({ params, body }) => {
          const fleet = db.fleet();
          const kind = kindOf(fleet, params.id);
          if (!kind) {
            return problem(404, {
              code: "decides-kind-unknown",
              detail: decidesWords.unknownKind(params.id),
            });
          }
          const fields = kindFields(fleet, body, kind.id);
          if (fields instanceof ElysiaStatus) {
            return fields;
          }
          const renamed = { ...kind, ...fields };
          db.putKind(renamed);
          return renamed;
        }
      )
      .delete(
        "/api/decides/kinds/:id",
        { body: t.Object({ moveTo: t.String() }) },
        async ({ params, body }) => {
          const fleet = db.fleet();
          const kind = removable(fleet, params.id, body.moveTo);
          if (kind instanceof ElysiaStatus) {
            return kind;
          }
          // Read every project's file while the kind still reads in it.
          const rewrites = await rewriteProjects(fleet, (own) => {
            if (!(kind.id in own.routes)) {
              return;
            }
            const { [kind.id]: _gone, ...routes } = own.routes;
            return { ...own, routes };
          });
          if (rewrites instanceof ElysiaStatus) {
            return rewrites;
          }
          const { moved, projects } = await refileAll(kind.id, body.moveTo);
          db.removeKind(kind.id, body.moveTo);
          const written = await writeRewrites(
            rewrites,
            decidesWords.kindRemovedCommit(kind.name)
          );
          if (written instanceof ElysiaStatus) {
            return written;
          }
          for (const one of rewrites) {
            projects.add(one.id);
          }
          return { moved, projects: [...projects] };
        }
      )
      .get("/api/decides/kinds/:id/waiting", ({ params }) => {
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
      .get(
        "/api/decides/members/:id/record",
        { query: t.Object({ project: t.Optional(t.String()) }) },
        ({ params, query }) => {
          const member = known(params.id);
          if (member instanceof ElysiaStatus) {
            return member;
          }
          const record = db.record(params.id);
          const month = new Date();
          month.setDate(1);
          month.setHours(0, 0, 0, 0);
          // Caw, asked from a project's page: that project's conversations.
          const asked = member.type === "caw" ? query.project : undefined;
          const unknown =
            asked === undefined ? undefined : unknownProject(asked);
          if (unknown) {
            return unknown;
          }
          const caw = asked === undefined ? null : deps.cawRecord(asked, month);
          return {
            caw: caw && {
              spendUsd: caw.spendUsd,
              threads: caw.threads,
              lastTurnAt:
                caw.lastTurnAt === null
                  ? null
                  : new Date(caw.lastTurnAt).toISOString(),
            },
            decided: record.decided,
            lastAt: record.lastAt?.toISOString() ?? null,
            takenBack: record.takenBack,
            waiting: record.open.filter((row) =>
              row.workItemId ? deps.live(row.workItemId) : row.signed === null
            ).length,
            spendUsd: deps.spend(record.instances, month),
          };
        }
      )
      // Where each card of a decision page went (card_settlings), for the
      // signature its surface draws: the member it went to, the line a card
      // that came to him carries (`decidesWords.cameToYou`), and when it was
      // settled and taken back. The answer's own signature (`SettledBy`) is on
      // the page's entries.
      .get("/api/decides/pages/:artifactId", ({ params }) => ({
        cards: db.settlings(params.artifactId).map((row) => ({
          card: row.card,
          member: row.route,
          kind: row.kind,
          signed: row.signed,
          settledAt: row.settledAt?.toISOString() ?? null,
          takenBackAt: row.takenBackAt?.toISOString() ?? null,
        })),
      }))
      .get("/api/projects/:id/decides", async ({ params }) => {
        const unknown = unknownProject(params.id);
        if (unknown) {
          return unknown;
        }
        const decides = await decidesTable(
          { projectId: params.id, areaId: areaOf(params.id) },
          db.fleet()
        );
        return decides instanceof ElysiaStatus
          ? decides
          : { file: DECIDES_FILE, decides };
      })
      .put(
        "/api/projects/:id/decides",
        {
          body: t.Object({
            routes: t.Record(t.String(), t.Nullable(t.String())),
            message: t.String({ minLength: 1, maxLength: MESSAGE_LIMIT }),
          }),
        },
        async ({ params, body }) => {
          const fleet = db.fleet();
          const unknown =
            unknownProject(params.id) ?? unknownRoutes(fleet, body.routes);
          if (unknown) {
            return unknown;
          }
          const file = await projectFile(params.id, fleet, body.routes);
          if (file instanceof ElysiaStatus) {
            return file;
          }
          const written = await writeFolderFile(params.id, DECIDES_FILE, file, {
            author: YOU,
            message: body.message,
          });
          if (written instanceof ElysiaStatus) {
            return written;
          }
          const decides = await decidesTable(
            { projectId: params.id, areaId: areaOf(params.id) },
            db.fleet()
          );
          return decides instanceof ElysiaStatus
            ? decides
            : { file: DECIDES_FILE, decides };
        }
      )
  );
};
