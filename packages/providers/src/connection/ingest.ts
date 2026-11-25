/**
 * A connector poll's read (provider spec §2.9, `connection`): its tool
 * called through the connection, the items in its answer read by id and
 * version. Every item is a revision of its record; one the mirror does not
 * hold at that version is new or changed, and its event (kind `item`,
 * keyed `<id>:<version>`, the item whole as its data) is stored with it by
 * the door. The answer is the poll's whole listing, so a record it no
 * longer lists goes and its return is new again. A first call is a
 * baseline: it only looks.
 */
import { Effect } from "effect";
import type {
  Ingest,
  ItemRevision,
  MirroredRef,
  Polled,
  SourceEvent,
} from "../provider";
import { refusedWith } from "../read-stop";
import {
  CONNECTOR_MIN_S,
  connectionSource,
  connectorCallOf,
  keyPart,
  valueAt,
} from "./descriptor";

/** A tool's answer as an MCP client hands it over: its structured content, else its content parts. */
interface ToolAnswer {
  content: readonly ({ text: string; type: "text" } | { type: string })[];
  isError?: boolean;
  structuredContent?: unknown;
}

/** One tool of the watch's connection, called with its arguments (hub connections.ts `callConnection`). */
export type ToolCaller = (
  tool: string,
  args: Record<string, unknown>
) => Promise<ToolAnswer>;

/** Its one stream's mark: there once it has looked. */
export type ConnectorCursor = Record<string, never>;

/** The one stream a connector poll has. */
export const ITEMS_STREAM = "items";

/** The answer's items: its structured content, else its first text as JSON, at the poll's items path. */
const itemsIn = (answer: ToolAnswer, itemsPath: string): unknown[] => {
  if (answer.isError) {
    throw new Error("the tool answered an error");
  }
  let read: unknown = answer.structuredContent;
  if (read === undefined) {
    const text = answer.content.find(
      (part): part is { text: string; type: "text" } => part.type === "text"
    );
    if (!text) {
      throw new Error("its answer had no text or structured content");
    }
    try {
      read = JSON.parse(text.text);
    } catch (error) {
      throw new Error("its answer's text is not JSON", { cause: error });
    }
  }
  const items = valueAt(read, itemsPath);
  if (!Array.isArray(items)) {
    throw new Error(
      `no list of items at “${itemsPath || "(the whole answer)"}”`
    );
  }
  return items;
};

/** A record of the poll's watch, as the mirror keys it. */
const recordOf = (watchId: string, id: string): MirroredRef => ({
  provider: "connection",
  host: "",
  container: watchId,
  kind: "record",
  key: id,
  ref: id,
  url: null,
});

const MOST_REASON = 500;

/** A connector poll's ingest. */
export const connectionIngest: Ingest<ToolCaller, ConnectorCursor> = {
  everyMs: (watch) =>
    Math.max(CONNECTOR_MIN_S, connectorCallOf(watch.settings).intervalS) * 1000,
  streams: () => [ITEMS_STREAM],
  readsBy: (watch) => {
    const call = connectorCallOf(watch.settings);
    return [
      watch.connection,
      call.tool,
      call.args,
      call.itemsPath,
      call.idPath,
      call.versionPath,
    ];
  },
  // The call is the connection's (hub connections.ts `callConnection`),
  // bounded there: it takes no deadline of the poll's.
  poll: ({ client, cursor, now, watch }) => {
    const call = connectorCallOf(watch.settings);
    const refused = (error: unknown) => {
      const said = `${watch.connection}/${call.tool}: ${error instanceof Error ? error.message : String(error)}`;
      return refusedWith(
        said.length > MOST_REASON ? `${said.slice(0, MOST_REASON)}…` : said
      );
    };
    return Effect.tryPromise({
      try: async () =>
        itemsIn(await client(call.tool, call.args), call.itemsPath),
      catch: refused,
    }).pipe(
      Effect.map((items): Polled<ConnectorCursor> => {
        const source = connectionSource(watch.connection, call.tool);
        const byId = new Map<string, { item: unknown; version: string }>();
        for (const item of items) {
          const id = keyPart(valueAt(item, call.idPath));
          const version = keyPart(valueAt(item, call.versionPath));
          if (id !== undefined && version !== undefined) {
            byId.set(id, { item, version });
          }
        }
        const revisions: ItemRevision[] = [];
        const events: SourceEvent[] = [];
        for (const [id, { item, version }] of byId) {
          const ref = recordOf(watch.id, id);
          revisions.push({
            item: ref,
            version,
            snapshot: {
              externalId: "",
              title: "",
              state: null,
              stateName: "",
              author: null,
              labels: [],
              data: item,
            },
          });
          events.push({
            item: ref,
            change: true,
            source,
            key: `${id}:${version}`,
            kind: "item",
            actor: null,
            labels: [],
            branch: null,
            url: null,
            title: null,
            body: null,
            at: now,
            data: item,
          });
        }
        return {
          kind: "read",
          baseline: cursor === null,
          cursor: {},
          ingested: { revisions, events, whole: { container: watch.id } },
        };
      })
    );
  },
};
