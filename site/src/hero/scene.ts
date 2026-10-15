import { gsap } from 'gsap';
import { CustomEase } from 'gsap/CustomEase';
import { all, one } from '../dom';

gsap.registerPlugin(CustomEase);

/**
 * Scene 1, "after you close the lid": the screen types a line, the lid falls shut, and desk-box's
 * sessions arrive as cards and drift on. It is one paused timeline with a label per beat, built
 * from the stage's markup alone, so any time can be sought and gives the same frame. That is the
 * HyperFrames composition contract (the stage is the composition root, `data-composition-id`):
 * the site plays this timeline with its own gsap, and `npx hyperframes snapshot` renders it at
 * its labels from scripts/hero-composition.ts. No HyperFrames runtime ships on the page.
 */
export const SCENE_ONE = { id: 'hero-scene-1', duration: 7.6 } as const;

/** The lid clip's rate: 17 baked poses at 24 fps. */
const FPS = 24;

/** `ui-in`: 360ms from 10px lower, at 98%, from nothing, on the house ease-out. */
const UI_IN = { duration: 0.36, ease: CustomEase.create('hero-ui-in', '0.23, 1, 0.32, 1') };
const UI_STAGGER = 0.18;

/** The beats. `lid-shut` and `typed` follow from the clip's length and the typing. */
const AT = {
  ajar: 0,
  typing: 0.3,
  close: 2.2,
  cards: 3,
  summary: SCENE_ONE.duration,
};

/** The caret blinks in 530ms steps while nothing is typed. */
const BLINK = 0.53;

/**
 * When each character lands: 45ms ± 15ms apart, 70ms more after punctuation. The ± comes from a
 * fixed Park–Miller sequence, so every run (and every render) types at the same moments.
 */
function keystrokes(count: number, text: string, from: number): { at: number[]; done: number } {
  let seed = 48271;
  const next = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const at: number[] = [];
  let t = from;
  for (let i = 0; i < count; i++) {
    t += 0.045 + (next() * 2 - 1) * 0.015;
    at.push(t);
    if (/[.,!?]/.test(text[i] ?? '')) t += 0.07;
  }
  return { at, done: t };
}

/**
 * A frame clip: a stack of baked drawings, one shown at a time. The timeline owns it through a
 * tween on an integer frame index (ease none, frames ÷ fps seconds), so pausing, seeking and
 * reduced motion land on exact frames. Caw's drawn clips can move onto the same player.
 */
export interface FrameClip {
  readonly count: number;
  /** The frame on show. */
  readonly frame: number;
  show(frame: number): void;
  /** Adds the clip to `timeline` at `at`, playing every frame once. */
  play(timeline: gsap.core.Timeline, at: number | string): void;
}

export function frameClip(
  frames: Element[][],
  onFrame: (frame: number) => void = () => {},
): FrameClip {
  let current = -1;
  const clip: FrameClip = {
    count: frames.length,
    get frame() {
      return current;
    },
    show(frame) {
      if (frame === current) return;
      for (const [index, parts] of frames.entries()) {
        for (const part of parts) part.classList.toggle('on', index === frame);
      }
      current = frame;
      onFrame(frame);
    },
    play(timeline, at) {
      // The index is a getter/setter, so every render of the timeline sets the frame, including
      // a seek with its events suppressed (an onUpdate would miss those).
      let head = 0;
      const playhead = {
        frame(value?: number): number {
          if (value === undefined) return head;
          head = value;
          clip.show(Math.min(clip.count - 1, Math.max(0, Math.floor(value))));
          return head;
        },
      };
      timeline.fromTo(
        playhead,
        { frame: 0 },
        { frame: clip.count, duration: clip.count / FPS, ease: 'none' },
        at,
      );
    },
  };
  clip.show(0);
  return clip;
}

/** Scales a pool of light toward the hinge line (plan y = -107.5) and sets how strong it is. */
const HINGE_Y = -107.5;

