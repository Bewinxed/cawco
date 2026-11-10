import { waitsOnYou } from "@cawco/core/activity";
import type { SendAttachment } from "@cawco/core/attachments";
import { COMMENT_LIMITS } from "@cawco/core/comments/model";
import { detach } from "@cawco/core/detach";
import { ARTIFACT_ORIGIN } from "@cawco/core/harness/kinds";
import {
  artifactCommentsNotice,
  artifactHandedNotice,
  artifactResponsesNotice,
  parseArtifactComments,
  parseArtifactResponses,
} from "@cawco/core/injected";
import type { Envelope, InstanceRow, SendPayload } from "@cawco/core/protocol";
import { artifactLink } from "@cawco/core/references";
import { relaunchOf } from "@cawco/core/relaunch";
import type { SentMessage } from "@cawco/core/session-messages";
import {
  STAGE_CLONE_MS,
  STAGE_INSTALL_MS,
  STAGE_READY_MS,
  STAGE_RENDER,
  STAGE_RENDER_MS,
} from "@cawco/core/stage";
import { secondsOf } from "@cawco/core/time";
import { transcriptUserText } from "@cawco/core/transcript-rules";
import { unhandled } from "@cawco/core/unhandled";
import { waitArtifact } from "@cawco/core/wait-targets";
import { artifactToolWords } from "@cawco/core/words/artifact-tools";
import { workWords } from "@cawco/core/words/work";
import type { WorkspaceRef } from "@cawco/core/workspace/controls";
import { isPlace } from "@cawco/core/workspace-policy";
import { ElysiaStatus, problem } from "elysia";
import type { ArtifactServiceDeps } from "./artifacts/deps";
import type { MarksDelivery, MarksOutcome, StageAt } from "./artifacts/shapes";
import { artifactTaker } from "./artifacts/taker";
import type { Caw } from "./caw";
import { stagePlaceRef } from "./caw";
import { peek } from "./cut-turns";
import type { ArtifactRow } from "./db/artifacts";
import type { SentMessageRow } from "./db/sends";
import { askWhat } from "./delegate-waits";
import type { HubContext } from "./hub-context";
import type { HubTimer } from "./lifetime";
import { externalizeImages } from "./media";
import { handle as idHandle } from "./presenters/words";

import { sendMode } from "./sends";
import { unreachable } from "./unreachable";
import { isLive } from "./work-item-state";
import type { PersonWait } from "./work-items";

