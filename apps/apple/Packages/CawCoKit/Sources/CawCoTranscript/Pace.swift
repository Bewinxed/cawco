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
                #if DEBUG
                turn = Parts()
                #endif
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
                #if DEBUG
                if probing {
                    measure(now, held: held)
                    if held >= seen { sayStretch(held) }
                }
                #endif
                guard held >= seen else { return }
                log.info("main thread held \(held * 1000, format: .fixed(precision: 0)) ms at a stretch, \(taken * 1000, format: .fixed(precision: 0)) ms of it in \(frames) transcript frames")
            }
        }
        CFRunLoopAddObserver(CFRunLoopGetMain(), wake, .commonModes)
        CFRunLoopAddObserver(CFRunLoopGetMain(), rest, .commonModes)
        #if DEBUG
        // A turn at least once a second, so the probe's totals are said even
        // when nothing else wakes the main thread.
        if probing { RunLoop.main.add(Timer(timeInterval: 1, repeats: true) { _ in }, forMode: .common) }
        #endif
        #if DEBUG && arch(arm64)
        MainSampler.start()
        #endif
    }

    /// The Markdown cache let sources go (BlockCache `sweep`).
    static func swept(_ session: String, held: Int, dropped: Int) {
        log.info("block cache of \(session.prefix(8), privacy: .public): \(held) sources held, \(dropped) let go")
    }

    /// Rows built since the last frame was counted.
    private static var built = 0

    /// A row was built: a cell set up for an item.
    static func row() { built += 1 }

    /// The parts a turn's time is told in, while a simulator pass measures
    /// (`-probe-pace`). `build`: a row set up for an item in a cell (RowStore
    /// `row`) outside the transcript's frame and `warm`; `measure`: a cell
    /// measuring its row (HostCell, not from a height held) outside them;
    /// `warm`: rows built ahead of the screen (RowStore `warm`, in the
    /// frame); `frameBuild`, `frameMeasure`: rows set up and measured inside
    /// the frame (an update applied), outside `warm`; `layout`: the list's
    /// layout preparing (its rows' places solved again), wherever it runs;
    /// `text`: a text view laying its whole text out to know its height
    /// (ProseView `intrinsicContentSize`), wherever it runs, inside the others.
    enum Part: Int, CaseIterable { case build, measure, warm, frameBuild, frameMeasure, layout, text }

    /// Runs `body`; while a simulator pass measures, its time is counted to `part`.
    static func time<T>(_ part: Part, _ body: () -> T) -> T {
        #if DEBUG
        return probeTime(part, body)
        #else
        return body()
        #endif
    }

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

#if DEBUG
/// A simulator pass's measures (probe-kit spec `ios-scroll-up`), kept only
/// when the app is launched with `-probe-pace`. Each is a running total
/// since launch, said once a second as `probe pace key=value …`, so the
/// pass reads what a stretch of its own took as the difference of two lines.
///
/// - Hitches while the list scrolls: the gap between the transcript's
///   display-link frames past one frame, wherever a frame came late (a
///   main-thread turn that ran past its vsync delays the next callback by
///   whole frames). Counted only between two frames that both scrolled.
/// - The main thread while a turn streams: its own CPU time
///   (`CLOCK_THREAD_CPUTIME_ID`, read on it) and its awake time, against the
///   wall clock, over every turn the transcript in view had a busy tail.
/// - Blank frames: turns whose committed screen showed a visible row blank
///   (TranscriptView `probeBlanks`, run here after Core Animation's commit).
extension Pace {
    static let probing = ProcessInfo.processInfo.arguments.contains("-probe-pace")
    /// Run after each turn's commit, on what the screen now shows.
    static var afterCommit: [@MainActor () -> Void] = []
    /// Whether the transcript in view has a busy tail (a turn streaming).
    static var streaming = false

    private struct Tally {
        var scroll = 0.0, hitch = 0.0, hitches = 0, ticks = 0
        /// The late frames a main-thread turn since the frame before ran past a frame for.
        var mainHitch = 0.0, mainHitches = 0
        var streamWall = 0.0, streamCPU = 0.0, streamAwake = 0.0
        var blankFrames = 0, blankRows = 0, checked = 0
        /// What the blank check itself took of the main thread (`afterCommit`).
        var checking = 0.0
        /// Exact heights checked against their views, how many drifted, and by how much at most.
        var heightsChecked = 0, drifts = 0
        var maxDrift = 0.0
        /// What turns took while the list scrolled, by part (`Part`).
        var spent = Parts()
    }

    /// Where a turn's time went, by part, with how many of each.
    struct Parts {
        var time = [Double](repeating: 0, count: Part.allCases.count)
        var count = [Int](repeating: 0, count: Part.allCases.count)
    }

