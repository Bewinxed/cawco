import { all } from './dom';

export interface Tabs {
  /** Marks one tab as the chosen one: its choice attribute, and the roving tab stop. */
  mark(id: string): void;
}

/**
 * How a group says which of its buttons is chosen: a `tablist` of tabs by `aria-selected`, a
 * `radiogroup` of radios by `aria-checked`.
 */
export type Choice = 'aria-selected' | 'aria-checked';

/**
 * The page's tab behaviour, for any `[role="tablist"]` or `[role="radiogroup"]` of `[data-tab]`
 * buttons: a click or an arrow key picks a tab and says so through `onPick`. `fromKey` is true
 * for a key press, which lands at once and keeps focus on the tab it moved to. Choosing which
 * panel or command follows the choice is the caller's job; this only keeps the tabs themselves
 * right.
 */
export function initTabs(
  tablist: HTMLElement,
  onPick: (id: string, fromKey: boolean) => void,
  choice: Choice = 'aria-selected',
): Tabs {
  const tabs = all<HTMLButtonElement>(tablist, '[data-tab]');
  const ids = tabs.map((tab) => tab.dataset.tab ?? '');

  tablist.addEventListener('click', (event) => {
    const tab = (event.target as Element).closest<HTMLElement>('[data-tab]');
    if (!tab?.dataset.tab) return;
    onPick(tab.dataset.tab, false);
  });

  // Arrow keys move between tabs, as a tablist should. No transition: a key press lands at once.
  tablist.addEventListener('keydown', (event) => {
    const last = ids.length - 1;
    const here = tabs.findIndex((tab) => tab.getAttribute(choice) === 'true');
    const steps: Record<string, number> = {
      ArrowRight: here + 1,
      ArrowDown: here + 1,
      ArrowLeft: here - 1,
      ArrowUp: here - 1,
      Home: 0,
      End: last,
    };
    const wanted = steps[event.key];
    if (wanted === undefined) return;
    event.preventDefault();
    const index = (wanted + ids.length) % ids.length;
    const id = ids[index];
    if (!id) return;
    onPick(id, true);
    tabs[index]?.focus();
  });

  return {
    mark(id) {
      for (const tab of tabs) {
        const on = tab.dataset.tab === id;
        tab.setAttribute(choice, String(on));
        tab.tabIndex = on ? 0 : -1;
      }
    },
  };
}

/**
 * Puts a segmented group's one bar under its chosen tab. It moves by transform alone: a
 * translate, and a scale where the tabs differ in width. `animate` false lands it at once.
 */
export function placeSlider(
  tabs: HTMLElement[],
  slider: HTMLElement,
  choice: Choice,
  animate: boolean,
): void {
  const selected = tabs.find((tab) => tab.getAttribute(choice) === 'true');
  const first = tabs[0];
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
}
