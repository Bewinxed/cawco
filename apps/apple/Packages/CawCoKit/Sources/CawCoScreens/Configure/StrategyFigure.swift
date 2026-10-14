import CawCoCore
import CawCoDesign
import UIKit

// The strategy figures (accounts/figure.ts, StrategyFigure.svelte): each
// account a lane, sessions riding in from the left and docking in the lane
// the strategy picks, the lane's bar filling as they use it. One looping
// timeline per figure, built from the web's storyboards in seconds: each
// track is one property of one layer over the loop, evaluated here on its
// keys' curves and played by Core Animation as a looping keyframe animation.
// The last frame holds, then the figure fades through to its first. A figure
// that is not playing shows its last frame and caption, which is also all it
// ever shows with reduced motion. The lanes' clocks and fills illustrate a
// strategy; they are nobody's readings.

enum FigureBoard: String {
    case pinned, fill, spread, soonest, limit

    /// The board a strategy's card plays (model.svelte.ts `STRATEGIES`).
    init(strategy: String) {
        switch strategy {
        case "pinned": self = .pinned
        case "spread": self = .spread
        case "soonest-reset": self = .soonest
        default: self = .fill
        }
    }

    /// Its lane pitch: the at-the-limit board has a tag line under each dock row.
    var pitch: Double { self == .limit ? 56 : 40 }

    /// Whether it writes a caption under its lanes: Pinned only where the
    /// provider has limits to reach, Fill first and Spread never.
    func captioned(limits: Bool) -> Bool {
        switch self {
        case .pinned: limits
        case .soonest, .limit: true
        case .fill, .spread: false
        }
    }

    /// The stage's height for `lanes` lanes and a caption of `lines` lines.
    func height(lanes: Int, lines: Int) -> Double {
        Figure.pad + Double(lanes) * pitch + (lines > 0 ? Figure.capGap + Double(lines) * Figure.capLine + Figure.capFoot : 0)
    }
}

/// One lane: an account's name and colour (an `account-<hue>` token).
struct FigureLane: Equatable {
    let name: String
    let hue: String
}

/// The at-limit numbers the limit board is driven by.
struct FigurePolicy: Equatable {
    var wait: Int
    var under: Int
    var at: Int
}

// MARK: Timeline

/// A key's curve into the next key: `linear`, CSS's `ease-out` keyword, and
/// the house `--ease-out` and `--ease-figure`.
enum FigureCurve {
    case linear, cssEaseOut, easeOut, figure

    private static let css = TimingCurve(x1: 0, y1: 0, x2: 0.58, y2: 1)

    func value(_ p: Double) -> Double {
        switch self {
        case .linear: p
        case .cssEaseOut: Self.css.value(at: p)
        case .easeOut: Motion.easeOut.value(at: p)
        case .figure: Motion.easeFigure.value(at: p)
        }
    }
}

/// One property (or a few drawn from one value) of one layer over the
/// figure's time (figure.ts `Track`). A value is a vector of numbers;
/// `apply` turns one into the layer's key paths and their values.
final class FigureTrack {
    struct Key {
        var t: Double
        var v: [Double]
        var e: FigureCurve
    }

    let layer: CALayer
    let apply: ([Double]) -> [(String, Any)]
    private(set) var keys: [Key]

    init(_ layer: CALayer, _ v0: [Double], apply: @escaping ([Double]) -> [(String, Any)]) {
        self.layer = layer
        self.apply = apply
        keys = [Key(t: 0, v: v0, e: .linear)]
    }

    private var last: Key { keys[keys.count - 1] }

    /// From `at`, move to `v` over `d` seconds on `e`.
    @discardableResult
    func to(_ at: Double, _ v: [Double], _ d: Double = 0.5, _ e: FigureCurve = .figure) -> FigureTrack {
        let held = last
        let t = max(at, held.t)
        if t > held.t {
            keys.append(Key(t: t, v: held.v, e: e))
        } else {
            keys[keys.count - 1].e = e
        }
        keys.append(Key(t: t + max(d, 0.001), v: v, e: .linear))
        return self
    }

    @discardableResult
    func set(_ t: Double, _ v: [Double]) -> FigureTrack {
        to(t, v, 0.001, .linear)
    }

    /// The value the last key at or before `t` holds: the still frame's.
    func held(_ t: Double) -> [Double] {
        var v = keys[0].v
        for key in keys where key.t <= t + 1e-6 {
            v = key.v
        }
        return v
    }

    /// The value at `t`, between its keys on the earlier key's curve.
    func value(_ t: Double) -> [Double] {
        guard let next = keys.firstIndex(where: { $0.t > t }) else { return last.v }
        guard next > 0 else { return keys[0].v }
        let from = keys[next - 1]
        let to = keys[next]
        let p = from.e.value((t - from.t) / (to.t - from.t))
        return zip(from.v, to.v).map { $0 + ($1 - $0) * p }
    }
}

/// The figure's whole loop: its tracks, and the words that change with time
/// (figure.ts `Timeline`).
final class FigureTimeline: NSObject {
    private(set) var tracks: [FigureTrack] = []
    private var texts: [(label: UILabel, words: (Double) -> String)] = []
    /// The last frame's time, the seam's start, the loop's length (seconds).
    var end = 0.0
    var seamAt = 0.0
    var length = 1.0
    private var link: CADisplayLink?
    private var started: CFTimeInterval = 0
    private var from = 0.0
    private(set) var playing = false

    func track(_ layer: CALayer, _ v0: [Double], apply: @escaping ([Double]) -> [(String, Any)]) -> FigureTrack {
        let track = FigureTrack(layer, v0, apply: apply)
        tracks.append(track)
        return track
    }

    func text(_ label: UILabel, _ words: @escaping (Double) -> String) {
        texts.append((label, words))
    }

    /// Shows the last frame, standing still.
    func rest() {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        for track in tracks {
            for (path, value) in track.apply(track.held(end)) {
                track.layer.setValue(value, forKeyPath: path)
            }
        }
        CATransaction.commit()
        words(end)
    }

    private func words(_ t: Double) {
        for text in texts {
            let said = text.words(t)
            if text.label.text != said { text.label.text = said }
        }
    }

