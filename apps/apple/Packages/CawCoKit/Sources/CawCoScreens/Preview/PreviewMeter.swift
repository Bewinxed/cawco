#if DEBUG
import Darwin
import Foundation
import OSLog
import Synchronization
import UIKit
import WebKit

/// `-preview-meter` (a simulator pass of a heavy preview): a `preview meter`
/// Probe line every 5 s, written off the main thread so a main thread that
/// has stopped still says so. It carries the app's own memory footprint,
/// each preview page's WebContent process (its pid and footprint, `gone`
/// once that process has died), and the longest the main thread took to
/// answer a 250 ms ping over the window, or how long it has gone unanswered.
///
/// `-preview-kill-content <s>`: `s` seconds after a page says it is ready,
/// its content process is killed (SIGKILL), as jetsam would, twice in a
/// launch: the first death and the reload after it, then the second.
enum PreviewMeter {
    static let on = ProcessInfo.processInfo.arguments.contains("-preview-meter")
    static let killAfter: Double? = {
        let arguments = ProcessInfo.processInfo.arguments
        guard let flag = arguments.firstIndex(of: "-preview-kill-content"), arguments.indices.contains(flag + 1) else { return nil }
        return Double(arguments[flag + 1])
    }()

    /// The pages measured; weak, so a released web view leaves the list.
    private static let webs = NSHashTable<WKWebView>.weakObjects()
    private static var kills = 0
    private static var killed: Set<Int32> = []
    private static var answers = 0
    private static let walked = NSHashTable<WKWebView>.weakObjects()

    static func watch(_ web: WKWebView) {
        guard on else { return }
        webs.add(web)
        Meter.shared.begin()
    }

    /// `-preview-scroll`: once ready, the page is scrolled a viewport a second to its foot and back up, again and again, so every section draws.
    static let scrolls = ProcessInfo.processInfo.arguments.contains("-preview-scroll")

    /// `-preview-try-again <s>`: `s` seconds after the stopped state shows, its Try again is pressed (its own action).
    static let tryAgainAfter: Double? = {
        let arguments = ProcessInfo.processInfo.arguments
        guard let flag = arguments.firstIndex(of: "-preview-try-again"), arguments.indices.contains(flag + 1) else { return nil }
        return Double(arguments[flag + 1])
    }()

    /// The stopped state is up: what VoiceOver reads in it, and Try again pressed when the run asks.
    static func stopped(_ state: UIView, tryAgain: UIButton) {
        var labels: [String] = []
        var views: [UIView] = [state]
        while let next = views.popLast() {
            if next.isAccessibilityElement, let label = next.accessibilityLabel, !label.isEmpty { labels.append(label) }
            views += next.subviews.reversed()
        }
        PreviewProbe.say("preview stopped reads \(labels.map { "\"\($0)\"" }.joined(separator: " | "))")
        guard let tryAgainAfter else { return }
        Task { @MainActor [weak tryAgain] in
            try? await Task.sleep(for: .seconds(tryAgainAfter))
            guard let tryAgain, tryAgain.window != nil, tryAgain.isEnabled else { return }
            PreviewProbe.say("preview probe presses Try again")
            tryAgain.sendActions(for: .primaryActionTriggered)
            PreviewProbe.say("preview try-again words=\(tryAgain.configuration?.attributedTitle.map { String($0.characters) } ?? "?") enabled=\(tryAgain.isEnabled)")
        }
    }

    /// The WebContent pid behind `web`: 0 before its first load and after
    /// its process ended (WebKit's own property, read in DEBUG only).
    static func pid(of web: WKWebView) -> Int32 { process(web, "_webProcessIdentifier") }

    /// The GPU process's pid, where a page's canvases are drawn; 0 when WebKit has none.
    private static func gpu(of web: WKWebView) -> Int32 { process(web, "_gpuProcessIdentifier") }

    private static func process(_ web: WKWebView, _ key: String) -> Int32 {
        guard web.responds(to: NSSelectorFromString(key)) else { return 0 }
        return (web.value(forKey: key) as? NSNumber)?.int32Value ?? 0
    }

    /// Main's answer to a ping, where the pages' pids are read: each page's content process, then the GPU process.
    static func pids() -> [Int32] {
        let all = webs.allObjects
        answers += 1
        if answers % 20 == 0 { all.forEach(pageStats) }
        return all.map(pid(of:)).filter { $0 > 0 } + Array(Set(all.map(gpu(of:)).filter { $0 > 0 })).map { -$0 }
    }

    /// The page's own state, from the engine: its elements, canvases and height.
    static func pageStats(_ web: WKWebView) {
        guard on else { return }
        web.evaluateJavaScript("[document.querySelectorAll('*').length, document.querySelectorAll('canvas').length, document.documentElement.scrollHeight, Math.round(scrollY)].join(',')") { value, error in
            PreviewProbe.say("preview page-stats elements,canvases,height,scrollY=\((value as? String) ?? error.map { "error \($0.localizedDescription)" } ?? "?")")
        }
    }

    /// `-preview-scroll`'s walk: a viewport down each second, back to the top at the foot.
    static func walk(_ web: WKWebView) {
        guard scrolls else { return }
        Task { @MainActor [weak web] in
            while web != nil {
                try? await Task.sleep(for: .seconds(1))
                web?.evaluateJavaScript("(() => { const foot = document.documentElement.scrollHeight - innerHeight; scrollTo(0, scrollY >= foot - 2 ? 0 : scrollY + innerHeight); return 0 })()", completionHandler: nil)
            }
        }
    }

    /// The page in `web` said it is ready: its content process dies `killAfter` seconds on, twice a launch.
    static func ready(_ web: WKWebView) {
        if scrolls, !walked.contains(web) {
            walked.add(web)
            walk(web)
        }
        guard let killAfter, kills < 2 else { return }
        Task { @MainActor [weak web] in
            try? await Task.sleep(for: .seconds(killAfter))
            // The page says it is ready more than once a document: each kill is of a process not killed yet.
            guard let web, kills < 2 else { return }
            let pid = pid(of: web)
            guard pid > 0, !killed.contains(pid) else { return }
            killed.insert(pid)
            kills += 1
            let result = Darwin.kill(pid, SIGKILL)
            PreviewProbe.say("preview killed content \(kills) pid=\(pid) result=\(result)")
        }
    }
}

