import OSLog
import QuartzCore

/// Says when the main thread was held long enough to be seen. A stretch is
/// one turn of the main run loop, from waking to waiting again: everything
/// that ran without the screen being able to move. The log names how long it
/// was and how much of it the transcript's frames took, so a held open reads
/// off `log stream` without a profiler.
@MainActor
enum Pace {
    private static let log = Logger(subsystem: "dev.cawco.app", category: "Transcript")
    private static var watching = false
    private static var woke = CACurrentMediaTime()
    /// What the transcript's frames have taken of this turn of the main thread.
    private(set) static var taken = 0.0
    private static var frames = 0

    /// A stretch this long is a dropped frame on every screen the app runs on.
    private static let seen = 0.05
    /// One frame at 60 a second: what a turn of the main thread has before it is late.
    private static let frame = 1.0 / 60
    /// Time run past a frame since `told`, and the transcript's frames in those turns.
    private static var over = 0.0
    private static var overIn = 0.0
    private static var told = CACurrentMediaTime()

    static func watch() {
        guard !watching else { return }
        watching = true
        woke = CACurrentMediaTime()
        let wake = CFRunLoopObserverCreateWithHandler(nil, CFRunLoopActivity.afterWaiting.rawValue, true, .min) { _, _ in
            MainActor.assumeIsolated {
                woke = CACurrentMediaTime()
                taken = 0
                frames = 0
            }
        }
        // After Core Animation's own commit, which lays out what the turn changed.
        let rest = CFRunLoopObserverCreateWithHandler(nil, CFRunLoopActivity.beforeWaiting.rawValue, true, .max) { _, _ in
            MainActor.assumeIsolated {
                let now = CACurrentMediaTime()
                let held = now - woke
                // The hitch time: what each turn ran past one frame, summed and
                // said once a second while there is any (ms of hitch a second).
                if held > frame { over += held - frame; overIn += taken }
                if now - told >= 1 {
                    if over > 0 {
                        log.info("main thread over a frame by \(over * 1000, format: .fixed(precision: 1)) ms in \((now - told) * 1000, format: .fixed(precision: 0)) ms, transcript frames \(overIn * 1000, format: .fixed(precision: 1)) ms of those turns")
                    }
                    told = now
                    over = 0
                    overIn = 0
                }
                guard held >= seen else { return }
                log.info("main thread held \(held * 1000, format: .fixed(precision: 0)) ms at a stretch, \(taken * 1000, format: .fixed(precision: 0)) ms of it in \(frames) transcript frames")
            }
        }
        CFRunLoopAddObserver(CFRunLoopGetMain(), wake, .commonModes)
        CFRunLoopAddObserver(CFRunLoopGetMain(), rest, .commonModes)
    }

    /// Rows built since the last frame was counted.
    private static var built = 0

    /// A row was built: a cell set up for an item.
    static func row() { built += 1 }

    /// One transcript frame's cost, counted into the stretch it ran in.
    static func spent(_ seconds: Double, in session: String, items: Int, cells: Int) {
        taken += seconds
        frames += 1
        let rows = built
        built = 0
        guard seconds >= 0.02 else { return }
        log.info("frame of \(session.prefix(8), privacy: .public) took \(seconds * 1000, format: .fixed(precision: 0)) ms: \(items) items, \(rows) rows built, \(cells) on screen")
    }
}
