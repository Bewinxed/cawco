// Planted: a namespace import of a module that is no kit group; then a kit
// group's index, imported as a group imports its own (`./index.js`), which
// passes.
import * as Group from "./index.js";
import * as Thing from "./thing.ts";

export const used = [Thing, Group];
