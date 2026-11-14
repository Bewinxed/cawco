import type { Machine } from "./stores/board.svelte";
import type * as Board from "../cawco/stores/board.svelte";
import { holdMachines } from "./stores/board.svelte";
import * as board from "../cawco/stores/board.svelte";
import {
  type Machine as Row,
  holdMachines as hold,
} from "../cawco/stores/board.svelte";
import "./stores/board.svelte";

export const Shared = {
  beforeEach() {
    holdMachines([]);
    board.holdMachines([]);
    hold([] as Row[]);
  },
};

export const Own = {
  async beforeEach() {
    const own: typeof Board = await import("./stores/board.svelte");
    own.holdMachines([] as Machine[]);
  },
};
