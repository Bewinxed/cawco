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
/// - every row's contrast as drawn: a capture of the window, and in each
///   row's words and time the strongest ink pixel against the shape's
///   surface, 4.5:1 at least; and the topmost row drawn again over a range
///   of blurs (the sweep), for the blur its depth can carry;
/// - every soft row showing its blurred copy the moment a roll settles,
///   and again after the appearance changes while the wheel is up;
/// - a search with a match: the row on the line stopping short of the
///   query chip, the rows above it across the shape;
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
            await settled(composer, "\(name) opening")
            await wait(1.0)
            measure(composer, "\(name) keyboard down", regular: regular)
            snap(window, dir, "\(name)-rest")
            composer.wheel?.probeSpin(to: 14)
            await wait(0.14)
            snap(window, dir, "\(name)-glide")
            await settled(composer, "\(name) a roll to row 14")
            await wait(0.4)
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
                widths(state, window, "\(name) search")
                measure(composer, "\(name) search", regular: regular, search: true)
                snap(window, dir, "\(name)-search")
                wheel.dismiss()
            }
            await wait(0.6)
        }
        // The appearance changing while it is up: no row keeps a copy blurred in the other's inks.
        window.overrideUserInterfaceStyle = .light
        await wait(0.6)
        composer.probeOpenWheel()
        await settled(composer, "\(device) light, before the switch")
        await wait(0.6)
        window.overrideUserInterfaceStyle = .dark
        await wait(0.6)
        measure(composer, "\(device) switched to dark while up", regular: regular)
        composer.wheel?.dismiss()
        window.overrideUserInterfaceStyle = .unspecified
        await wait(0.6)
        await glide(composer, window: window, first: entries.count)
        say("done \(dir.path)")
    }

    /// The wheel as it stands: its top against the reach, every row's
    /// depth, which must only grow from the pick and end at the depth, and
    /// every row's contrast as the screen draws it.
    private static func measure(_ composer: ComposerView, _ label: String, regular: Bool, search: Bool = false) {
        guard let state = composer.wheel?.probeState, let window = composer.window else { return say("FAIL \(label): no wheel") }
        if !search {
            let target = state.floor * (1 - Recall.reach(regular: regular))
            let height = Double(window.bounds.height)
            say("\(label): top \(f(state.top, 1)) reach \(f(target, 1)) (floor \(f(state.floor, 0)) × \(f(1 - Recall.reach(regular: regular)))) open \(f(state.open)) rows above \(state.above) depth \(state.depth)")
            // The reach is a share of the room up from the foot: the window's bottom, or the keyboard's top.
            say("\(label) height: the shape's top stands \(f(state.floor - state.top, 0))pt up from the foot, \(f((state.floor - state.top) / state.floor * 100, 1))% of the room (want \(f(Recall.reach(regular: regular) * 100, 0))%), \(f((height - state.top) / height * 100, 1))% of the window up from its bottom; the top is \(f(state.top / height * 100, 1))% of the way down")
            check("\(label) the shape's top reaches its reach", state.open == 1 && state.top <= target + Recall.row && state.top >= target - Recall.row,
                  "top \(f(state.top, 1)) within one row of \(f(target, 1))\(regular ? ", at least five rows: \(state.above)" : "")")
        }
        let ghosts = state.rows.filter { $0.off > -0.01 }.sorted { $0.off < $1.off }
        let dark = composer.traitCollection.userInterfaceStyle == .dark
        let drawn = asDrawn(window, ghosts)
        var weakest = (ratio: Double.infinity, what: "")
        for row in ghosts {
            let contrasts = drawn[row.index] ?? []
            for (name, ratio) in contrasts where ratio < weakest.ratio {
                weakest = (ratio, "row \(row.index) \(name)")
            }
            say("\(label) row \(row.index) off \(f(row.off)) depth \(f(row.depth, 3)) lean \(f(row.depth * Recall.lean))° width \(f(1 - row.depth * Recall.shrink, 4)) blur \(f(row.blur, 3)) (shown \(f(row.softShown))) opacity \(f(row.alpha, 3)) drawn \(contrasts.map { "\($0.0) \(f($0.1))" }.joined(separator: ", "))")
        }
        check("\(label) every row holds 4.5:1 as drawn", weakest.ratio >= 4.5 && !ghosts.isEmpty,
              "the weakest: \(weakest.what) at \(f(weakest.ratio)):1 (\(dark ? "dark" : "light")), its strongest ink pixel against the shape's surface in a capture of the window")
        let pending = ghosts.filter(\.pending).map(\.index)
        check("\(label) every soft row shows its blurred copy", pending.isEmpty, pending.isEmpty ? "all \(ghosts.count) rows" : "pending: rows \(pending)")
        if let top = ghosts.last { sweep(top, label) }
        let rising = zip(ghosts, ghosts.dropFirst()).allSatisfy { low, high in
            high.depth >= low.depth && high.blur >= low.blur && high.alpha <= low.alpha + 1e-6
        }
        check("\(label) depth only grows from the pick", rising, "lean, width, blur and opacity monotone over \(ghosts.count) rows")
        // A search shows only its matches, in a shape only as tall as they need.
        guard !search else { return }
        let above = ghosts.filter { $0.off > 0.5 }
        check("\(label) rows shown", above.count == state.above, "\(above.count) above the line, \(state.above) measured")
        if let top = above.last {
            let deep = Double(state.depth)
            // The web's topmost row: 94% at regular width, 95.5% on a phone.
            let faintest = regular ? 0.94 : 0.955
            let ok = abs(top.depth - deep) < 1e-6 && abs(top.blur - deep * Recall.soft) < 1e-6 && abs(top.alpha - faintest) < 1e-3
            check("\(label) the oldest row ends at row \(state.depth)'s values", ok,
                  "lean \(f(top.depth * Recall.lean))° (want \(f(deep * Recall.lean))), width \(f(1 - top.depth * Recall.shrink, 4)) (want \(f(1 - deep * Recall.shrink, 4))), blur \(f(top.blur, 3)) (want \(f(deep * Recall.soft, 3))), opacity \(f(top.alpha, 3)) (want \(f(faintest, 3)))")
        }
    }

    /// Waits a frame at a time for the roll to stand still, then: every
    /// soft row's blurred copy already shows, the moment it does.
    private static func settled(_ composer: ComposerView, _ label: String) async {
        for _ in 0 ..< 600 where composer.wheel?.probeRolling ?? false {
            try? await Task.sleep(for: .milliseconds(4))
        }
        guard let state = composer.wheel?.probeState else { return say("FAIL \(label): no wheel") }
        let pending = state.rows.filter { $0.off > -0.01 && $0.pending }.map(\.index)
        let soft = state.rows.filter { $0.off > -0.01 && $0.blur > 0 }.count
        check("\(label): every soft row's blurred copy shows as the roll settles", pending.isEmpty,
              pending.isEmpty ? "\(soft) soft rows, all showing their copies" : "\(pending.count) of \(soft) soft rows still sharp: \(pending)")
    }

    /// A search's rows: the one on the line stops a step short of the query
    /// chip, and every row above it is the shape's width less the pill's
    /// padding on each side (before its lean narrows it).
    private static func widths(_ state: RecallProbeState, _ window: UIWindow, _ label: String) {
        guard let chip = state.chip else { return say("FAIL \(label): no query chip") }
        let inner = state.shape.width - 2 * state.pad
        for row in state.rows where row.off > -0.01 {
            let drawn = row.view.layer.convert(row.view.bounds, to: window.layer)
            say("\(label) row \(row.index) off \(f(row.off)): \(f(row.view.bounds.width, 1))pt wide, drawn \(f(drawn.minX, 1))…\(f(drawn.maxX, 1)) of the shape's \(f(state.shape.minX, 1))…\(f(state.shape.maxX, 1)) (\(f(drawn.width / state.shape.width * 100, 1))%), chip from \(f(chip.minX, 1))")
        }
        if let line = state.rows.first(where: { abs($0.off) < 0.01 }) {
            let right = line.view.layer.convert(line.view.bounds, to: window.layer).maxX
            check("\(label) the row on the line stops short of the chip", right <= chip.minX && chip.minX - right <= 12,
                  "its right edge \(f(right, 1)), the chip's left \(f(chip.minX, 1))")
        }
        let above = state.rows.filter { $0.off > 0.99 }
        let short = above.filter { abs($0.view.bounds.width - inner) > 0.5 }
        check("\(label) the rows above the line are the shape's width", !above.isEmpty && short.isEmpty,
              "\(above.count) rows, \(short.isEmpty ? "each" : "rows \(short.map(\.index)) not") \(f(inner, 1))pt (the shape's \(f(state.shape.width, 1)) less \(f(state.pad, 1)) each side)")
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

extension RecallProbe {
    /// Every row's words and time as the screen composites them (lean,
    /// shrink, blurred copy, opacity, the shape under them): a capture of
    /// the window, and in each box the WCAG ratio of its strongest ink
    /// pixel against the surface it stands on (the box's commonest pixel).
    static func asDrawn(_ window: UIWindow, _ rows: [RecallProbeState.Row]) -> [Int: [(String, Double)]] {
        let format = UIGraphicsImageRendererFormat()
        format.preferredRange = .standard
        format.scale = window.screen.scale
        let image = UIGraphicsImageRenderer(bounds: window.bounds, format: format).image { _ in
            _ = window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
        }
        guard let cg = image.cgImage, let pixels = Pixels(cg) else { return [:] }
        let scale = Double(format.scale)
        var found: [Int: [(String, Double)]] = [:]
        for row in rows {
            found[row.index] = row.view.probeBoxes.map { name, box in
                let shown = row.view.layer.convert(box, to: window.layer)
                return (name, pixels.contrast(in: shown, scale: scale, surface: nil))
            }
        }
        return found
    }

    /// The topmost row's words and time drawn again at its opacity over the
    /// shape's surface, blurred by each of a range of blurs as its copy is:
    /// the blur its depth can carry and still hold 4.5:1.
    static func sweep(_ row: RecallProbeState.Row, _ label: String) {
        let view = row.view
        let sharp = view.probeSharp()
        let surface = Palette.surfaceRaised.resolvedColor(with: view.traitCollection)
        let scale = Double(sharp.scale)
        let pad = RecallRow.pad
        var lines: [String] = []
        for blur in [0, 0.1, 0.15, 0.2, 0.25, 0.3, 0.45, 0.9, 1.5] {
            guard let image = blur == 0 ? sharp : RecallRow.blurred(sharp, radius: Float(blur * scale)), let cg = image.cgImage,
                  let pixels = Pixels(cg, over: surface, alpha: row.alpha) else { continue }
            let ratios = view.probeBoxes.map { name, box in
                "\(name) \(f(pixels.contrast(in: box.offsetBy(dx: pad, dy: pad), scale: scale, surface: pixels.corner)))"
            }
            lines.append("\(f(blur))pt \(ratios.joined(separator: " "))")
        }
        say("\(label) sweep row \(row.index) at \(f(row.alpha, 3)): \(lines.joined(separator: " | "))")
    }
}

/// An image's pixels, 8-bit sRGB, as the screen shows them.
struct Pixels {
    let width: Int
    let height: Int
    private let bytes: [UInt8]

    /// `image`, or `image` at `alpha` over `surface`.
    init?(_ image: CGImage, over surface: UIColor? = nil, alpha: Double = 1) {
        let width = image.width, height = image.height
        self.width = width
        self.height = height
        var bytes = [UInt8](repeating: 0, count: width * height * 4)
        let drawn = bytes.withUnsafeMutableBytes { buffer -> Bool in
            guard let space = CGColorSpace(name: CGColorSpace.sRGB),
                  let context = CGContext(data: buffer.baseAddress, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
                                          space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
            let box = CGRect(x: 0, y: 0, width: width, height: height)
            if let surface {
                context.setFillColor(surface.cgColor)
                context.fill(box)
            }
            context.setAlpha(alpha)
            context.draw(image, in: box)
            return true
        }
        guard drawn else { return nil }
        self.bytes = bytes
    }

    private func at(_ x: Int, _ y: Int) -> UInt32 {
        let i = (y * width + x) * 4
        return UInt32(bytes[i]) << 16 | UInt32(bytes[i + 1]) << 8 | UInt32(bytes[i + 2])
    }

    /// The top left pixel.
    var corner: UInt32 { at(0, 0) }

    /// The WCAG ratio of the pixel in `rect` (points, top-left origin)
    /// furthest from `surface`, or from the rect's commonest pixel.
    func contrast(in rect: CGRect, scale: Double, surface: UInt32?) -> Double {
        let x0 = max(0, Int((rect.minX * scale).rounded(.down))), x1 = min(width, Int((rect.maxX * scale).rounded(.up)))
        let y0 = max(0, Int((rect.minY * scale).rounded(.down))), y1 = min(height, Int((rect.maxY * scale).rounded(.up)))
        guard x1 > x0, y1 > y0 else { return 0 }
        var ground = surface ?? 0
        if surface == nil {
            var counts: [UInt32: Int] = [:]
            for y in y0 ..< y1 { for x in x0 ..< x1 { counts[at(x, y), default: 0] += 1 } }
            ground = counts.max { $0.value < $1.value }?.key ?? 0
        }
        let base = Self.luminance(ground)
        var best = 1.0
        for y in y0 ..< y1 {
            for x in x0 ..< x1 {
                let l = Self.luminance(at(x, y))
                best = max(best, (max(l, base) + 0.05) / (min(l, base) + 0.05))
            }
        }
        return best
    }

    private static let linear: [Double] = (0 ..< 256).map {
        let v = Double($0) / 255
        return v <= 0.04045 ? v / 12.92 : pow((v + 0.055) / 1.055, 2.4)
    }

    static func luminance(_ rgb: UInt32) -> Double {
        0.2126 * linear[Int(rgb >> 16 & 255)] + 0.7152 * linear[Int(rgb >> 8 & 255)] + 0.0722 * linear[Int(rgb & 255)]
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