    /// Plays from `at` seconds, or from just before the last frame's hold.
    func play(from at: Double? = nil) {
        guard !playing else { return }
        playing = true
        from = at ?? (seamAt - 0.2)
        started = CACurrentMediaTime()
        // A sample each 1/60 s: the curves are the storyboard's, evaluated here.
        let samples = max(2, Int((length * 60).rounded(.up)) + 1)
        let times = (0 ..< samples).map { Double($0) / Double(samples - 1) }
        for track in tracks {
            let frames = times.map { track.apply(track.value($0 * length)) }
            guard let first = frames.first else { continue }
            for (index, (path, _)) in first.enumerated() {
                let animation = CAKeyframeAnimation(keyPath: path)
                animation.values = frames.map { $0[index].1 }
                animation.keyTimes = times.map { NSNumber(value: $0) }
                animation.calculationMode = .linear
                animation.duration = length
                animation.repeatCount = .infinity
                animation.timeOffset = from
                animation.isRemovedOnCompletion = false
                track.layer.add(animation, forKey: "figure.\(path)")
            }
        }
        if !texts.isEmpty {
            let link = CADisplayLink(target: self, selector: #selector(tick))
            link.add(to: .main, forMode: .common)
            self.link = link
        }
    }

    @objc private func tick() {
        if let at = time() { words(at) }
    }

    func stop() {
        guard playing else {
            rest()
            return
        }
        playing = false
        link?.invalidate()
        link = nil
        for track in tracks {
            for key in track.layer.animationKeys() ?? [] where key.hasPrefix("figure.") {
                track.layer.removeAnimation(forKey: key)
            }
        }
        rest()
    }

    /// Where the loop is, in seconds; nil while it stands still.
    func time() -> Double? {
        playing ? (CACurrentMediaTime() - started + from).truncatingRemainder(dividingBy: length) : nil
    }
}

// MARK: Layout

/// The figure's geometry and the parts a storyboard writes its timeline
/// with (figure.ts `layout`). Lanes stand on a fixed pitch from the top: a
/// lane's label row, then its dock row centred `row` below the lane's top,
/// then room under the dock before the next lane. Left of every lane runs the
/// entry gutter: sessions come in at the lanes' middle there and turn into
/// their lane's row before the dock, so a session in flight never crosses a
/// lane's name, its dot, or a session already docked.
final class Figure {
    static let pad = 12.0
    static let row = 24.0
    static let gutter = 14.0
    static let slotPitch = 13.0
    static let slots = 5
    static let chip = 10.0
    static let capGap = 6.0
    static let capLine = 16.0
    static let capFoot = 8.0
    /// A lane's clock, `m` minutes from its reset: "resets 4h 25m", "resets 12m" (figure.ts `resets`).
    static func resets(_ m: Double) -> String {
        let whole = max(0, Int(m.rounded()))
        return Words.Accounts.Figure.resets(time: Words.Accounts.Figure.time(hours: whole / 60, minutes: whole % 60))
    }

    /// A window that just reset: all of it ahead (figure.ts `RESET`).
    static let reset = Words.Accounts.Figure.resets(time: Words.Accounts.Figure.window)
    /// Illustrative clocks and fills, by lane.
    static let clocks = [resets(265), resets(70), resets(290), resets(185)]
    static let fills = [0.2, 0.3, 0.15, 0.25]

    struct LaneSpec {
        var lane: FigureLane
        var fill: Double
        var clock: (Double) -> String
        var glow = false
        var pin = false
        var blocked = Words.Accounts.Figure.blocked
    }

    final class LaneParts {
        let index: Int
        let color: UIColor
        var f: Double
        var f0: Double
        var docked = 0
        let fillTrack: FigureTrack
        let dim: FigureTrack
        let glow: FigureTrack
        let clockWords: FigureTrack
        let blockedWord: FigureTrack
        let headroom: FigureTrack
        let ghost: FigureTrack
        let pulse: FigureTrack
        let ghostLayer: CALayer
        let clock: UILabel
        let glows: Bool

        init(index: Int, color: UIColor, fill: Double, glows: Bool, tracks: [FigureTrack], ghostLayer: CALayer, clock: UILabel) {
            self.index = index
            self.color = color
            f = fill
            f0 = fill
            self.glows = glows
            fillTrack = tracks[0]
            dim = tracks[1]
            glow = tracks[2]
            clockWords = tracks[3]
            blockedWord = tracks[4]
            headroom = tracks[5]
            ghost = tracks[6]
            pulse = tracks[7]
            self.ghostLayer = ghostLayer
            self.clock = clock
        }
    }

    struct Chip {
        let layer: CALayer
        /// The chip's own colour, under its ring.
        let body: CALayer
        let lane: Int
        let at: CGPoint
    }

    let timeline = FigureTimeline()
    let stage: UIView
    let width: Double
    let board: FigureBoard
    private(set) var lanes: [LaneParts] = []
    /// The layer that fades through at the seam.
    let fades = UIView()
    let barX: Double
    let barW: Double
    private let traits: UITraitCollection
    private let entry: CGPoint
    private let left = Figure.pad + Figure.gutter
    private var captions: [KitLabel] = []

    /// A colour resolved for this figure's theme, at an alpha.
    /// A label the figure places by its frame. KitLabel is made for Auto
    /// Layout (no autoresizing mask); with no constraints of its own here,
    /// layout would stand every one at the stage's corner, over the others.
    static func placed(_ label: KitLabel) -> KitLabel {
        label.translatesAutoresizingMaskIntoConstraints = true
        return label
    }

    func rc(_ color: UIColor, _ alpha: Double = 1) -> CGColor {
        Self.resolve(color, alpha, traits)
    }

    /// `rc` for a track's closure, which holds the theme rather than the figure.
    static func resolve(_ color: UIColor, _ alpha: Double, _ traits: UITraitCollection) -> CGColor {
        let resolved = color.resolvedColor(with: traits)
        return resolved.withAlphaComponent(resolved.cgColor.alpha * alpha).cgColor
    }

