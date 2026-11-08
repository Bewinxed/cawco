/** The sentences a permission card shows. */

import type { PermissionPresentation } from "../permission-presentation";

/** Who asks and where, as an ask's head names them: "Caw · cockpit". */
export const askerLine = (presentation: PermissionPresentation): string =>
  presentation.project
    ? `${presentation.asker} · ${presentation.project}`
    : presentation.asker;
