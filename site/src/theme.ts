import { all, one } from './dom';
import { applyTheme, isTheme, THEME_KEY, type Theme } from './scheme';
import { initTabs, placeSlider } from './tabs';

/** The kept pick, or `system` where there is none or the browser keeps no storage here. */
function saved(): Theme {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return isTheme(value) ? value : 'system';
  } catch {
    return 'system';
  }
}

/** Keeps a pick; `system` forgets it. Where the browser keeps no storage, it lasts the visit. */
function keep(theme: Theme): void {
  try {
    if (theme === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Storage is refused here (a private window, or site data blocked): the pick holds for the visit.
  }
}

/**
 * The header's colour scheme switch: System, Light, Dark, as a radio group drawn as the page's
 * segmented tabs. The page already carries the kept pick from its head; this shows it and
 * applies a new one at once.
 */
export function initTheme(group: HTMLElement): void {
  const slider = one(group, '[data-slider]');
  const buttons = all(group, '[data-tab]');
  const place = (animate: boolean) => placeSlider(buttons, slider, 'aria-checked', animate);
  let chosen = saved();

  const radios = initTabs(
    group,
    (id) => {
      if (!isTheme(id) || id === chosen) return;
      chosen = id;
      keep(id);
      applyTheme(id);
      radios.mark(id);
      place(true);
    },
    'aria-checked',
  );

  // Without scripts the switch would do nothing, so it ships hidden.
  radios.mark(chosen);
  applyTheme(chosen);
  group.hidden = false;
  place(false);
  new ResizeObserver(() => place(false)).observe(group);
}
