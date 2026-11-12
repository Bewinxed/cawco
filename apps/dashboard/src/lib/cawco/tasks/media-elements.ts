/**
 * The Video.js 10 elements MediaPlayer is built from (`@videojs/html`, the
 * maintained successor of Media Chrome and Vidstack, its Svelte guide's
 * way: the element imports static, so each control is defined before
 * Svelte sets its props). Each import registers one custom element; none
 * draws anything of its own: MediaPlayer gives each its look from the
 * tokens. Defining is safe on the server (each guards `customElements`).
 */
import "@videojs/html/audio/player";
import "@videojs/html/video/player";
import "@videojs/html/ui/container";
import "@videojs/html/ui/controls";
import "@videojs/html/ui/controls-content";
import "@videojs/html/ui/gesture";
import "@videojs/html/ui/play-button";
import "@videojs/html/ui/mute-button";
import "@videojs/html/ui/fullscreen-button";
import "@videojs/html/ui/time-slider";
import "@videojs/html/ui/slider-track";
import "@videojs/html/ui/slider-buffer";
import "@videojs/html/ui/slider-fill";
import "@videojs/html/ui/slider-thumb";
import "@videojs/html/ui/time";
import "@videojs/html/ui/time-group";
import "@videojs/html/ui/time-separator";

/** What MediaPlayer reads of a player's store (`<video-player>`, `<audio-player>`): the state its controls' names follow. */
interface PlayerStore {
  readonly ended: boolean;
  readonly isFullscreen?: boolean;
  readonly muted: boolean;
  readonly paused: boolean;
  subscribe: (listener: () => void) => () => void;
}

/** A player element, once defined: its store. */
export interface PlayerElement extends HTMLElement {
  readonly store?: PlayerStore;
}
