/**
 * How the preview server (`cawco preview`, its own process and service:
 * preview-server/main.ts) and the hub speak, on the hub's own port on
 * loopback, each request carrying {@link TOKEN_HEADER}: a key derived from
 * the hub's secret key (secret-box.ts), which both processes read beside the
 * database.
 *
 * - **The control link** ({@link CONTROL_PATH}): one WebSocket the preview
 *   server keeps open. The hub says when what the listeners stand on moved
 *   (`ports`: the port rows and the mode, which the server reads itself),
 *   the dashboards that may frame a preview, and the tailnet's certificate;
 *   the server says each origin's use and viewers,
 *   each pass's use, each bind refused, and each machine listener that
 *   didn't answer. Nothing a page waits on goes over it.
 * - **The hub's own paths on a preview origin** ({@link ORIGIN_PATH} and
 *   {@link SYNC_PATH}, {@link STORE_SYNC_PATH}): what only the hub can
 *   answer (an entry, which writes a pass; an artifact's doc socket and its
 *   Send, picture and pictures; a page's store's socket; a page's shape; a
 *   page's fault report), relayed as the browser sent it.
 * - **Asks** ({@link UPSTREAM_PATH}, {@link OPEN_PATH}, {@link DOCUMENT_PATH},
 *   {@link REVIVE_PATH}): where a machine's preview is served now (the hub
 *   starts its listener on the machine), a port opened for an origin that has
 *   none, a document the hub hasn't built yet, and the workspace a preview's
 *   machine said is gone made again.
 */
import { timingSafeEqual } from "node:crypto";
import { isRecord } from "@cawco/core/is-record";
import { PREVIEW_DOWNS, type PreviewDown } from "@cawco/core/preview/protocol";
import { isSourceKey, type Upstream } from "@cawco/core/preview/upstream";
import { z } from "zod";
import type { PreviewStop } from "../preview-stops";
import { hubSecrets } from "../secret-box";

/** Everything of the hub's for its preview server, under one prefix. */
export const PREVIEW_SERVER_PREFIX = "/__cawco-preview";
/** The control link, a WebSocket. */
export const CONTROL_PATH = `${PREVIEW_SERVER_PREFIX}/control`;
/** `<ORIGIN_PATH><key or ->/<the path the browser asked>`: a hub-owned path on origin `key` (`-` for a port no origin holds). */
export const ORIGIN_PATH = `${PREVIEW_SERVER_PREFIX}/origin/`;
/** `<SYNC_PATH><key>/<artifact id>`: an artifact's doc socket joined on origin `key` (`?screen=1` for a canvas's host page). */
export const SYNC_PATH = `${PREVIEW_SERVER_PREFIX}/sync/`;
/** `<STORE_SYNC_PATH><key>/<scope>`: the store of scope `artifact` or `project` of the page on origin `key` (artifacts/page-stores.ts). */
export const STORE_SYNC_PATH = `${PREVIEW_SERVER_PREFIX}/store/`;
/** `<UPSTREAM_PATH><key>`: where machine artifact origin `key`'s preview is served now, its listener started when none serves it. */
export const UPSTREAM_PATH = `${PREVIEW_SERVER_PREFIX}/upstream/`;
/** `POST <OPEN_PATH><key>`: origin `key`'s port, opened when it has none. */
export const OPEN_PATH = `${PREVIEW_SERVER_PREFIX}/open/`;
/** `POST <DOCUMENT_PATH><id>`: artifact `id`'s document built now. */
export const DOCUMENT_PATH = `${PREVIEW_SERVER_PREFIX}/document/`;
/**
 * `POST <REVIVE_PATH><key>`: the workspace machine origin `key`'s preview is
 * served from, which its machine said is gone (agent preview.ts `staged`),
 * cut again at its last version (hub workspaces.ts `revive`); answers
 * {@link RevivedAnswer}.
 */
export const REVIVE_PATH = `${PREVIEW_SERVER_PREFIX}/revive/`;

/** The header every request from the preview server carries: {@link previewServerToken}. */
export const TOKEN_HEADER = "x-cawco-preview-server";
/** A relayed request's address as the browser asked for it (scheme, host, port, path and query). */
export const REACHED_HEADER = "x-cawco-preview-reached";
/** The lock the relayed request met: `port`, or host mode's domain. */
export const LOCK_HEADER = "x-cawco-preview-lock";

const TOKEN_LABEL = "cawco preview server v1";

/** The token both sides derive from the hub's secret key. */
export const previewServerToken = (): string =>
  hubSecrets().derive(TOKEN_LABEL).toString("base64url");

/** Whether `said` is the preview server's token. */
export const isPreviewServer = (said: string | null | undefined): boolean => {
  if (!said) {
    return false;
  }
  const want = Buffer.from(previewServerToken());
  const got = Buffer.from(said);
  return want.length === got.length && timingSafeEqual(want, got);
};

/** Tailscale's certificate for the machine's tailnet name, and where it serves (tailnet-https.ts). */
export interface TailnetServing {
  ips: string[];
  name: string;
  pair: { cert: string; key: string };
}

