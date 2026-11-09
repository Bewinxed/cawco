import type { ChoiceEntry, SettledBy } from "@cawco/core/choices";
import type { Member } from "@cawco/core/decides";
import type { AfterLinks, DecisionCard } from "@cawco/core/decisions";
import type { PlanStep } from "@cawco/core/plan";
import type { PreviewDown } from "@cawco/core/preview/protocol";
import type { PreviewAddress } from "@cawco/core/preview/routes";
import type { AgentRow, InstanceRow } from "@cawco/core/protocol";
import type {
  CanvasSpec,
  DesignMap,
  DesignQuery,
  ServeSpec,
  SheetWrite,
  SheetWritten,
  StageOpened,
  StageRendered,
  StageState,
  StageWarm,
} from "@cawco/core/stage";
import type { FolderWeight } from "@cawco/preview/proxy";
import type { ArtifactRow, ArtifactsDb } from "../db/artifacts";
import type { ArtifactNamed, BuiltProgram } from "../decision-program";
import type { AskedArtifact } from "../design-verify";
import type { HubLifetimeShape } from "../lifetime";
import type { SentPage } from "../setup";
import type { StateAsk } from "./component";
import type { ArtifactDocs } from "./docs";
import type { ArtifactRefusal } from "./refusals";
import type {
  Browsed,
  CanvasScreen,
  MarksDelivery,
  MarksOutcome,
  PageFrom,
  PageHearer,
  StageAt,
} from "./shapes";