    /// The ghost strip's dashed outline, drawn to the strip's frame as it stands.
    func outline(_ ghost: CALayer, _ color: UIColor) {
        let dash = (ghost.sublayers?.first as? CAShapeLayer) ?? CAShapeLayer()
        if dash.superlayer == nil { ghost.addSublayer(dash) }
        dash.frame = ghost.bounds
        dash.path = UIBezierPath(roundedRect: ghost.bounds.insetBy(dx: 0.5, dy: 0.5), cornerRadius: Radius.radiusHair).cgPath
        dash.fillColor = nil
        dash.lineWidth = 1
        dash.lineDashPattern = [3, 2]
        dash.strokeColor = rc(color)
    }

    private func y0(_ i: Int) -> Double { Self.pad + Double(i) * board.pitch }

    /// A dock slot's centre, `k` from the gutter's end.
    func slot(_ i: Int, _ k: Int) -> CGPoint {
        CGPoint(x: left + Self.chip / 2 + Double(k) * Self.slotPitch, y: y0(i) + Self.row)
    }

    /// Where a lane's `k`th session docks: the first at the bar's end.
    private func dock(_ i: Int, _ k: Int) -> CGPoint {
        slot(i, Self.slots - 1 - min(k, Self.slots - 1))
    }

    init(stage: UIView, board: FigureBoard, specs: [LaneSpec]) {
        self.stage = stage
        self.board = board
        traits = stage.traitCollection
        width = stage.bounds.width
        barX = Figure.pad + Figure.gutter + Double(Figure.slots) * Figure.slotPitch + 8
        barW = max(0, stage.bounds.width - barX - Figure.pad)
        entry = CGPoint(x: -10, y: Figure.pad + Double(specs.count) * board.pitch / 2)
        stage.subviews.forEach { $0.removeFromSuperview() }
        fades.frame = stage.bounds
        fades.isUserInteractionEnabled = false
        for (i, spec) in specs.enumerated() {
            lanes.append(lane(i, spec))
        }
        stage.addSubview(fades)
    }

    private func lane(_ i: Int, _ spec: LaneSpec) -> LaneParts {
        let color = AccountInk.color(spec.lane.hue)
        let y = y0(i)
        let group = UIView(frame: stage.bounds)
        group.isUserInteractionEnabled = false
        stage.addSubview(group)

        // The clock's words, the wash behind them, and the blocked word in their place.
        let clock = Self.placed(KitLabel(TypeScale.typeMeta, ink: Palette.inkMuted))
        clock.tabular = true
        clock.text = spec.clock(0)
        clock.sizeToFit()
        let clockW = clock.bounds.width + 10
        let wash = UIView(frame: CGRect(x: width - (Self.pad - 5) - clockW, y: y, width: clockW, height: 14))
        wash.backgroundColor = UIColor(cgColor: rc(color, 0.26))
        wash.layer.cornerRadius = Radius.radiusXs
        group.addSubview(wash)
        // Right-aligned to the wash's inner edge, as wide as its words (a
        // clock that counts down only ever gets shorter).
        clock.textAlignment = .right
        clock.frame = CGRect(x: width - Self.pad - (clockW - 10), y: y, width: clockW - 10, height: 14)
        group.addSubview(clock)
        let blocked = Self.placed(KitLabel(TypeScale.typeMeta.withWeight(TypeScale.weightStrong), ink: Palette.dataBad))
        blocked.text = spec.blocked
        blocked.sizeToFit()
        blocked.frame = CGRect(x: width - Self.pad - blocked.bounds.width, y: y, width: blocked.bounds.width, height: 14)
        group.addSubview(blocked)

        // The lane's name behind its dot, giving way before it reaches the clock.
        let dot = UIView(frame: CGRect(x: 0, y: 3.5, width: 7, height: 7))
        dot.backgroundColor = color
        dot.layer.cornerRadius = 3.5
        let name = Self.placed(KitLabel(TypeScale.typeMeta.withWeight(TypeScale.weightStrong), ink: Palette.inkRow))
        name.text = spec.lane.name
        name.lineBreakMode = .byTruncatingTail
        name.sizeToFit()
        let room = max(0, width - left - Self.pad - max(clockW, blocked.bounds.width) - 8)
        let pinW = spec.pin ? 6 + 12.0 : 0
        let nameW = max(0, min(name.bounds.width, room - 13 - pinW))
        name.frame = CGRect(x: 13, y: 0, width: nameW, height: 14)
        let label = UIView(frame: CGRect(x: left, y: y, width: min(room, 13 + nameW + pinW), height: 14))
        label.addSubview(dot)
        label.addSubview(name)
        if spec.pin {
            let pin = GlyphView(.pin, size: 12, tint: Palette.inkMuted)
            pin.translatesAutoresizingMaskIntoConstraints = true
            pin.frame = CGRect(x: 13 + nameW + 6, y: 1, width: 12, height: 12)
            label.addSubview(pin)
        }
        group.addSubview(label)

        // The use bar: its track, headroom, what a reset ghosts out, the fill, the pulse.
        let bars = CALayer()
        bars.frame = stage.bounds
        group.layer.addSublayer(bars)
        let bar = CGRect(x: barX, y: y + Self.row - Self.chip / 2, width: barW, height: 10)
        func strip(_ fill: CGColor?) -> CALayer {
            let layer = CALayer()
            layer.frame = bar
            layer.cornerRadius = Radius.radiusHair
            layer.backgroundColor = fill
            bars.addSublayer(layer)
            return layer
        }
        _ = strip(rc(Palette.surfaceFill))
        let headroom = strip(rc(color, 0.42))
        let ghost = strip(rc(color, 0.22))
        outline(ghost, color)
        let fill = strip(rc(color))
        fill.anchorPoint = CGPoint(x: 0, y: 0.5)
        fill.frame = bar
        let ring = CAShapeLayer()
        ring.fillColor = nil
        bars.addSublayer(ring)

        let t = timeline
        let opacity: ([Double]) -> [(String, Any)] = { [("opacity", Float($0[0]))] }
        let theme = traits
        let tracks = [
            t.track(fill, [spec.fill]) { [("transform.scale.x", $0[0])] },
            t.track(bars, [1], apply: opacity),
            t.track(wash.layer, [spec.glow ? 1 : 0], apply: opacity),
            t.track(clock.layer, [1], apply: opacity),
            t.track(blocked.layer, [0], apply: opacity),
            t.track(headroom, [0], apply: opacity),
            t.track(ghost, [0], apply: opacity),
            // A ring leaving the bar's edge: its spread and its colour's alpha.
            t.track(ring, [0, 0]) { v in
                let spread = v[0]
                let path = UIBezierPath(roundedRect: bar.insetBy(dx: -spread / 2, dy: -spread / 2), cornerRadius: Radius.radiusHair + spread / 2).cgPath
                return [("path", path), ("lineWidth", spread), ("strokeColor", Figure.resolve(color, v[1], theme))]
            },
        ]
        if spec.clock(0) != spec.clock(1) { t.text(clock, spec.clock) }
        return LaneParts(index: i, color: color, fill: spec.fill, glows: spec.glow, tracks: tracks, ghostLayer: ghost, clock: clock)
    }

