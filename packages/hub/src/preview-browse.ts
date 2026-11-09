import { ARTIFACT_PICTURE, PICTURE_LIMITS } from "@cawco/core/artifact-picture";
import type { PreviewAddress } from "@cawco/core/preview/routes";
import {
  placeAtLink,
  previewEnterUrl,
  previewRoute,
} from "@cawco/core/preview/routes";
import type { InstanceRow } from "@cawco/core/protocol";
import { secondsOf } from "@cawco/core/time";
import { artifactWords } from "@cawco/core/words/artifacts";
import type { WorkspaceSaved } from "@cawco/core/workspace/controls";
import { CONTROL_WORKSPACE_SAVE } from "@cawco/core/workspace/controls";
import type { Browsed } from "./artifacts/service";
import { ArtifactRefusal } from "./artifacts/service";
import { dashboardUrl } from "./dashboard-url";
import type { ArtifactRow } from "./db/artifacts";
import type { HubContext } from "./hub-context";
import { embedKey, PreviewRefusal, servedByMachine } from "./preview";
import { mintSessionTicket } from "./preview-access";
import { unreachable } from "./unreachable";

const NOT_NAME = /[^a-z0-9]+/gu;
const NAME_ENDS = /^-+|-+$/gu;
const NAME_TAIL = /-+$/u;
/**
 * Workspace controls other than create/archive: enough for their boundary work.
 * Create and its discard share the longer git-plus-boundary budget; archive
 * may be queued behind the create it must remove.
 */
export const WORKSPACE_TIMEOUT_MS = 60_000;

export type PreviewBrowseContext = Pick<
  HubContext,
  | "artifacts"
  | "callAgent"
  | "db"
  | "embedKeyOf"
  | "machineName"
  | "originKeyOf"
  | "ownMachineId"
  | "previewListeners"
  | "registry"
  | "sessionWorkspace"
>;