    private static var tally = Tally()
    /// This turn's parts so far.
    fileprivate static var turn = Parts()
    /// A `warm` is running: what it builds is its own.
    private static var warming = false
    /// The transcript's frame is running (TranscriptView `frame`).
    static var inFrame = false
    /// The longest turn since the last display-link frame.
    private static var heldSinceTick = 0.0
    private static var scrollingNow = false
    private static var lastTick: CFTimeInterval = 0

    fileprivate static func probeTime<T>(_ part: Part, _ body: () -> T) -> T {
        guard probing, !warming || (part != .build && part != .measure) else { return body() }
        let slot: Part = switch part {
        case .build where inFrame: .frameBuild
        case .measure where inFrame: .frameMeasure
        default: part
        }
        let start = CACurrentMediaTime()
        if part == .warm { warming = true }
        defer {
            if part == .warm { warming = false }
            turn.time[slot.rawValue] += CACurrentMediaTime() - start
            turn.count[slot.rawValue] += 1
        }
        return body()
    }

    /// A turn held the main thread past `seen`: where its time went.
    fileprivate static func sayStretch(_ held: Double) {
        let p = turn
        func ms(_ part: Part) -> String {
            "\(String(format: "%.0f", p.time[part.rawValue] * 1000)) ms (\(p.count[part.rawValue]))"
        }
        let rest = held - taken - p.time[Part.build.rawValue] - p.time[Part.measure.rawValue]
        log.notice("probe stretch \(held * 1000, format: .fixed(precision: 0)) ms\(scrollingNow ? " scrolling" : "", privacy: .public): text laid out \(ms(.text), privacy: .public) inside what follows; transcript frames \(taken * 1000, format: .fixed(precision: 0)) ms (\(frames)) [warm \(ms(.warm), privacy: .public), build \(ms(.frameBuild), privacy: .public), measure \(ms(.frameMeasure), privacy: .public)]; outside them build \(ms(.build), privacy: .public), measure \(ms(.measure), privacy: .public); the rest \(rest * 1000, format: .fixed(precision: 0)) ms; layout preparing \(ms(.layout), privacy: .public) of all that")
    }
    private static var lastSeen = 0.0
    private static var lastCPU = 0.0
    private static var said = 0.0
    private static var blankThisTurn = false
    /// The display link ran since the screen was last checked.
    private static var framed = false

    /// The main thread's own CPU time, in seconds; read on it.
    private static func threadCPU() -> Double {
        var time = timespec()
        clock_gettime(CLOCK_THREAD_CPUTIME_ID, &time)
        return Double(time.tv_sec) + Double(time.tv_nsec) / 1e9
    }

    /// One frame of the transcript in view: `scrolling` while the reader drags or it coasts.
    static func tick(_ link: CADisplayLink, scrolling: Bool) {
        let held = heldSinceTick
        heldSinceTick = 0
        scrollingNow = scrolling
        framed = true
        #if arch(arm64)
        MainSampler.phase.store(scrolling ? 1 : streaming ? 2 : 0, ordering: .relaxed)
        #endif
        defer { lastTick = scrolling ? link.timestamp : 0 }
        guard probing, scrolling, lastTick > 0 else { return }
        let gap = link.timestamp - lastTick
        tally.scroll += gap
        tally.ticks += 1
        if gap > link.duration * 1.5 {
            tally.hitch += gap - link.duration
            tally.hitches += 1
            // Late because a turn of the main thread ran past a frame; else
            // the frame was late with the main thread free (the render side).
            if held > link.duration {
                tally.mainHitch += gap - link.duration
                tally.mainHitches += 1
            }
        }
    }

    /// A visible row was blank on the screen this turn; `fresh`: one not said before.
    static func blank(fresh: Bool) {
        blankThisTurn = true
        if fresh { tally.blankRows += 1 }
    }

    /// The screen of a turn was looked at for blank rows.
    static func checkedScreen() { tally.checked += 1 }

    /// What `part` has taken of this turn so far.
    static func turnTime(_ part: Part) -> Double { turn.time[part.rawValue] }

    /// Rows built ahead of the screen (RowStore `warm`), by row view: how
    /// many, how many were new views, and the time each step took in all:
    /// set up for the item, laid out at its width, measured, laid out at its height.
    private struct Warmed {
        var rows = 0, fresh = 0
        var steps = [0.0, 0.0, 0.0, 0.0]
    }

    private static var warmedKinds: [String: Warmed] = [:]
    private static var kindsSaid = 0.0
    /// Row views set up for an item: taken from the spares (RowStore `spare`), or made new.
    private static var fromSpare = 0
    private static var madeNew = 0

    static func madeRow(spare: Bool) {
        if spare { fromSpare += 1 } else { madeNew += 1 }
    }