    // MARK: What a storyboard writes

    func fill(_ i: Int, _ t: Double, _ v: Double, _ d: Double = 0.5) {
        let lane = lanes[i]
        lane.f = max(0, min(1, v))
        lane.fillTrack.to(t, [lane.f], d, .figure)
    }

    func notch(_ i: Int, _ t: Double, _ dv: Double) {
        fill(i, t, lanes[i].f + dv)
    }

    /// A ring leaves the bar's edge and fades.
    func pulse(_ i: Int, _ t: Double) {
        lanes[i].pulse.set(t, [0, 1]).to(t + 0.01, [7, 0], 0.9, .cssEaseOut)
    }

    /// A session's chip, its colour ringed in the stage's ground; a fork's drawn hollow.
    func chipLayer(_ color: UIColor, child: Bool = false, in parent: CALayer? = nil) -> (CALayer, CALayer) {
        let ring = CALayer()
        ring.bounds = CGRect(x: 0, y: 0, width: Self.chip + 3, height: Self.chip + 3)
        ring.cornerRadius = 4.5
        ring.backgroundColor = rc(Palette.surfaceRecess)
        let body = CALayer()
        body.frame = ring.bounds.insetBy(dx: 1.5, dy: 1.5)
        body.cornerRadius = 3
        if child {
            body.backgroundColor = rc(Palette.surfaceRecess)
            body.borderWidth = 1.5
            body.borderColor = rc(color)
        } else {
            body.backgroundColor = rc(color)
        }
        ring.addSublayer(body)
        (parent ?? fades.layer).addSublayer(ring)
        return (ring, body)
    }

    /// A session comes in through the gutter, turns into lane i's row there,
    /// and docks in the lane's next free slot. With `pause`, it waits at the
    /// turn for `hold` seconds first (the strategy weighing the lanes).
    @discardableResult
    func chip(_ i: Int, _ t: Double, pause: Bool = false, hold: Double = 0) -> Chip {
        let lane = lanes[i]
        let s = dock(i, lane.docked)
        lane.docked += 1
        let turn = left / 2
        let route = FigurePath()
        route.line(from: entry, to: CGPoint(x: turn, y: entry.y))
        let lead = route.length
        route.curve(to: CGPoint(x: left, y: s.y), c1: CGPoint(x: left, y: entry.y), c2: CGPoint(x: turn, y: s.y))
        route.line(to: s)
        let (layer, body) = chipLayer(lane.color)
        timeline.track(layer, [0]) { [("opacity", Float($0[0]))] }.to(t, [1], 0.3, .cssEaseOut)
        let travel = timeline.track(layer, [0]) { [("position", NSValue(cgPoint: route.point(at: $0[0])))] }
        if pause {
            travel.to(t, [lead / route.length], 0.45, .figure).to(t + hold, [1], 0.6, .figure)
        } else {
            travel.to(t, [1], 0.7, .figure)
        }
        return Chip(layer: layer, body: body, lane: i, at: s)
    }

    /// A session's fork: the child grows in its parent's lane, in the next
    /// free slot, drawn hollow to say what it is. The lane is the relation.
    @discardableResult
    func fork(_ parent: Chip, _ t: Double) -> Chip {
        let lane = lanes[parent.lane]
        let s = dock(parent.lane, lane.docked)
        lane.docked += 1
        let (layer, body) = chipLayer(lane.color, child: true)
        layer.position = s
        timeline.track(layer, [0]) { [("opacity", Float($0[0]))] }.to(t, [1], 0.2, .cssEaseOut)
        timeline.track(layer, [0.6]) { [("transform.scale", $0[0])] }.to(t, [1], 0.35, .figure)
        return Chip(layer: layer, body: body, lane: parent.lane, at: s)
    }

    /// The lane's blocked word takes its clock's place, and gives it back with `on` false.
    func block(_ i: Int, _ t: Double, on: Bool = true) {
        let lane = lanes[i]
        // One word in the place at a time: the leaving one is gone before the arriving one shows.
        let (leave, arrive) = on ? (lane.clockWords, lane.blockedWord) : (lane.blockedWord, lane.clockWords)
        leave.to(t, [0], 0.15, .cssEaseOut)
        arrive.to(t + 0.15, [1], 0.25, .cssEaseOut)
        if on { lane.glow.to(t, [0], 0.15, .cssEaseOut) }
    }

    /// A caption fades in at `a` and out at `b`; `b` = 99 holds it to the seam.
    func cap(_ a: Double, _ b: Double, _ text: String) {
        let label = Self.placed(KitLabel(TypeScale.typeMeta, ink: Palette.inkRow, lines: 0))
        label.text = text
        label.wrap = .pretty
        fades.addSubview(label)
        captions.append(label)
        let track = timeline.track(label.layer, [0]) { [("opacity", Float($0[0]))] }.to(a, [1], 0.3, .cssEaseOut)
        if b < 99 { track.to(b, [0], 0.25, .cssEaseOut) }
    }

    /// Holds the last frame, then fades through to frame 0.
    func seam(_ end: Double, hold: Double = 1.2) {
        let s = end + hold
        timeline.end = end
        timeline.seamAt = s
        timeline.length = s + 0.3
        for lane in lanes {
            lane.fillTrack.to(s, [lane.f0], 0.3, .easeOut)
            lane.dim.to(s, [1], 0.3, .easeOut)
            // The blocked word leaves before the clock comes back to its place.
            lane.blockedWord.to(s, [0], 0.12, .easeOut)
            lane.clockWords.to(s + 0.12, [1], 0.18, .easeOut)
            lane.headroom.to(s, [0], 0.2, .easeOut)
            lane.ghost.to(s, [0], 0.2, .easeOut)
            lane.glow.to(s, [lane.glows ? 1 : 0], 0.3, .easeOut)
        }
        timeline.track(fades.layer, [0]) { [("opacity", Float($0[0]))] }.to(0, [1], 0.15, .easeOut).to(s, [0], 0.15, .easeOut)
    }

