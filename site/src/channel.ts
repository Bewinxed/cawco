import { all, one } from './dom';
import { initTabs } from './tabs';

/**
 * The install command is three parts: a head, the `sh` tail, and, for Nightly only, the piece
 * that sits before `sh`. Stable is the head and `sh`; Nightly adds `CAWCO_CHANNEL=nightly `.
 * The served HTML carries the stable line as plain text, so the page is right without scripts.
 */
const HEAD = 'curl -fsSL https://cawco.dev/install.sh |';
const CHAN = 'CAWCO_CHANNEL=nightly ';
const SH = 'sh';

const IN_MOVE = 220;
const IN_FADE = 200;
const OUT_FADE = 100;
const OUT_MOVE = 180;

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const span = (className: string, text: string) => {
  const node = document.createElement('span');
  node.className = className;
  node.textContent = text;
  return node;
};

/** One command box: its `sh`, its tail, and the motion running on them. */
interface Command {
  box: HTMLElement;
  tail: HTMLElement;
  sh: HTMLElement;
  chan: HTMLElement | null;
  /** The movement of `sh` and the box height. */
  moves: Animation[];
  /** The fade of the channel piece. */
  fade: Animation | null;
}

interface Snapshot {
  left: number;
  top: number;
  height: number;
}

const build = (code: HTMLElement): Command => {
  const box = code.closest<HTMLElement>('.cmd');
  if (!box) throw new Error('A command sits outside a command box.');
  const sh = span('cmd-sh', SH);
  const tail = document.createElement('span');
  tail.className = 'cmd-tail';
  tail.append(sh);
  code.replaceChildren(span('cmd-head', HEAD), ' ', tail);
  return { box, tail, sh, chan: null, moves: [], fade: null };
};

/** Where `sh` is on screen now (running transform included), and how tall the box is now. */
const snapshot = (cmd: Command): Snapshot => {
  const rect = cmd.sh.getBoundingClientRect();
  return { left: rect.left, top: rect.top, height: cmd.box.getBoundingClientRect().height };
};

const opacityOf = (node: HTMLElement) => Number(getComputedStyle(node).opacity);

const cancelAll = (cmd: Command) => {
  for (const move of cmd.moves) move.cancel();
  cmd.moves = [];
  cmd.fade?.cancel();
  cmd.fade = null;
};

/**
 * The layout now holds the new choice. Moves `sh` from where it was to where it is, and grows or
 * shrinks the box with it. A visitor who asked for reduced motion gets both at once.
 */
const settle = (cmd: Command, from: Snapshot, duration: number, easing: string) => {
  if (reduced()) return;
  const to = snapshot(cmd);
  const dx = from.left - to.left;
  const dy = from.top - to.top;
  if (dx !== 0 || dy !== 0) {
    cmd.moves.push(
      cmd.sh.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0px, 0px)' }],
        { duration, easing },
      ),
    );
  }
  if (from.height !== to.height) {
    cmd.moves.push(
      cmd.box.animate([{ height: `${from.height}px` }, { height: `${to.height}px` }], {
        duration,
        easing,
      }),
    );
  }
};

/**
 * The release channel switch: one choice for the whole page, shown in every command box.
 * Nightly: the piece arrives and `sh` makes room. Stable: the piece fades, then `sh` closes up.
 * A pick mid-motion starts from where everything is on screen, so nothing queues or jumps.
 */
export function initChannel(tablist: HTMLElement): void {
  const token = (name: string) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const easing = token('--ease-out');
  const travel = token('--ease-in-out');
  const commands = all(document, '[data-cmd]').map(build);
  const slider = one(tablist, '[data-slider]');
  const tabButtons = all(tablist, '[data-tab]');
  let chosen = 'stable';

  const toNightly = (cmd: Command) => {
    const start = cmd.chan ? opacityOf(cmd.chan) : 0;
    const from = snapshot(cmd);
    cancelAll(cmd);
    if (!cmd.chan) {
      cmd.chan = span('cmd-chan', CHAN);
      cmd.tail.insertBefore(cmd.chan, cmd.sh);
    }
    settle(cmd, from, IN_MOVE, travel);
    cmd.fade = cmd.chan.animate([{ opacity: start }, { opacity: 1 }], {
      duration: reduced() ? OUT_FADE : IN_FADE,
      easing,
    });
  };

  const toStable = (cmd: Command) => {
    const chan = cmd.chan;
    if (!chan) return;
    const start = opacityOf(chan);
    cmd.fade?.cancel();
    const out = chan.animate([{ opacity: start }, { opacity: 0 }], {
      duration: OUT_FADE,
      easing,
      fill: 'forwards',
    });
    cmd.fade = out;
    out.onfinish = () => {
      const from = snapshot(cmd);
      cancelAll(cmd);
      chan.remove();
      cmd.chan = null;
      settle(cmd, from, OUT_MOVE, travel);
    };
  };

  // One bar under the chosen tab. It moves by transform alone: a translate, and a scale where
  // the two tabs differ in width.
  const place = (animate: boolean) => {
    const selected = tabButtons.find((tab) => tab.getAttribute('aria-selected') === 'true');
    const first = tabButtons[0];
    if (!selected || !first) return;
    const inset = (tab: HTMLElement) => parseFloat(getComputedStyle(tab).paddingLeft);
    const base = first.offsetWidth - inset(first) * 2;
    if (base <= 0) return;
    const scale = (selected.offsetWidth - inset(selected) * 2) / base;
    if (!animate) slider.style.transition = 'none';
    slider.style.width = `${base}px`;
    slider.style.transform = `translateX(${selected.offsetLeft + inset(selected)}px) scaleX(${scale})`;
    if (!animate) {
      slider.getBoundingClientRect();
      slider.style.transition = '';
    }
  };

  const tabs = initTabs(tablist, (id) => {
    if ((id !== 'stable' && id !== 'nightly') || id === chosen) return;
    chosen = id;
    tabs.mark(id);
    place(true);
    for (const cmd of commands) (id === 'nightly' ? toNightly : toStable)(cmd);
  });

  // Without scripts the tabs would do nothing, so they ship hidden.
  tabs.mark(chosen);
  tablist.hidden = false;
  place(false);
  new ResizeObserver(() => place(false)).observe(tablist);
}
