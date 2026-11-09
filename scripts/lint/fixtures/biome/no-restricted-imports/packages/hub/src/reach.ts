// @ts-nocheck: these name modules that are not there.
// A member reaches another through its manifest, never by a path into it.
import "../../../packages/core/src/time";
import "@cawco/core/src/time";
import "../../../apps/dashboard/other.js";
// The manifest's own door, and the CLI's named exception, stand.
import "@cawco/core/time";
import "../../../apps/dashboard/serve.js";