    /// The stage's height once its captions are measured: as tall as its
    /// lanes and its longest caption, which wraps rather than being cut.
    func finish() -> Double {
        let lines = captions.map { label in
            Int((label.sizeThatFits(CGSize(width: width - 24, height: .greatestFiniteMagnitude)).height / Self.capLine).rounded(.up))
        }.max() ?? 0
        let height = board.height(lanes: lanes.count, lines: lines)
        for label in captions {
            let tall = label.sizeThatFits(CGSize(width: width - 24, height: .greatestFiniteMagnitude)).height
            label.frame = CGRect(x: 12, y: height - Self.capFoot - tall, width: width - 24, height: tall)
        }
        fades.frame = CGRect(x: 0, y: 0, width: width, height: height)
        return height
    }
}

/// A chip's route: lines and a cubic, measured so a share of its length is a point on it.
final class FigurePath {
    private var points: [CGPoint] = []
    private var lengths: [Double] = []

    var length: Double { lengths.last ?? 0 }

    private func add(_ point: CGPoint) {
        if let last = points.last {
            lengths.append(length + hypot(point.x - last.x, point.y - last.y))
        } else {
            lengths.append(0)
        }
        points.append(point)
    }

    func line(from start: CGPoint? = nil, to end: CGPoint) {
        if let start, points.isEmpty { add(start) }
        add(end)
    }

    func curve(to end: CGPoint, c1: CGPoint, c2: CGPoint) {
        guard let start = points.last else { return }
        for step in 1 ... 48 {
            let t = Double(step) / 48
            let u = 1 - t
            add(CGPoint(x: u * u * u * start.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * end.x,
                        y: u * u * u * start.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * end.y))
        }
    }

    /// The point `share` (0–1) of the way along.
    func point(at share: Double) -> CGPoint {
        guard let first = points.first else { return .zero }
        let want = max(0, min(1, share)) * length
        guard let next = lengths.firstIndex(where: { $0 >= want }), next > 0 else { return first }
        let a = points[next - 1]
        let b = points[next]
        let span = lengths[next] - lengths[next - 1]
        let p = span > 0 ? (want - lengths[next - 1]) / span : 0
        return CGPoint(x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p)
    }
}

// MARK: Boards

extension Figure {
    private static func fixed(_ text: String) -> (Double) -> String { { _ in text } }

    /// Builds `board` in `stage`, standing at its last frame; its height.
    static func build(_ board: FigureBoard, in stage: UIView, lanes: [FigureLane], limits: Bool, pin: Int, policy: FigurePolicy?) -> (Figure, Double) {
        let figure: Figure
        switch board {
        case .pinned: figure = pinned(stage, lanes, pin: pin, limits: limits)
        case .fill: figure = fill(stage, lanes)
        case .spread: figure = spread(stage, lanes)
        case .soonest: figure = soonest(stage, lanes)
        case .limit: figure = limit(stage, lanes, policy ?? FigurePolicy(wait: 15, under: 200, at: 90))
        }
        let height = figure.finish()
        figure.timeline.rest()
        return (figure, height)
    }

    private static func pinned(_ stage: UIView, _ lanes: [FigureLane], pin: Int, limits: Bool) -> Figure {
        let f = Figure(stage: stage, board: .pinned, specs: lanes.enumerated().map { i, lane in
            LaneSpec(lane: lane, fill: i == pin ? 0.2 : fills[safe: i] ?? 0.25, clock: fixed(clocks[safe: i] ?? clocks[0]), pin: i == pin)
        })
        f.chip(pin, 0.7)
        f.notch(pin, 1.15, 0.12)
        let c2 = f.chip(pin, 1.4)
        f.notch(pin, 1.85, 0.12)
        f.chip(pin, 2.1)
        f.notch(pin, 2.55, 0.12)
        f.fork(c2, 2.8)
        f.notch(pin, 3.3, 0.1)
        f.chip(pin, 3.5)
        f.notch(pin, 3.95, 0.14)
        f.fill(pin, 4.2, 1, 0.4)
        f.pulse(pin, 4.6)
        if limits { f.cap(4.6, 99, Words.Accounts.Figure.policyBelow) }
        f.seam(5.6)
        return f
    }

    private static func fill(_ stage: UIView, _ lanes: [FigureLane]) -> Figure {
        let f = Figure(stage: stage, board: .fill, specs: lanes.enumerated().map { i, lane in
            LaneSpec(lane: lane, fill: fills[safe: i] ?? 0.25, clock: fixed(clocks[safe: i] ?? clocks[0]))
        })
        f.chip(0, 0.7)
        f.notch(0, 1.15, 0.14)
        let c2 = f.chip(0, 1.4)
        f.notch(0, 1.85, 0.14)
        f.chip(0, 2.1)
        f.notch(0, 2.55, 0.14)
        f.fill(0, 2.8, 1, 0.3)
        f.pulse(0, 2.9)
        f.block(0, 3.0)
        f.lanes[0].dim.to(3.0, [0.6], 0.3, .cssEaseOut)
        if f.lanes.count > 1 {
            f.chip(1, 3.5)
            f.notch(1, 3.95, 0.14)
        }
        f.fork(c2, 4.2)
        if f.lanes.count > 1 {
            f.chip(1, 5.0)
            f.notch(1, 5.45, 0.14)
        }
        f.seam(6.0)
        return f
    }

