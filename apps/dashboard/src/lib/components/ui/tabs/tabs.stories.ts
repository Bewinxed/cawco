/**
 * The kit's segmented tabs (Component Story Format 3, live components):
 * bits-ui Tabs on the shared segment (ui/segmented) in a frame of their own
 * (tabs-frame), the lens over the chosen tab, so its corners are read
 * against the track's and a pick, a press and a drag are tried in place.
 * The meta's args are every story's; a story's own args are what it
 * changes.
 */
import TabsFrame from "./tabs-frame.svelte";

export default {
  title: "Kit/Tabs",
  component: TabsFrame,
  args: {
    label: "Spend by",
    segments: ["Day", "Week", "Month"],
    chosen: "Day",
  },
};

/** Three tabs of one width across a fixed row, Files chosen. */
const EVEN = {
  label: "Change",
  segments: ["Diff", "Files", "Log"],
  chosen: "Files",
  fill: true,
};

/** Day chosen, the first of the three. */
export const First = {};

/** Month chosen, the last of the three. */
export const Last = { args: { chosen: "Month" } };

/** Week chosen, each tab with a tooltip naming it. */
export const Tipped = { args: { chosen: "Week", tips: true } };

/** The track across its row, its three tabs one width each, Files chosen. */
export const Even = { args: EVEN };

interface Play {
  canvas: {
    getByText: (text: string) => HTMLElement;
  };
  userEvent: {
    click: (element: Element) => Promise<void>;
    wait: (ms: number) => Promise<void>;
  };
}

/** Longer than the lens's glide or swell takes to settle. */
const SETTLED_MS = 500;
/** The pointer's steps along a drag, as a hand moves it. */
const DRAG_STEPS = 8;

/** The pointer at a tab's centre, as the mouse sends it. */
const pointer = (type: string, at: Element, x: number) => {
  const box = at.getBoundingClientRect();
  at.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      button: 0,
      buttons: type === "pointerup" ? 0 : 1,
      clientX: x,
      clientY: box.top + box.height / 2,
      isPrimary: true,
      pointerId: 1,
      pointerType: "mouse",
    })
  );
};

/** A tab's centre on the screen, across. */
const centreOf = (tab: Element) => {
  const box = tab.getBoundingClientRect();
  return box.left + box.width / 2;
};

/** Log tapped: the lens glides to it from Files. */
export const PickedLog = {
  args: EVEN,
  from: "Even",
  play: async ({ canvas, userEvent }: Play) => {
    await userEvent.click(canvas.getByText("Log"));
    await userEvent.wait(SETTLED_MS);
  },
};

/** Files held down: the lens swells a little past the track. */
export const Held = {
  args: EVEN,
  from: "Even",
  play: async ({ canvas, userEvent }: Play) => {
    const files = canvas.getByText("Files");
    pointer("pointerdown", files, centreOf(files));
    await userEvent.wait(SETTLED_MS);
  },
};

/** The lens dragged from Files to Diff and let go there: Diff is chosen. */
export const DraggedToDiff = {
  args: EVEN,
  from: "Even",
  play: async ({ canvas, userEvent }: Play) => {
    const files = canvas.getByText("Files");
    const start = centreOf(files);
    const end = centreOf(canvas.getByText("Diff"));
    pointer("pointerdown", files, start);
    for (let step = 1; step <= DRAG_STEPS; step += 1) {
      await userEvent.wait(16);
      pointer(
        "pointermove",
        files,
        start + ((end - start) * step) / DRAG_STEPS
      );
    }
    pointer("pointerup", files, end);
    await userEvent.wait(SETTLED_MS);
  },
};
