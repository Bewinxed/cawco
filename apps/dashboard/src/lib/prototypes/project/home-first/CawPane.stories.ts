/**
 * Caw's pane (Option 2), opened from his line on Home or Ask Caw in the bar:
 * docked beside the page at 1440, over it at 900, a drawer on a phone. His
 * newest conversation, a new one with the project's starters, his first
 * read, Caw off, and his machine unreachable.
 */
import { BUSY } from "./fixture";
import HomeScreen from "./HomeScreen.svelte";

const desk = { viewport: 1440 };
const phone = { viewport: 390 };

export default {
  title: "Home first/Caw pane",
  component: HomeScreen,
  args: { briefing: BUSY, open: "caw", cawState: "conversation" },
};

/** His newest conversation, the posts he filed named in it. */
export const Conversation = { parameters: desk };

/** On a phone, as a drawer. */
export const ConversationPhone = {
  name: "Conversation on a phone",
  parameters: phone,
};

/** A new conversation: what he knows, and the starters that fill the composer. */
export const Fresh = {
  name: "New conversation",
  args: { cawState: "fresh" },
  parameters: desk,
};

/** A new conversation on a phone. */
export const FreshPhone = {
  name: "New conversation on a phone",
  args: { cawState: "fresh" },
  parameters: phone,
};

/** His last turns being read. */
export const Loading = { args: { cawState: "loading" }, parameters: desk };

/** Caw is off: what is sent waits, Turn on. */
export const Off = {
  name: "Caw off",
  args: { cawState: "off" },
  parameters: desk,
};

/** His machine isn't answering: the words stay. */
export const Unreachable = {
  args: { cawState: "unreachable" },
  parameters: desk,
};

/** Unreachable on a phone. */
export const UnreachablePhone = {
  name: "Unreachable on a phone",
  args: { cawState: "unreachable" },
  parameters: phone,
};
