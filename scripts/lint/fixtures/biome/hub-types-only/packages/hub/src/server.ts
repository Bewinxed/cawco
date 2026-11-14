// Left alone: the hub's own modules take each other's code.
import { appName } from "./app";

export const createServer = (): string => appName;