/** What the hub says on the control link. */
export type HubSays =
  /** What the listeners stand on moved: the port rows, the mode or its pattern. */
  | { type: "ports" }
  /** The origins that may frame a preview, and hello its overlay (preview.ts `previewParents`). */
  | { type: "parents"; parents: string[] }
  /** The tailnet's HTTPS: every preview port's TLS twin serves with it; null while none. */
  | { type: "tailnet"; serving: TailnetServing | null };

/** What the preview server says on the control link. */
export type ServerSays =
  /** Origin `key` was used at `at` (ms epoch): its port row's `used_at`, at most once a minute. */
  | { type: "used"; key: string; at: number }
  /** Pass `id` was used at `at`: its `last_seen_at`, at most once a minute. */
  | { type: "touched"; id: string; at: number }
  /** Origin `key` has a socket open on it now (`on`), or none. */
  | { type: "watched"; key: string; on: boolean }
  /**
   * The listeners stand as the rows say, but for these: each port whose
   * bind was refused, held by another program (`held`) or refused by the
   * bind address; and host mode's listener, when it didn't open.
   */
  | {
      type: "bound";
      refused: { key: string; port: number; held: boolean; why: string }[];
      host: { held: boolean; why: string } | null;
    }
  /** Machine origin `key`'s listener at `upstream` didn't answer: the next request asks where it is served now. */
  | { type: "unreachable"; key: string; upstream: Upstream };

/** Where a machine's preview is served now, or why not, as {@link UPSTREAM_PATH} answers. */
export type UpstreamAnswer =
  | { ok: true; upstream: Upstream }
  | { ok: false; down: PreviewDown; error: string; stop: PreviewStop };

/**
 * {@link REVIVE_PATH}'s answer: the workspace is on its machine again (the
 * request goes on to its listener), or why the preview can't come back,
 * `down` the hop the proxy's page names and `why` the words under it: `gone`
 * for a version that can't be cut again, `machine` while its machine is away.
 */
export type RevivedAnswer =
  { ok: true } | { ok: false; down: "gone" | "machine"; why: string | null };

const RevivedAnswerSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true) }),
  z.object({
    ok: z.literal(false),
    down: z.enum(["gone", "machine"]),
    why: z.string().nullable(),
  }),
]);

/** Whether `said` is {@link REVIVE_PATH}'s answer. */
export const isRevivedAnswer = (said: unknown): said is RevivedAnswer =>
  RevivedAnswerSchema.safeParse(said).success;

const TailnetServingSchema = z.object({
  ips: z.array(z.string()),
  name: z.string(),
  pair: z.object({ cert: z.string(), key: z.string() }),
});

const HubSaysSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ports") }),
  z.object({ type: z.literal("parents"), parents: z.array(z.string()) }),
  z.object({
    type: z.literal("tailnet"),
    serving: TailnetServingSchema.nullable(),
  }),
]);

/** Whether `said` is something the hub says on the control link. */
export const isHubSays = (said: unknown): said is HubSays =>
  HubSaysSchema.safeParse(said).success;

/**
 * Whether `value` is an upstream as the hub's preview-service.ts made it and
 * said it: the server keeps one only while its `for` is what the origin's
 * row names (serve.ts `createUpstreams`), and never makes one.
 */
const isUpstream = (value: unknown): value is Upstream =>
  isRecord(value) &&
  typeof value.address === "string" &&
  typeof value.port === "number" &&
  typeof value.token === "string" &&
  isSourceKey(value.for);

const UpstreamSchema = z.custom<Upstream>(isUpstream);

const ServerSaysSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("used"), key: z.string(), at: z.number() }),
  z.object({ type: z.literal("touched"), id: z.string(), at: z.number() }),
  z.object({ type: z.literal("watched"), key: z.string(), on: z.boolean() }),
  z.object({
    type: z.literal("bound"),
    refused: z.array(
      z.object({
        key: z.string(),
        port: z.number(),
        held: z.boolean(),
        why: z.string(),
      })
    ),
    host: z.object({ held: z.boolean(), why: z.string() }).nullable(),
  }),
  z.object({
    type: z.literal("unreachable"),
    key: z.string(),
    upstream: UpstreamSchema,
  }),
]);

/** What the preview server said on the control link, read; null for anything else. */
export const serverSaid = (text: string): ServerSays | null => {
  try {
    const read = ServerSaysSchema.safeParse(JSON.parse(text));
    return read.success ? read.data : null;
  } catch {
    return null;
  }
};

const PreviewDownSchema = z.enum(PREVIEW_DOWNS);
const PreviewStopSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("away"), machineId: z.string() }),
  z.object({ kind: z.literal("silent") }),
  z.object({ kind: z.literal("paused") }),
  z.object({ kind: z.literal("closed") }),
  z.object({ kind: z.literal("failed") }),
]);

const UpstreamAnswerSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), upstream: UpstreamSchema }),
  z.object({
    ok: z.literal(false),
    down: PreviewDownSchema,
    error: z.string(),
    stop: PreviewStopSchema,
  }),
]);

/** Whether `said` is {@link UPSTREAM_PATH}'s answer. */
export const isUpstreamAnswer = (said: unknown): said is UpstreamAnswer =>
  UpstreamAnswerSchema.safeParse(said).success;

/** {@link OPEN_PATH}'s answer: the port, or the hub's refusal (a problem's `detail`). */
export const OpenedSchema = z.object({
  port: z.number().optional(),
  detail: z.string().optional(),
});
