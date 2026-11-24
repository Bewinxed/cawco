/**
 * The project's Settings view in each situation the person meets, read
 * one story each: every stop of the live story's dials
 * (SettingsView.stories.ts), mounted in the same shell and fed the same
 * records (settings.fixtures.ts).
 */

import SettingsLive from "./settings-live.svelte";
import { shellFrame } from "./shell-seed";

export default {
  ...shellFrame,
  title: "Project settings, every situation",
  component: SettingsLive,
  args: { situation: "At rest" },
};

/** A folder on kestrel has gone missing and GitHub refused the last sync. */
export const TwoStagesInTrouble = {
  args: { situation: "Two stages in trouble" },
};

/** Tasks mirror to GitHub Issues and the two sides agree as of four minutes ago. */
export const TiedToGitHub = { args: { situation: "Tied to GitHub, in step" } };

/** The account named for the project is signed in nowhere, so nothing can start. */
export const AccountSignedOut = {
  args: { situation: "Named account signed out" },
};

/** The project's own rule file did not read, so every choice comes to me. */
export const RulesUnreadable = {
  args: { situation: "Who decides unreadable" },
};

/** The hub is out of reach: what I see was read 26 minutes ago and nothing can be sent. */
export const HubOutOfReach = { args: { situation: "Hub out of reach" } };

/** A writing project with no code: it ends at what waits for me. */
export const NoCode = { args: { situation: "A project with no code" } };

/** Places and the account are still being read. */
export const StillReading = {
  args: { reading: "Places and account still reading" },
};

/** Where tasks are kept could not be read; Try again stands in its place. */
export const TasksFailedToRead = { args: { reading: "Tasks failed to read" } };

/** The server refuses every change I make: each pick moves, then comes back with why. */
export const ServerRefuses = { args: { answer: "refuses it" } };
