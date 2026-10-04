import { gsap } from 'gsap';
import { CustomEase } from 'gsap/CustomEase';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';
import { SplitText } from 'gsap/SplitText';
import { all, one } from './dom';

gsap.registerPlugin(CustomEase, DrawSVGPlugin, MotionPathPlugin, SplitText);

export type SceneId = 'board' | 'phone' | 'rules' | 'delegates' | 'sync';

type Timeline = gsap.core.Timeline;

/** Strong ease-out for things arriving, ease-in-out for things travelling. */
const OUT = CustomEase.create('caw-out', '0.23, 1, 0.32, 1');
const TRAVEL = CustomEase.create('caw-travel', '0.77, 0, 0.175, 1');

/** How long a finished scene rests before the next one. */
const HOLD = 1.8;

const INK = '#171715';
const IVORY = '#f4f0e6';

/**
 * A `.swap` stacks two states in one cell. Markup rests on the second
 * (`data-b`); a scene starts from the first and crosses over.
 */
function showFirst(scope: ParentNode): void {
  gsap.set(all(scope, '[data-a]'), { opacity: 1 });
  gsap.set(all(scope, '[data-b]'), { opacity: 0 });
}

function crossOver(timeline: Timeline, scope: ParentNode, at: string | number): void {
  timeline
    .to(all(scope, '[data-a]'), { opacity: 0, duration: 0.22 }, at)
    .to(all(scope, '[data-b]'), { opacity: 1, duration: 0.22 }, '<');
}

/** Five loose terminals fold into five rows of one board, then one row asks for you. */
function board(root: HTMLElement): Timeline {
  const rows = all(root, '[data-row]');
  const groups = all(root, '[data-group]');
  const terms = all(root, '[data-term]');
  const asking = one(root, '[data-flip]');
  const count = one(root, '[data-needs]');
  const origin = one(root, '.terms').getBoundingClientRect();

  const flights = terms.map((term, index) => {
    const row = rows[index];
    if (!row) throw new Error('A terminal has no row to land on.');
    const landing = row.getBoundingClientRect();
    return {
      term,
      row,
      x: landing.left + landing.width / 2 - (origin.left + term.offsetLeft + term.offsetWidth / 2),
      y: landing.top + landing.height / 2 - (origin.top + term.offsetTop + term.offsetHeight / 2),
      scaleX: landing.width / term.offsetWidth,
      scaleY: landing.height / term.offsetHeight,
      tilt: Number.parseFloat(getComputedStyle(term).getPropertyValue('--r')),
    };
  });

  gsap.set([...rows, ...groups], { opacity: 0 });
  gsap.set(count, { opacity: 0, scale: 0.8 });
  gsap.set(asking, { backgroundColor: 'rgba(230, 93, 70, 0)' });
  showFirst(asking);
  for (const flight of flights) {
    gsap.set(flight.term, { rotation: flight.tilt, scale: 0.9, opacity: 0 });
  }

  const timeline = gsap.timeline({ defaults: { ease: OUT } });
  timeline.to(terms, { opacity: 1, scale: 1, duration: 0.35, stagger: 0.07 }, 0.2);
  timeline.addLabel('gather', '+=0.8');
  flights.forEach((flight, index) => {
    const at = (later: number) => `gather+=${(index * 0.07 + later).toFixed(2)}`;
    timeline
      .to(
        flight.term,
        {
          x: flight.x,
          y: flight.y,
          rotation: 0,
          scaleX: flight.scaleX,
          scaleY: flight.scaleY,
          duration: 0.6,
          ease: TRAVEL,
        },
        at(0),
      )
      // The label would stretch with the card, so it goes first.
      .to(flight.term.children, { opacity: 0, duration: 0.15, ease: 'none' }, at(0))
      .to(flight.term, { opacity: 0, duration: 0.2, ease: 'none' }, at(0.4))
      .to(flight.row, { opacity: 1, duration: 0.3 }, at(0.38));
  });
  timeline.to(groups, { opacity: 1, duration: 0.3, stagger: 0.06 }, 'gather+=0.55');
  timeline.addLabel('ask', '+=0.6');
  crossOver(timeline, asking, 'ask');
  timeline
    .to(asking, { backgroundColor: 'rgba(230, 93, 70, 0.18)', duration: 0.3 }, 'ask')
    .to(count, { opacity: 1, scale: 1, duration: 0.35, ease: 'back.out(2.5)' }, 'ask+=0.1')
    .to({}, { duration: HOLD });
  return timeline;
}