export interface ArtifactServiceDeps {
  /** The notice ids the person acknowledged (hub notices.ts): Not now's among them. */
  acknowledged: () => readonly string[];
  /**
   * What decision page `name` drawn with `cards` does to its project's
   * links (decisions.ts `linksOf`): its `after`s naming no decision, and
   * its decisions other pages come after. Said to its writer. A project
   * the hub does not keep is refused.
   */
  afterLinks: (
    projectId: string,
    name: string,
    cards: DecisionCard[]
  ) => Promise<AfterLinks | { refused: string; status: 404 }>;
  /**
   * Who hears the person on `artifact`, which `writer` made: the one his
   * marks and the hub's own send of his answers go to (artifacts/taker.ts),
   * its writer while it takes input, else the session that delegated it,
   * else the project's Caw; none when no one can.
   */
  answersTo: (
    writer: InstanceRow | undefined,
    artifact: ArtifactRow
  ) => PageHearer | null;
  /** The step of the session's plan an ask of the artifact is made at: the open one naming it, else the one in progress; null when it is at work on none (plans.ts `askedAt`). */
  askedAt: (instanceId: string, artifactId: string) => string | null;
  /**
   * Where session `instance`'s own browser opens artifact `row`, which it
   * may read (`artifact_browse`, preview-browse.ts `browseAt`): its address, behind
   * a one-time entry and a pass of the session's own in host mode.
   */
  browse: (instance: InstanceRow, row: ArtifactRow) => Browsed;
  /** Closes session `instanceId`'s panel: it shows nothing, and every view of it hears so. */
  close: (instanceId: string) => void;
  /**
   * Whether a session is cold now: no turn under way and its prompt cache
   * expired, the test by which `handoff` refuses to hand it work without
   * asking (keep-alive.ts `cacheWarmNow`). What it left in its project is
   * then its project's to take up (`leftFor` below).
   */
  cold: (instance: InstanceRow) => boolean;
  db: ArtifactsDb;
  /**
   * Who decides (settling.ts): each card a session just wrote, sent to its
   * member by the project's table and said back as a line after its link;
   * the member a session settles a card for, and how it signs, refused in
   * words when it may not; and a settled card's ledger stamp and push.
   */
  decides: {
    routed: (
      asker: InstanceRow,
      row: ArtifactRow,
      cards: DecisionCard[],
      all: DecisionCard[],
      state: Record<string, ChoiceEntry>
    ) => Promise<Record<string, string>>;
    settled: (
      row: ArtifactRow,
      card: DecisionCard,
      member: Member,
      answer: { label: string; why: string }
    ) => void;
    settler: (
      settler: InstanceRow,
      row: ArtifactRow,
      card: DecisionCard
    ) => Promise<Pick<SettledBy, "by" | "name" | "runs"> & { member: Member }>;
  };
  /**
   * Whether `workspaceId` holds a work item of the session's delegates: one it
   * delegated, or one of a project it is the conversation of (as `stop_delegate` decides).
   */
  delegatesIn: (instance: InstanceRow, workspaceId: string) => boolean;
  /**
   * Delivers the person's marks on `artifact` to the session that made it,
   * waking it as their own words do; to the project's Caw when that session
   * takes no input any more (server.ts `deliverMarks`).
   */
  deliverMarks: (
    instance: InstanceRow,
    artifact: ArtifactRow,
    delivery: MarksDelivery
  ) => Promise<MarksOutcome>;
  docs: ArtifactDocs;
  /**
   * Page `name`'s source taken out of project `projectId`'s folder
   * (`decisions/<name>/page.oui` or its built `index.html`) in one commit by
   * `instance`: a project's page lives as long as it. Why not, when the
   * folder refuses.
   */
  dropPage: (
    instance: InstanceRow,
    projectId: string,
    name: string
  ) => Promise<
    { refused: string; status: ArtifactRefusal["status"] } | undefined
  >;
  /** Whether a session has ended or takes no input now (artifacts/taker.ts `takesNoInput`), so its marks go to its parent, else its project's Caw. */
  ended: (instance: InstanceRow) => boolean;
  /**
   * Whether a session's asks are over for good (Needs you's rule 4): it
   * finished, its workspace was archived or moved on, its conversation is
   * gone, or nothing can give it a turn again. A machine away is not.
   */
  finished: (instance: InstanceRow) => boolean;
  /** What a folder preview of `dir` loads, weighed on machine `machineId`, and the desk captures on its start page at `path` (agent preview.ts `previewWeight`). Throws an {@link ArtifactRefusal} saying why it can't. */
  folderWeight: (
    machineId: string,
    dir: string,
    path: string | undefined
  ) => Promise<FolderWeight>;
  /** Whether a dashboard (or the app) follows the session's stream now: one shows it. */
  followed: (instanceId: string) => boolean;
  /**
   * Tells `parent` once that its delegate `maker` handed it `artifact`, not
   * opened, or changed it while its panel shows it, the change held as
   * `next` (core `artifactHandedNotice`), on the channel the person's picks
   * take (artifact-events.ts `handArtifactUp`).
   */
  handedUp: (
    parent: InstanceRow,
    maker: InstanceRow,
    artifact: ArtifactRow,
    next?: ArtifactRow
  ) => Promise<void>;
  instance: (id: string) => InstanceRow | undefined;
  /** The rows of `ids` the hub holds, in one read. */
  instances: (ids: string[]) => InstanceRow[];
  /**
   * Whether the session's work item ended (done, failed or cancelled),
   * whatever its workspace's state: the sessions up its delegation tree may
   * then delete what it wrote ({@link Artifacts.remove}). False for a session
   * with no item, and while its item is live (a reopened one included).
   */
  itemEnded: (instance: InstanceRow) => boolean;
  /**
   * Page `name`'s source kept in `instance`'s project folder at
   * `decisions/<name>/`, as a build with `keep` keeps it: a held next
   * version's, once its parent opens it. Why not, when the folder refuses.
   */
  keepPage: (
    instance: InstanceRow,
    name: string,
    page: { html: string; program?: string }
  ) => Promise<
    { refused: string; status: ArtifactRefusal["status"] } | undefined
  >;
  /**
   * Picture `png` (base64) kept at `path` in session `instance`'s workspace
   * (`artifact_read`'s `save`), written by its machine (core
   * `CONTROL_WORKSPACE_SAVE`). The path written; throws an
   * {@link ArtifactRefusal} saying why when it wasn't.
   */
  keepPicture: (
    instance: InstanceRow,
    path: string,
    png: string
  ) => Promise<string>;
  /**
   * The projects session `instance` is the conversation of (their Caw): an ended writer's
   * marks are routed to him, and he answers them in their pins' threads.
   * He also reads every page of his project, so a page whose session ended
   * or is gone is his to act on (Projects spec §5.8, decisions.ts).
   */
  ledProjects: (instance: InstanceRow) => string[];
  /** The hub's lifetime: the marks' delivery and the shown acks' keep run on it. */
  lifetime: HubLifetimeShape;
  /**
   * The session's panel is listed: the browser it uses gets its artifact
   * there, made the first time (browsers.ts `listed`).
   */
  listing: (instance: InstanceRow) => void;
  /** The person looked at artifact `id` (a view's word that it had it on screen): its push is over. */
  looked: (id: string) => void;
  /** The machines the hub knows. */
  machines: () => Pick<AgentRow, "machineId" | "hostname">[];
  /**
   * Something an artifact's Needs-you item is read from moved (its row, its
   * ask, the person's look): the lane is read again and every screen told.
   */
  needsMoved: () => void;
  /**
   * Publishes `artifact` to session `panel`'s panel (its own session's
   * unless named: another session of its delegation tree shows it in its
   * own) at a fresh revision (the open frame every view of that session
   * hears); why not, when its server could not be started. Whether a view
   * put it on screen is that view's word ({@link Artifacts.shown}).
   */
  open: (
    artifact: ArtifactRow,
    panel?: string | null
  ) => Promise<{ ok: true; revision: string } | { error: string; ok: false }>;
  /** The workspace a session runs in, by id; undefined outside one. */
  ownWorkspace: (instance: InstanceRow) => string | undefined;
  /**
   * A page's HTML built as the decision-page skill builds one: from inline
   * `html`, from `dir`'s page.html on the session's machine, or (neither) from
   * `decisions/<name>/page.html` in the session's project folder; written to
   * `decisions/<name>/` too when the session is in a project and `keep`.
   */
  page: (
    instance: InstanceRow,
    name: string,
    from: PageFrom,
    keep: boolean,
    /** The artifact a program's Canvas or Preview names, whole (`whole`). */
    artifact: ArtifactNamed
  ) => Promise<
    | { html: string; program?: BuiltProgram }
    | { refused: string; status: ArtifactRefusal["status"] }
  >;
  /**
   * Preview or page `artifact` drawn as the person's panel draws it, for
   * session `instance`'s `artifact_read` with `png` (server.ts, agent
   * artifact-picture.ts): on its own preview origin in the Chromium of the
   * hub's machine, `width` CSS px wide, at its state's `link` when one is
   * named, a sleeping server woken first. Its picture, base64 PNG; throws an
   * {@link ArtifactRefusal} saying why when it can't be drawn.
   */
  picture: (
    instance: InstanceRow,
    artifact: ArtifactRow,
    drawn: { link?: string; width: number }
  ) => Promise<string>;
  /**
   * The agent's reply `text` on a pin of artifact `artifactId` asks the
   * person something (`comment_reply`'s `asks`): its push, grouped per
   * artifact (push.ts `pinAsked`).
   */
  pinAsked: (artifactId: string, text: string) => void;
  /**
   * Session `instanceId`'s preview origin (preview.ts), its listener started
   * when it has none; throws a refusal when every port is taken.
   */
  previewAddress: (instanceId: string) => PreviewAddress;
  /**
   * A session closed one of artifact `artifactId`'s questions to the person
   * (taken or withdrawn): every screen listing a session's questions reads
   * them again (core `QuestionsMovedFrame`).
   */
  questionsMoved: (artifactId: string) => void;
  /**
   * A preview no panel shows, loaded once on its own origin as a pane's
   * load would be (its machine's listener started for what its row names
   * now: hub preview-service.ts): null when nothing stands in its way (a
   * page its server is still making among that), else the hop that failed
   * and the machine's words for it, or `error` and the page's status and
   * first error line when it answered an error status (4xx, 5xx). A
   * preview handed to a parent is checked
   * so before it reaches them.
   */
  reachable: (
    row: ArtifactRow
  ) => Promise<{ failure: PreviewDown; why: string | null } | null>;
  /**
   * Every view of session `instanceId`'s panel hears its artifacts again on
   * the frame it follows (the panel's open frame, unchanged otherwise); none
   * when the panel shows nothing.
   */
  relist: (instanceId: string) => void;
  /**
   * An artifact was taken out: a preview it was no longer holds the
   * workspace it showed (work-items.ts `settleShown`). The origin its row
   * pointed at ends with the row (db `onArtifactsGone`), not here.
   */
  removed?: (row: ArtifactRow) => void;
  /** Where artifacts' files are kept: a page's `<root>/<id>/index.html`, a canvas's `<root>/<id>/picture.png`. */
  root: string;
  /**
   * Canvas `artifact`'s host page opened in the Chromium of the hub's own
   * machine (agent canvas-screen.ts), told it is that canvas, its doc at
   * `sync`, where it joins the doc as a screen: what holds it on through a
   * write, and what lets it go. Throws an {@link ArtifactRefusal} saying why
   * when none can open.
   */
  screen: (artifact: ArtifactRow, sync: string) => Promise<CanvasScreen>;
  /**
   * What a send applies before the session hears it (setup.ts
   * `applySetupPicks`): the page as it stands ({@link SentPage}); a
   * refusal throws and nothing is sent.
   */
  sending: (
    to: PageHearer,
    artifact: ArtifactRow,
    page: SentPage
  ) => Promise<void>;
  /**
   * A workspace preview's server (agent stage.ts `ensureServed`), started or
   * woken on the workspace's machine and waited on until its port answers:
   * its state. Throws an {@link ArtifactRefusal} saying why it didn't start.
   * A decision page's Previews of it wake it as the page goes out, unwaited
   * (`warmPreviews`).
   */
  serve: (
    machineId: string,
    workspace: string,
    serve: ServeSpec
  ) => Promise<StageState>;
  /** Whether project `projectId` is set up (tasks.ts `isSetUp`): where its setup page lands (core `setupLanding`). */
  setUp: (projectId: string) => boolean;
  /** The artifact a session's panel shows now, if any. */
  showing: (instanceId: string) => string | undefined;
  /**
   * Tells `to` the person sent their picks on `artifact`: its session,
   * which reads them from `since` with `artifact_read` (core
   * `artifactResponsesNotice`), one it has not read yet for the same
   * artifact superseded, not added to, so it hears once, from the earliest
   * `since` it was not told of; or the project's Caw, in `to`'s words.
   * Answers the session that heard it.
   */
  signal: (
    to: PageHearer,
    artifact: ArtifactRow,
    responses: { since: number }
  ) => Promise<string>;
  /**
   * The stage story file `file` runs on in a workspace (agent stage.ts
   * `ensureStage`), started or woken there and waited on: its port, root and
   * state, the sheet's stories, with the workspace and its machine. Throws
   * an {@link ArtifactRefusal} saying why it can't run, and, `opening` a
   * canvas, naming a states file that isn't written. A decision page's
   * Previews of sheets start or wake theirs as the page goes out, unwaited
   * ({@link ArtifactServiceDeps.warmStage}).
   */
  stage: (
    at: StageAt,
    file: string,
    files?: string[],
    opening?: boolean
  ) => Promise<{ machineId: string; opened: StageOpened; workspace: string }>;
  /** The design map of session `instance`'s workspace (agent stage.ts `stageComponents`): its components, paged, or one's card. */
  stageComponents: (at: StageAt, ask: DesignQuery) => Promise<DesignMap>;
  /** A canvas drawn by its workspace's daemon in the machine's Chromium (agent stage-render.ts): within its limit, what it drew and what it did not. */
  stageRender: (
    at: StageAt,
    ask: { files: string[]; png?: boolean; spec?: CanvasSpec; state?: StateAsk }
  ) => Promise<StageRendered>;
  /**
   * A write to a sheet's story file in its workspace, made by its stage
   * (agent stage.ts `writeSheet`): the lines it changed and the sheet after.
   * Throws an {@link ArtifactRefusal} saying why it can't.
   */
  stageWrite: (at: StageAt, write: SheetWrite) => Promise<SheetWritten>;
  /** The session's plan's steps: an open one naming a card or pin of an artifact holds its ask (needs.ts `planHolds`). */
  steps: (instanceId: string) => readonly PlanStep[];
  /**
   * Whether a session can no longer act, ever: no one, its parent and the
   * person included, can give it a turn again. Its item ended and its
   * workspace was discarded or retired past cutting again, or a newer item
   * holds that workspace, or the session itself ended for good (continued
   * into another, its conversation gone). What it wrote is then deleted by
   * the sessions up its delegation tree ({@link Artifacts.remove}), as it is
   * once its work item ended ({@link ArtifactServiceDeps.itemEnded}).
   */
  stranded: (instance: InstanceRow) => boolean;
  /**
   * Every session of `instance`'s delegation tree (delegation-tree.ts
   * `treeSessions`): each reads, never changes, the others' artifacts of
   * its project; one up a writer whose work item ended deletes that
   * writer's ({@link ArtifactServiceDeps.stranded}).
   */
  tree: (instance: InstanceRow) => Set<string>;
  /** Stops the server on `port` of workspace `workspace` (agent stage.ts `stopServed`): no artifact previews it any more. Never throws. */
  unserve: (machineId: string, workspace: string, port: number) => void;
  /**
   * A component canvas drawn by its workspace's daemon in the machine's own
   * Chromium (agent stage.ts `renderStage`): the stage's report once every
   * section drew, and a picture when asked.
   */
  /**
   * A design system round asked of a component canvas in a chat (hub
   * design-verify.ts `ask`): its verdict goes to `requester`. Answers what
   * the ask did, one sentence.
   */
  verify: (requester: InstanceRow, artifact: AskedArtifact) => Promise<string>;
  /**
   * One stage warmed for a decision page as it goes out (agent stage.ts
   * `warmStage`): started or woken there and every canvas of `warm` compiled
   * as its Preview's page loads it. Settles once the machine took it, before
   * the warm-up runs; throws an {@link ArtifactRefusal} when it can't be
   * reached.
   */
  warmStage: (at: StageAt, warm: StageWarm) => Promise<void>;
  /**
   * Why a browser in a workspace on machine `machineId` cannot open `url`,
   * or null when it can (server.ts, core boundary-reach.ts
   * `workspaceReach`): a Linux workspace's boundary reaches public hosts
   * only; a Mac's dials as its host does.
   */
  workspaceReach: (url: string, machineId: string) => Promise<string | null>;
  /** The workspaces an id or its prefix names, each with the machine it is on. */
  workspaces: (
    needle: string
  ) => { id: string; machineId: string; state: string }[];
}
