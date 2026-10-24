/**
 * What the agent's updates to the canvas changed that the person hasn't
 * looked at (PRD §5.7, "Pointing and what changed"; core comments.ts
 * `ArtifactChanges`, kept under the canvas's scene version): the doc's
 * `meta.changes` less the person's looks in its `seen` map, read from the doc
 * this page holds, so every screen of the canvas marks the same.
 *
 * Each changed element wears the ring the pages wear (`--c-change-ring`,
 * `--c-change-ring-width` heavy, `--c-change-ring-offset` outside its box,
 * so it never covers its strokes or words) on a layer of its own over the
 * scene, in the scene's coordinates: it pans and zooms with the drawing,
 * takes no press, and fades off over `--dur-fade` once seen. An ellipse is
 * ringed as an ellipse, a diamond as a diamond, a rounded box at its own
 * radius grown by as much. A ring pings once as it lands and again when a
 * step reaches it: its halo, the same shape, grows `--c-change-ping-spread`
 * outward as it fades over `--dur-loop`, its line kept as heavy
 * (`vector-effect: non-scaling-stroke`); with less motion it stands still.
 *
 * The tag (the floating tag recipe, under the rail) reads "N changed since
 * you looked", then "k of N" while stepping, between ‹ (Previous change) and
 * › (Next change); a press on its words starts at the first stop, and J and
 * K step it while it holds the focus. Stops run in the scene's reading
 * order, top to bottom, then what was taken out. A step brings the element
 * into view and selects it (the canvas's chosen line), and marks it seen;
 * so does the person selecting a ringed element; so does a Send (the
 * hub's). The tag leaves once every stop is seen.
 */
import {
  type ArtifactChanges,
  type ChangedItem,
  seeChanges,
  seenOf,
} from "@cawco/core/comments";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Doc } from "yjs";
import { Icon } from "./icons";
import { tokenMs } from "./motion";

/** The doc's latest changes, and the anchors of them the person has looked at. */
interface Read {
  changes: ArtifactChanges | null;
  seen: Set<string>;
}

const readOf = (doc: Doc): Read => {
  const changes =
    (doc.getMap("meta").get("changes") as ArtifactChanges | undefined) ?? null;
  return {
    changes,
    seen: new Set(
      changes ? (seenOf(doc).get(String(changes.revision)) ?? []) : []
    ),
  };
};

/** One element's ring in the view's px: its element's box, and the shape it is drawn in. */
interface Ring {
  anchor: string;
  h: number;
  radius: number;
  shape: "box" | "ellipse" | "diamond";
  w: number;
  x: number;
  y: number;
}

/** Excalidraw's rounded box: a quarter of its short side, at most 32 (its adaptive radius). */
const ROUND_MOST = 32;
const ROUND_SHARE = 0.25;

/** An element's box in the scene: its own, or its points' for a line, an arrow or a stroke. */
const sceneBoxOf = (el: ExcalidrawElement) => {
  if ("points" in el && el.points.length > 0) {
    const xs = el.points.map(([px]) => px);
    const ys = el.points.map(([, py]) => py);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    return {
      x: el.x + left,
      y: el.y + top,
      w: Math.max(...xs) - left,
      h: Math.max(...ys) - top,
    };
  }
  return { x: el.x, y: el.y, w: el.width, h: el.height };
};

/** The rings of `anchors` as the view stands now, in its px. */
const ringsOf = (
  api: ExcalidrawImperativeAPI,
  anchors: readonly string[]
): Ring[] => {
  const state = api.getAppState();
  const zoom = state.zoom.value;
  const byId = new Map(
    api
      .getSceneElements()
      .filter((el) => !el.isDeleted)
      .map((el) => [el.id, el])
  );
  return anchors.flatMap((anchor): Ring[] => {
    const el = byId.get(anchor);
    if (!el) {
      return [];
    }
    const box = sceneBoxOf(el);
    let shape: Ring["shape"] = "box";
    if (el.type === "ellipse") {
      shape = "ellipse";
    } else if (el.type === "diamond") {
      shape = "diamond";
    }
    const radius = el.roundness
      ? Math.min(ROUND_MOST, ROUND_SHARE * Math.min(box.w, box.h))
      : 0;
    return [
      {
        anchor,
        shape,
        x: (box.x + state.scrollX) * zoom,
        y: (box.y + state.scrollY) * zoom,
        w: box.w * zoom,
        h: box.h * zoom,
        radius: radius * zoom,
      },
    ];
  });
};

/** How far a ring's line stands out from its element's box, to the line's middle, px: the offset and half the line (tokens read once per draw). */
const ringOut = (): number => {
  const root = getComputedStyle(document.documentElement);
  const offset =
    Number.parseFloat(root.getPropertyValue("--c-change-ring-offset")) || 3;
  const line =
    Number.parseFloat(root.getPropertyValue("--c-change-ring-width")) || 2;
  return offset + line / 2;
};

/** The ping's spread, px. */
const pingSpread = (): number =>
  Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue(
      "--c-change-ping-spread"
    )
  ) || 10;

