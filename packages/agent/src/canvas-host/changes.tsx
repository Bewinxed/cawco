/**
 * What changed on the canvas since the person looked (Projects spec §5.7,
 * "Pointing and what changed"; core changes.ts), drawn over Excalidraw's
 * scene. The overlay reads the doc's `meta.changes` and the person's looks
 * and says which elements stand unseen, and which one a step of the panel's
 * tag chose (`cawco:canvas-changes`, preview-overlay changes.ts); this draws
 * the done wash over each (`change-wash`, translucent, with no edge, at the
 * house's small radius), the chosen one with the One Target Rule's 1px
 * line, following the scene's scroll and zoom. A step scrolls its element
 * into view (`cawco:canvas-step`); a wash looked at fades off over
 * `--dur-fade`. Selecting a changed element is the person's look at it
 * (`cawco:canvas-looked`).
 */
import type {
  ExcalidrawElement,
  NonDeletedExcalidrawElement,
} from "@excalidraw/excalidraw/element/types";
import type {
  AppState,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";
import { useEffect, useState } from "react";
import { tokenMs } from "./motion";

/** What the overlay says stands unseen on the canvas, and the stepped one. */
interface Said {
  chosen: string | null;
  ids: string[];
}

/** A wash's box over the scene, in the host's px. */
interface Box {
  h: number;
  w: number;
  x: number;
  y: number;
}

/** Element `el`'s box in the view: its scene box through the scroll and zoom. */
const boxOf = (el: ExcalidrawElement, state: AppState): Box => {
  const zoom = state.zoom.value;
  const left = Math.min(el.x, el.x + el.width);
  const top = Math.min(el.y, el.y + el.height);
  return {
    x: (left + state.scrollX) * zoom,
    y: (top + state.scrollY) * zoom,
    w: Math.abs(el.width) * zoom,
    h: Math.abs(el.height) * zoom,
  };
};

const saidOf = (event: Event): Said => {
  const { detail } = event as CustomEvent<Partial<Said> | null>;
  return {
    ids: Array.isArray(detail?.ids)
      ? detail.ids.filter((id): id is string => typeof id === "string")
      : [],
    chosen: typeof detail?.chosen === "string" ? detail.chosen : null,
  };
};

export function ChangeMarks({
  api,
  reduced,
}: {
  api: ExcalidrawImperativeAPI;
  reduced: () => boolean;
}) {
  const [said, setSaid] = useState<Said>({ ids: [], chosen: null });
  /** Washes looked at, fading off: by id, until `--dur-fade` has run. */
  const [leaving, setLeaving] = useState<string[]>([]);
  const [boxes, setBoxes] = useState<Record<string, Box>>({});

  useEffect(() => {
    let shown: string[] = [];
    const heard = (event: Event) => {
      const next = saidOf(event);
      const gone = shown.filter((id) => !next.ids.includes(id));
      shown = next.ids;
      setSaid(next);
      if (gone.length > 0) {
        setLeaving((was) => [...was, ...gone]);
        setTimeout(
          () => setLeaving((was) => was.filter((id) => !gone.includes(id))),
          tokenMs("--dur-fade")
        );
      }
    };
    const stepped = (event: Event) => {
      const { chosen } = saidOf(event);
      const el = api
        .getSceneElements()
        .find((one: NonDeletedExcalidrawElement) => one.id === chosen);
      if (el) {
        api.scrollToContent(el, { animate: !reduced() });
      }
    };
    addEventListener("cawco:canvas-changes", heard);
    addEventListener("cawco:canvas-step", stepped);
    // Mounted after the overlay's last word: it says the set again.
    dispatchEvent(new CustomEvent("cawco:canvas-ask"));
    return () => {
      removeEventListener("cawco:canvas-changes", heard);
      removeEventListener("cawco:canvas-step", stepped);
    };
  }, [api, reduced]);

  // The washes and the chosen line follow the scene: each element's box again on every change of it or of the view.
  const drawn = [...new Set([...said.ids, ...leaving])];
  const watching = [...drawn, said.chosen ?? ""].join(" ");
  useEffect(() => {
    const ids = new Set(watching.split(" ").filter(Boolean));
    if (ids.size === 0) {
      setBoxes({});
      return;
    }
    const place = (elements: readonly ExcalidrawElement[], state: AppState) => {
      setBoxes(
        Object.fromEntries(
          elements
            .filter((el) => ids.has(el.id) && !el.isDeleted)
            .map((el) => [el.id, boxOf(el, state)])
        )
      );
      const looked = Object.keys(state.selectedElementIds).filter((id) =>
        ids.has(id)
      );
      if (looked.length > 0) {
        dispatchEvent(
          new CustomEvent("cawco:canvas-looked", { detail: { ids: looked } })
        );
      }
    };
    place(api.getSceneElements(), api.getAppState());
    return api.onChange(place);
  }, [api, watching]);

  const chosen = said.chosen ? boxes[said.chosen] : undefined;
  return (
    <div aria-hidden="true" className="canvas-changes">
      {drawn.map((id) => {
        const box = boxes[id];
        return box ? (
          <div
            className="canvas-change"
            data-change={id}
            data-leaving={said.ids.includes(id) ? undefined : ""}
            key={id}
            style={placed(box)}
          />
        ) : null;
      })}
      {chosen ? (
        <div
          className="canvas-chosen"
          data-chosen={said.chosen ?? ""}
          style={placed(chosen)}
        />
      ) : null}
    </div>
  );
}

/** A box laid where it stands in the host. */
const placed = (box: Box) => ({
  left: `${box.x}px`,
  top: `${box.y}px`,
  width: `${box.w}px`,
  height: `${box.h}px`,
});
