/**
 * What the states files of Caw's settings, his seat and the fleet's
 * triggers share: the panel's start, and the stores fed for each story.
 */
/** Every story's start for the panel: awake, the hub taking each change, what he started running. */
export const PANEL_ARGS = {
  on: true,
  answer: "accepts",
  running: true,
  hub: "connected",
  overridden: false,
  asked: null,
  changes: false,
  triggers: "read",
  refusedKind: null,
} as const;

/** Feeds the machines and the accounts through their stores' writers, the story's own. */
export async function seedStores(): Promise<void> {
  const { seedCawSettings } = await import("./caw-settings.fixtures.svelte");
  seedCawSettings();
}

/** The person's events, as the stage plays them in a story's `play`. */
interface PersonEvents {
  click: (element: Element) => Promise<void>;
  wait: (ms: number) => Promise<void>;
}

interface Play {
  userEvent: PersonEvents;
}

/** Longer than a popover's grow. */
const SETTLED_MS = 900;
const CANCEL = /^cancel$/iu;

/** Flips his switch off with what he started running: the confirm grows out of it. */
export async function askOff({ userEvent }: Play): Promise<void> {
  await userEvent.wait(SETTLED_MS);
  // His switch, in the hero's glass (CawLeadSwitch marks it).
  const flip = document.querySelector("[data-caw-lead-switch]");
  if (flip) {
    await userEvent.click(flip);
  }
  await userEvent.wait(SETTLED_MS);
}

/** Asks him off, then Cancel: the confirm shrinks back into the switch. */
export async function askOffThenCancel(play: Play): Promise<void> {
  await askOff(play);
  // The confirm stands in the page's floating layer, out of the frame.
  const cancel = [...document.querySelectorAll("[data-ns-pop] button")].find(
    (button) => CANCEL.test(button.textContent?.trim() ?? "")
  );
  if (cancel) {
    await play.userEvent.click(cancel);
  }
  await play.userEvent.wait(SETTLED_MS);
}
