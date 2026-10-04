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

/** Only what the scene's current layout shows: a narrow frame leaves some rows out. */
const shown = <T extends HTMLElement>(elements: T[]): T[] =>
  elements.filter((element) => element.offsetParent !== null);

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

/**
 * Loose terminals fold into the rows of one tree. A session's delegates and a
 * workflow run's steps open under them, then one row asks for you.
 */
function board(root: HTMLElement): Timeline {
  const rows = shown(all(root, '[data-row]'));
  const groups = shown(all(root, '[data-group]'));
  const terms = shown(all(root, '[data-term]'));
  const branches = all(root, '[data-branch]');
  const leaves = shown(all(root, '[data-leaf]'));
  const asking = one(root, '[data-flip]');
  const count = one(root, '[data-needs]');
  const origin = one(root, '.terms').getBoundingClientRect();

  const flights = terms.map((term, index) => {
    const row = rows[index];
    if (!row) throw new Error('A terminal has no row to land on.');
    const landing = one(row, '.t-row').getBoundingClientRect();
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

  root.classList.add('is-calm');
  gsap.set([...rows, ...groups, ...branches], { opacity: 0 });
  gsap.set(leaves, { opacity: 0, x: -8 });
  gsap.set(count, { opacity: 0, scale: 0.8 });
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
  timeline
    .to(groups, { opacity: 1, duration: 0.3, stagger: 0.06 }, 'gather+=0.55')
    // The trees open: each row comes out along its arm, one after the other.
    .addLabel('unfold', '+=0.3')
    .set(branches, { opacity: 1 }, 'unfold')
    .to(leaves, { opacity: 1, x: 0, duration: 0.32, stagger: 0.09 }, 'unfold')
    .addLabel('ask', '+=0.6')
    .call(() => root.classList.remove('is-calm'), undefined, 'ask');
  crossOver(timeline, asking, 'ask');
  timeline
    .to(count, { opacity: 1, scale: 1, duration: 0.35, ease: 'back.out(2.5)' }, 'ask+=0.1')
    .to({}, { duration: HOLD });
  return timeline;
}

/** A session stops at a prompt. It shows in the app and in Telegram, and one tap sends it on. */
function phone(root: HTMLElement): Timeline {
  const handset = one(root, '[data-handset]');
  const ask = one(root, '[data-ask]');
  const telegram = one(root, '[data-tg]');
  const allow = one(root, '[data-allow]');
  const tap = one(root, '[data-tap]');

  const frame = handset.getBoundingClientRect();
  const target = allow.getBoundingClientRect();
  const tapAt = {
    x: target.left + target.width / 2 - frame.left - handset.clientLeft,
    y: target.top + target.height / 2 - frame.top - handset.clientTop,
  };

  root.classList.add('is-pending');
  showFirst(ask);
  // The app's own arrival for a prompt: one settle of 8px, then still.
  gsap.set([ask, telegram], { opacity: 0, y: 8 });
  gsap.set(tap, { x: tapAt.x, y: tapAt.y, opacity: 0, scale: 0.4 });

  const timeline = gsap.timeline({ defaults: { ease: OUT } });
  timeline
    .to(ask, { opacity: 1, y: 0, duration: 0.24 }, 0.6)
    .to(telegram, { opacity: 1, y: 0, duration: 0.24 }, '<0.25')
    .to(tap, { opacity: 1, scale: 1, duration: 0.2 }, '+=1')
    .to(allow, { scale: 0.96, duration: 0.1 }, '<0.06')
    .to(allow, { scale: 1, duration: 0.2 })
    .to(tap, { opacity: 0, scale: 1.6, duration: 0.3 }, '<')
    .call(() => root.classList.remove('is-pending'), undefined, '<0.1');
  crossOver(timeline, ask, '<');
  timeline.to({}, { duration: HOLD });
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
  gsap.set(phrase, { backgroundSize: '0% 100%' });
  gsap.set([reply, answer], { opacity: 0, y: 8 });

  const timeline = gsap.timeline({ defaults: { ease: OUT } });
  timeline
    .to(words, { opacity: 1, y: 0, duration: 0.28, stagger: 0.05 }, 0.4)
    .to(phrase, { backgroundSize: '100% 100%', duration: 0.4, ease: TRAVEL }, '+=0.3')
    .call(() => root.classList.add('is-hit'), undefined, '<')
    .to(card, { scale: 1.02, duration: 0.16, yoyo: true, repeat: 1, ease: 'power1.inOut' }, '<0.1')
    .to(reply, { opacity: 1, y: 0, duration: 0.35 }, '+=0.35')
    .to(answer, { opacity: 1, y: 0, duration: 0.35 }, '+=1')
    .to({}, { duration: HOLD });
  return timeline;
}

const SVG = 'http://www.w3.org/2000/svg';

/** Draws one curve from each session down to each one it started, with a dot to ride it. */
export function drawLinks(root: HTMLElement): void {
  const canvas = one<SVGSVGElement>(root, '[data-links]');
  const box = root.getBoundingClientRect();

  canvas.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
  canvas.replaceChildren(
    ...all(root, '[data-from]').flatMap((node) => {
      const above = one(root, `[data-node="${node.dataset.from}"]`).getBoundingClientRect();
      const below = node.getBoundingClientRect();
      const from = { x: above.left + above.width / 2 - box.left, y: above.bottom - box.top };
      const to = { x: below.left + below.width / 2 - box.left, y: below.top - box.top };
      const bend = (from.y + to.y) / 2;
      const path = document.createElementNS(SVG, 'path');
      path.dataset.link = node.dataset.node;
      path.setAttribute(
        'd',
        `M${from.x} ${from.y} C${from.x} ${bend} ${to.x} ${bend} ${to.x} ${to.y}`,
      );
      const dot = document.createElementNS(SVG, 'circle');
      dot.dataset.dot = node.dataset.node;
      dot.setAttribute('r', '4');
      return [path, dot];
    }),
  );
}

/**
 * The orchestrator hands work out first: a dot leaves it along each line, and a
 * delegate appears where the dot lands. One delegate starts a session of its
 * own on another machine. Then each finishes and its result rides back up.
 */
function delegates(root: HTMLElement): Timeline {
  drawLinks(root);
  const parent = one(root, '[data-node="parent"]');
  const started = all(root, '[data-from]');
  const link = (node: HTMLElement) => ({
    node,
    path: one<SVGPathElement>(root, `[data-link="${node.dataset.node}"]`),
    dot: one<SVGCircleElement>(root, `[data-dot="${node.dataset.node}"]`),
  });
  const kids = started.filter((node) => node.dataset.from === 'parent').map(link);
  const further = started.filter((node) => node.dataset.from !== 'parent').map(link);

  showFirst(parent);
  for (const node of started) showFirst(node);
  gsap.set(started, { opacity: 0, y: 10, scale: 0.96 });
  gsap.set(all(root, '[data-link]'), { drawSVG: '0%' });

  const timeline = gsap.timeline({ defaults: { ease: OUT } });
  /** A moment `seconds` after a label, as the timeline writes it. */
  const after = (label: string, seconds: number): string => `${label}+=${seconds.toFixed(2)}`;
  type Leg = ReturnType<typeof link>;
  const ride = ({ path, dot }: Leg, label: string, start: number, way: 'out' | 'back'): void => {
    timeline
      .set(dot, { opacity: 1 }, after(label, start))
      .to(
        dot,
        {
          motionPath: {
            path,
            align: path,
            alignOrigin: [0.5, 0.5],
            start: way === 'out' ? 0 : 1,
            end: way === 'out' ? 1 : 0,
          },
          duration: 0.5,
          ease: TRAVEL,
          immediateRender: false,
        },
        after(label, start),
      )
      .set(dot, { opacity: 0 }, after(label, start + 0.5));
  };
  /** The work goes out along a line, and the session it starts appears where it lands. */
  const send = (to: Leg, label: string, start: number): void => {
    timeline.to(to.path, { drawSVG: '100%', duration: 0.5, ease: TRAVEL }, after(label, start));
    ride(to, label, start, 'out');
    timeline.to(
      to.node,
      { opacity: 1, y: 0, scale: 1, duration: 0.35 },
      after(label, start + 0.42),
    );
  };
  /** The session finishes, and its result goes back up the same line. */
  const report = (from: Leg, label: string, start: number): void => {
    crossOver(timeline, from.node, after(label, start));
    ride(from, label, start + 0.1, 'back');
  };

  timeline.addLabel('out', 0.5);
  kids.forEach((kid, index) => {
    send(kid, 'out', index * 0.2);
  });
  timeline.addLabel('further', '+=0.25');
  further.forEach((node, index) => {
    send(node, 'further', index * 0.2);
  });
  timeline.addLabel('back', '+=0.9');
  further.forEach((node, index) => {
    report(node, 'back', index * 0.3);
  });
  timeline.addLabel('reports', '+=0.25');
  kids.forEach((kid, index) => {
    report(kid, 'reports', index * 0.4);
  });
  timeline.addLabel('wrap', '+=0.2');
  crossOver(timeline, parent, 'wrap');
  timeline.to({}, { duration: HOLD });
  return timeline;
}

/** One pasted line becomes a tool on the hub, and the hub sends it to every machine. */
function sync(root: HTMLElement): Timeline {
  const add = one(root, '[data-add]');
  const lamps = all(root, '[data-machine]').map((machine) => all(machine, '.lamp'));
  const pastes = (['skill', 'mcp', 'market'] as const).map((kind) => {
    const source = one(root, `[data-src="${kind}"]`);
    const from = source.getBoundingClientRect();
    return {
      // The field's label, the line itself and the button's word, for this kind of tool.
      field: all(root, `[data-step="${kind}"]`),
      letters: SplitText.create(one(root, `[data-line][data-step="${kind}"]`), { type: 'chars' })
        .chars,
      source,
      copies: all(root, `[data-dst="${kind}"]`).map((copy) => {
        const to = copy.getBoundingClientRect();
        return { copy, x: from.left - to.left, y: from.top - to.top };
      }),
    };
  });

  for (const paste of pastes) {
    gsap.set(paste.field, { opacity: 0 });
    gsap.set(paste.letters, { opacity: 0 });
    gsap.set(paste.source, { opacity: 0, y: 6, scale: 0.94 });
    for (const { copy, x, y } of paste.copies) gsap.set(copy, { x, y, opacity: 0, scale: 0.94 });
  }
  gsap.set(lamps.flat(), { opacity: 0.25 });

  const timeline = gsap.timeline({ defaults: { ease: OUT } });
  pastes.forEach((paste, index) => {
    const before = pastes[index - 1];
    if (before) timeline.to(before.field, { opacity: 0, duration: 0.15 }, '+=0.35');
    timeline
      .to(paste.field, { opacity: 1, duration: 0.2 }, index === 0 ? 0.4 : '>')
      .to(paste.letters, { opacity: 1, duration: 0.01, stagger: 0.022, ease: 'none' }, '<0.1')
      .to(add, { scale: 0.96, duration: 0.1 }, '+=0.25')
      .to(add, { scale: 1, duration: 0.2 })
      .to(paste.source, { opacity: 1, y: 0, scale: 1, duration: 0.3 }, '<')
      .to(
        paste.copies.map(({ copy }) => copy),
        { x: 0, y: 0, opacity: 1, scale: 1, duration: 0.6, ease: TRAVEL, stagger: 0.07 },
        '+=0.15',
      );
  });
  timeline.addLabel('lit', '+=0.1');
  lamps.forEach((lamp, index) => {
    timeline.to(lamp, { opacity: 1, duration: 0.3 }, `lit+=${(index * 0.09).toFixed(2)}`);
  });
  timeline.to({}, { duration: HOLD });
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
export const SCENE_STATES = ['is-calm', 'is-pending', 'is-hit'];
