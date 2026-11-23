import { posix } from "node:path";
import { waitsOnYou } from "@cawco/core/activity";
import type { SendAttachment } from "@cawco/core/attachments";
import {
  imageBlockOf,
  isImageMediaType,
  type TurnImage,
} from "@cawco/core/attachments";
import { COMMENT_LIMITS } from "@cawco/core/comments/model";
import type { ControlReply } from "@cawco/core/control-replies";
import type { ControlArgs, ControlName } from "@cawco/core/control-table";
import { detach } from "@cawco/core/detach";
import type { HubEnvelope } from "@cawco/core/envelopes";
import { byPerson } from "@cawco/core/harness";
import { ARTIFACT_ORIGIN } from "@cawco/core/harness/kinds";
import {
  artifactCommentsNotice,
  artifactHandedNotice,
  artifactResponsesNotice,
  parseArtifactComments,
  parseArtifactResponses,
} from "@cawco/core/injected";
import type { InstanceRow, SendPayload } from "@cawco/core/protocol";
import { artifactLink } from "@cawco/core/references";
import { relaunchOf } from "@cawco/core/relaunch";
import {
  STAGE_CLONE_MS,
  STAGE_INSTALL_MS,
  STAGE_PICTURE,
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
import {
  CONTROL_REPO_ROOT,
  WORKSPACE_GIT_TIMEOUT_MS,
  type WorkspaceRef,
} from "@cawco/core/workspace/controls";
import { byWorkspaceIdKind, workspaceIdKindOf } from "@cawco/core/workspace-id";
import { ElysiaStatus, problem } from "elysia";
import type { ArtifactServiceDeps } from "./artifacts/deps";
import { designFolderOf } from "./artifacts/design-folder";
import type { MarksDelivery, MarksOutcome, StageAt } from "./artifacts/shapes";
import { artifactTaker, takesNoInput } from "./artifacts/taker";
import { placeRefOf, stagePlaceRef } from "./caw";
import { ARTIFACTS_ROOT } from "./config";
import type { ArtifactRow } from "./db/artifacts";
import { askWhat } from "./delegate-waits";
import type { HubContext } from "./hub-context";
import type { HubTimer } from "./lifetime";
import { awayProblem, silentProblem } from "./machine-answers";
import { externalizeImages } from "./media";
import { handle as idHandle } from "./presenters/words";
import { sendMode } from "./sends";
import { unreachable } from "./unreachable";
import { isLive } from "./work-item-state";
import type { PersonWait } from "./work-items";
import type { DiscardAsked, Discarded } from "./workspace-discards";

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
  | "triggers"
  | "leftoverWords"
  | "lifetime"
  | "ownMachineIdRead"
  | "pending"
  | "plans"
  | "publishSend"
  | "readAgent"
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
    whole: Pick<HubEnvelope<"send">, "payload"> | null
  ): TurnImage[] => {
    const content = whole ? whole.payload.message.message.content : "";
    return typeof content === "string"
      ? []
      : content.flatMap((block) => {
          if (block.type !== "image" || block.source.type !== "base64") {
            return [];
          }
          // The hub made these blocks of the pictures a send carried, each
          // of a type a turn can carry.
          const { data, media_type: mediaType } = block.source;
          return isImageMediaType(mediaType) ? [{ data, mediaType }] : [];
        });
  };
  /** The texts and files a stored send carried (`SendPayload.attachments`). */
  const attachmentsOf = (
    whole: Pick<HubEnvelope<"send">, "payload"> | null
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
      images: TurnImage[];
      text: string;
    }[];
  }> => {
    let replaces: string | undefined;
    const withdrawn: {
      attachments: SendAttachment[];
      images: TurnImage[];
      text: string;
    }[] = [];
    for (const row of ctx.db.sendsIn(instance.id, ["pending"])) {
      const { body } = row;
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
      const images = picturesOf(row.envelope);
      const attachments = attachmentsOf(row.envelope);
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
    images: TurnImage[],
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
            : [...images.map(imageBlockOf), { type: "text" as const, text }],
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
    images: TurnImage[],
    replaces: string | undefined,
    attachments: SendAttachment[] = []
  ) =>
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
    images: TurnImage[],
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
  /** A session that takes input now (artifacts/taker.ts `takesNoInput`), by id; undefined for none. */
  const takingInput = (id: string | null | undefined) => {
    const [row] = id ? ctx.db.getInstancesByIds([id]) : [];
    return row && takesNoInput(row, artifactRefusal) === undefined
      ? row
      : undefined;
  };
  /**
   * Whether session `maker`'s turn now works on the person's own word: the
   * newest send it read is his (core `byPerson`: his words, picks, pins,
   * answer). A page made in a turn he started is his (B1, 2026-11-15).
   */
  const personsTurn = (maker: InstanceRow): boolean => {
    const { read } = ctx.db.latestSends(maker.id);
    const origin = read?.body.origin;
    return !!origin && byPerson(origin);
  };
  /**
   * THE SESSION `maker`'S ARTIFACTS GO TO, unopened (artifacts/service.ts
   * `ownerFor`): the session it reports to. Delegated work's go to the
   * session that started it (work-items.ts `reportsBack`), while that one
   * takes input; else they stay its own, and the person's marks on them
   * are a trigger on the artifact (artifacts/taker.ts, triggers.ts). A
   * routine's run's, and any hub-started session's, stay its own: they
   * never reach the project's Caw conversation. Undefined, it keeps its
   * own: a session that reports to no one (one started with start_session,
   * a design check's verifier), and one at work on the person's own word
   * ({@link personsTurn}).
   */
  const artifactsTo = (maker: InstanceRow): InstanceRow | undefined => {
    if (personsTurn(maker) || !ctx.workItems.reportsBack(maker)) {
      return;
    }
    const to = takingInput(maker.parentInstanceId);
    return to?.id === maker.id ? undefined : to;
  };
  /** Whether `parent` is woken by what `maker` hands it: it hears `maker`'s reports (work-items.ts `reportees`). */
  const wokenBy = (parent: InstanceRow, maker: InstanceRow): boolean =>
    ctx.workItems.reportees(maker).some((one) => one.id === parent.id);
  /**
   * A session's artifact went to the session it reports to, not opened
   * (artifacts/service.ts `handOver`): that one hears it once per
   * hand-off, on the channel the person's picks take, which wakes it as
   * their words do, unless it is not woken by this maker's work
   * ({@link wokenBy}): then it is kept in its transcript as not sent, with
   * why, waking nobody. So is one it didn't take.
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
      does: artifact.does,
      ask: artifact.ask,
      next: next?.id,
    });
    await artifactInOrder(`${artifact.id}:handed`, () => {
      if (!wokenBy(parent, maker)) {
        recordUndelivered(parent, text, [], artifactToolWords.handedUnwoken);
        return Promise.resolve();
      }
      const record = sendArtifactEvent(parent, text, [], undefined);
      if (record instanceof ElysiaStatus) {
        // A problem the send path answers (a conversation gone) keeps no record of its own.
        recordUndelivered(parent, text, [], record.response.detail);
      } else if (record?.state === "failed") {
        console.warn(
          `[artifacts] ${artifact.id}: ${parent.id} wasn't told its delegate handed it up: ${record.reason ?? "the send failed"}`
        );
      }
      return Promise.resolve();
    });
  };
  /**
   * Tells `instance` the person sent their picks on `artifact`. Answers the
   * uuid of the send that carries the notice, or nothing when no send was
   * taken.
   */
  const signalResponses = (
    instance: InstanceRow,
    artifact: ArtifactRow,
    { since }: { since: number }
  ): Promise<string | undefined> =>
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
      const notice = artifactResponsesNotice({
        id: artifact.id,
        kind: artifact.kind,
        name: artifact.name,
        title: artifact.title,
        since: earliest,
      });
      const sent = sendArtifactEvent(instance, notice, [], replaces);
      if (sent instanceof ElysiaStatus) {
        // A problem the send path answers (a conversation gone) keeps no record of its own.
        recordUndelivered(instance, notice, [], sent.response.detail);
        return;
      }
      return sent?.uuid;
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
        case "route":
          return marksRouted(
            instance,
            artifact,
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
    artifactTaker(writer, artifact, artifactRefusal);
  /** Why a send of the person's marks or answers to session `id` is refused, or nothing. */
  const artifactRefusal = (id: string): string | undefined =>
    ctx.inputRefusal(id, { kind: "system", name: ARTIFACT_ORIGIN })?.reason;
  /**
   * {@link deliverArtifactMarks} once the writer takes no input: a trigger
   * on the artifact (triggers.ts), told as marks to the session on it, else
   * briefing a fresh one; held while the project's triggers are off. When
   * nobody took them, the writer's transcript says why not.
   */
  const marksRouted = async (
    instance: InstanceRow,
    artifact: ArtifactRow,
    projectId: string,
    why: string,
    delivery: MarksDelivery
  ): Promise<MarksOutcome> => {
    const { text, images, attachments } = delivery;
    const reply =
      "Answer each in its pin's thread with comment_reply({ pin, text }), naming the pin by its id above.";
    const link = artifactLink(artifact.id, artifact.title || artifact.name);
    const routed = ctx.triggers
      ? await ctx.triggers.route(projectId, {
          kind: "person-request",
          thing: {
            kind: "artifact",
            id: artifact.id,
            name: `the ${artifact.kind} ${link}`,
          },
          what: `The person marked the ${artifact.kind} ${link}, made by ${ctx.sessionName(instance)}, which takes no input now (${why.replace(CLOSING_STOP, "")}).`,
          delta: `${text}\n\n${reply}`,
          who: "you",
          ...(images.length > 0 || attachments.length > 0
            ? {
                carried: {
                  ...(images.length > 0 ? { images } : {}),
                  ...(attachments.length > 0 ? { attachments } : {}),
                },
              }
            : {}),
          deliver: async (owner) =>
            (
              await marksToSession(owner, artifact, {
                ...delivery,
                text: `${text}\n\n${reply}`,
              })
            ).ok,
        })
      : { to: "lost" as const, why: "the hub is still starting" };
    if (routed.to !== "lost") {
      console.log(
        artifactToolWords.marksRouted(
          instance.id,
          projectId,
          routed.to === "held" ? routed.why : routed.instanceId,
          why.replace(CLOSING_STOP, "")
        )
      );
      return { ok: true };
    }
    const reason = `This session takes no input now, and no session took them: ${routed.why.replace(CLOSING_STOP, "")}.`;
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
    const record = sendArtifactEvent(
      instance,
      words,
      pictures,
      replaces,
      carried
    );
    if (record instanceof ElysiaStatus) {
      // A problem the send path answers (a conversation gone) keeps no record of its own.
      const reason = record.response.detail;
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
      ctx.lifetime.after("decisions told", DECISIONS_TOLD_MS, () => {
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
        routedTo: envelope.payload.routedTo,
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
      ctx.lifetime.after("wait page told", WAIT_PAGE_MS, () => {
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
      ctx.lifetime.after("record followed", RECORD_QUIET_MS, () => {
        recordsFollowing.delete(key);
        ctx.decisions.picksMoved(projectId, name);
      })
    );
  };
  /**
   * The place session `instance`'s port preview is staged from, and its
   * server's folder in it: `folder`, absolute or from the session's folder
   * (the session's own when absent), read on the session's machine (agent
   * repo-top.ts `repoRoot`). In a repository, the place is over its top and
   * the server runs in the folder's path from there; else it is over the
   * folder, its server at ".". Kept by its id (db stage-places.ts), so its
   * stage finds the folder when no session works in it ({@link stageWhere}).
   * Refused, naming `folder`, when it is no folder on that machine.
   */
  const placeFor = async (
    instance: InstanceRow,
    folder: string | undefined
  ) => {
    const app = posix.resolve(instance.cwd, folder ?? ".");
    const asked = await ctx.readAgent(
      instance.machineId,
      CONTROL_REPO_ROOT,
      [app],
      WORKSPACE_GIT_TIMEOUT_MS + 15_000
    );
    switch (asked.kind) {
      case "unanswered":
        return asked.reason === "dead"
          ? awayProblem(
              instance.machineId,
              "Your machine isn't connected to the hub, so the preview's folder can't be read."
            )
          : silentProblem(
              `Your machine didn't answer within ${secondsOf(asked.after)}s, so the preview's folder wasn't read.`
            );
      case "answered":
        break;
      default:
        throw unreachable(asked);
    }
    if (!asked.value.ok) {
      return problem(400, {
        code: "artifact-preview-folder",
        detail: artifactToolWords.serveFolderRefused(
          folder ?? ".",
          asked.value.error ?? `${app} could not be read.`
        ),
      });
    }
    const top = asked.value.result ?? app;
    const inside = posix.relative(top, app);
    // git names its top by its real path: a folder reached through a link
    // to it is staged from itself, whose clone the machine cuts at that top.
    const outside = inside.startsWith("..") || posix.isAbsolute(inside);
    const place = placeRefOf(instance.machineId, outside ? app : top);
    ctx.db.stagePlaces.keep({
      machineId: instance.machineId,
      namedBy: instance.id,
      ref: place,
    });
    const staged: { cwd: string; place: WorkspaceRef } = {
      place,
      cwd: (outside ? "" : inside) || ".",
    };
    return staged;
  };
  /**
   * Where a stage runs, with its machine: a session's work item's workspace,
   * else its place (caw.ts `stagePlaceRef`), on the session's machine; or
   * the workspace or place a sheet or a port preview was made in (a port
   * preview's kept as its create named it, {@link placeFor}); or a design folder's tree,
   * its folder under the artifacts root on the hub's machine (core stage.ts
   * `designOf`). Undefined when that is gone: a workspace the hub no longer
   * has, a place no session names any more.
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
    switch (workspaceIdKindOf(at.workspace)) {
      case undefined:
        return;
      case "design":
        return {
          workspace: {
            id: at.workspace,
            path: designFolderOf(ARTIFACTS_ROOT, at.workspace),
          },
          machineId: ctx.ownMachineIdRead,
        };
      case "place": {
        const kept = ctx.db.stagePlaces.get(at.workspace);
        if (kept) {
          return { workspace: kept.ref, machineId: kept.machineId };
        }
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
      case "clone": {
        const workspace = ctx.workItems.workspaceRef(at.workspace);
        return workspace
          ? {
              workspace,
              machineId: ctx.db.workspacesNamed(workspace.id)[0]?.machineId,
            }
          : undefined;
      }
    }
  };
  /** Why the tree `named` (a workspace, place or design folder id) can't run a stage: it is gone ({@link stageWhere}). */
  const goneWords = (named: string): string =>
    workspaceIdKindOf(named) === undefined
      ? `${named.slice(0, 8)} names no workspace, so no stage runs there.`
      : byWorkspaceIdKind(named, {
          clone: `The workspace ${named.slice(0, 8)} it was made in is gone, so its stage can't run.`,
          design: `The design folder ${named.slice(0, 8)} is gone, so its stage can't run.`,
          place:
            "No session works in the folder it was made in any more, so CawCo can't find that folder to run its stage in.",
        });
  /**
   * A stage method (core stage.ts) on a workspace's machine (a session's
   * own, or the one a sheet was made in), with the arguments `args` makes of
   * the workspace: its answer, or a refusal saying
   * why the stage can't be reached or said no.
   */
  const onStage = async <K extends ControlName>(
    at: StageAt,
    method: K,
    args: (workspace: WorkspaceRef) => ControlArgs<K>
  ) => {
    const where = stageWhere(at);
    if (!where) {
      // Only an artifact's names one that can be gone: a session always has a place.
      const named = "workspace" in at ? at.workspace : "";
      return problem(409, {
        code: "stage-workspace-gone",
        detail: goneWords(named),
      });
    }
    const { workspace, machineId } = where;
    if (machineId === undefined) {
      return problem(409, {
        code: "stage-workspace-unplaced",
        detail: `The workspace ${workspace.id.slice(0, 8)} it was made in is on no machine the hub knows, so its stage can't run.`,
      });
    }
    // A stage installs its project first when its lockfile moved (agent
    // stage-install.ts); a place's runs in a clone of its checkout, cut on
    // its first use (agent stage-clone.ts): its call waits for that too. A
    // design folder's installs as a clone's does.
    const asked = await ctx.callAgent(
      machineId,
      method,
      args(workspace),
      STAGE_READY_MS +
        byWorkspaceIdKind(workspace.id, {
          place: STAGE_CLONE_MS,
          clone: STAGE_INSTALL_MS,
          design: STAGE_INSTALL_MS,
        }) +
        (method === STAGE_RENDER || method === STAGE_PICTURE
          ? STAGE_RENDER_MS
          : 0) +
        15_000
    );
    switch (asked.kind) {
      case "unanswered":
        return asked.reason === "dead"
          ? awayProblem(
              machineId,
              "The workspace's machine isn't connected to the hub, so its stage can't be reached."
            )
          : silentProblem(
              `The workspace's machine didn't answer within ${secondsOf(asked.after)}s, so the stage's state is unknown.`
            );
      case "answered":
        break;
      default:
        throw unreachable(asked);
    }
    const answer = asked.value;
    if (!answer.ok) {
      return problem(502, {
        code: "stage-said-no",
        detail: answer.error ?? "The stage said no.",
      });
    }
    const staged: {
      machineId: string;
      result: ControlReply<K>;
      workspace: string;
    } = {
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
  ): Promise<Discarded> => {
    const archived = await ctx.workItems.discardFor(from, id, {
      approved,
    });
    if (archived instanceof ElysiaStatus) {
      return archived;
    }
    const { workspace, carry } = archived;
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
  ): Promise<DiscardAsked> => {
    const asked = ctx.workItems.discardable(from, id);
    if (asked instanceof ElysiaStatus) {
      return asked;
    }
    const stillWaiting = ctx.workItems.waiting(asked.id);
    if (stillWaiting instanceof ElysiaStatus) {
      return stillWaiting;
    }
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
    artifactsTo,
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
    placeFor,
    stranded,
    itemEnded,
    itemLive,
    personWaitOf,
    discarded,
    discardAsked,
  };
};