export function sceneOne(stage: HTMLElement): gsap.core.Timeline {
  const laptop = one(stage, '.m-lap');
  const line = one(laptop, '.ui-line');
  const characters = all(line, '.ch');
  const caret = one(line, '.caret');
  const pools = all(laptop, '.pool');
  const poolShapes = all(laptop, '[data-pool-shape]');
  const lids = all(laptop, '.lid[data-frame]');
  const reach = lids.map((lid) => (lid.getAttribute('data-pool') ?? '0 0').split(' ').map(Number));
  const frames = lids.map((lid) => all(laptop, `[data-frame="${lid.getAttribute('data-frame')}"]`));
  const drifts = all(stage, '[data-drift]');

  const lid = frameClip(frames, (frame) => {
    const [scale = 0, strength = 0] = reach[frame] ?? [];
    const matrix = `matrix(1 0 0 ${scale} 0 ${(HINGE_Y * (1 - scale)).toFixed(2)})`;
    for (const shape of poolShapes) shape.setAttribute('transform', matrix);
    for (const pool of pools) pool.setAttribute('opacity', String(strength));
  });

  const timeline = gsap.timeline({ paused: true });
  const typed = keystrokes(characters.length, line.textContent ?? '', AT.typing);
  const shut = AT.close + lid.count / FPS;

  timeline
    .addLabel('ajar', AT.ajar)
    .addLabel('typing', AT.typing)
    .addLabel('typed', typed.done)
    .addLabel('close', AT.close)
    .addLabel('lid-shut', shut)
    .addLabel('cards', AT.cards)
    .addLabel('cards-in', AT.cards + (drifts.length - 1) * UI_STAGGER + UI_IN.duration)
    .addLabel('summary', AT.summary);

  // 1. The screen types its line; the caret holds still while it types and blinks while it waits.
  characters.forEach((character, index) => {
    timeline.set(character, { display: 'inline' }, typed.at[index]);
  });
  timeline.set(caret, { visibility: 'visible' }, 0);
  for (let t = typed.done + BLINK, on = false; t < shut; t += BLINK, on = !on) {
    timeline.set(caret, { visibility: on ? 'visible' : 'hidden' }, t);
  }

  // 2. Hold. 3. The lid falls shut as a clip; its baked poses dim the line between 60° and 30°.
  lid.play(timeline, 'close');

  // The room goes down with the screen at night (styles.css reads `--dusk` only in the dark).
  timeline.fromTo(
    stage,
    { '--dusk': 0 },
    { '--dusk': 1, duration: 0.7, ease: 'sine.inOut' },
    'close+=0.3',
  );

  // 4. The magnetic catch settles the laptop by 1px.
  timeline
    .fromTo(laptop, { y: 0 }, { y: 1, duration: 0.06, ease: 'power2.in' }, 'lid-shut')
    .to(laptop, { y: 0, duration: 0.2, ease: UI_IN.ease }, '>');

  // 5. Desk-box's sessions arrive as cards and drift along the floor's y axis from then on.
  drifts.forEach((drift, index) => {
    const card = one(drift, '.session-card');
    const at = AT.cards + index * UI_STAGGER;
    timeline.fromTo(
      card,
      { opacity: 0, y: 10, scale: 0.98 },
      { opacity: 1, y: 0, scale: 1, ...UI_IN },
      at,
    );
    timeline.fromTo(
      drift,
      { '--t': 0 },
      { '--t': AT.summary - at, duration: AT.summary - at, ease: 'none' },
      at,
    );
    // Each card's age counts on a minute every 1.2s.
    const ages = all(card, '[data-age]');
    ages.slice(1).forEach((age, step) => {
      const tick = at + (step + 1) * 1.2;
      timeline
        .set(ages[step] as HTMLElement, { visibility: 'hidden' }, tick)
        .set(age, { visibility: 'visible' }, tick);
    });
  });

  // 6. The summary frame: lid shut, cards resting, desk-box's lamp on.
  timeline.set({}, {}, AT.summary);
  return timeline;
}
