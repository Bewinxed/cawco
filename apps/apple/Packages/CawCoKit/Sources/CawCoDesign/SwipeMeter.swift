import OSLog
import QuartzCore
import UIKit

/// What a page swipe cost the main thread, from its first movement to its
/// landing: each turn of the main run loop it spanned, from waking to waiting
/// again, and how far each ran past one frame of the screen (the hitch time).
/// One line a swipe in the `Paging` log, and a `swipe` signpost interval for
/// Instruments.
@MainActor
enum SwipeMeter {
    private static let log = Logger(subsystem: "dev.cawco.app", category: "Paging")
    private static let signposter = OSSignposter(subsystem: "dev.cawco.app", category: "Paging")
    private static var installed = false
    private static var woke = CACurrentMediaTime()
    private static var swipe: (name: String, began: Double, frame: Double, interval: OSSignpostIntervalState)?
    private static var turns = 0
    private static var busy = 0.0
    private static var over = 0.0
    private static var longest = 0.0

    static func begin(_ name: String, frame: Double) {
        install()
        if let landed { report(page: landed) }
        if let swipe { signposter.endInterval("swipe", swipe.interval) }
        swipe = (name, CACurrentMediaTime(), frame, signposter.beginInterval("swipe", "\(name, privacy: .public)"))
        turns = 0
        busy = 0
        over = 0
        longest = 0
    }

    /// The swipe landed: it is counted to the end of the turn it landed in,
    /// which draws the landing.
    static func end(page: Int) {
        guard swipe != nil else { return }
        landed = page
    }

    private static var landed: Int?

    private static func report(page: Int) {
        guard let swipe else { return }
        self.swipe = nil
        landed = nil
        signposter.endInterval("swipe", swipe.interval)
        let span = max(0.001, CACurrentMediaTime() - swipe.began)
        log.info("swipe \(swipe.name, privacy: .public) to page \(page): \(turns) turns over \(span * 1000, format: .fixed(precision: 0)) ms, main thread \(busy * 1000, format: .fixed(precision: 1)) ms, hitch \(over * 1000, format: .fixed(precision: 1)) ms (\(over * 1000 / span, format: .fixed(precision: 1)) ms/s), longest turn \(longest * 1000, format: .fixed(precision: 1)) ms")
    }

    private static func install() {
        guard !installed else { return }
        installed = true
        let wake = CFRunLoopObserverCreateWithHandler(nil, CFRunLoopActivity.afterWaiting.rawValue, true, .min) { _, _ in
            MainActor.assumeIsolated { woke = CACurrentMediaTime() }
        }
        // After Core Animation's own commit, which lays out what the turn changed.
        let rest = CFRunLoopObserverCreateWithHandler(nil, CFRunLoopActivity.beforeWaiting.rawValue, true, .max) { _, _ in
            MainActor.assumeIsolated {
                guard let swipe else { return }
                let held = CACurrentMediaTime() - woke
                turns += 1
                busy += held
                longest = max(longest, held)
                if held > swipe.frame { over += held - swipe.frame }
                if let landed { report(page: landed) }
            }
        }
        CFRunLoopAddObserver(CFRunLoopGetMain(), wake, .commonModes)
        CFRunLoopAddObserver(CFRunLoopGetMain(), rest, .commonModes)
    }
}
