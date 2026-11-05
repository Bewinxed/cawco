/**
 * Full size: a project's tab filling the window, the rail and the tab strip
 * put away (the owner's pick on the project-tabs page, 2026-11-05). The
 * project's head says it and takes it back (ProjectHead), Escape takes it
 * back from anywhere it is not already the field's or an open layer's, and
 * it ends by itself once no project is in front (Shell). It is how this
 * window is shown, not the project's: never stored.
 */

let on = $state(false);

export const fullSize = {
  /** Whether the project in front fills the window. */
  get on(): boolean {
    return on;
  },
  toggle(): void {
    on = !on;
  },
  exit(): void {
    on = false;
  },
};