/**
 * One ring, drawn in its element's shape `out` px outside it; fading off
 * once it leaves. `ping` draws its halo, which grows outward once as it
 * fades: one per ping, so a step that reaches it plays it again.
 */
function RingShape({
  ring,
  leaving,
  ping,
}: {
  leaving: boolean;
  ping?: number;
  ring: Ring;
}) {
  const out = ringOut();
  const box = {
    x: ring.x - out,
    y: ring.y - out,
    w: ring.w + 2 * out,
    h: ring.h + 2 * out,
  };
  const spread = pingSpread();
  const shape = (className: string, extra: Record<string, unknown>) => {
    const common = { className, ...extra };
    if (ring.shape === "ellipse") {
      return (
        <ellipse
          {...common}
          cx={box.x + box.w / 2}
          cy={box.y + box.h / 2}
          rx={box.w / 2}
          ry={box.h / 2}
        />
      );
    }
    if (ring.shape === "diamond") {
      const cx = box.x + box.w / 2;
      const cy = box.y + box.h / 2;
      return (
        <polygon
          {...common}
          points={`${cx},${box.y} ${box.x + box.w},${cy} ${cx},${box.y + box.h} ${box.x},${cy}`}
        />
      );
    }
    const radius = ring.radius > 0 ? ring.radius + out : 0;
    return (
      <rect
        {...common}
        height={box.h}
        rx={radius}
        ry={radius}
        width={box.w}
        x={box.x}
        y={box.y}
      />
    );
  };
  return (
    <>
      {ping !== undefined && !leaving ? (
        // One halo per ping: a new one plays its growth again.
        <g key={`ping:${ping}`}>
          {shape("canvas-change-ping", {
            "data-ping": "",
            style: {
              "--ping-x": String(1 + (2 * spread) / Math.max(1, box.w)),
              "--ping-y": String(1 + (2 * spread) / Math.max(1, box.h)),
            },
          })}
        </g>
      ) : null}
      {shape("canvas-change", {
        "data-change": leaving ? undefined : ring.anchor,
        "data-leaving": leaving ? "" : undefined,
      })}
    </>
  );
}

/** One stop of the tag: its anchor and its words. */
interface Stop {
  anchor: string;
  label: string;
}

/** The stops not looked at, in the scene's reading order (top to bottom, then left to right), then what was taken out. */
const stopsOf = (
  api: ExcalidrawImperativeAPI,
  unseen: readonly ChangedItem[]
): Stop[] => {
  const byId = new Map(api.getSceneElements().map((el) => [el.id, el]));
  const placed = unseen
    .filter((item) => item.kind === "canvas" && byId.has(item.anchor))
    .map((item) => ({
      item,
      box: sceneBoxOf(byId.get(item.anchor) as ExcalidrawElement),
    }))
    .sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x)
    .map(({ item }) => item);
  const rest = unseen.filter((item) => !placed.includes(item));
  return [...placed, ...rest].map((item) => ({
    anchor: item.anchor,
    label: item.label,
  }));
};

