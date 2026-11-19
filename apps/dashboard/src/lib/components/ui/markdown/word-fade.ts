import { getContext, setContext } from "svelte";

/**
 * A streamed reply's word fade as a design graph sets it while the person
 * tunes it (transcript/word-fade-live.svelte). The markdown hands Words this
 * duration, which Words writes on each fading span and unwraps the span
 * after, and sets both on its root as --word-fade-duration and
 * --word-fade-ease, which app.css's fade rule reads. With none provided, the
 * product's fade stands: --duration-menu on --ease-out.
 */
export interface WordFade {
  /** The fade's length, in ms. */
  readonly duration: number;
  /** The fade's curve, as CSS (`cubic-bezier(…)`). */
  readonly ease: string;
}

const KEY = Symbol("word-fade");

/** Sets the fade for every markdown under the caller. */
export const provideWordFade = (fade: WordFade): void => {
  setContext(KEY, fade);
};

/** The fade a design graph set above this markdown, if any. */
export const useWordFade = (): WordFade | undefined => getContext(KEY);
