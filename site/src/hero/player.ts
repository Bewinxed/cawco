import { gsap } from 'gsap';
import { one } from '../dom';
import { SCENE_ONE, sceneOne } from './scene';

/** Pause demos / Play demos, kept for the visit (WCAG 2.2.2: anything that moves can be stopped). */
const PAUSE_KEY = 'cawco-demos';

/** How long a finished beat rests on its summary frame before the next one takes over. */
const HAND_OFF = 2.4;

const kept = (): boolean => {
  try {
    return sessionStorage.getItem(PAUSE_KEY) === 'paused';
  } catch {
    return false;
  }
};

const keep = (paused: boolean): void => {
  try {
    if (paused) sessionStorage.setItem(PAUSE_KEY, 'paused');
    else sessionStorage.removeItem(PAUSE_KEY);
  } catch {
    // Storage is refused here: the choice holds until the page is left.
  }
};

export interface Hero {
  /** Whether the stage may move. Off stands it on scene 1's summary frame. */
  setMotion(on: boolean): void;
}

/**
 * Plays the hero's stage: scene 1 while it is on screen, then, after a rest, the next beat. Only
 * beat 1 is built, so the hand-off comes back round to it. Hovering the stage holds the hand-off;
 * the pause holds everything, and is kept for the visit.
 */
export function initHero(stage: HTMLElement, rail: HTMLElement): Hero {
  const timeline = sceneOne(stage);
  // The composition contract's registry, under the stage's `data-composition-id`, so anything
  // that seeks compositions (the proof scripts, a HyperFrames render) finds this same timeline.
  const registry = window as unknown as { __timelines?: Record<string, gsap.core.Timeline> };
  registry.__timelines ??= {};
  registry.__timelines[stage.dataset.compositionId ?? SCENE_ONE.id] = timeline;
  const fill = one(rail, '[data-fill]');
  const first = one<HTMLButtonElement>(rail, '[data-beat="1"]');
  const toggle = one<HTMLButtonElement>(rail, '[data-demo-pause]');
  const toggleLabel = one(toggle, '[data-demo-pause-label]');

  let motion = false;
  let inView = false;
  let hovering = false;
  let paused = kept();
  let handOff: gsap.core.Tween | null = null;

  timeline.eventCallback('onUpdate', () => {
    fill.style.transform = `scaleX(${timeline.progress()})`;
  });
  timeline.eventCallback('onComplete', () => {
    handOff = gsap.delayedCall(HAND_OFF, () => {
      handOff = null;
      play(true);
    });
    if (hovering || !inView) handOff.pause();
  });

  function play(fromStart: boolean): void {
    handOff?.kill();
    handOff = null;
    if (fromStart || timeline.progress() === 1) timeline.restart();
    else timeline.play();
  }

  function showPaused(): void {
    toggle.toggleAttribute('data-paused', paused);
    toggleLabel.textContent = paused ? 'Play demos' : 'Pause demos';
  }

  function hold(): void {
    timeline.pause();
    handOff?.pause();
  }

  function carryOn(): void {
    if (!motion || paused || !inView) return;
    if (handOff) {
      if (!hovering) handOff.resume();
    } else if (timeline.progress() < 1) timeline.play();
    else play(true);
  }

  toggle.addEventListener('click', () => {
    paused = !paused;
    keep(paused);
    showPaused();
    if (paused) hold();
    else carryOn();
  });

  first.addEventListener('click', () => {
    if (!motion) return;
    paused = false;
    keep(false);
    showPaused();
    play(true);
  });

  stage.addEventListener('pointerenter', (event) => {
    if (event.pointerType !== 'mouse') return;
    hovering = true;
    handOff?.pause();
  });
  stage.addEventListener('pointerleave', () => {
    hovering = false;
    if (handOff && motion && !paused && inView) handOff.resume();
  });

  // The stage only plays while a good part of it is on screen.
  new IntersectionObserver(
    ([entry]) => {
      inView = entry?.isIntersecting ?? false;
      if (inView) carryOn();
      else hold();
    },
    { threshold: 0.3 },
  ).observe(stage);

  showPaused();
  return {
    setMotion(on) {
      motion = on;
      toggle.hidden = !on;
      if (!on || paused) {
        // Still: the summary frame, the whole story at once.
        hold();
        timeline.progress(1);
        return;
      }
      timeline.progress(0);
      carryOn();
    },
  };
}