    private static func spread(_ stage: UIView, _ lanes: [FigureLane]) -> Figure {
        let start = [0.2, 0.6, 0.45, 0.35]
        let f = Figure(stage: stage, board: .spread, specs: lanes.enumerated().map { i, lane in
            LaneSpec(lane: lane, fill: start[safe: i] ?? 0.4, clock: fixed(clocks[safe: i] ?? clocks[0]))
        })
        var forkFrom: Chip?
        var forkAfter = 0.0
        for t in [0.7, 1.6, 2.5, 3.4] {
            // The chip waits at the turn in the gutter while every lane's
            // headroom lights; the most room wins.
            let rooms = f.lanes.map { 1 - $0.f }
            let best = rooms.firstIndex(of: rooms.max() ?? 0) ?? 0
            let c = f.chip(best, t, pause: true, hold: 0.55)
            for (i, lane) in f.lanes.enumerated() {
                lane.headroom.to(t + 0.3, [1], 0.2, .cssEaseOut).to(i == best ? t + 0.95 : t + 0.6, [0], 0.25, .cssEaseOut)
            }
            f.notch(best, t + 0.95, 0.15)
            if best != 0, forkFrom == nil {
                forkFrom = c
                forkAfter = t + 1.3
            }
        }
        let tf = max(4.2, forkAfter)
        if let forkFrom {
            f.fork(forkFrom, tf)
            f.notch(forkFrom.lane, tf + 0.5, 0.08)
        }
        f.seam(tf + 1.0)
        return f
    }

    private static func soonest(_ stage: UIView, _ lanes: [FigureLane]) -> Figure {
        let base = [12.0, 100, 185, 240]
        let start = [0.35, 0.2, 0.95, 0.5]
        /// Compressed time: five minutes a second.
        let rate = 5.0
        let clock: (Int) -> (Double) -> String = { i in
            let b = base[safe: i] ?? 240
            if i == 0 {
                return { t in t < 2.4 ? resets(b - rate * t) : t < 2.8 ? resets(0) : reset }
            }
            return { t in resets(b - rate * t) }
        }
        let f = Figure(stage: stage, board: .soonest, specs: lanes.enumerated().map { i, lane in
            LaneSpec(lane: lane, fill: start[safe: i] ?? 0.3, clock: clock(i), glow: i == 0, blocked: Words.Accounts.Figure.full)
        })
        let first = f.lanes[0]
        let c1 = f.chip(0, 0.7)
        f.notch(0, 1.15, 0.2)
        f.chip(0, 1.4)
        f.notch(0, 1.85, 0.2)
        // The first lane's clock reaches zero: what it left unused ghosts out, and its fill drains.
        let ghost = first.ghostLayer.frame
        first.ghostLayer.frame = CGRect(x: f.barX + f.barW * first.f, y: ghost.minY, width: f.barW * (1 - first.f), height: ghost.height)
        f.outline(first.ghostLayer, first.color)
        first.ghost.set(2.4, [1]).to(2.5, [0], 0.6, .cssEaseOut)
        f.fill(0, 2.4, 0, 0.4)
        first.glow.to(2.4, [0], 0.3, .cssEaseOut)
        f.cap(2.4, 3.7, Words.Accounts.Figure.unusedWasted)
        if f.lanes.count > 1 {
            f.lanes[1].glow.to(2.8, [1], 0.3, .cssEaseOut)
            f.chip(1, 2.8)
            f.notch(1, 3.25, 0.2)
        }
        if f.lanes.count > 2 {
            f.block(2, 3.6)
            f.block(2, 4.5, on: false)
            f.cap(3.8, 4.5, Words.Accounts.Figure.fullSkipped)
        }
        if f.lanes.count > 1 {
            f.chip(1, 3.8)
            f.notch(1, 4.25, 0.2)
        }
        f.fork(c1, 4.6)
        f.seam(5.4)
        return f
    }