/** A session stops at a prompt, the phone buzzes, one tap sends it on its way. */
function phone(root: HTMLElement): Timeline {
  const row = one(root, '[data-row]');
  const ask = one(root, '[data-ask]');
  const handset = one(root, '[data-handset]');
  const bubble = one(root, '[data-bubble]');
  const allow = one(root, '[data-allow]');
  const tap = one(root, '[data-tap]');
  const waiting = all(row, '[data-a]');
  const working = all(row, '[data-b]');

  const frame = handset.getBoundingClientRect();
  const target = allow.getBoundingClientRect();
  const tapAt = {
    x: target.left + target.width / 2 - frame.left - handset.clientLeft,
    y: target.top + target.height / 2 - frame.top - handset.clientTop,
  };

  root.classList.add('is-pending');
  gsap.set(ask, { opacity: 0, y: -8 });
  gsap.set(bubble, { opacity: 0, y: 16, scale: 0.94 });
  gsap.set(tap, { x: tapAt.x, y: tapAt.y, opacity: 0, scale: 0.4 });

  const timeline = gsap.timeline({ defaults: { ease: OUT } });
  timeline
    .to(working, { opacity: 0, duration: 0.22 }, 0.6)
    .to(waiting, { opacity: 1, duration: 0.22 }, '<')
    .to(ask, { opacity: 1, y: 0, duration: 0.35 }, '<0.1')
    .to(
      handset,
      { keyframes: { rotation: [0, -2.4, 2, -1.4, 0] }, duration: 0.42, ease: 'none' },
      '+=0.3',
    )
    .to(bubble, { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: 'back.out(1.5)' }, '<0.08')
    .to(tap, { opacity: 1, scale: 1, duration: 0.2 }, '+=0.9')
    .to(allow, { scale: 0.93, duration: 0.1 }, '<0.06')
    .call(() => root.classList.remove('is-pending'))
    .to(allow, { scale: 1, duration: 0.22, ease: 'back.out(3)' })
    .to(tap, { opacity: 0, scale: 1.6, duration: 0.3 }, '<')
    .to(waiting, { opacity: 0, duration: 0.22 }, '+=0.4')
    .to(working, { opacity: 1, duration: 0.22 }, '<')
    .to({}, { duration: HOLD });
  return timeline;
}

/** A session says the phrase, the rule catches it, the standing reply goes back. */
function rules(root: HTMLElement): Timeline {
  const claim = one(root, '[data-msg1]');
  const phrase = one(root, '[data-hit]');
  const reply = one(root, '[data-reply]');
  const answer = one(root, '[data-msg2]');
  const card = one(root, '[data-card]');
  const words = SplitText.create(claim, { type: 'words' }).words;

  gsap.set(words, { opacity: 0, y: 5 });
  gsap.set(phrase, { backgroundSize: '0% 100%', color: IVORY });
  gsap.set([reply, answer], { opacity: 0, y: 12 });

  const timeline = gsap.timeline({ defaults: { ease: OUT } });
  timeline
    .to(words, { opacity: 1, y: 0, duration: 0.28, stagger: 0.05 }, 0.4)
    .to(phrase, { backgroundSize: '100% 100%', color: INK, duration: 0.4, ease: TRAVEL }, '+=0.3')
    .call(() => root.classList.add('is-hit'), undefined, '<')
    .to(card, { scale: 1.035, duration: 0.16, yoyo: true, repeat: 1, ease: 'power1.inOut' }, '<0.1')
    .to(reply, { opacity: 1, y: 0, duration: 0.45, ease: 'back.out(1.4)' }, '+=0.35')
    .to(answer, { opacity: 1, y: 0, duration: 0.4 }, '+=1')
    .to({}, { duration: HOLD });
  return timeline;
}

const SVG = 'http://www.w3.org/2000/svg';

/** Draws one curve from the parent session down to each delegate, with a dot to ride it. */
export function drawLinks(root: HTMLElement): void {
  const canvas = one<SVGSVGElement>(root, '[data-links]');
  const box = root.getBoundingClientRect();
  const parent = one(root, '[data-parent]').getBoundingClientRect();
  const from = { x: parent.left + parent.width / 2 - box.left, y: parent.bottom - box.top };

  canvas.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
  canvas.replaceChildren(
    ...all(root, '[data-kid]').flatMap((kid) => {
      const rect = kid.getBoundingClientRect();
      const to = { x: rect.left + rect.width / 2 - box.left, y: rect.top - box.top };
      const bend = (from.y + to.y) / 2;
      const path = document.createElementNS(SVG, 'path');
      path.setAttribute(
        'd',
        `M${from.x} ${from.y} C${from.x} ${bend} ${to.x} ${bend} ${to.x} ${to.y}`,
      );
      const dot = document.createElementNS(SVG, 'circle');
      dot.setAttribute('r', '4');
      return [path, dot];
    }),
  );
}

