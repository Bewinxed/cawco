#if DEBUG
import OSLog
import UIKit

/// A simulator pass's `-recall-probe` (scripts/probe-ios-recall.ts): once the
/// session's sent messages are read, the recall wheel's state, read off the
/// wheel itself, light and dark, every line in the Probe log as `recall …`:
///
/// - the pill's buttons (no history button), and VoiceOver's "Show what you
///   sent" on the field, invoked, bringing the wheel up;
/// - the grown shape's top against its reach (half the window on a phone,
///   40% at regular width, of the room above the keyboard while it is up);
/// - every row in view: its depth, lean, width, blur and opacity, which
///   only grow from the pick, the oldest at the depth's end;
/// - a search with a match;
/// - the display link's frame times through a 2s glide over the session's
///   200 sent messages, and the rows' own drawing cost in each frame;
/// - the older pages read as the wheel nears its oldest entry.
///
/// Captures (at rest, mid-glide, after the action, a search) go to the app's
/// temporary folder under `recall/`.
@MainActor
enum RecallProbe {
    private static var armed = ProcessInfo.processInfo.arguments.contains("-recall-probe")
    private static let log = Logger(subsystem: "dev.cawco.app", category: "Probe")

    static func arm(_ composer: ComposerView) {
        guard armed else { return }
        armed = false
        Task { await run(composer) }
    }

    private static func say(_ line: String) {
        log.notice("recall \(line, privacy: .public)")
    }

    private static func check(_ name: String, _ ok: Bool, _ detail: String) {
        say("\(ok ? "PASS" : "FAIL") \(name): \(detail)")
    }

    private static func wait(_ seconds: Double) async {
        try? await Task.sleep(for: .seconds(seconds))
    }

    private static func f(_ value: Double, _ places: Int = 2) -> String {
        String(format: "%.\(places)f", value)
    }

    private static func snap(_ window: UIWindow, _ dir: URL, _ name: String) {
        let image = UIGraphicsImageRenderer(bounds: window.bounds).image { _ in
            _ = window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
        }
        try? image.pngData()?.write(to: dir.appending(path: "\(name).png"))
        say("capture \(name).png")
    }

