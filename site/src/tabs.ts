import { all } from './dom';

export interface Tabs {
  /** Marks one tab as the chosen one: `aria-selected`, and the roving tab stop. */
  mark(id: string): void;
}

/**
 * The page's tab behaviour, for any `[role="tablist"]` of `[data-tab]` buttons: a click or an arrow key
 * picks a tab and says so through `onPick`. `fromKey` is true for a key press, which lands at
 * once and keeps focus on the tab it moved to. Choosing which panel or command follows the
 * choice is the caller's job; this only keeps the tabs themselves right.
 */
export function initTabs(
  tablist: HTMLElement,
  onPick: (id: string, fromKey: boolean) => void,
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
    const here = tabs.findIndex((tab) => tab.getAttribute('aria-selected') === 'true');
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
        tab.setAttribute('aria-selected', String(on));
        tab.tabIndex = on ? 0 : -1;
      }
    },
  };
}
