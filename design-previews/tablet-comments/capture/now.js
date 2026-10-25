/**
 * The capture's "now": the moment the pins were read from the hub
 * (pins.json `now`), so every age the parts draw (a row's, a thread's
 * entries') is told against one fixed clock and never goes stale. Imported
 * first by stage.js, before any component reads the time.
 */
import EXPORT from "../pins.json";

const NOW = Date.parse(EXPORT.now);
Date.now = () => NOW;
