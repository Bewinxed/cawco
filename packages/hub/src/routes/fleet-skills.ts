/**
 * The fleet's skills, their source updates and their versions.
 */

import { detach } from "@cawco/core/detach";
import { hashFiles } from "@cawco/core/file-hash";
import { type FleetSkillMeta, READ_SKILL_FILES } from "@cawco/core/fleet";
import { Elysia, ElysiaStatus, t } from "elysia";
import { undoable } from "../db/trash";
import type { HubContext } from "../hub-context";
import { machineSkillFiles } from "../machine-answers";
import { READ_TIMEOUT_MS } from "../machine-read-timeouts";
import type { MachineReadsContext } from "../machine-reads";
import { pushTarget, skillFilesOff, unansweredStatus } from "../machine-reads";
import { refusal } from "../refusal";
import { unreachable } from "../unreachable";
import { boundFields } from "./bound-fields";

/** What a skill may be called: it names a directory under `~/.claude/skills`. */
const SKILL_NAME = /^[A-Za-z0-9._-]+$/u;

export const fleetSkillRoutes = (
  ctx: Pick<
    HubContext,
    | "announceSkill"
    | "boundProblem"
    | "checkSources"
    | "db"
    | "fanOutFetched"
    | "fetchSkill"
    | "fleetChanged"
    | "fleetSyncs"
    | "installFromFolder"
    | "noteFetch"
    | "publishInstances"
    | "readAgent"
    | "skillChoices"
    | "skillRow"
    | keyof MachineReadsContext
  >
) => {
  const {
    announceSkill,
    boundProblem,
    checkSources,
    db,
    fanOutFetched,
    fetchSkill,
    fleetChanged,
    fleetSyncs,
    installFromFolder,
    noteFetch,
    publishInstances,
    readAgent,
    skillChoices,
    skillRow,
  } = ctx;
  return (
    new Elysia()
      // A plain skill is resolved here, once for the whole fleet: the hub
      // downloads it, and the machines are handed the files (NEW.md §11). The
      // route answers with the row marked `fetching` before the download
      // starts; what came of it is a `fleet.fetch` frame (`fetchSkill`). A
      // source that would not resolve is still stored — the row is where the
      // dashboard reads why, and the ambiguous case carries what it could have
      // meant (`choices`).
      //
      // `fromMachine` is the other way in: a skill somebody wrote on one machine,
      // read off it and stored like any fetched one, so it reaches the rest.
      // So is a skill folder on a machine (`file://<machine>/<path>`): read
      // and checked here before anything is stored, refused in its words
      // when it can't be, and refused when it no longer holds the files the
      // person approved (`contentHash`, skills.ts `FOLDER_CHANGED`).
      .put(
        "/api/fleet/skills/:name",
        {
          body: t.Object({
            source: t.Optional(t.String()),
            /** A folder install's approved files, by their hash (skills.ts `readCheckedFolder`). */
            contentHash: t.Optional(t.String()),
            enabled: t.Optional(t.Boolean()),
            fromMachine: t.Optional(t.String()),
            /** The checkout a project-scoped skill was discovered in. */
            cwd: t.Optional(t.String()),
            ...boundFields,
          }),
        },
        async ({ params, body, set }) => {
          if (!SKILL_NAME.test(params.name)) {
            return refusal(
              400,
              "not-usable-skill-name",
              `${params.name} is not a usable skill name`
            );
          }
          const unbindable = boundProblem(body);
          if (unbindable) {
            return refusal(400, "unbindable", unbindable);
          }

          if (body.fromMachine) {
            const read = await skillFilesOff(
              ctx,
              body.fromMachine,
              [params.name, body.cwd],
              set
            );
            if (read instanceof ElysiaStatus) {
              return read;
            }
            const { files } = read;
            const skill = db.putSkill({
              name: params.name,
              source: `machine:${body.fromMachine}`,
              enabled: body.enabled,
              projectId: body.projectId,
              areaId: body.areaId,
              hash: hashFiles(files),
              bytes: files.reduce(
                (total, file) =>
                  total + Buffer.byteLength(file.contentBase64, "base64"),
                0
              ),
              files,
            });
            fleetChanged();
            return skill;
          }

          if (!body.source) {
            return refusal(
              400,
              "name-source-machine-adopt",
              "name a source, or the machine to adopt it from"
            );
          }

          const fromFolder = await installFromFolder(
            params.name,
            { ...body, source: body.source },
            (code, refused) => refusal(code, "skill-refused", refused)
          );
          if (fromFolder) {
            return fromFolder;
          }

          db.stageSkill({
            name: params.name,
            source: body.source,
            enabled: body.enabled,
            projectId: body.projectId,
            areaId: body.areaId,
          });
          // A fetch that found the files the fleet has tells the machines
          // here instead: the row's switch or placement may have moved.
          detach(
            fetchSkill(params.name, body.source).then((fetched) => {
              if (fetched === "same") {
                fleetChanged();
              }
            }),
            "skill fetch"
          );
          const staged = db
            .listSkills()
            .find((entry) => entry.name === params.name);
          return staged
            ? skillRow(staged)
            : refusal(404, "no-skill", `no skill ${params.name}`);
        }
      )
      // On or off: the stored row's flag, its source and files as they are.
      // Nothing is fetched; every machine is told, and a machine takes a
      // disabled skill away and writes an enabled one from the stored files.
      .patch(
        "/api/fleet/skills/:name",
        { body: t.Object({ enabled: t.Boolean() }) },
        ({ params, body }) => {
          let row: FleetSkillMeta | undefined;
          try {
            row = db.setSkillEnabled(params.name, body.enabled);
          } catch (error) {
            return refusal(
              400,
              "skill-not-saved",
              error instanceof Error ? error.message : String(error)
            );
          }
          if (!row) {
            return refusal(404, "no-skill", `no skill ${params.name}`);
          }
          fleetChanged();
          return skillRow(row);
        }
      )
      // Reads every skill's and plugin's source for what it holds now, nothing
      // stored and no machine told (`checkSources`). Answers at once,
      // `fetching`; each row it reads is a `fleet.fetch` frame, and so is its
      // end (`check`).
      .post("/api/fleet/updates/check", () => {
        detach(checkSources(), "update check");
        return { fetching: true };
      })
      // The same source, fetched again — for a skill whose repo has moved on.
      // Answers at once, the row marked `fetching`, as the PUT does.
      .post("/api/fleet/skills/:name/refresh", async ({ params, set }) => {
        const stored = db
          .listSkills()
          .find((entry) => entry.name === params.name);
        if (!stored) {
          return refusal(404, "no-skill", `no skill ${params.name}`);
        }

        // An adopted skill's source is the machine it came off, so that is where
        // "the same source, again" reads from.
        if (stored.source.startsWith("machine:")) {
          const machineId = stored.source.slice("machine:".length);
          const read = await skillFilesOff(ctx, machineId, [stored.name], set);
          if (read instanceof ElysiaStatus) {
            return read;
          }
          const { files } = read;
          const skill = db.putSkill({
            name: stored.name,
            source: stored.source,
            enabled: stored.enabled,
            hash: hashFiles(files),
            bytes: files.reduce(
              (total, file) =>
                total + Buffer.byteLength(file.contentBase64, "base64"),
              0
            ),
            files,
          });
          if (noteFetch({ skill: stored.name }, stored, skill, undefined)) {
            fanOutFetched(`skill ${stored.name}`);
          }
          announceSkill(stored.name, stored.source);
          return skillRow(
            db.listSkills().find((row) => row.name === stored.name) ?? skill
          );
        }

        detach(fetchSkill(stored.name, stored.source), "skill refresh");
        return skillRow(stored);
      })
      // Its files kept in its history, then into the trash, off every machine.
      .delete("/api/fleet/skills/:name", ({ params }) => {
        db.keepSkillVersion(params.name);
        const trashed = db.trash.put(
          { kind: "skill", key: params.name },
          Date.now()
        );
        if (trashed === undefined) {
          return refusal(
            404,
            "no-skill",
            `the fleet keeps no skill ${params.name}`
          );
        }
        skillChoices.delete(params.name);
        fleetChanged();
        return undoable(trashed);
      })
      // What one skill used to be, newest first, without its files.
      .get(
        "/api/fleet/skills/history",
        { query: t.Object({ name: t.String() }) },
        ({ query }) => db.listFleetSkillHistory(query.name)
      )
      // Undo, through the same door as any change to the fleet's copy: what
      // restoring replaces is itself kept first (`putSkill`), so a restore of
      // the wrong version is undone the same way. The version's source comes
      // back with it — a copy taken off a machine is that machine's again.
      .post(
        "/api/fleet/skills/restore",
        { body: t.Object({ id: t.Number() }) },
        ({ body }) => {
          const version = db.fleetSkillVersion(body.id);
          if (!version) {
            return refusal(
              404,
              "no-skill-version",
              `no skill version ${body.id}`
            );
          }
          const current = db
            .listSkills()
            .find((skill) => skill.name === version.name);
          try {
            const skill = db.putSkill({
              name: version.name,
              source: version.skillSource,
              enabled: current?.enabled ?? true,
              hash: version.hash,
              bytes: version.bytes,
              files: version.files,
            });
            // A restore is no fetch: what the last one came to no longer
            // says what the row holds.
            db.noteSource({ skill: skill.name }, { lastRefresh: null });
            fleetChanged();
            return skillRow(
              db.listSkills().find((row) => row.name === skill.name) ?? skill
            );
          } catch (error) {
            return refusal(
              400,
              "skill-not-saved",
              error instanceof Error ? error.message : String(error)
            );
          }
        }
      )
      // The click that settles a skill edited on one machine the fleet's way:
      // `force: true` on that one skill, for that one machine. The machine is
      // read first, as a hook push reads it: the edited copy an overwrite
      // destroys exists nowhere else, so it goes into the skill's history
      // before it goes, and a machine that will not answer stops the push.
      // The other way to settle it is to adopt that copy (`PUT …/skills/:name`
      // with `fromMachine`).
      .post(
        "/api/fleet/skills/:name/push",
        { body: t.Object({ machineId: t.String() }) },
        async ({ params, body, set }) => {
          const target = pushTarget(ctx, body);
          if (target instanceof ElysiaStatus) {
            return target;
          }
          const { config } = target;
          const fleetCopy = config.skills.find(
            (skill) => skill.name === params.name
          );
          if (!fleetCopy) {
            return refusal(
              404,
              "no-skill",
              `the fleet carries no skill ${params.name}`
            );
          }

          const asked = await readAgent(
            body.machineId,
            READ_SKILL_FILES,
            [params.name],
            READ_TIMEOUT_MS
          );
          switch (asked.kind) {
            case "unanswered": {
              return unansweredStatus(ctx, set, body.machineId, asked);
            }
            case "answered":
              break;
            default:
              throw unreachable(asked);
          }
          const answer = asked.value;
          // No copy on the machine is nothing to keep; any other refusal
          // stops the push, because the copy it would destroy was not read.
          if (!(answer.ok || answer.error?.startsWith("no skill "))) {
            return refusal(
              500,
              "skill-unread",
              answer.error ?? "the machine could not read the skill"
            );
          }
          if (answer.ok) {
            const theirs = machineSkillFiles(answer.result);
            const hash = hashFiles(theirs);
            if (hash !== fleetCopy.hash) {
              db.recordFleetSkill({
                name: params.name,
                skillSource: `machine:${body.machineId}`,
                hash,
                files: theirs,
                source: `machine:${body.machineId}`,
              });
            }
          }

          // Sent forced, and kept forced on the machine until a converge
          // writes it, whatever delta comes meanwhile (fleet-sync.ts).
          fleetSyncs.force(body.machineId, [`skill:${params.name}`]);
          fleetSyncs.changed(`an overwrite of skill ${params.name}`, {
            machineId: body.machineId,
          });
          publishInstances(body.machineId);
          return { ok: true };
        }
      )
  );
};
