/**
 * A page's heap after a collection, read as DevTools' Memory panel reads it:
 * the DOM nodes no document holds any more (detached), counted by kind, and
 * for any of them the shortest path from the GC roots that keeps it alive,
 * down to the closure, timer, listener or layout object at its end.
 *
 * `HeapProfiler.takeHeapSnapshot` collects garbage before it writes, so
 * every node in it is held by something. A DevTools console handle (an
 * object the driver asked about over DevTools) holds nothing for the page:
 * a node only it reaches is counted apart (`heldForDriver`), and no path
 * runs through one.
 */
import type { CDPSession } from "playwright-core";

/** DevTools' own prefix on a detached node's name, where the snapshot writes it. */
const DETACHED_PREFIX = /^Detached /;
/** An HTML element's name in a snapshot: its opening tag, attributes and all. */
const OPENING_TAG = /^<([a-z][\w-]*)[\s\S]*$/;
/** A probe's own mark on an element (`data-probe="…"`), said beside the element in a path. */
const PROBE_TAG = /data-probe="([^"]*)"/;
/** A script URL's scheme and host, left off a closure's source position. */
const ORIGIN = /^.*?\/\/[^/]+/;
const WHITESPACE = /\s+/g;
/** The snapshot's `detachedness` of a node no document holds. */
const DETACHED = 2;

interface Raw {
  edges: number[];
  locations?: number[];
  nodes: number[];
  snapshot: {
    meta: {
      edge_fields: string[];
      edge_types: [string[], ...unknown[]];
      location_fields?: string[];
      node_fields: string[];
      node_types: [string[], ...unknown[]];
    };
  };
  strings: string[];
}

/** A snapshot, indexed for counting and for walking retainers. */
export interface Heap {
  /**
   * Detached DOM nodes the page holds, by kind: an HTML element by its tag
   * (`div`, `span`), the rest by class (`SVGSVGElement`, `Text`, `Comment`).
   */
  detached: Record<string, number>;
  /** Node ordinals of the detached nodes of one kind. */
  detachedOf: (name: string) => number[];
  /** Detached nodes held only by a DevTools console handle: the driver's, left out of `detached`. */
  heldForDriver: number;
  /** A node's heap id: the same object keeps it from one snapshot to the next of a session. */
  idOf: (at: number) => number;
  /**
   * The path from the GC roots that holds node `at`, root first: each step
   * the holder, its type, the edge's name, and the source position of a
   * closure's function where the snapshot gives one.
   */
  pathTo: (at: number, depth?: number) => string[];
}

/** Takes a snapshot over `cdp` (a page's own DevTools session) and indexes it. */
export async function heapOf(cdp: CDPSession): Promise<Heap> {
  const scripts = new Map<string, string>();
  const parsed = (event: { scriptId: string; url: string }) =>
    scripts.set(event.scriptId, event.url);
  cdp.on("Debugger.scriptParsed", parsed);
  await cdp.send("Debugger.enable");
  await cdp.send("Debugger.disable");
  cdp.off("Debugger.scriptParsed", parsed);
  const chunks: string[] = [];
  const add = (event: { chunk: string }) => chunks.push(event.chunk);
  cdp.on("HeapProfiler.addHeapSnapshotChunk", add);
  await cdp.send("HeapProfiler.enable");
  await cdp.send("HeapProfiler.collectGarbage");
  await cdp.send("HeapProfiler.takeHeapSnapshot", {
    reportProgress: false,
    captureNumericValue: false,
  });
  cdp.off("HeapProfiler.addHeapSnapshotChunk", add);
  return new Snapshot(JSON.parse(chunks.join("")) as Raw, scripts).heap();
}

