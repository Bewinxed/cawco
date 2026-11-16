// Planted: a sibling module.
import { quote } from "./shell";

// Left alone: Node's built-in.
import process from "node:process";

export const used = [quote, process];
export const LOG_FRAME = "frame";