    private static func run(_ composer: ComposerView) async {
        // The transcript's newest page lands after the composer binds: wait for what it sent.
        for _ in 0 ..< 120 where composer.probeEntries.count < 20 || composer.window == nil {
            await wait(0.5)
        }
        guard let window = composer.window else { return say("FAIL probe: the composer has no window") }
        let entries = composer.probeEntries
        let regular = composer.traitCollection.horizontalSizeClass == .regular
        let device = window.traitCollection.userInterfaceIdiom == .pad ? "ipad" : "iphone"
        let dir = FileManager.default.temporaryDirectory.appending(path: "recall")
        try? FileManager.default.removeItem(at: dir)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        say("begin \(device) window \(f(window.bounds.width, 0))x\(f(window.bounds.height, 0)) \(regular ? "regular" : "compact") width, \(entries.count) sent")

        let buttons = composer.probeButtons
        check("no history button", buttons.count == 2 && !buttons.contains(ComposerView.recallAction),
              "the pill's buttons: \(buttons.joined(separator: " | "))")

        // A word of an older message, for the search.
        let word = entries.dropFirst(4).first.flatMap { entry in
            entry.text.split(separator: " ").map(String.init).first { $0.count >= 4 && $0.allSatisfy(\.isLetter) }
        } ?? "probe"

        for style in [UIUserInterfaceStyle.light, .dark] {
            let name = "\(device)-\(style == .dark ? "dark" : "light")"
            window.overrideUserInterfaceStyle = style
            composer.field.resignFirstResponder()
            await wait(1.0)

            // As a swipe brings it up: the keyboard left down.
            composer.probeOpenWheel()
            await wait(1.2)
            measure(composer, "\(name) keyboard down", regular: regular)
            snap(window, dir, "\(name)-rest")
            composer.wheel?.probeSpin(to: 14)
            await wait(0.14)
            snap(window, dir, "\(name)-glide")
            await wait(1.4)
            composer.wheel?.dismiss()
            await wait(0.6)

            // VoiceOver's way in: the field's custom action.
            let action = composer.field.accessibilityCustomActions?.first { $0.name == ComposerView.recallAction }
            check("\(name) the field carries \"\(ComposerView.recallAction)\"", action != nil,
                  "custom actions: \((composer.field.accessibilityCustomActions ?? []).map(\.name).joined(separator: " | "))")
            let acted = action.map { $0.actionHandler?($0) ?? false } ?? false
            await wait(1.8)
            check("\(name) the action brings the wheel up", acted && composer.wheel != nil, "handled \(acted), wheel up \(composer.wheel != nil)")
            if composer.wheel != nil {
                measure(composer, "\(name) after the action", regular: regular)
                snap(window, dir, "\(name)-action")
                composer.wheel?.dismiss()
            }
            composer.field.resignFirstResponder()
            await wait(1.0)

            // A search with a match, typed into the empty draft.
            composer.probeOpenWheel()
            await wait(1.0)
            _ = composer.wheel?.typed(word)
            await wait(0.8)
            if let wheel = composer.wheel {
                let state = wheel.probeState
                let line = state.rows.first { abs($0.off) < 0.01 }
                let held = composer.probeEntries.count
                check("\(name) a search for \"\(word)\" matches", state.matches > 0 && state.matches < held,
                      "\(state.matches) of \(held) sent; on the line: row \(line.map { "\($0.index)" } ?? "none")")
                snap(window, dir, "\(name)-search")
                wheel.dismiss()
            }
            await wait(0.6)
        }
        window.overrideUserInterfaceStyle = .unspecified
        await wait(0.6)
        await glide(composer, window: window, first: entries.count)
        say("done \(dir.path)")
    }

    /// The wheel as it stands: its top against the reach, and every row's
    /// depth, which must only grow from the pick and end at the depth.
    private static func measure(_ composer: ComposerView, _ label: String, regular: Bool) {
        guard let state = composer.wheel?.probeState else { return say("FAIL \(label): no wheel") }
        let target = state.floor * (1 - Recall.reach(regular: regular))
        say("\(label): top \(f(state.top, 1)) reach \(f(target, 1)) (floor \(f(state.floor, 0)) × \(f(1 - Recall.reach(regular: regular)))) open \(f(state.open)) rows above \(state.above) depth \(state.depth)")
        check("\(label) the shape's top reaches its reach", state.open == 1 && state.top <= target + Recall.row,
              "top \(f(state.top, 1)) ≤ \(f(target + Recall.row, 1)) (reach + one row)\(regular ? ", at least five rows: \(state.above)" : "")")
        let ghosts = state.rows.filter { $0.off > -0.01 }.sorted { $0.off < $1.off }
        for row in ghosts {
            say("\(label) row \(row.index) off \(f(row.off)) depth \(f(row.depth, 3)) lean \(f(row.depth * Recall.lean))° width \(f(1 - row.depth * Recall.shrink, 4)) blur \(f(row.blur, 3)) (shown \(f(row.softShown))) opacity \(f(row.alpha, 3))")
        }
        let above = ghosts.filter { $0.off > 0.5 }
        check("\(label) rows shown", above.count == state.above, "\(above.count) above the line, \(state.above) measured")
        let rising = zip(ghosts, ghosts.dropFirst()).allSatisfy { low, high in
            high.depth >= low.depth && high.blur >= low.blur && high.alpha <= low.alpha + 1e-6
        }
        check("\(label) depth only grows from the pick", rising, "lean, width, blur and opacity monotone over \(ghosts.count) rows")
        if let top = above.last {
            let deep = Double(state.depth)
            let ok = abs(top.depth - deep) < 1e-6 && abs(top.blur - deep * Recall.soft) < 1e-6 && abs(top.alpha - Recall.ghost(deep)) < 1e-3
            check("\(label) the oldest row ends at row \(state.depth)'s values", ok,
                  "lean \(f(top.depth * Recall.lean))° (want \(f(deep * Recall.lean))), width \(f(1 - top.depth * Recall.shrink, 4)) (want \(f(1 - deep * Recall.shrink, 4))), blur \(f(top.blur, 3)) (want \(f(deep * Recall.soft, 3))), opacity \(f(top.alpha, 3)) (want \(f(Recall.ghost(deep), 3)))")
        }
    }