/** One session starts three delegates; each finishes and reports back up its line. */
function delegates(root: HTMLElement): Timeline {
  drawLinks(root);
  const parent = one(root, '[data-parent]');
  const kids = all(root, '[data-kid]');
  const paths = all<SVGPathElement>(root, '[data-links] path');
  const dots = all<SVGCircleElement>(root, '[data-links] circle');

  showFirst(parent);
  for (const kid of kids) showFirst(kid);
  gsap.set(kids, { opacity: 0, y: 14, scale: 0.95 });
  gsap.set(paths, { drawSVG: '0%' });

  const timeline = gsap.timeline({ defaults: { ease: OUT } });
  timeline
    .to(paths, { drawSVG: '100%', duration: 0.5, stagger: 0.12, ease: TRAVEL }, 0.4)
    .to(
      kids,
      { opacity: 1, y: 0, scale: 1, duration: 0.45, stagger: 0.12, ease: 'back.out(1.5)' },
      '<0.3',
    )
    .addLabel('work', '+=0.7');
  kids.forEach((kid, index) => {
    const path = paths[index];
    const dot = dots[index];
    if (!path || !dot) throw new Error('A delegate has no line back to its parent.');
    const at = (later: number) => `work+=${(index * 0.5 + later).toFixed(2)}`;
    crossOver(timeline, kid, at(0));
    timeline
      .set(dot, { opacity: 1 }, at(0.1))
      .to(
        dot,
        {
          motionPath: { path, align: path, alignOrigin: [0.5, 0.5], start: 1, end: 0 },
          duration: 0.55,
          ease: TRAVEL,
        },
        at(0.1),
      )
      .set(dot, { opacity: 0 }, at(0.65));
  });
  timeline.addLabel('wrap', '+=0.2');
  crossOver(timeline, parent, 'wrap');
  timeline.to({}, { duration: HOLD });
  return timeline;
}

/** A tool added once in the hub lands on every machine. */
function sync(root: HTMLElement): Timeline {
  const moves = (['mcp', 'skill', 'hook'] as const).map((kind) => {
    const source = one(root, `[data-src="${kind}"]`);
    const from = source.getBoundingClientRect();
    const copies = all(root, `[data-dst="${kind}"]`).map((copy) => {
      const to = copy.getBoundingClientRect();
      return { copy, x: from.left - to.left, y: from.top - to.top };
    });
    return { source, copies };
  });
  const synced = all(root, '[data-synced]');

  gsap.set(
    moves.map((move) => move.source),
    { opacity: 0, y: 8, scale: 0.92 },
  );
  for (const move of moves) {
    for (const { copy, x, y } of move.copies) gsap.set(copy, { x, y, opacity: 0, scale: 0.92 });
  }
  gsap.set(synced, { opacity: 0, scale: 0.85 });

  const timeline = gsap.timeline({ defaults: { ease: OUT } });
  moves.forEach((move, index) => {
    timeline
      .to(
        move.source,
        { opacity: 1, y: 0, scale: 1, duration: 0.35, ease: 'back.out(1.8)' },
        index === 0 ? 0.4 : '+=0.25',
      )
      .to(
        move.copies.map(({ copy }) => copy),
        { x: 0, y: 0, opacity: 1, scale: 1, duration: 0.6, ease: TRAVEL, stagger: 0.08 },
        '+=0.2',
      );
  });
  timeline
    .to(
      synced,
      { opacity: 1, scale: 1, duration: 0.35, stagger: 0.09, ease: 'back.out(2.2)' },
      '+=0.2',
    )
    .to({}, { duration: HOLD });
  return timeline;
}

export const scenes: Record<SceneId, (root: HTMLElement) => Timeline> = {
  board,
  phone,
  rules,
  delegates,
  sync,
};

/** Classes a scene may leave on its root if it is stopped part-way. */
export const SCENE_STATES = ['is-pending', 'is-hit'];
