/**
 * A harness entry's page (design-explore skill): the kit's switcher and rail
 * (kit/switcher.js), the entry's component on the stage, and DialKit's
 * Svelte adapter docked in the rail, its values kept in the hub by the
 * decision page's bridge (kit/dials.js, `cawcoKeepDials`).
 *
 *   preview({ title, width, variants, states, dials, timelines }, Entry);
 *
 * `Entry` takes `place`, `{ variant, state }`, reactive: it renders the
 * place's variant in the place's state, and makes its dial panels and
 * timeline clips with `createDialKit` and `createDialTimeline` from
 * `dialkit/svelte`.
 */
import "./guard";
import "../src/app.css";
// DialKit's sheet comes with its root, which injects it (DialRoot.svelte).
import "../../../packages/hub/skills/design-explore/kit/switcher.css";
import "../../../packages/hub/skills/design-explore/kit/switcher.js";
import "../../../packages/hub/skills/decision-page/kit/dials.js";
import { DialStore } from "dialkit/store";
import { DialRoot, DialTimeline } from "dialkit/svelte";
import { type Component, mount } from "svelte";

export interface Place {
  state?: string;
  variant?: string;
}

interface Entry {
  id: string;
  label: string;
}

interface Group {
  entries: Entry[];
  heading: string;
}

export interface PreviewConfig {
  /** Dial panel names the entry creates, for the check. */
  dials?: string[];
  states?: Group[];
  /** Timeline names the entry creates, for the check. */
  timelines?: string[];
  /** What is being judged, in one line. */
  title: string;
  variants?: Group[];
  /** The component's production width in px, or "fill". */
  width: number | "fill";
}

interface Shell {
  dials: HTMLElement;
  frame: HTMLElement;
  timeline: HTMLElement;
}

declare global {
  interface Window {
    cawcoKeepDials: (store: typeof DialStore) => void;
    cawcoPreview: (
      config: PreviewConfig & {
        render: (place: Place, frame: HTMLElement) => void;
      }
    ) => Shell;
  }
}

/**
 * DialKit 2.0.2's Svelte timeline portals its dock to <body> and takes no
 * target (its vanilla root takes `target`). The portal is a wrapper it
 * appends once, so the wrapper is moved into the rail as it appears.
 */
function dockTimeline(rail: HTMLElement): void {
  const move = () => {
    for (const dock of document.body.querySelectorAll(
      ":scope > div > .dialkit-timeline"
    )) {
      rail.append(dock.parentElement as HTMLElement);
    }
  };
  new MutationObserver(move).observe(document.body, { childList: true });
  move();
}

export function preview(
  config: PreviewConfig,
  Entry: Component<{ place: Place }>
): void {
  // The app's theme, as its layout sets it: the OS's.
  const dark = matchMedia("(prefers-color-scheme: dark)");
  const themed = () =>
    document.documentElement.classList.toggle("dark", dark.matches);
  themed();
  dark.addEventListener("change", themed);

  const place = $state<Place>({});
  const shell = window.cawcoPreview({
    ...config,
    render: (next) => {
      place.variant = next.variant;
      place.state = next.state;
    },
  });
  mount(Entry, { target: shell.frame, props: { place } });
  if (config.dials?.length || config.timelines?.length) {
    mount(DialRoot, {
      target: shell.dials,
      props: { mode: "inline", theme: "dark", productionEnabled: true },
    });
    window.cawcoKeepDials(DialStore);
  }
  if (config.timelines?.length) {
    dockTimeline(shell.timeline);
    mount(DialTimeline, {
      target: shell.timeline,
      props: { theme: "dark", productionEnabled: true },
    });
  }
}
