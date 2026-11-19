// The views thread reads on a connection of its own: left alone.
declare const db: {
  select: () => { from: (t: object) => { all: () => unknown[] } };
};
declare const instances: object;
export const all = db.select().from(instances).all();
