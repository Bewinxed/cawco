/**
 * The presses the card's flows make on its live instance (the stage's
 * `play`): each finds its control by role and name, presses it or types
 * into it, and waits as long as the mock hub takes to answer.
 */
interface Play {
  canvas: {
    getByRole: (role: string, options: { name: RegExp }) => HTMLElement;
  };
  userEvent: {
    click: (element: Element) => Promise<void>;
    type: (element: Element, text: string) => Promise<void>;
    wait: (ms: number) => Promise<void>;
  };
}

/** One press: the control's role and name, what to type into it, and how long to wait after. */
export interface Press {
  after: number;
  name: RegExp;
  role: string;
  /** Typed into the control in place of a press. */
  text?: string;
}

/** Each press in order, the last one's wait included. */
export const presses =
  (...steps: Press[]) =>
  async ({ canvas, userEvent }: Play): Promise<void> => {
    for (const { role, name, text, after } of steps) {
      const control = canvas.getByRole(role, { name });
      if (text === undefined) {
        await userEvent.click(control);
      } else {
        await userEvent.type(control, text);
      }
      await userEvent.wait(after);
    }
  };

/** No press: the hub's answer to what the card read as it opened, waited for. */
export const settles =
  (ms: number) =>
  async ({ userEvent }: Pick<Play, "userEvent">): Promise<void> => {
    await userEvent.wait(ms);
  };

/** The hub set to refuse every change (the `answer` dial), then each press in order. */
export const refused =
  (...steps: Press[]) =>
  async (
    play: Play & { update: (args: Record<string, unknown>) => unknown }
  ): Promise<void> => {
    await play.update({ answer: "refuse" });
    await presses(...steps)(play);
  };

/** The card's first reads answered (the stand-in's wait), then each press in order. */
export const afterReads =
  (...steps: Press[]) =>
  async (play: Play): Promise<void> => {
    await play.userEvent.wait(1300);
    await presses(...steps)(play);
  };