export const createPreviewBrowse = (ctx: PreviewBrowseContext) => {
  /**
   * A decision page's Diagram opened as a canvas (its "Open as canvas"): a
   * canvas artifact in the page's session's panel drawn from the Diagram's
   * Mermaid, named after the page and the Diagram's statement, so opening
   * the same one again redraws that canvas. The person's, from the page.
   */
  const openDiagramAsCanvas = async (
    request: Request,
    instanceId: string,
    artifactId: string
  ): Promise<Response> => {
    if (request.method !== "POST") {
      return new Response("Open a canvas with a POST.", {
        status: 405,
        headers: { allow: "POST" },
      });
    }
    const page = ctx.db.artifacts.get(artifactId);
    if (
      page?.kind !== "page" ||
      ctx.artifacts.program(artifactId) === undefined
    ) {
      return new Response("Only a decision page's Diagram opens as a canvas.", {
        status: 409,
      });
    }
    const body = (await request.json().catch(() => null)) as {
      from?: unknown;
      mermaid?: unknown;
    } | null;
    if (typeof body?.mermaid !== "string" || !body.mermaid.trim()) {
      return new Response("Name the Diagram's Mermaid to draw.", {
        status: 400,
      });
    }
    const of =
      typeof body.from === "string"
        ? body.from.toLowerCase().replaceAll(NOT_NAME, "-")
        : "diagram";
    const name = `${page.name}-${of}`
      .replaceAll(NAME_ENDS, "")
      .slice(0, 63)
      .replace(NAME_TAIL, "");
    try {
      const made = await ctx.artifacts.create(instanceId, {
        kind: "canvas",
        name,
        does: "draw",
        ask: "Draw over the diagram",
        title: artifactWords.diagramTitle(page.title),
        mermaid: body.mermaid,
      });
      return Response.json({ id: made.id, name: made.name }, { status: 201 });
    } catch (error) {
      if (error instanceof ArtifactRefusal) {
        return new Response(error.message, { status: error.status });
      }
      throw error;
    }
  };

  /**
   * What `open` answers of a preview origin, its listener started when it
   * has none; every port taken is the artifact's refusal, in the listeners'
   * words.
   */
  const onPreviewPort = <T>(open: () => T): T => {
    let refusal: PreviewRefusal;
    try {
      return open();
    } catch (error) {
      if (!(error instanceof PreviewRefusal)) {
        throw error;
      }
      refusal = error;
    }
    throw new ArtifactRefusal(503, refusal.message, { cause: refusal });
  };

  /**
   * The origin that serves artifact `row` to a browser of its own, by its
   * key, its listener started when it has none, and its address there: a
   * page or a canvas on the origin that serves it, a machine's component or
   * preview on its embed origin ({@link embedKeyOf}). Refused when no
   * session or machine holds it, or every preview port is taken.
   */
  const browsedOrigin = (
    row: ArtifactRow
  ): { address: PreviewAddress; key: string; path: string } => {
    const owner = ctx.originKeyOf(row.id);
    if (!owner) {
      throw new ArtifactRefusal(404, `No session holds ${row.name} now.`);
    }
    if (row.kind === "page" || row.kind === "canvas") {
      return {
        key: owner,
        address: onPreviewPort(() => ctx.previewListeners.address(owner)),
        path: `/__cawco/${row.kind}/${row.id}/`,
      };
    }
    const key = ctx.embedKeyOf(row.id);
    if (!servedByMachine(row) || key === undefined) {
      throw new ArtifactRefusal(
        409,
        `${row.name} is served by no machine now, so it has no address to open.`
      );
    }
    return {
      key,
      address: onPreviewPort(() => ctx.previewListeners.embed(key, owner)),
      path: row.source.path ?? "/",
    };
  };

  /**
   * Session `instance`'s way into artifact `row` for a browser of its own:
   * the origin that serves it ({@link browsedOrigin}), its path there, and a
   * one-time ticket that sets the session's own pass on that origin and a
   * decision page's embeds alone (preview-access.ts). A decision page's
   * Preview of a dev server or a sheet stands on an embed origin of its own
   * (embedAt); its Canvas and Preview of a page stand on the page's own.
   */
  const enteredAt = (instance: InstanceRow, row: ArtifactRow) => {
    const { key, address, path } = browsedOrigin(row);
    const embeds = Object.entries(
      ctx.artifacts.programServed(row.id)?.media ?? {}
    ).flatMap(([, held]) => {
      const own =
        held?.kind === "preview" || held?.kind === "component"
          ? ctx.embedKeyOf(held.id)
          : undefined;
      return own === undefined ? [] : [own];
    });
    return {
      address,
      path,
      entry: mintSessionTicket(instance.id, [key, ...embeds]),
    };
  };

  /**
   * Where session `instance`'s own browser opens artifact `row`
   * (`artifact_browse`) ({@link enteredAt}): a page or a canvas at its own
   * address on the origin that serves it, a component or a preview on an
   * embed origin of its own, entered once on that origin (host mode's name,
   * else its own port on the host the hub's links name). The url stands
   * whatever port the origin moves to: loaded on a port its origin no
   * longer holds, its entry is sent on to where the origin stands now, and
   * the pass it sets follows the artifact's page there (preview.ts
   * `movedOn`), as the person's tab goes to the artifact's own tab.
   */
  const browseAt = (instance: InstanceRow, row: ArtifactRow): Browsed => {
    const { address, path, entry } = enteredAt(instance, row);
    const origin =
      address.origin ??
      previewRoute(address, new URL(dashboardUrl(ctx.registry)))?.origin;
    if (!origin) {
      throw new ArtifactRefusal(
        503,
        `${row.name}'s preview origin has no address this hub can name.`
      );
    }
    return {
      url: previewEnterUrl(origin, entry.ticket, path),
      expiresAt: new Date(entry.expiresAt).toISOString(),
    };
  };

  /**
   * Preview or page `row` drawn as the person's panel draws it, for session
   * `instance`'s `artifact_read` with `png`: the hub machine's daemon opens
   * it in its Chromium (agent artifact-picture.ts) where `artifact_browse`
   * would, on its own preview origin, here on loopback, so the proxy's
   * overlay and the real origin are in it; a sleeping server is woken by
   * the page's load; at its state's `link` (a query merged into its own, or
   * a hash) when one is named. Its picture, base64 PNG; refused in words
   * when no daemon runs on the hub's machine or it didn't draw in time.
   */
  const pictureOf = async (
    instance: InstanceRow,
    row: ArtifactRow,
    { link, width }: { link?: string; width: number }
  ): Promise<string> => {
    const machineId = await ctx.ownMachineId;
    if (!ctx.registry.agent(machineId)) {
      throw new ArtifactRefusal(
        503,
        `${row.name} wasn't drawn: no CawCo daemon runs on the hub's machine to open it unseen. Start one there, then call again.`
      );
    }
    const { address, path, entry } = enteredAt(instance, row);
    const asked = await ctx.callAgent(
      machineId,
      ARTIFACT_PICTURE,
      [
        {
          url: previewEnterUrl(
            ctx.previewListeners.loopback(address.port),
            entry.ticket,
            link === undefined ? path : placeAtLink(path, link)
          ),
          width,
          artifact: { id: row.id, kind: row.kind, name: row.name },
          sync: `/__cawco/artifact/${row.id}`,
        },
      ],
      PICTURE_LIMITS.askMs
    );
    switch (asked.kind) {
      case "unanswered":
        throw new ArtifactRefusal(
          503,
          `${row.name} wasn't drawn: the hub's machine didn't draw it ${asked.reason === "dead" ? "(its daemon isn't connected)" : `within ${secondsOf(asked.after)} s`}.`
        );
      case "answered":
        break;
      default:
        throw unreachable(asked);
    }
    const png = (asked.value.result as { png?: unknown } | undefined)?.png;
    if (!asked.value.ok || typeof png !== "string") {
      throw new ArtifactRefusal(
        503,
        asked.value.error ??
          `${row.name} wasn't drawn: the hub's machine answered no picture.`
      );
    }
    return png;
  };

  /**
   * Picture `png` kept at `path` in session `instance`'s workspace, the
   * boundary its spawns carry ({@link sessionWorkspace}) (`artifact_read`'s
   * `save`), written by the workspace's machine with the
   * writer its inputs land by (agent inputs.ts `savePicture`), which refuses
   * a path outside the clone and the scratch dir in words. The path written.
   */
  const keepPicture = async (
    instance: InstanceRow,
    path: string,
    png: string
  ): Promise<string> => {
    const workspace = ctx.sessionWorkspace(instance);
    if (!workspace) {
      throw new ArtifactRefusal(
        409,
        "save keeps a picture in your workspace, and this session runs in none; read it without save."
      );
    }
    const asked = await ctx.callAgent(
      instance.machineId,
      CONTROL_WORKSPACE_SAVE,
      [workspace, path, png],
      WORKSPACE_TIMEOUT_MS
    );
    switch (asked.kind) {
      case "unanswered":
        throw new ArtifactRefusal(
          503,
          `The picture wasn't saved: ${ctx.machineName(instance.machineId)} ${asked.reason === "dead" ? "isn't connected" : `didn't answer within ${secondsOf(asked.after)} s`}.`
        );
      case "answered":
        break;
      default:
        throw unreachable(asked);
    }
    const saved = asked.value.result as WorkspaceSaved | undefined;
    if (!(asked.value.ok && saved)) {
      throw new ArtifactRefusal(
        503,
        `The picture wasn't saved: ${asked.value.error ?? "its machine answered nothing"}.`
      );
    }
    if ("refused" in saved) {
      throw new ArtifactRefusal(400, saved.refused);
    }
    return saved.path;
  };

  /**
   * A decision page's Preview of a dev-server preview, a folder's preview or
   * a sheet of its session's, at the version its media draws (`artifactId`,
   * artifacts service `newestVersion`): whatever machine serves it (a port
   * or a folder), whether or not a panel shows it, on its own origin
   * ({@link embedKey}), so a next version held for the owner's panel
   * stands on an origin apart from the one the panel shows; its origin's
   * listener started, and its address as the page reached it, the source's
   * start path on it. A preview no
   * machine serves (a browser's, `{ page }`) has no embed. On the session's
   * own port: the same name, the
   * embed's port. On a host-mode name: the embed's name, which the browser's
   * pass covers as it covers the page's (preview-access.ts), so no ticket
   * is ever served in a page. Nothing when the hub no longer holds it;
   * every port taken, the refusal in its words (`unopened`): the page
   * says it, and its Try again serves the page again.
   */
  const embedAt = (
    pageId: string,
    artifactId: string,
    reachedAt: URL
  ): { embed?: string; unopened?: string } => {
    const row = ctx.db.artifacts.get(artifactId);
    // The origin that serves the page: its embeds are framed by it.
    const owner = ctx.originKeyOf(pageId);
    if (!(row && owner && servedByMachine(row))) {
      return {};
    }
    const key = embedKey(row.origin);
    let at: ReturnType<typeof ctx.previewListeners.embed>;
    let ownPort: number;
    try {
      at = ctx.previewListeners.embed(key, owner, reachedAt);
      ownPort = ctx.previewListeners.address(owner).port;
    } catch (error) {
      if (error instanceof PreviewRefusal) {
        console.warn(`[preview] ${error.message}`);
        return { unopened: error.message };
      }
      throw error;
    }
    const path = row.source.path ?? "/";
    if (reachedAt.port === String(ownPort) || !at.origin) {
      return {
        embed: `${reachedAt.protocol}//${reachedAt.hostname}:${at.port}${path}`,
      };
    }
    return { embed: `${at.origin}${path}` };
  };

  return {
    openDiagramAsCanvas,
    onPreviewPort,
    browseAt,
    pictureOf,
    keepPicture,
    embedAt,
  };
};
