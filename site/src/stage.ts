import { gsap } from 'gsap';
import { all, one } from './dom';
import { drawLinks, SCENE_STATES, type SceneId, scenes } from './scenes';

const ORDER: readonly SceneId[] = ['board', 'phone', 'rules', 'delegates', 'sync'];

/**
 * auto: scenes play and hand on to the next one.
 * picked: the visitor chose a tab, so its scene plays once and stays.
 * paused: the visitor pressed pause, so nothing moves until they press play.
 */
type Mode = 'auto' | 'picked' | 'paused';

interface Run {
  context: gsap.Context;
  timeline: gsap.core.Timeline;
}

export interface Stage {
  /** Whether scenes may move. Off means every scene stands in its finished state. */
  setMotion(on: boolean): void;
}

export function initStage(stage: HTMLElement): Stage {
  const tablist = one(stage, '[role="tablist"]');
  const toggle = one<HTMLButtonElement>(stage, '[data-autoplay]');
  const toggleLabel = one(toggle, '[data-autoplay-label]');
  const bars = all(stage, '[data-bar]');

  let current: SceneId = 'board';
  let mode: Mode = 'auto';
  let motion = false;
  let inView = false;
  let run: Run | null = null;
  let width = stage.offsetWidth;

  const parts = (id: SceneId) => {
    const tab = one<HTMLButtonElement>(stage, `[data-tab="${id}"]`);
    const panel = one(stage, `[data-panel="${id}"]`);
    return {
      tab,
      panel,
      scene: one(panel, '.scene'),
      bar: one(tab, '[data-bar]'),
    };
  };

  const after = (id: SceneId): SceneId => {
    const next = ORDER[(ORDER.indexOf(id) + 1) % ORDER.length];
    if (!next) throw new Error('The scene order is empty.');
    return next;
  };

  function stop(): void {
    run?.context.revert();
    run = null;
    for (const bar of bars) bar.style.transform = '';
  }

  function play(): void {
    stop();
    if (!motion || !inView) return;
    const { scene, bar } = parts(current);
    const built: { timeline?: gsap.core.Timeline } = {};
    const context = gsap.context(() => {
      built.timeline = scenes[current](scene);
      return () => scene.classList.remove(...SCENE_STATES);
    });
    const timeline = built.timeline;
    if (!timeline) throw new Error(`The "${current}" scene built no timeline.`);
    timeline.eventCallback('onUpdate', () => {
      bar.style.transform = `scaleX(${timeline.progress()})`;
    });
    timeline.eventCallback('onComplete', () => {
      if (mode === 'auto') select(after(current), false);
    });
    run = { context, timeline };
  }

  function select(id: SceneId, instant: boolean): void {
    current = id;
    stage.classList.toggle('is-instant', instant);
    for (const other of ORDER) {
      const { tab, panel } = parts(other);
      const on = other === id;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      panel.classList.toggle('is-on', on);
    }
    play();
  }

  function setMode(next: Mode): void {
    mode = next;
    toggle.toggleAttribute('data-paused', mode !== 'auto');
    toggleLabel.textContent = mode === 'auto' ? 'Pause demos' : 'Play demos';
  }

  toggle.addEventListener('click', () => {
    if (mode === 'auto') {
      setMode('paused');
      run?.timeline.pause();
      return;
    }
    setMode('auto');
    if (run && run.timeline.progress() < 1) run.timeline.resume();
    else select(run ? after(current) : current, false);
  });

  tablist.addEventListener('click', (event) => {
    const tab = (event.target as Element).closest<HTMLElement>('[data-tab]');
    if (!tab) return;
    setMode('picked');
    select(tab.dataset.tab as SceneId, false);
  });

  // Arrow keys move between tabs, as a tablist should. No transition: a key press lands at once.
  tablist.addEventListener('keydown', (event) => {
    const last = ORDER.length - 1;
    const here = ORDER.indexOf(current);
    const steps: Record<string, number> = {
      ArrowRight: here + 1,
      ArrowDown: here + 1,
      ArrowLeft: here - 1,
      ArrowUp: here - 1,
      Home: 0,
      End: last,
    };
    const wanted = steps[event.key];
    if (wanted === undefined) return;
    event.preventDefault();
    const id = ORDER[(wanted + ORDER.length) % ORDER.length];
    if (!id) return;
    setMode('picked');
    select(id, true);
    parts(id).tab.focus();
  });

  // Scenes only run while the stage is on screen.
  new IntersectionObserver(
    ([entry]) => {
      inView = entry?.isIntersecting ?? false;
      if (!inView) run?.timeline.pause();
      else if (!run) play();
      else if (mode !== 'paused') run.timeline.resume();
    },
    { threshold: 0.3 },
  ).observe(stage);

  // Scenes measure the layout when they start, so a new width starts the current one again.
  new ResizeObserver(() => {
    if (stage.offsetWidth === width) return;
    width = stage.offsetWidth;
    drawLinks(parts('delegates').scene);
    if (run) play();
  }).observe(stage);

  drawLinks(parts('delegates').scene);

  return {
    setMotion(on) {
      motion = on;
      toggle.hidden = !on;
      if (on) play();
      else stop();
    },
  };
}
