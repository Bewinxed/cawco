// @ts-nocheck: these name modules that are not there.
// A member reaches another through its manifest, never by a path into it.
import "../../../packages/core/src/time";
import "@cawco/core/src/time";
import "../../../apps/dashboard/other.js";
import "../../../agent/src/proc-id";
import "../../core/scripts/openui-views";
// The manifest's own door, and the CLI's named exception, stand.
import "@cawco/core/time";
import "../../../apps/dashboard/serve.js";
// Its own modules that share a member's name stand.
import "./auth";
import "../sessiond";
import "./core/rows";