    private static func limit(_ stage: UIView, _ lanes: [FigureLane], _ policy: FigurePolicy) -> Figure {
        guard lanes.count >= 2 else { return fill(stage, lanes) }
        let (runsOut, free) = (lanes[0], lanes[1])
        let f = Figure(stage: stage, board: .limit, specs: [
            LaneSpec(lane: runsOut, fill: 0.85, clock: fixed(resets(12))),
            LaneSpec(lane: free, fill: 0.2, clock: fixed(resets(265))),
        ])
        let (work, next) = (f.lanes[0], f.lanes[1])
        let runsInk = AccountInk.color(runsOut.hue)
        let freeInk = AccountInk.color(free.hue)
        let tc = min(1.5, max(0.1, ((Double(min(policy.at, 100)) / 100 - 0.85) / 0.15) * 1.6))
        work.fillTrack.to(0, [1], 1.6, .linear)
        work.f = 1
        f.pulse(0, 1.6)
        f.cap(tc, 1.95, Words.Accounts.Figure.summaryEarly)
        let scenes: [(t0: Double, t1: Double, w: Int, tok: Int)] = [(2.0, 3.4, 12, 180), (3.4, 5.2, 120, 180), (5.2, 7.0, 120, 412)]
        let s0 = f.slot(0, 0)
        let s1 = f.slot(0, 1)
        let p0 = f.slot(1, 0)
        let p1 = f.slot(1, 1)
        let dy = p0.y - s0.y
        var clocks: [(Double, Double, (Double) -> String)] = [(0, 2.0, { _ in resets(12) })]
        /// A layer at `x, y` (its top left, as `translate`), scaled about its centre.
        let place: (CALayer) -> ([Double]) -> [(String, Any)] = { layer in
            let half = CGPoint(x: layer.bounds.width / 2, y: layer.bounds.height / 2)
            return { v in [("position", NSValue(cgPoint: CGPoint(x: v[0] + half.x, y: v[1] + half.y))), ("transform.scale", v[2])] }
        }
        /// A tag naming the conversation's size, its top left at `x, y`.
        func tag(_ text: String, x: Double, y: Double, in parent: UIView) -> UILabel {
            let label = Figure.placed(KitLabel(TypeScale.typeCaps, ink: Palette.inkRow))
            label.tabular = true
            label.text = text
            label.textAlignment = .center
            label.backgroundColor = Palette.surfaceFill
            label.layer.cornerRadius = Radius.radiusXs
            label.layer.masksToBounds = true
            label.sizeToFit()
            label.frame = CGRect(x: x, y: y, width: label.bounds.width + 8, height: 14)
            parent.addSubview(label)
            return label
        }
        for (qi, q) in scenes.enumerated() {
            let isFirst = qi == 0
            let isLast = qi == scenes.count - 1
            let capEnd = isLast ? 99 : q.t1 - 0.1
            let branch = q.w <= policy.wait ? "wait" : q.tok <= policy.under ? "move" : "summary"
            // Each branch's pieces show for its window; the last branch is the still frame, so it stays.
            let wrap = UIView(frame: f.fades.bounds)
            wrap.isUserInteractionEnabled = false
            f.fades.addSubview(wrap)
            let (ch, chBody) = f.chipLayer(runsInk, in: wrap.layer)
            let tg = tag(Words.Accounts.Figure.tokens(k: q.tok), x: s0.x - 8, y: s0.y + 8, in: wrap)
            let doc = CALayer()
            doc.bounds = CGRect(x: 0, y: 0, width: 10, height: 13)
            doc.cornerRadius = Radius.radiusHair
            doc.backgroundColor = f.rc(Palette.warning9)
            doc.shadowColor = f.rc(Palette.warning9)
            doc.shadowOpacity = 0.55
            doc.shadowRadius = 4
            doc.shadowOffset = CGSize(width: 0, height: 1)
            for line in [3.0, 5.5] {
                let rule = CALayer()
                rule.frame = CGRect(x: 2, y: line, width: 6, height: 1)
                rule.backgroundColor = f.rc(Palette.surfaceRecess, 0.55)
                doc.addSublayer(rule)
            }
            wrap.layer.addSublayer(doc)
            let shown = f.timeline.track(wrap.layer, [isFirst ? 1 : 0]) { [("opacity", Float($0[0]))] }
            if !isFirst { shown.to(q.t0 - 0.05, [1], 0.25, .cssEaseOut) }
            if !isLast { shown.to(q.t1 - 0.2, [0], 0.2, .cssEaseOut) }
            // The chip's layer is its ring: its top left sits 1.5 out from the chip's.
            let chipAt = f.timeline.track(ch, [s0.x - 6.5, s0.y - 6.5, 1], apply: place(ch))
            let docAt = f.timeline.track(doc, [s1.x - 5, s1.y - 6, isFirst ? 0.4 : 1], apply: place(doc))
            let docShown = f.timeline.track(doc, [isFirst ? 0 : 1]) { [("opacity", Float($0[0]))] }
            if isFirst {
                docShown.to(tc, [1], 0.3, .cssEaseOut)
                docAt.to(tc, [s1.x - 5, s1.y - 6, 1], 0.5, .figure)
            } else {
                work.fillTrack.to(q.t0 - 0.05, [1], 0.25, .figure)
                next.fillTrack.to(q.t0 - 0.05, [0.2], 0.25, .figure)
            }
            switch branch {
            case "wait":
                f.cap(q.t0 + 0.1, capEnd, Words.Accounts.Figure.waits(minutes: q.w))
                clocks.append((q.t0, q.t1, { t in
                    t < q.t0 + 0.1 ? Words.Accounts.Figure.resets(time: Words.Accounts.Figure.time(hours: 0, minutes: q.w))
                        : t < q.t0 + 0.9 ? resets(Double(q.w) * (1 - (t - q.t0 - 0.1) / 0.8)) : reset
                }))
                work.fillTrack.to(q.t0 + 0.9, [0.06], 0.4, .easeOut)
                chipAt.to(q.t0 + 1.0, [s0.x - 6.5, s0.y - 6.5, 1.25], 0.15, .figure).to(q.t0 + 1.15, [s0.x - 6.5, s0.y - 6.5, 1], 0.3, .figure)
                docShown.to(q.t0 + 1.0, [0], 0.3, .cssEaseOut)
            case "move":
                f.cap(q.t0 + 0.1, capEnd, Words.Accounts.Figure.movesWhole)
                clocks.append((q.t0, q.t1, { _ in resets(Double(q.w)) }))
                chipAt.to(q.t0 + 0.2, [s0.x - 6.5, s0.y - 6.5 + dy, 1], 0.7, .figure)
                let from = UIColor(cgColor: f.rc(runsInk))
                let to = UIColor(cgColor: f.rc(freeInk))
                f.timeline.track(chBody, [0]) { v in [("backgroundColor", Figure.mix(from, to, v[0]))] }.to(q.t0 + 0.5, [1], 0.3, .cssEaseOut)
                docAt.to(q.t0 + 0.26, [s1.x - 5, s1.y - 6 + dy, 1], 0.7, .figure)
                let moved = tag(Words.Accounts.Figure.reread(k: q.tok), x: s0.x - 8, y: s0.y + 8 + dy, in: wrap)
                f.timeline.track(tg.layer, [1]) { [("opacity", Float($0[0]))] }.to(q.t0 + 0.15, [0], 0.2, .cssEaseOut)
                f.timeline.track(moved.layer, [0]) { [("opacity", Float($0[0]))] }.to(q.t0 + 0.8, [1], 0.3, .cssEaseOut)
                next.fillTrack.to(q.t0 + 0.85, [min(1, 0.2 + Double(q.tok) * 0.0016)], 0.5, .figure)
            default:
                f.cap(q.t0 + 0.1, capEnd, Words.Accounts.Figure.continues)
                clocks.append((q.t0, q.t1, { _ in resets(Double(q.w)) }))
                docAt.to(q.t0 + 0.2, [p0.x - 5, p0.y - 6, 1], 0.7, .figure)
                let (nc, _) = f.chipLayer(freeInk, in: wrap.layer)
                f.timeline.track(nc, [0]) { [("opacity", Float($0[0]))] }.to(q.t0 + 0.8, [1], 0.25, .cssEaseOut)
                f.timeline.track(nc, [p0.x - 6.5, p0.y - 6.5, 0.4], apply: place(nc)).to(q.t0 + 0.8, [p1.x - 6.5, p1.y - 6.5, 1], 0.6, .figure)
                f.timeline.track(ch, [1]) { [("opacity", Float($0[0]))] }.to(q.t0 + 0.8, [0.35], 0.3, .cssEaseOut)
                let stays = tag(Words.Accounts.Figure.staysOn(k: q.tok, name: runsOut.name), x: s0.x - 8, y: s0.y + 8, in: wrap)
                f.timeline.track(tg.layer, [1]) { [("opacity", Float($0[0]))] }.to(q.t0 + 0.75, [0], 0.2, .cssEaseOut)
                f.timeline.track(stays.layer, [0]) { [("opacity", Float($0[0]))] }.to(q.t0 + 0.9, [1], 0.3, .cssEaseOut)
                next.fillTrack.to(q.t0 + 0.95, [0.28], 0.5, .figure)
            }
        }
        work.f0 = 0.85
        next.f0 = 0.2
        let said = clocks
        f.timeline.text(work.clock) { t in
            for (a, b, words) in said where t >= a && t < b {
                return words(t)
            }
            return said[said.count - 1].2(t)
        }
        f.seam(7.0, hold: 1.0)
        return f
    }

