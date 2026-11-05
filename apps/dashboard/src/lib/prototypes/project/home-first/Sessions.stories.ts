/**
 * Sessions, reached from Home's Working now (Option 2): Cawco's own
 * sessions, Caw's conversations, attempts and those spun off by hand, and
 * Spin off a session's form beside them.
 */
import { PROJECT, SESSIONS } from "./fixture";
import { LOADING, moveTo, STALE } from "./play";
import SessionsScreen from "./SessionsScreen.svelte";

const desk = { viewport: 1440 };
const phone = { viewport: 390 };

export default {
  title: "Home first/Sessions",
  component: SessionsScreen,
  args: { project: PROJECT, sessions: SESSIONS, read: "live" },
};

/** The project's sessions, in three groups. */
export const Sessions = { parameters: desk };

/** On a phone. */
export const SessionsPhone = { name: "Sessions on a phone", parameters: phone };

/** Spin off a session: machine and checkout, harness, type, and what comes along. */
export const SpinOff = {
  name: "Spin off a session",
  args: { spinning: true },
  parameters: desk,
  from: "Sessions",
  play: moveTo({ spinning: true }),
};

/** Spin off a session on a phone, as a drawer. */
export const SpinOffPhone = {
  name: "Spin off on a phone",
  args: { spinning: true },
  parameters: phone,
};

/** No session runs: each group named, saying so. */
export const NoSessions = {
  name: "No session",
  args: { sessions: [] },
  parameters: desk,
};

/** The first read. */
export const Loading = { args: LOADING, parameters: desk };

/** The hub unreachable. */
export const Stale = {
  name: "Hub unreachable",
  args: STALE,
  parameters: desk,
};
