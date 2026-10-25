/** The types of state-switcher.js, for the previews built from TypeScript (address). */

export interface SwitcherState {
  readonly value: string;
  readonly label: string;
}

export interface SwitcherGroup {
  readonly key: string;
  readonly label: string;
  readonly states: readonly SwitcherState[];
  /** Axes: the state this group opens on when the URL names none. */
  readonly initial?: string;
  /** Axes: the axis this group's states set, where several groups share one (its key by default). */
  readonly axis?: string;
}

export type Axes = Record<string, string>;

interface Common {
  /** The stage's production width, px. */
  width: number;
  label?: string;
  stage?: Node[];
  host?: HTMLElement;
}

export interface SwitcherHandle<S> {
  state: S;
  /** Whether the address named a state when the page opened. */
  readonly named: boolean;
  readonly stage: HTMLDivElement;
  set(next: S extends string ? string : Partial<S>): void;
  refresh(): void;
}

export function mountStateSwitcher(
  options: Common & {
    axes: true;
    groups: readonly SwitcherGroup[] | ((state: Axes) => readonly SwitcherGroup[]);
    resolve?: (next: Axes, key: string, previous: Axes) => Axes;
    onchange?: (state: Axes, previous: Axes) => void;
  }
): SwitcherHandle<Axes>;
export function mountStateSwitcher(
  options: Common & {
    axes?: false;
    initial?: string;
    groups: readonly SwitcherGroup[] | ((state: string) => readonly SwitcherGroup[]);
    onchange?: (state: string, previous: string) => void;
  }
): SwitcherHandle<string>;