    /// Two colours mixed in sRGB, as a keyframe between them is.
    static func mix(_ a: UIColor, _ b: UIColor, _ p: Double) -> CGColor {
        var (r1, g1, b1, a1, r2, g2, b2, a2): (CGFloat, CGFloat, CGFloat, CGFloat, CGFloat, CGFloat, CGFloat, CGFloat) = (0, 0, 0, 0, 0, 0, 0, 0)
        a.getRed(&r1, green: &g1, blue: &b1, alpha: &a1)
        b.getRed(&r2, green: &g2, blue: &b2, alpha: &a2)
        return UIColor(red: r1 + (r2 - r1) * p, green: g1 + (g2 - g1) * p, blue: b1 + (b2 - b1) * p, alpha: a1 + (a2 - a1) * p).cgColor
    }
}

private extension Array {
    subscript(safe index: Int) -> Element? { indices.contains(index) ? self[index] : nil }
}

// MARK: The stage

/// One strategy figure in its stage (StrategyFigure.svelte): built for the
/// stage's width and rebuilt when that, its lanes, its numbers or the theme
/// change, keeping its place in the loop. It plays only while `playing` (its
/// card chosen or under the pointer) and while on screen; otherwise, and
/// always with reduced motion, it holds its last frame and caption.
final class StrategyFigureView: UIView {
    private let board: FigureBoard
    private var lanes: [FigureLane]
    private let limits: Bool
    private var pin: Int
    private var policy: FigurePolicy?
    private let stage = UIView()
    private var figure: Figure?
    private var height: NSLayoutConstraint!
    private var built: (width: Double, lanes: [FigureLane], pin: Int, policy: FigurePolicy?, dark: Bool)?
    private var rebuild: Task<Void, Never>?

    var playing = false { didSet { sync() } }

    init(board: FigureBoard, lanes: [FigureLane], limits: Bool = true, pin: Int = 0, policy: FigurePolicy? = nil) {
        self.board = board
        self.lanes = lanes
        self.limits = limits
        self.pin = pin
        self.policy = policy
        super.init(frame: .zero)
        isUserInteractionEnabled = false
        isAccessibilityElement = false
        accessibilityElementsHidden = true
        backgroundColor = Palette.surfaceRecess
        layer.cornerRadius = Radius.radiusMd
        layer.cornerCurve = .continuous
        layer.borderWidth = 1
        clipsToBounds = true
        stage.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stage)
        // Its lanes' height from the first frame, a caption's line only on a board that writes one.
        height = heightAnchor.constraint(equalToConstant: board.height(lanes: lanes.count, lines: board.captioned(limits: limits) ? 1 : 0) + 2)
        NSLayoutConstraint.activate([
            height,
            stage.topAnchor.constraint(equalTo: topAnchor, constant: 1),
            stage.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -1),
            stage.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 1),
            stage.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -1),
        ])
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (view: StrategyFigureView, _: UITraitCollection) in
            view.layer.borderColor = Palette.borderWell.resolvedColor(with: view.traitCollection).cgColor
            view.setNeedsLayout()
        }
        layer.borderColor = Palette.borderWell.resolvedColor(with: traitCollection).cgColor
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("StrategyFigureView is built in code")
    }

    /// New lanes, pin or numbers: rebuilt a beat after they settle (a number being typed).
    func update(lanes next: [FigureLane], pin nextPin: Int = 0, policy nextPolicy: FigurePolicy? = nil) {
        guard next != lanes || nextPin != pin || nextPolicy != policy else { return }
        lanes = next
        pin = nextPin
        policy = nextPolicy
        rebuild?.cancel()
        rebuild = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .milliseconds(120))
            guard let self, !Task.isCancelled else { return }
            build()
        }
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        let dark = traitCollection.userInterfaceStyle == .dark
        if built?.width != stage.bounds.width || built?.dark != dark { build() }
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        sync()
    }

    private func build() {
        let width = stage.bounds.width
        guard width > 0, !lanes.isEmpty else { return }
        let at = figure?.timeline.time()
        figure?.timeline.stop()
        let (made, tall) = Figure.build(board, in: stage, lanes: lanes, limits: limits, pin: pin, policy: policy)
        figure = made
        built = (width, lanes, pin, policy, traitCollection.userInterfaceStyle == .dark)
        height.constant = tall + 2
        sync(from: at)
    }

    private var live: Bool { playing && window != nil && !UIAccessibility.isReduceMotionEnabled }

    private func sync(from at: Double? = nil) {
        guard let timeline = figure?.timeline else { return }
        if live, !timeline.playing {
            timeline.play(from: at)
        } else if !live, timeline.playing {
            timeline.stop()
        }
    }

    #if DEBUG
    /// The figure's loop as it stands: playing and where, for the probe.
    var probeState: String {
        guard let timeline = figure?.timeline else { return "\(board.rawValue): not built" }
        // Words that stand at the same time and overlap: none should.
        var labels: [CGRect] = []
        func walk(_ node: UIView, _ shown: Float) {
            for child in node.subviews {
                let opacity = shown * child.layer.opacity
                if let label = child as? UILabel, !(label.text ?? "").isEmpty, opacity > 0.01 {
                    labels.append(label.convert(label.bounds, to: stage))
                }
                walk(child, opacity)
            }
        }
        walk(stage, 1)
        var overlaps = 0
        for i in labels.indices {
            for j in labels.indices where j > i && labels[i].insetBy(dx: 0.5, dy: 0.5).intersects(labels[j]) {
                overlaps += 1
            }
        }
        return "\(board.rawValue) \(lanes.count) lanes \(timeline.playing ? "playing" : "still") loop \(String(format: "%.1f", timeline.length))s overlaps \(overlaps)"
    }
    #endif
}
