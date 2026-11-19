/**
 * A Map whose every change names the key it moved, to whoever reads its
 * entries elsewhere (the board, board.ts): a keeper of what the database
 * does not hold (a held session, a machine's custody) cannot forget to say
 * it moved, because saying it is the write. A set of the entry already held
 * moves nothing.
 */
export class WatchedMap<Key, Value> extends Map<Key, Value> {
  readonly #listeners: ((key: Key) => void)[] = [];

  /** Hears each key that moves from here on. */
  hear(listener: (key: Key) => void): void {
    this.#listeners.push(listener);
  }

  #moved(key: Key): void {
    for (const listener of this.#listeners) {
      listener(key);
    }
  }

  override set(key: Key, value: Value): this {
    const held = super.has(key) && super.get(key) === value;
    super.set(key, value);
    if (!held) {
      this.#moved(key);
    }
    return this;
  }

  override delete(key: Key): boolean {
    const deleted = super.delete(key);
    if (deleted) {
      this.#moved(key);
    }
    return deleted;
  }

  override clear(): void {
    const keys = [...super.keys()];
    super.clear();
    for (const key of keys) {
      this.#moved(key);
    }
  }
}
