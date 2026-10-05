import { all } from './dom';
import { initTabs } from './tabs';

/** The install command for each release channel. The served HTML carries the stable one. */
const COMMANDS: Record<string, string> = {
  stable: 'curl -fsSL https://cawco.dev/install.sh | sh',
  nightly: 'curl -fsSL https://cawco.dev/install.sh | CAWCO_CHANNEL=nightly sh',
};

const FADE_OUT = 160;
const FADE_IN = 200;
const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';

/**
 * The release channel switch: one choice for the whole page, shown in every command box.
 * A command swaps by fading out and back in. A second pick mid-swap retargets from the
 * opacity the text has reached, so nothing queues.
 */
export function initChannel(tablist: HTMLElement): void {
  const codes = all(document, '[data-cmd]');
  const runs = new Map<HTMLElement, Animation>();
  const heights = new Map<HTMLElement, Animation>();
  let chosen = 'stable';

  const fade = (code: HTMLElement, from: number, to: number, duration: number) => {
    const run = code.animate([{ opacity: from }, { opacity: to }], { duration, easing: EASE_OUT });
    runs.set(code, run);
    return run;
  };

  // Where a narrow screen wraps the command, the new text can need a different height:
  // the box grows or shrinks to it over the fade-in instead of jumping.
  const resize = (code: HTMLElement, change: () => void) => {
    const box = code.closest<HTMLElement>('.cmd');
    if (!box) throw new Error('A command sits outside a command box.');
    const from = box.getBoundingClientRect().height;
    heights.get(box)?.cancel();
    change();
    const to = box.getBoundingClientRect().height;
    if (from === to) return;
    heights.set(
      box,
      box.animate([{ height: `${from}px` }, { height: `${to}px` }], {
        duration: FADE_IN,
        easing: EASE_OUT,
      }),
    );
  };

  const swap = (code: HTMLElement, text: string) => {
    const from = Number(getComputedStyle(code).opacity);
    runs.get(code)?.cancel();
    if (code.textContent === text) {
      // The old text is still on screen (a swap was cut short): bring it back.
      fade(code, from, 1, FADE_IN);
      return;
    }
    code.style.opacity = '0';
    const out = fade(code, from, 0, FADE_OUT * from);
    out.onfinish = () => {
      resize(code, () => {
        code.textContent = text;
      });
      code.style.opacity = '';
      fade(code, 0, 1, FADE_IN);
    };
  };

  // The chosen tab's bar is full, the other is empty, the way the stage tabs' bars fill.
  const showBars = () => {
    for (const bar of all(tablist, '[data-bar]')) {
      const on = bar.closest('[data-tab]')?.getAttribute('aria-selected') === 'true';
      bar.style.transform = `scaleX(${on ? 1 : 0})`;
    }
  };

  const tabs = initTabs(tablist, (id) => {
    const text = COMMANDS[id];
    if (text === undefined || id === chosen) return;
    chosen = id;
    tabs.mark(id);
    showBars();
    for (const code of codes) swap(code, text);
  });

  // Without scripts the tabs would do nothing, so they ship hidden.
  tabs.mark(chosen);
  showBars();
  tablist.hidden = false;
}
