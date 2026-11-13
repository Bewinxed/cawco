import type { PageSays } from "@cawco/core/page-wire";
import { toHost } from "@cawco/preview/overlay/host-origin";

/** Says `message` to the dashboard that holds the page, once its hello has come (core page-wire `PageSays`). */
export const sayToHost = (message: PageSays): void => toHost(message);
