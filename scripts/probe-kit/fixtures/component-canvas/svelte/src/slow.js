// A states file's helper that takes its time, as a screen's first transform does: its section waits on it.
await new Promise((done) => setTimeout(done, 4000));
