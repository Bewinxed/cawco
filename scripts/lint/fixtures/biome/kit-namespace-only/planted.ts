// Planted: a namespace import of a module that is no kit group; then a kit
// group's, which passes.
import * as Thing from "./thing.js";
import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";

export const used = [Thing, DropdownMenu];