/** A picture's number in a comments delivery's words (core comments.ts `attachedLine`). */
const PICTURE_NUMBER = /\(picture (\d+) of this message/gu;

/** What a session whose process a signal killed is told of the turn that kill cut. */
/** A sentence's closing full stop, taken off to set it inside another. */
const CLOSING_STOP = /\.$/u;

export type ArtifactEventsContext = Pick<
  HubContext,
  | "anchors"
  | "artifactLane"
  | "callAgent"
  | "db"
  | "decisions"
  | "deliverSend"
  | "hubAsks"
  | "inputRefusal"
  | "lead"
  | "leftoverWords"
  | "lifetime"
  | "pending"
  | "plans"
  | "publishSend"
  | "registry"
  | "sentFrame"
  | "sessionName"
  | "tasks"
  | "withdrawPending"
  | "workItems"
  | "workspaceArchived"
>;

export const createArtifactEvents = (ctx: ArtifactEventsContext) => {
  /**
   * The person's word on an artifact, to its session: one event of origin
   * {@link ARTIFACT_ORIGIN}, never their bubble. Their picks' Send is a
   * notice to read them (core `artifactResponsesNotice`); their pins, replies,
   * resolves and ink go on the same Send as a notice that carries them (core
   * `artifactCommentsNotice`). A session hears one of each per artifact at a
   * time: one it has not read yet is withdrawn and the new one stands in its
   * place ({@link withdrawPending}, `replaces`), what the withdrawn one said
   * folded in (the earlier `since`; the earlier pins and pictures first). One
   * it already read is not repeated. Each artifact's events settle one after
   * another.
   */
  const artifactEventsInFlight = new Map<string, Promise<unknown>>();
  const artifactInOrder = <T>(
    key: string,
    run: () => Promise<T>
  ): Promise<T> => {
    const before = artifactEventsInFlight.get(key) ?? Promise.resolve();
    const next = before.catch(() => undefined).then(run);
    artifactEventsInFlight.set(key, next);
    return next.finally(() => {
      if (artifactEventsInFlight.get(key) === next) {
        artifactEventsInFlight.delete(key);
      }
    });
  };
  /** The base64 pictures a held send's envelope carries, in order. */
  const picturesOf = (
    whole: Envelope<SendPayload> | null
  ): { data: string; mediaType: string }[] => {
    const content = whole ? whole.payload.message.message.content : "";
    return typeof content === "string"
      ? []
      : content.flatMap((block) =>
          block.type === "image" && block.source.type === "base64"
            ? [{ data: block.source.data, mediaType: block.source.media_type }]
            : []
        );
  };
  /** The texts and files a stored send carried (`SendPayload.attachments`). */
  const attachmentsOf = (
    whole: Envelope<SendPayload> | null
  ): SendAttachment[] => whole?.payload.attachments ?? [];
  /**
   * Withdraws each of the session's unread artifact events `same` names
   * (by its words), in order: the words, pictures, texts and files of each
   * one withdrawn, and the last one's uuid, which the new event `replaces`.
   */
  const withdrawArtifactEvents = async (
    instance: InstanceRow,
    artifact: ArtifactRow,
    same: (text: string) => boolean
  ): Promise<{
    replaces?: string;
    withdrawn: {
      attachments: SendAttachment[];
      images: { data: string; mediaType: string }[];
      text: string;
    }[];
  }> => {
    let replaces: string | undefined;
    const withdrawn: {
      attachments: SendAttachment[];
      images: { data: string; mediaType: string }[];
      text: string;
    }[] = [];
    for (const row of ctx.db.sendsIn(instance.id, ["pending"])) {
      const body = row.body as SentMessage | null;
      if (!(
        body?.origin?.kind === "system" && body.origin.name === ARTIFACT_ORIGIN
      )) {
        continue;
      }
      const text = transcriptUserText(body.message) ?? "";
      if (!same(text)) {
        continue;
      }
      // Read before the withdrawal, which clears what the record held.
      const images = picturesOf(row.owed ?? row.envelope);
      const attachments = attachmentsOf(row.owed ?? row.envelope);
      const outcome = await ctx
        .withdrawPending(row, instance.machineId)
        .catch((error: unknown) => {
          console.warn(
            `[artifacts] ${artifact.name}: its unread event ${row.uuid} could not be withdrawn, so it stands: ${error instanceof Error ? error.message : String(error)}`
          );
          return "started" as const;
        });
      if (outcome === "withdrawn") {
        withdrawn.push({ text, images, attachments });
        replaces = row.uuid;
      }
    }
    return { withdrawn, ...(replaces ? { replaces } : {}) };
  };
  /** An artifact event's payload to `instance`: its words, its pictures first, the texts and files it carries, and the unread event it replaces. */
  const artifactEventPayload = (
    instance: InstanceRow,
    text: string,
    images: { data: string; mediaType: string }[],
    replaces: string | undefined,
    attachments: SendAttachment[] = []
  ): SendPayload => ({
    instanceId: instance.id,
    ...(attachments.length > 0 ? { attachments } : {}),
    message: {
      type: "user",
      uuid: crypto.randomUUID(),
      message: {
        role: "user",
        content:
          images.length === 0
            ? text
            : [
                ...images.map(({ mediaType, data }) => ({
                  type: "image" as const,
                  source: {
                    type: "base64" as const,
                    media_type: mediaType,
                    data,
                  },
                })),
                { type: "text" as const, text },
              ],
      },
      parent_tool_use_id: null,
      origin: { kind: "system", name: ARTIFACT_ORIGIN },
      ...(replaces ? { replaces } : {}),
    },
  });
  /** One artifact event to its session, through the one send path: its record. */
  const sendArtifactEvent = (
    instance: InstanceRow,
    text: string,
    images: { data: string; mediaType: string }[],
    replaces: string | undefined,
    attachments: SendAttachment[] = []
  ): SentMessageRow | undefined =>
    ctx.deliverSend({
      verb: "send",
      machineId: instance.machineId,
      instanceId: instance.id,
      payload: artifactEventPayload(
        instance,
        text,
        images,
        replaces,
        attachments
      ),
    });
  /**
   * An artifact event that reached no one, kept in the session's
   * transcript as the send path keeps one it refused: its line (core
   * `ARTIFACT_RESPONSES`) reads "not sent", `reason` under it.
   */
  const recordUndelivered = (
    instance: InstanceRow,
    text: string,
    images: { data: string; mediaType: string }[],
    reason: string,
    attachments: SendAttachment[] = []
  ) => {
    const payload = artifactEventPayload(
      instance,
      text,
      images,
      undefined,
      attachments
    );
    ctx.publishSend(
      ctx.db.recordSend({
        uuid: payload.message.uuid,
        instanceId: instance.id,
        acceptedAt: new Date(),
        body: externalizeImages(ctx.sentFrame(payload)),
        mode: sendMode(payload),
        state: "failed",
        reason,
        refusal: null,
        anchor: ctx.anchors.get(instance.id) ?? null,
      })
    );
  };
  /**
   * A delegate handed its parent an artifact, not opened (artifacts/service.ts
   * `handOver`): the parent hears it once per hand-off, on the channel the person's picks
   * take, which wakes it as their words do. One the parent didn't take is
   * kept in its transcript as not sent, with why.
   */
  const handArtifactUp: ArtifactServiceDeps["handedUp"] = async (
    parent,
    maker,
    artifact,
    next
  ) => {
    const text = artifactHandedNotice({
      from: ctx.sessionName(maker),
      id: artifact.id,
      kind: artifact.kind,
      name: artifact.name,
      title: artifact.title,
      next: next?.id,
    });
    await artifactInOrder(`${artifact.id}:handed`, () => {
      try {
        const record = sendArtifactEvent(parent, text, [], undefined);
        if (record?.state === "failed") {
          console.warn(
            `[artifacts] ${artifact.id}: ${parent.id} wasn't told its delegate handed it up: ${record.reason ?? "the send failed"}`
          );
        }
      } catch (error) {
        // A refusal the send path throws (a conversation gone) keeps no record of its own.
        recordUndelivered(
          parent,
          text,
          [],
          error instanceof Error ? error.message : String(error)
        );
      }
      return Promise.resolve();
    });
  };
  const signalResponses = (
    instance: InstanceRow,
    artifact: ArtifactRow,
    { since }: { since: number }
  ): Promise<void> =>
    artifactInOrder(`${artifact.id}:picks`, async () => {
      const { withdrawn, replaces } = await withdrawArtifactEvents(
        instance,
        artifact,
        (text) => parseArtifactResponses(text)?.id === artifact.id
      );
      const earliest = Math.min(
        since,
        ...withdrawn.map(
          (one) => parseArtifactResponses(one.text)?.since ?? since
        )
      );
      sendArtifactEvent(
        instance,
        artifactResponsesNotice({
          id: artifact.id,
          kind: artifact.kind,
          name: artifact.name,
          title: artifact.title,
          since: earliest,
        }),
        [],
        replaces
      );
    });
  /**
   * The person's marks on an artifact (artifacts/service.ts
   * `deliverMarks`), to the session that made it, which they wake as the
   * person's own words do (core `byPerson`): a sleeping one is woken. One
   * that has ended (stopped or discarded) or takes no input any more (its
   * conversation gone, its finished work's workspace archived or taken over
   * by a later item; artifacts/taker.ts `takesNoInput`): the marks go to
   * whoever can act on them, the session that delegated it while that one
   * takes input, else the project's Caw, as the projects plan's §5.8 says
   * for a page whose writer ended ("wakes the session that wrote the page,
   * or Caw if it has ended"). With neither, they go to the writer, woken,
   * and its send records why when it is not taken.
   *
   * Answers whether someone took them: a send the session accepted, or Caw
   * woken. When no one did (the send refused, Caw's wake refused), the
   * writer's transcript keeps the event as not sent, with why
   * ({@link recordUndelivered}, as deliverSend keeps a refused send), and
   * the marks stay owed for the next delivery.
   */
  const deliverArtifactMarks: ArtifactServiceDeps["deliverMarks"] = (
    instance,
    artifact,
    delivery
  ) =>
    artifactInOrder(`${artifact.id}:marks`, () => {
      const taker = takerOf(instance, artifact);
      switch (taker.to) {
        case "writer":
        case "none":
          return marksToSession(instance, artifact, delivery);
        case "parent":
          return marksToSession(taker.session, artifact, {
            ...delivery,
            text: `${delivery.text}\n\nThe session that made it, ${ctx.sessionName(instance)}, takes no input now (${taker.why}), so these come to you, the session that delegated it: answer each in its pin's thread with comment_reply({ pin, text }), naming the pin by its id above.`,
          });
        case "caw":
          return marksToCaw(
            taker.caw,
            instance,
            taker.projectId,
            taker.why,
            delivery
          );
        default:
          return unhandled("artifact taker", taker);
      }
    });
  /** Who takes what the person did on an artifact `writer` made (artifacts/taker.ts). */
  const takerOf = (writer: InstanceRow | undefined, artifact: ArtifactRow) =>
    artifactTaker(writer, artifact, {
      caw: ctx.lead,
      instance: (id) => ctx.db.getInstancesByIds([id])[0],
      refusal: artifactRefusal,
    });
  /** Why a send of the person's marks or answers to session `id` is refused, or nothing. */
  const artifactRefusal = (id: string): string | undefined =>
    ctx.inputRefusal(id, { kind: "system", name: ARTIFACT_ORIGIN })?.reason;
  /** {@link deliverArtifactMarks} to the project's Caw: woken with them, or the writer's transcript says why not. */
  const marksToCaw = async (
    their: Caw,
    instance: InstanceRow,
    projectId: string,
    why: string,
    { text, images, attachments }: MarksDelivery
  ): Promise<MarksOutcome> => {
    const woke = await their
      .tell(projectId, {
        by: "act",
        kind: "person-request",
        origin: { name: ARTIFACT_ORIGIN },
        trigger: `the person marked an artifact ${ctx.sessionName(instance)} made, and that session takes no input now (${why.replace(CLOSING_STOP, "")})`,
        text: `${text}\n\nThese come to you: answer each in its pin's thread with comment_reply({ pin, text }), naming the pin by its id above.`,
        ...(images.length > 0 || attachments.length > 0
          ? {
              carried: {
                ...(images.length > 0 ? { images } : {}),
                ...(attachments.length > 0 ? { attachments } : {}),
              },
            }
          : {}),
      })
      .catch((error: unknown) =>
        problem(502, {
          code: "caw-failed",
          detail: error instanceof Error ? error.message : String(error),
        })
      );
    if (!(woke instanceof ElysiaStatus)) {
      console.log(
        artifactToolWords.marksWokeCaw(
          instance.id,
          projectId,
          why.replace(CLOSING_STOP, "")
        )
      );
      return { ok: true };
    }
    const reason = `This session takes no input now, and the project's Caw couldn't take them: ${woke.response.detail.replace(CLOSING_STOP, "")}.`;
    recordUndelivered(instance, text, images, reason, attachments);
    return { ok: false, reason };
  };
  /** {@link deliverArtifactMarks} to the session itself, an unread earlier delivery folded in: whether it took them. */
  const marksToSession = async (
    instance: InstanceRow,
    artifact: ArtifactRow,
    { text, images, attachments }: MarksDelivery
  ): Promise<MarksOutcome> => {
    const { withdrawn, replaces } = await withdrawArtifactEvents(
      instance,
      artifact,
      (said) => parseArtifactComments(said)?.id === artifact.id
    );
    // The earlier event's pictures lead, so this one's are numbered after them.
    const before = withdrawn.reduce((n, one) => n + one.images.length, 0);
    const words =
      withdrawn.length === 0
        ? text
        : artifactCommentsNotice(artifact, [
            ...withdrawn.flatMap((one) => {
              const earlier = parseArtifactComments(one.text);
              return earlier ? [earlier.sections] : [];
            }),
            (parseArtifactComments(text)?.sections ?? "").replace(
              PICTURE_NUMBER,
              (_, n: string) => `(picture ${Number(n) + before} of this message`
            ),
          ]);
    const pictures = [
      ...withdrawn.flatMap((one) => one.images),
      ...images,
    ].slice(0, COMMENT_LIMITS.pictures);
    const carried = [
      ...withdrawn.flatMap((one) => one.attachments),
      ...attachments,
    ];
    let record: SentMessageRow | undefined;
    try {
      record = sendArtifactEvent(instance, words, pictures, replaces, carried);
    } catch (error) {
      // A refusal the send path throws (a conversation gone) keeps no record of its own.
      const reason = error instanceof Error ? error.message : String(error);
      recordUndelivered(instance, words, pictures, reason, carried);
      return { ok: false, reason };
    }
    if (record && record.state !== "failed") {
      console.log(
        artifactToolWords.marksWent(
          artifact.id,
          instance.id,
          record.uuid,
          `${record.state}, ${record.mode}${withdrawn.length > 0 ? `, folding in ${withdrawn.length} unread earlier one(s)` : ""}`
        )
      );
      return { ok: true };
    }
    return {
      ok: false,
      reason: record?.reason ?? "The session didn't take them.",
    };
  };

  /**
   * Every dashboard showing a project reads its decision pages again
   * (`decisions.changed`, decisions.ts): a page built, picked on or sent,
   * its record written, its graph edited. A burst of picks (a note typed)
   * is told once per {@link DECISIONS_TOLD_MS}.
   */
  const DECISIONS_TOLD_MS = 400;
  const decisionsTelling = new Map<string, HubTimer>();
  const decisionsChanged = (projectId: string): void => {
    if (decisionsTelling.has(projectId)) {
      return;
    }
    decisionsTelling.set(
      projectId,
      ctx.lifetime.after(DECISIONS_TOLD_MS, () => {
        decisionsTelling.delete(projectId);
        ctx.registry.broadcast({
          verb: "frames",
          machineId: "hub",
          payload: { kind: "decisions.changed", projectId },
        });
      })
    );
  };
  /**
   * The sessions waiting on the person now (core `waitingOnYou`): an ask
   * parked under it for the person (not one routed to its parent), or an
   * artifact of it in Needs you. Find's state, fleet watch's stall sweep and
   * an account's admission read it, as every screen's mark does.
   */
  const waitsNow = () =>
    waitsOnYou({
      asks: ctx.pending.list().map((envelope) => ({
        envelope,
        instanceId: envelope.instanceId,
        routedTo: peek(envelope.payload, "routedTo"),
      })),
      artifacts: ctx.artifactLane.now().needs,
    });
  const waitingNow = (): Set<string> => new Set(waitsNow().keys());
  /**
   * What session `instanceId` itself waits on the person for now, by the
   * same rule ({@link waitingNow}): what each of its asks asks, and each
   * artifact of it in Needs you at its first open card. A work item's
   * session waiting so is held as it rests (work-items.ts `onPerson`), and
   * `delegate_list` names what it waits on.
   */
  const personWaitOf = (instanceId: string): PersonWait | undefined => {
    const waits = waitsNow().get(instanceId);
    return (
      waits && {
        asks: waits.asks.map((one) => askWhat(one.envelope)),
        cards: waits.artifacts.map((need) => ({
          artifactId: need.artifactId,
          card: "card" in need.stop ? need.stop.card : null,
          title: need.title,
        })),
      }
    );
  };
  /**
   * A page's picks or pins moved: once the burst is over, each project whose
   * tasks wait on a card or pin of it looks again (tasks.ts `waitsMoved`:
   * readiness is live, and a live attempt dispatched on a card answered
   * differently hears it once), and each plan waiting on one is read again.
   */
  const WAIT_PAGE_MS = 1000;
  const waitPagesTelling = new Map<string, HubTimer>();
  const waitPageMoved = (artifactId: string): void => {
    if (waitPagesTelling.has(artifactId)) {
      return;
    }
    waitPagesTelling.set(
      artifactId,
      ctx.lifetime.after(WAIT_PAGE_MS, () => {
        waitPagesTelling.delete(artifactId);
        ctx.plans.pageMoved(artifactId);
        for (const project of ctx.db.listProjects()) {
          if (
            ctx.db
              .taskIndex(project.id)
              .some((row) =>
                row.waitsOn.some(
                  (target) => waitArtifact(target) === artifactId
                )
              )
          ) {
            detach(
              ctx.tasks.waitsMoved(project.id).then((refused) => {
                if (refused) {
                  console.warn(
                    `[task waits moved] failed: ${refused.response.detail}`
                  );
                }
              }),
              "task waits moved"
            );
          }
        }
      })
    );
  };
  /**
   * A decided page's record follows its picks (decisions.ts `picksMoved`)
   * once they stand quiet {@link RECORD_QUIET_MS}: a note typed, or picks
   * changed in a burst, is one commit to the project's folder, not one a
   * keystroke.
   */
  const RECORD_QUIET_MS = 2000;
  const recordsFollowing = new Map<string, HubTimer>();
  const recordFollows = (projectId: string, name: string): void => {
    const key = `${projectId}/${name}`;
    ctx.lifetime.cancel(recordsFollowing.get(key));
    recordsFollowing.set(
      key,
      ctx.lifetime.after(RECORD_QUIET_MS, () => {
        recordsFollowing.delete(key);
        ctx.decisions.picksMoved(projectId, name);
      })
    );
  };
  /**
   * Where a stage runs, with its machine: a session's work item's workspace,
   * else its place (caw.ts `stagePlaceRef`), on the session's machine; or
   * the workspace or place a sheet was made in. Undefined when that is gone:
   * a workspace the hub no longer has, a place no session names any more.
   */
  const stageWhere = (
    at: StageAt
  ): { machineId?: string; workspace: WorkspaceRef } | undefined => {
    if ("session" in at) {
      const own = ctx.workItems.workspaceOf(at.session);
      return own
        ? {
            workspace: own,
            machineId:
              ctx.db.workspacesNamed(own.id)[0]?.machineId ??
              at.session.machineId,
          }
        : {
            workspace: stagePlaceRef(at.session),
            machineId: at.session.machineId,
          };
    }
    if (isPlace(at.workspace)) {
      const row = ctx.db
        .listInstances()
        .find(
          (one) =>
            stagePlaceRef(one).id === at.workspace &&
            !ctx.workItems.workspaceOf(one)
        );
      return row
        ? { workspace: stagePlaceRef(row), machineId: row.machineId }
        : undefined;
    }
    const workspace = ctx.workItems.workspaceRef(at.workspace);
    return workspace
      ? {
          workspace,
          machineId: ctx.db.workspacesNamed(workspace.id)[0]?.machineId,
        }
      : undefined;
  };
  /**
   * A stage method (core stage.ts) on a workspace's machine (a session's
   * own, or the one a sheet was made in), with the workspace and `arg`: its
   * answer, or a refusal saying why the stage can't be reached or said no.
   */
  const onStage = async (at: StageAt, method: string, arg: unknown) => {
    const where = stageWhere(at);
    if (!where) {
      // Only a sheet's names one that can be gone: a session always has a place.
      const named = "workspace" in at ? at.workspace : "";
      return problem(409, {
        code: "stage-workspace-gone",
        detail: `The sheet's workspace ${named.slice(0, 8)} is gone, so its stage can't run.`,
      });
    }
    const { workspace, machineId } = where;
    if (machineId === undefined) {
      return problem(409, {
        code: "stage-workspace-unplaced",
        detail: `The sheet's workspace ${workspace.id.slice(0, 8)} is on no machine the hub knows, so its stage can't run.`,
      });
    }
    // A stage installs its project first when its lockfile moved (agent
    // stage-install.ts); a place's runs in a clone of its checkout, cut on
    // its first use (agent stage-clone.ts): its call waits for that too.
    const asked = await ctx.callAgent(
      machineId,
      method,
      [workspace, arg],
      STAGE_READY_MS +
        (isPlace(workspace.id) ? STAGE_CLONE_MS : STAGE_INSTALL_MS) +
        (method === STAGE_RENDER ? STAGE_RENDER_MS : 0) +
        15_000
    );
    switch (asked.kind) {
      case "unanswered":
        return asked.reason === "dead"
          ? problem(503, {
              code: "stage-machine-away",
              detail:
                "The workspace's machine isn't connected to the hub, so its stage can't be reached.",
            })
          : problem(504, {
              code: "stage-machine-late",
              detail: `The workspace's machine didn't answer within ${secondsOf(asked.after)}s, so the stage's state is unknown.`,
            });
      case "answered":
        break;
      default:
        throw unreachable(asked);
    }
    const answer = asked.value;
    if (!answer.ok) {
      return problem(422, {
        code: "stage-said-no",
        detail: answer.error ?? "The stage said no.",
      });
    }
    const staged: { machineId: string; result: unknown; workspace: string } = {
      machineId,
      workspace: workspace.id,
      result: answer.result,
    };
    return staged;
  };
  /**
   * Whether a session can no longer act, ever: no one can give it a turn
   * again, the person included. What refuses even their words for good,
   * never a refusal they could clear (a sign-in, a machine coming back, a
   * mode to pick). Its artifacts are then deleted up its delegation tree
   * (artifacts/service.ts `deletable`).
   */
  const stranded = (instance: InstanceRow): boolean => {
    if (relaunchOf(instance).kind === "refused") {
      return true;
    }
    const refused = ctx.workItems.refusal(instance, { kind: "human" })?.refusal
      .kind;
    return refused === "workspace-archived" || refused === "item-superseded";
  };
  /**
   * Whether the session's work item ended (done, failed or cancelled),
   * whatever its workspace's state: its artifacts are then deleted up its
   * delegation tree (artifacts/service.ts `deletable`). False for a session
   * with no item, and while its item is live again (a reopen).
   */
  const itemEnded = (instance: InstanceRow): boolean => {
    const item = instance.workItemId
      ? ctx.db.workItem(instance.workItemId)
      : undefined;
    return !!item && !isLive(item.state);
  };
  /** Whether the session's work item is live (artifacts service `itemLive`). */
  const itemLive = (instance: InstanceRow): boolean => {
    const item = instance.workItemId
      ? ctx.db.workItem(instance.workItemId)
      : undefined;
    return !!item && isLive(item.state);
  };
  /**
   * Workspace `id` discarded for session `from` (work-items.ts
   * `discardFor`), and what `discard_workspace` answers of it: its carry,
   * and what its delegates left in the person's panel. `approved`: the
   * person decided it goes even while what it serves waits on him.
   */
  const discarded = async (
    from: string,
    id: string,
    { approved = false }: { approved?: boolean } = {}
  ): Promise<string> => {
    const { workspace, carry } = await ctx.workItems.discardFor(from, id, {
      approved,
    });
    ctx.workspaceArchived(workspace);
    return `${
      carry
        ? `Discarded workspace ${idHandle(workspace.id)}: what it held that was nowhere else is in the carry ${carry} on its machine, and its clone is gone.`
        : `Archived workspace ${idHandle(workspace.id)}: it held nothing that is nowhere else, so no carry was written, and its clone is gone.`
    }${ctx.leftoverWords(workspace.id, from)}`;
  };

  /**
   * Session `from`'s ask that the person decide the discard of workspace
   * `id` while what it serves waits on him: an approve ask (asks.ts) naming
   * `discard_workspace`, the workspace, the session's `reason` and what
   * still waits (`waiting`), which the person reads on its card; approved,
   * the hub runs it once with `approved` (the ask's `run`). Its words when
   * recorded; else whether the discard goes now approved: nothing waits
   * (it goes as asked, not approved), or the session is in Full Send
   * (approved at once, asks.ts).
   */
  const discardAsked = async (
    from: string,
    id: string,
    reason: string | undefined
  ) => {
    const asked = ctx.workItems.discardable(from, id);
    const stillWaiting = ctx.workItems.waiting(asked.id);
    const goes: { recorded: string } | { approved: boolean } = {
      approved: false,
    };
    if (stillWaiting.length === 0) {
      return goes;
    }
    if (!reason?.trim()) {
      return problem(400, {
        code: "discard-ask-reason",
        detail: workWords.discardAskReason,
      });
    }
    const [actor] = ctx.db.getInstancesByIds([from]);
    if (!actor) {
      return problem(404, {
        code: "discard-ask-session-unknown",
        detail: `No session ${from} on this hub.`,
      });
    }
    const recorded = await ctx.hubAsks.ask(actor, "discard_workspace", {
      workspace: asked.id,
      reason: reason.trim(),
      waiting: workWords.discardAskWaiting(
        stillWaiting.map((one) => artifactLink(one.id, one.title))
      ),
    });
    const decided: { recorded: string } | { approved: boolean } =
      recorded === undefined ? { approved: true } : { recorded };
    return decided;
  };

  return {
    handArtifactUp,
    signalResponses,
    deliverArtifactMarks,
    takerOf,
    artifactRefusal,
    decisionsChanged,
    waitingNow,
    waitPageMoved,
    recordFollows,
    onStage,
    stranded,
    itemEnded,
    itemLive,
    personWaitOf,
    discarded,
    discardAsked,
  };
};