/// The meter's own thread and what it has read.
private nonisolated final class Meter: Sendable {
    static let shared = Meter()

    private struct Readings {
        var started = false
        var pinged: ContinuousClock.Instant?
        var worst: Duration = .zero
        var pids: [Int32] = []
    }

    private let readings = Mutex(Readings())
    private static let log = Logger(subsystem: "dev.cawco.app", category: "Probe")

    func begin() {
        let first = readings.withLock { readings in
            defer { readings.started = true }
            return !readings.started
        }
        guard first else { return }
        let thread = Thread { [self] in run() }
        thread.name = "preview-meter"
        thread.start()
    }

    private func run() {
        var tick = 0
        while true {
            Thread.sleep(forTimeInterval: 0.25)
            tick += 1
            let now = ContinuousClock.now
            let ask = readings.withLock { readings in
                guard readings.pinged == nil else { return false }
                readings.pinged = now
                return true
            }
            if ask {
                Task { @MainActor [self] in
                    let pids = PreviewMeter.pids()
                    answered(pids, at: ContinuousClock.now)
                }
            }
            guard tick % 20 == 0 else { continue }
            let (worst, silent, pids) = readings.withLock { readings in
                defer { readings.worst = .zero }
                return (readings.worst, readings.pinged.map { now - $0 } ?? .zero, readings.pids)
            }
            // A negative pid is the GPU process's.
            let pages = pids.map { pid in
                let name = pid < 0 ? "gpu \(-pid)" : "\(pid)"
                return Self.footprint(abs(pid)).map { "\(name):\($0)MB" } ?? "\(name):gone"
            }
            Self.log.notice("preview meter app=\(Self.footprint(getpid()) ?? -1, privacy: .public)MB content=[\(pages.joined(separator: ","), privacy: .public)] mainWorst=\(Self.ms(worst), privacy: .public)ms mainSilent=\(Self.ms(silent), privacy: .public)ms")
        }
    }

    private func answered(_ pids: [Int32], at: ContinuousClock.Instant) {
        readings.withLock { readings in
            if let pinged = readings.pinged { readings.worst = max(readings.worst, at - pinged) }
            readings.pinged = nil
            readings.pids = pids
        }
    }

    private static func ms(_ duration: Duration) -> Int {
        Int(duration.components.seconds * 1000 + duration.components.attoseconds / 1_000_000_000_000_000)
    }

    /// A process's physical footprint in MB (`proc_pid_rusage`, rusage_info_v0's
    /// `ri_phys_footprint`, 72 bytes in); nil when the process is gone.
    private static func footprint(_ pid: Int32) -> Int? {
        typealias Rusage = @convention(c) (Int32, Int32, UnsafeMutableRawPointer) -> Int32
        guard let symbol = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "proc_pid_rusage") else { return nil }
        let rusage = unsafeBitCast(symbol, to: Rusage.self)
        let buffer = UnsafeMutableRawPointer.allocate(byteCount: 512, alignment: 8)
        defer { buffer.deallocate() }
        guard rusage(pid, 0, buffer) == 0 else { return nil }
        return Int(buffer.load(fromByteOffset: 72, as: UInt64.self) / 1_048_576)
    }
}
#endif