class Snapshot {
  readonly #raw: Raw;
  readonly #n: number;
  readonly #e: number;
  readonly #field: (name: string) => number;
  /** Where in a node or edge record each field sits. */
  readonly #nName: number;
  readonly #nType: number;
  readonly #eTo: number;
  readonly #eType: number;
  readonly #eName: number;
  readonly #edgeTypes: string[];
  readonly #count: number;
  /** Each node's first edge, as an offset into `edges`. */
  readonly #first: Uint32Array;
  /** Each node's distance from the root along edges that hold; -1 where none reach it. */
  readonly #distance: Int32Array;
  /** Edges by the node they point to: `#inAt[i]` to `#inAt[i + 1]` index `#inEdge` and `#inFrom`. */
  #inAt = new Uint32Array(0);
  #inEdge = new Uint32Array(0);
  #inFrom = new Uint32Array(0);
  readonly #where = new Map<number, string>();

  constructor(raw: Raw, scripts: Map<string, string>) {
    this.#raw = raw;
    const { meta } = raw.snapshot;
    this.#n = meta.node_fields.length;
    this.#e = meta.edge_fields.length;
    this.#field = (name) => meta.node_fields.indexOf(name);
    this.#nName = this.#field("name");
    this.#nType = this.#field("type");
    this.#eTo = meta.edge_fields.indexOf("to_node");
    this.#eType = meta.edge_fields.indexOf("type");
    this.#eName = meta.edge_fields.indexOf("name_or_index");
    [this.#edgeTypes] = meta.edge_types;
    this.#count = raw.nodes.length / this.#n;
    this.#first = this.#firstEdges();
    this.#distance = this.#distances();
    this.#retainers();
    this.#locations(scripts);
  }

  #firstEdges(): Uint32Array {
    const first = new Uint32Array(this.#count + 1);
    const edgeCount = this.#field("edge_count");
    for (let i = 0; i < this.#count; i += 1) {
      first[i + 1] =
        (first[i] as number) +
        (this.#raw.nodes[i * this.#n + edgeCount] as number) * this.#e;
    }
    return first;
  }

  #to(e: number): number {
    return (this.#raw.edges[e + this.#eTo] as number) / this.#n;
  }

  #edgeType(e: number): string {
    return this.#edgeTypes[this.#raw.edges[e + this.#eType] as number] ?? "";
  }

  #edgeName(e: number): string {
    const value = this.#raw.edges[e + this.#eName];
    const type = this.#edgeType(e);
    return type === "element" || type === "hidden"
      ? `[${value}]`
      : (this.#raw.strings[value as number] ?? "");
  }

  /** An edge that keeps nothing alive for the page: weak, a shortcut, or a DevTools console handle. */
  #holdsNot(e: number): boolean {
    const type = this.#edgeType(e);
    if (type === "weak" || type === "shortcut") {
      return true;
    }
    return (
      type === "internal" && this.#edgeName(e).includes("DevTools console")
    );
  }