    /// A row stood at its exact height was measured as its view lays out
    /// (RowStore `verify`): a difference over half a point is a drift.
    static func heightChecked(_ kind: String, id: String, exact: Double, real: Double) {
        tally.heightsChecked += 1
        let drift = abs(real - exact)
        tally.maxDrift = max(tally.maxDrift, drift)
        guard drift > 0.5 else { return }
        tally.drifts += 1
        guard tally.drifts <= 40 else { return }
        log.notice("probe height drift \(kind, privacy: .public) \(id, privacy: .public): worked out \(exact, format: .fixed(precision: 2)), laid out \(real, format: .fixed(precision: 2))")
    }

    /// One row built ahead: its view's type, whether it was a new view, and the time at each step's end.
    static func warmed(_ kind: String, fresh: Bool, marks: [Double]) {
        var entry = warmedKinds[kind, default: Warmed()]
        entry.rows += 1
        if fresh { entry.fresh += 1 }
        for i in 0 ..< 4 { entry.steps[i] += marks[i + 1] - marks[i] }
        warmedKinds[kind] = entry
    }

    /// The rows built ahead so far, by kind, said every five seconds.
    private static func sayKinds(_ now: Double) {
        guard now - kindsSaid >= 5, !warmedKinds.isEmpty else { return }
        kindsSaid = now
        let said = warmedKinds.sorted { $0.key < $1.key }.map { kind, w in
            let ms = w.steps.map { String(format: "%.0f", $0 * 1000) }.joined(separator: "/")
            return "\(kind) \(w.rows) rows (\(w.fresh) new) \(ms) ms"
        }.joined(separator: "; ")
        log.notice("probe warmed kinds (set up/laid out/measured/laid out again): \(said, privacy: .public); row views from spares \(fromSpare), made new \(madeNew)")
    }

    /// The end of one turn of the main thread, after Core Animation's commit.
    fileprivate static func measure(_ now: Double, held: Double) {
        let cpu = threadCPU()
        if lastSeen > 0, streaming {
            tally.streamWall += now - lastSeen
            tally.streamCPU += cpu - lastCPU
            tally.streamAwake += held
        }
        lastSeen = now
        heldSinceTick = max(heldSinceTick, held)
        if scrollingNow {
            for i in Part.allCases.indices {
                tally.spent.time[i] += turn.time[i]
                tally.spent.count[i] += turn.count[i]
            }
        }
        // Once a frame: after the commit of the turn the display link ran in.
        // Run after every turn, the check ran some 24 times a frame (a turn
        // for every touch, timer and source) and took a third of the main
        // thread while the list scrolled, after `held` was read: the late
        // frames it caused were counted as the main thread's being free.
        if framed {
            framed = false
            blankThisTurn = false
            let checking = CACurrentMediaTime()
            for check in afterCommit { check() }
            tally.checking += CACurrentMediaTime() - checking
            if blankThisTurn { tally.blankFrames += 1 }
        }
        sayKinds(now)
        if now - said >= 1 {
            said = now
            let t = tally
            let s = t.spent
            func ms(_ part: Part) -> String { String(format: "%.1f", s.time[part.rawValue] * 1000) }
            log.notice("probe pace scroll=\(t.scroll * 1000, format: .fixed(precision: 1)) hitch=\(t.hitch * 1000, format: .fixed(precision: 1)) hitches=\(t.hitches) mainHitch=\(t.mainHitch * 1000, format: .fixed(precision: 1)) mainHitches=\(t.mainHitches) ticks=\(t.ticks) streamWall=\(t.streamWall * 1000, format: .fixed(precision: 1)) streamCPU=\(t.streamCPU * 1000, format: .fixed(precision: 1)) streamAwake=\(t.streamAwake * 1000, format: .fixed(precision: 1)) blankFrames=\(t.blankFrames) blankRows=\(t.blankRows) checked=\(t.checked) checking=\(t.checking * 1000, format: .fixed(precision: 1)) heightsChecked=\(t.heightsChecked) drifts=\(t.drifts) maxDrift=\(t.maxDrift, format: .fixed(precision: 2)) build=\(ms(.build), privacy: .public) builds=\(s.count[Part.build.rawValue]) measure=\(ms(.measure), privacy: .public) measures=\(s.count[Part.measure.rawValue]) warm=\(ms(.warm), privacy: .public) frameBuild=\(ms(.frameBuild), privacy: .public) frameMeasure=\(ms(.frameMeasure), privacy: .public) layout=\(ms(.layout), privacy: .public) layouts=\(s.count[Part.layout.rawValue]) text=\(ms(.text), privacy: .public) texts=\(s.count[Part.text.rawValue])")
        }
        // The probe's own work is not the thread's: counted from here.
        lastCPU = threadCPU()
    }
}
#endif