    /// A 2s glide over what the session sent: out to the oldest entry held
    /// (again once the page before it lands) and back, with the display
    /// link's frame times and the rows' drawing cost in each frame; then
    /// rolled to the oldest until all 200 sent are in the wheel.
    /// `first` is how many the transcript's newest page held as the probe began.
    private static func glide(_ composer: ComposerView, window: UIWindow, first: Int) async {
        composer.field.resignFirstResponder()
        await wait(0.8)
        composer.probeOpenWheel()
        await wait(1.2)
        guard let wheel = composer.wheel else { return say("FAIL glide: no wheel") }
        let opened = wheel.probeState.matches - 1
        var costs: [(seconds: Double, built: Int, blurs: Int)] = []
        wheel.probeCost = { costs.append(($0, $1, $2)) }
        let clock = FrameClock()
        // Out to the oldest held, and again to the oldest once the pages before it land, then back.
        wheel.probeSpin(to: 10000)
        await wait(0.6)
        wheel.probeSpin(to: 10000)
        await wait(0.5)
        wheel.probeSpin(to: 2)
        await wait(0.9)
        let intervals = clock.stop()
        wheel.probeCost = nil
        for _ in 0 ..< 40 where wheel.probeState.matches - 1 < 200 {
            wheel.probeSpin(to: 10000)
            await wait(0.5)
        }
        let reached = wheel.probeState.matches - 1
        check("nearing the oldest entry, the page before it is read", first < 200 && reached >= 200,
              "the newest page held \(first) sent; the wheel had \(opened) when the glide began, and reached \(reached) rolling to its oldest")
        let fps = Double(window.windowScene?.screen.maximumFramesPerSecond ?? 60)
        let worst = intervals.max() ?? 0
        let dropped = intervals.filter { $0 > 1.5 / fps }.count
        let heaviest = costs.max { $0.seconds < $1.seconds }
        let cost = heaviest?.seconds ?? 0
        let mean = costs.isEmpty ? 0 : costs.map(\.seconds).reduce(0, +) / Double(costs.count)
        say("glide over \(opened)+ entries: \(intervals.count) frames at \(f(fps, 0)) fps, worst \(f(worst * 1000))ms, \(dropped) over 1.5 frames; rows drawn \(costs.count) times, worst \(f(cost * 1000))ms (\(heaviest?.built ?? 0) rows built, \(heaviest?.blurs ?? 0) blurs begun), mean \(f(mean * 1000, 3))ms, most rows built in a frame \(costs.map(\.built).max() ?? 0)")
        check("the rows' worst frame fits a 120Hz frame", cost < 1.0 / 120, "worst \(f(cost * 1000))ms against 8.33ms")
        check("glide holds its frames", worst < 0.0167 && dropped == 0, "worst frame \(f(worst * 1000))ms, \(dropped) dropped")
        wheel.dismiss()
    }
}

/// A display link that keeps the time between the frames it is called for.
@MainActor
private final class FrameClock: NSObject {
    private var link: CADisplayLink?
    private var last: CFTimeInterval = 0
    private var intervals: [Double] = []

    override init() {
        super.init()
        let link = CADisplayLink(target: self, selector: #selector(tick(_:)))
        link.add(to: .main, forMode: .common)
        self.link = link
    }

    @objc private func tick(_ link: CADisplayLink) {
        if last > 0 { intervals.append(link.timestamp - last) }
        last = link.timestamp
    }

    func stop() -> [Double] {
        link?.invalidate()
        link = nil
        return intervals
    }
}
#endif