  #distances(): Int32Array {
    const distance = new Int32Array(this.#count).fill(-1);
    const queue = new Uint32Array(this.#count);
    distance[0] = 0;
    let head = 0;
    let tail = 1;
    while (head < tail) {
      const at = queue[head] as number;
      head += 1;
      for (
        let e = this.#first[at] as number;
        e < (this.#first[at + 1] as number);
        e += this.#e
      ) {
        const to = this.#to(e);
        if (!this.#holdsNot(e) && distance[to] === -1) {
          distance[to] = (distance[at] as number) + 1;
          queue[tail] = to;
          tail += 1;
        }
      }
    }
    return distance;
  }

  #retainers(): void {
    const { edges } = this.#raw;
    const inAt = new Uint32Array(this.#count + 1);
    for (let e = 0; e < edges.length; e += this.#e) {
      inAt[this.#to(e) + 1] += 1;
    }
    for (let i = 0; i < this.#count; i += 1) {
      inAt[i + 1] += inAt[i] as number;
    }
    const fill = inAt.slice();
    this.#inEdge = new Uint32Array(edges.length / this.#e);
    this.#inFrom = new Uint32Array(edges.length / this.#e);
    for (let from = 0; from < this.#count; from += 1) {
      for (
        let e = this.#first[from] as number;
        e < (this.#first[from + 1] as number);
        e += this.#e
      ) {
        const to = this.#to(e);
        const slot = fill[to] as number;
        fill[to] = slot + 1;
        this.#inEdge[slot] = e;
        this.#inFrom[slot] = from;
      }
    }
    this.#inAt = inAt;
  }

  /** Each closure's source position, from the snapshot's locations. */
  #locations(scripts: Map<string, string>): void {
    const fields = this.#raw.snapshot.meta.location_fields ?? [];
    const locations = this.#raw.locations ?? [];
    const at = (name: string) => fields.indexOf(name);
    for (let l = 0; fields.length && l < locations.length; l += fields.length) {
      const script = String(locations[l + at("script_id")]);
      const url = (scripts.get(script) ?? `script ${script}`).replace(
        ORIGIN,
        ""
      );
      const line = (locations[l + at("line")] as number) + 1;
      const column = (locations[l + at("column")] as number) + 1;
      this.#where.set(
        (locations[l + at("object_index")] as number) / this.#n,
        `${url}:${line}:${column}`
      );
    }
  }

  #nameOf(i: number): string {
    return (
      this.#raw.strings[this.#raw.nodes[i * this.#n + this.#nName] as number] ??
      ""
    );
  }

  #describe(i: number): string {
    const full = this.#nameOf(i);
    const type =
      this.#raw.snapshot.meta.node_types[0][
        this.#raw.nodes[i * this.#n + this.#nType] as number
      ];
    const name = full.slice(0, 80).replace(WHITESPACE, " ");
    const tag = PROBE_TAG.exec(full)?.[1];
    const at = this.#where.get(i);
    return `${type} ${name}${tag ? ` [${tag}]` : ""}${at ? ` @${at}` : ""}`;
  }

  /** The retainer of `node` nearest the root, and the edge it holds it by; null where none holds it. */
  #nearest(node: number): { edge: number; from: number } | null {
    let best: { edge: number; from: number } | null = null;
    for (
      let s = this.#inAt[node] as number;
      s < (this.#inAt[node + 1] as number);
      s += 1
    ) {
      const edge = this.#inEdge[s] as number;
      const from = this.#inFrom[s] as number;
      const d = this.#distance[from] as number;
      if (
        d !== -1 &&
        !this.#holdsNot(edge) &&
        (best === null || d < (this.#distance[best.from] as number))
      ) {
        best = { edge, from };
      }
    }
    return best;
  }

  #pathTo(at: number, depth: number): string[] {
    const steps = [this.#describe(at)];
    let node = at;
    for (let n = 0; n < depth && node !== 0; n += 1) {
      const holder = this.#nearest(node);
      if (!holder) {
        steps.unshift("(no strong retainer)");
        break;
      }
      steps.unshift(
        `${this.#describe(holder.from)} --${this.#edgeType(holder.edge)}:${this.#edgeName(holder.edge)}-->`
      );
      node = holder.from;
    }
    return steps;
  }

  heap(): Heap {
    const detachedness = this.#field("detachedness");
    const id = this.#field("id");
    const detached: Record<string, number> = {};
    const byName = new Map<string, number[]>();
    let heldForDriver = 0;
    for (let i = 0; detachedness !== -1 && i < this.#count; i += 1) {
      if (this.#raw.nodes[i * this.#n + detachedness] !== DETACHED) {
        continue;
      }
      if (this.#distance[i] === -1) {
        heldForDriver += 1;
        continue;
      }
      const name = this.#nameOf(i)
        .replace(DETACHED_PREFIX, "")
        .replace(OPENING_TAG, "$1");
      detached[name] = (detached[name] ?? 0) + 1;
      const list = byName.get(name) ?? [];
      list.push(i);
      byName.set(name, list);
    }
    return {
      detached,
      heldForDriver,
      detachedOf: (name) => byName.get(name) ?? [],
      idOf: (at) => this.#raw.nodes[at * this.#n + id] as number,
      pathTo: (at, depth = 40) => this.#pathTo(at, depth),
    };
  }
}