export function Changes({
  api,
  doc,
}: {
  api: ExcalidrawImperativeAPI;
  doc: Doc;
}) {
  const [read, setRead] = useState<Read>(() => readOf(doc));
  // The doc changes: the hub's next changes, the person's looks from any screen.
  useEffect(() => {
    const again = () => setRead(readOf(doc));
    again();
    doc.on("update", again);
    return () => doc.off("update", again);
  }, [doc]);
  // The view moves: the rings follow the scene's scroll and zoom.
  const [view, setView] = useState(0);
  useEffect(
    () =>
      api.onChange(() => {
        setView((n) => n + 1);
      }),
    [api]
  );
  const unseen = useMemo(
    () =>
      (read.changes?.items ?? []).filter((item) => !read.seen.has(item.anchor)),
    [read]
  );
  const anchors = useMemo(
    () =>
      unseen
        .filter((item) => item.kind === "canvas")
        .map((item) => item.anchor),
    [unseen]
  );
  // `view` is the scene's scroll, zoom and elements moving, which ringsOf reads from the API.
  const rings = useMemo(() => ringsOf(api, anchors), [api, anchors, view]);
  /**
   * Each ring's pings, by anchor: one as it first lands on this screen, one
   * more each time a step reaches it.
   */
  const [pings, setPings] = useState<ReadonlyMap<string, number>>(new Map());
  const landed = useRef(new Set<string>());
  useEffect(() => {
    const fresh = anchors.filter((anchor) => !landed.current.has(anchor));
    if (fresh.length === 0) {
      return;
    }
    for (const anchor of fresh) {
      landed.current.add(anchor);
    }
    setPings((was) => {
      const next = new Map(was);
      for (const anchor of fresh) {
        next.set(anchor, (next.get(anchor) ?? 0) + 1);
      }
      return next;
    });
  }, [anchors]);
  /**
   * Rings looked at, fading off over --dur-fade before they go: each one
   * the last rings held that these don't, kept until its fade has run
   * however often the view redraws meanwhile.
   */
  const [leaving, setLeaving] = useState<Ring[]>([]);
  const before = useRef<Ring[]>([]);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const now = new Set(rings.map((ring) => ring.anchor));
    const gone = before.current.filter((ring) => !now.has(ring.anchor));
    before.current = rings;
    if (gone.length === 0) {
      return;
    }
    const goneAnchors = new Set(gone.map((ring) => ring.anchor));
    setLeaving((was) => [
      ...was.filter((ring) => !goneAnchors.has(ring.anchor)),
      ...gone,
    ]);
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      setLeaving((was) => was.filter((ring) => !gone.includes(ring)));
    }, tokenMs("--dur-fade"));
    timers.current.add(timer);
  }, [rings]);
  useEffect(() => {
    const held = timers.current;
    return () => {
      for (const timer of held) {
        clearTimeout(timer);
      }
    };
  }, []);

  const stops = useMemo(() => stopsOf(api, unseen), [api, unseen]);
  /** The stops as they stood at the first step: "k of N" counts them while he steps. */
  const [tour, setTour] = useState<Stop[] | null>(null);
  const [at, setAt] = useState(0);
  useEffect(() => {
    if (stops.length === 0) {
      setTour(null);
    }
  }, [stops.length]);
  /** What the handlers read as it stands now, so each keeps one identity. */
  const latest = useRef({ at, key: read.changes?.revision, stops, tour });
  latest.current = { at, key: read.changes?.revision, stops, tour };

  const looked = useCallback(
    (seenAnchors: string[]) => {
      const { key } = latest.current;
      if (key !== undefined && seenAnchors.length > 0) {
        seeChanges(doc, key, seenAnchors);
      }
    },
    [doc]
  );

  // The person selecting a ringed element has looked at it.
  useEffect(
    () =>
      api.onChange((_elements, state) => {
        const chosen = Object.keys(state.selectedElementIds).filter(
          (id) => state.selectedElementIds[id] && anchors.includes(id)
        );
        if (chosen.length > 0) {
          looked(chosen);
        }
      }),
    [api, anchors, looked]
  );

  /** A step of the tag: by one stop each way, or the first when it starts; brought into view, selected and seen. */
  const step = useCallback(
    (by: 1 | -1 | 0) => {
      const { at: from, stops: live, tour: frozen } = latest.current;
      const list = frozen ?? live;
      if (list.length === 0) {
        return;
      }
      let next: number;
      if (frozen) {
        next = (from + by + list.length) % list.length;
      } else {
        setTour(list);
        next = by === -1 ? list.length - 1 : 0;
      }
      setAt(next);
      const stop = list[next];
      if (!stop) {
        return;
      }
      const el = api
        .getSceneElements()
        .find((one) => one.id === stop.anchor && !one.isDeleted);
      if (el) {
        api.scrollToContent(el, {
          animate: !matchMedia("(prefers-reduced-motion: reduce)").matches,
        });
        api.updateScene({
          appState: { selectedElementIds: { [el.id]: true } },
        });
        setPings((was) =>
          new Map(was).set(stop.anchor, (was.get(stop.anchor) ?? 0) + 1)
        );
      }
      looked([stop.anchor]);
    },
    [api, looked]
  );
  const back = useCallback(() => step(-1), [step]);
  const on = useCallback(() => step(1), [step]);
  const count = useCallback(() => step(latest.current.tour ? 0 : 1), [step]);
  /** J and K step it while it holds the focus. */
  const keys = useCallback(
    (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      if (key === "j" || key === "k") {
        event.preventDefault();
        event.stopPropagation();
        step(key === "j" ? 1 : -1);
      }
    },
    [step]
  );
  const total = tour?.length ?? stops.length;
  const said = tour
    ? `${at + 1} of ${total}`
    : `${total} changed since you looked`;

  return (
    <>
      <svg
        aria-hidden="true"
        className="canvas-changes"
        data-canvas-changes=""
        data-cawco-changes=""
      >
        {rings.map((ring) => (
          <RingShape
            key={ring.anchor}
            leaving={false}
            ping={pings.get(ring.anchor)}
            ring={ring}
          />
        ))}
        {leaving.map((ring) => (
          <RingShape key={`gone:${ring.anchor}`} leaving ring={ring} />
        ))}
      </svg>
      {stops.length > 0 ? (
        <fieldset
          aria-label={`${total} changed since you looked`}
          className="canvas-changes-tag"
          data-slot="changes-tag"
        >
          <button
            aria-label="Previous change"
            className="canvas-changes-step"
            data-slot="change-previous"
            onClick={back}
            onKeyDown={keys}
            title="Previous change"
            type="button"
          >
            <span className="canvas-changes-back">
              <Icon name="chevron" />
            </span>
          </button>
          <button
            className="canvas-changes-count"
            data-slot="change-count"
            onClick={count}
            onKeyDown={keys}
            type="button"
          >
            {said}
          </button>
          <button
            aria-label="Next change"
            className="canvas-changes-step"
            data-slot="change-next"
            onClick={on}
            onKeyDown={keys}
            title="Next change"
            type="button"
          >
            <span className="canvas-changes-on">
              <Icon name="chevron" />
            </span>
          </button>
        </fieldset>
      ) : null}
    </>
  );
}
