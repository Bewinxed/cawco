/**
 * Three directions of one design for the design graph's bench
 * (DirectionsBench.svelte): the address tray as its design run left it
 * (design 6ddc57c4), the Family tray, the status card and the ticking
 * stations, each its own states file, each with the same five states of
 * the set-up, as the stage would say their sheets. The agent's one line on
 * each is its states file's own.
 */
import type {
  CanvasDial,
  CanvasDirection,
  SheetOnPage,
} from "@cawco/core/stage";
import type { Direction } from "../../address/preview/TrayView.svelte";
import type { ViewId } from "../../address/tray.svelte";

const ROOT = "src/lib/cawco/address";

/** Each direction as the canvas spec names it, and the tray it draws. */
export const TRAY_DIRECTIONS: (CanvasDirection & { tray: Direction })[] = [
  {
    file: `${ROOT}/FamilyTray.stories.ts`,
    name: "Family tray",
    line: "One thing per tray, replaced in place, Caw peeking over its top edge.",
    tray: "family",
  },
  {
    file: `${ROOT}/CardTray.stories.ts`,
    name: "Status card",
    line: "The pairing card: only its words, its slot and its button change.",
    tray: "card",
  },
  {
    file: `${ROOT}/StationsTray.stories.ts`,
    name: "Ticking stations",
    line: "Five rows, the live one open, Caw in the title's slot.",
    tray: "stations",
  },
];

/** The network the tray sets up on: a value, so a dial on every direction, never a direction of its own. */
export const TRAY_DIALS: CanvasDial[] = [
  {
    kind: "select",
    name: "network",
    label: "Network",
    options: ["tailscale", "headscale", "netbird"],
    target: { arg: "network" },
  },
];

/** The set-up's states every direction draws, by story, with the view it jumps to and its note. */
export const TRAY_STATES: {
  name: string;
  display: string;
  view: ViewId;
  note: string;
  failure?: true;
}[] = [
  {
    name: "FoundIt",
    display: "Found it",
    view: "found",
    note: "The network found on this machine: Join is the first thing to press.",
  },
  {
    name: "SigningIn",
    display: "Signing in",
    view: "signin",
    note: "Join pressed: the network's sign-in is open in another tab.",
  },
  {
    name: "Checking",
    display: "Checking the address",
    view: "checking",
    note: "Signed in: the hub checks heron-pike.ts.net answers from outside.",
  },
  {
    name: "Live",
    display: "Live",
    view: "live",
    note: "The address answers: the phone can open it.",
  },
  {
    name: "Failed",
    display: "Sign-in link expired",
    view: "failed",
    note: "The sign-in link went stale before it was used.",
    failure: true,
  },
];

/** Each direction's sheet, as the stage says it once its section loaded. */
export const traySheet = (
  direction: (typeof TRAY_DIRECTIONS)[number]
): SheetOnPage => ({
  file: direction.file,
  components: [],
  meta: {
    args: { direction: direction.tray },
    code: {},
    component: null,
    title: `Address tray/${direction.name}`,
  },
  stories: TRAY_STATES.map((state, at) => ({
    name: state.name,
    display: state.display,
    label: state.note,
    line: 20 + at * 6,
    column: 0,
    args: { view: state.view },
    code: {},
    component: null,
    form: null,
    formUnread: null,
    from: null,
    play: false,
    readOnly: null,
    records: null,
    tags: state.failure ? ["failure"] : [],
  })),
});
