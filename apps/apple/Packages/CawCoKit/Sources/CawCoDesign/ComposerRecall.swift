import CoreImage
import CoreImage.CIFilterBuiltins
import UIKit
import UIKit.UIGestureRecognizerSubclass

// The composer's recall (composer-recall, variant "Wheel"): the composer
// grows upward from its pill's top, absolutely, so nothing above it moves,
// to half the window, and what the reader sent here rolls down into its
// field as ghost rows on a gentle wheel. The row on the field's line is the
// one Return or a tap takes, tinted in the selected ink; above it the rows
// are ghosts, going softer as they rise.

/// The wheel's measures and the grown shape's curve.
enum Recall {
    /// One row: the field's own line box.
    static let row = Size.cComposerField
    /// How much of the window the grown shape stands up into, from its foot
    /// (`floor`: the window's, or the keyboard's top while it is up): half
    /// on a phone (compact width), 40% on an iPad or the Mac (regular width).
    static func reach(regular: Bool) -> Double {
        regular ? 0.4 : 0.5
    }
    /// Rows above the field's line: as many as stand between the pill's top
    /// (`top`, in the window) and the reach's top, never fewer than three on
    /// a phone and five at regular width.
    static func rowsAbove(top: Double, floor: Double, regular: Bool) -> Int {
        let fit = Int(((top - 6 - floor * (1 - reach(regular: regular))) / row).rounded())
        return max(regular ? 5 : 3, fit)
    }
    /// How far back the oldest row stands, in rows of lean, shrink, blur and
    /// fade: three on a phone, five at regular width. However many rows
    /// show, the depth is spread across them to end here.
    static func depth(regular: Bool) -> Int {
        regular ? 5 : 3
    }
    /// The wheel's lean per row, in degrees, and how much smaller each row
    /// is than the one below it: gentle, so it reads as a wheel and not a wall.
    static let lean = 6.0
    static let shrink = 0.022
    /// The row the composer grows by while a queued message is edited.
    static let editExtra = row
    /// The frosted fade at the shape's top: a band per blur, each a step
    /// lower and blurring twice as much as the one above it (points), so the
    /// transcript under the fade goes soft by degrees.
    static let blurs: [Double] = [0.5, 1, 2, 4, 8, 16]
    static let band = 6.0
    /// How much softer each row of depth is than the one below it: points
    /// of blur, a Gaussian's standard deviation, as CSS `blur()` takes px
    /// (RecallWheel.svelte `SOFT`). Any more and the topmost row's 12pt
    /// muted time, leaning 30° back at 94%, drops under 4.5:1 as drawn.
    static let soft = 0.02
    /// How much fainter a row is per row of depth (RecallWheel.svelte `FAINT`).
    static let faint = 0.015
    /// How strongly a row `deep` rows of depth back shows, of a wheel whose
    /// topmost row stands `depth` back (RecallWheel.svelte `presence`): full
    /// on the line, a touch fainter by its depth, the topmost at 95.5% on a
    /// phone and 94% at regular width, so every row holds 4.5:1.
    static func presence(_ deep: Double, of depth: Int) -> Double {
        1 - faint * Double(min(depth, 4)) * min(1, deep / Double(depth))
    }

    /// `--ease-drawer`, close enough for a frame-driven morph (composer-recall `drawer`).
    static func drawer(_ t: Double) -> Double {
        1 - pow(1 - min(1, max(0, t)), 3.2)
    }

    /// The shoulders' inward curve at full growth: as much as the top row has
    /// shrunk, `spread` rows of depth for each row the shape holds, at most
    /// `rows` rows' worth (grown.ts `taperRows`: a canvas curves in by one).
    static func taper(width: Double, extra: Double, spread: Double, rows: Double = .infinity) -> Double {
        shrink * (min(rows, max(0, (extra - 6) / row) * spread) + 0.5) * width / 2
    }

    /// The grown composer at `p` (0: the composer's own pill, 1: grown), in
    /// the pill's box (x from its left edge, past it where it stands wide),
    /// with its height and how far above the pill it reaches (composer-recall
    /// `outline()`, grown.ts). The whole pill rises from its top, evenly
    /// across its width, its top corners rounding all the way; then the
    /// shoulders curve in by the taper. A canvas standing wider than the
    /// pill (`geometry.wide`) steps each side out from the pill's edge over
    /// the pill's upper side, so it stands whole on the pill's top and its
    /// shoulders meet the pill's edges.
    static func outline(_ geometry: RecallGeometry, open p: Double, extra: Double) -> (path: CGPath, height: Double, up: Double) {
        let w = geometry.width
        let r = Radius.radiusLg
        let up = extra * drawer(p * 1.25 - 0.075), height = geometry.base + up
        let pw = drawer((p - 0.25) / 0.75)
        let k = taper(width: w, extra: extra, spread: geometry.spread, rows: geometry.taperRows)
        // How far each side stands out past the pill, and the band of the pill's upper side its step out takes.
        let eL = geometry.wide.left * pw, eR = geometry.wide.right * pw
        let left = -eL + k * pw, right = w + eR - k * pw
        let s = max(r, up)
        let bL = min(abs(eL), max(0, height - r - s)), bR = min(abs(eR), max(0, height - r - s))
        let path = CGMutablePath()
        func point(_ x: Double, _ y: Double) -> CGPoint { CGPoint(x: x, y: y) }
        path.move(to: point(r, height))
        path.addLine(to: point(w - r, height))
        path.addArc(tangent1End: point(w, height), tangent2End: point(w, height - r), radius: r)
        // Each side runs straight up the pill, steps out to its reach at the
        // pill's top, then sweeps in to its rounded top corner.
        path.addLine(to: point(w, s + bR))
        path.addCurve(to: point(w + eR, s), control1: point(w, s + bR * 0.45), control2: point(w + eR, s + bR * 0.55))
        path.addCurve(to: point(right, r), control1: point(w + eR, s - (s - r) * 0.55), control2: point(right, r + (s - r) * 0.35))
        path.addQuadCurve(to: point(right - r, 0), control: point(right, 0))
        path.addLine(to: point(left + r, 0))
        path.addQuadCurve(to: point(left, r), control: point(left, 0))
        path.addCurve(to: point(-eL, s), control1: point(left, r + (s - r) * 0.35), control2: point(-eL, s - (s - r) * 0.55))
        path.addCurve(to: point(0, s + bL), control1: point(-eL, s + bL * 0.55), control2: point(0, s + bL * 0.45))
        path.addLine(to: point(0, height - r))
        path.addArc(tangent1End: point(0, height), tangent2End: point(r, height), radius: r)
        path.closeSubpath()
        return (path, height, up)
    }

    /// How far in from its reach each side of the grown outline stands `y`
    /// points below its top (grown.ts `taperAt`): the shoulder's curve, which
    /// runs from the pill's top to the top corner, found by halving.
    static func taperAt(_ y: Double, geometry: RecallGeometry, extra: Double) -> Double {
        let r = Radius.radiusLg
        let k = taper(width: geometry.width, extra: extra, spread: geometry.spread, rows: geometry.taperRows)
        let s = max(r, extra), d = s - r
        guard y < s else { return 0 }
        // y(t) falls from s at t = 0 to r at t = 1; x(t) moves in by k·(3t² − 2t³).
        func yAt(_ t: Double) -> Double {
            let u = 1 - t
            return u * u * u * s + 3 * u * u * t * (s - d * 0.55) + 3 * u * t * t * (r + d * 0.35) + t * t * t * r
        }
        var lo = 0.0, hi = 1.0
        for _ in 0 ..< 24 {
            let mid = (lo + hi) / 2
            if yAt(mid) > y { lo = mid } else { hi = mid }
        }
        let t = (lo + hi) / 2
        return k * (3 * t * t - 2 * t * t * t)
    }

    /// A ghost row `off` rows above the field's line (below it when negative):
    /// `translateY(-off·row) rotateX(up·lean) scale(1 − up·shrink)` about its
    /// foot, under the wheel's 900pt perspective.
    static func transform(off: Double, up: Double) -> CATransform3D {
        let scale = 1 - up * shrink
        let angle = up * lean * .pi / 180
        // CSS `rotateX`: the top of the row tips away.
        var rotate = CATransform3DIdentity
        rotate.m22 = cos(angle)
        rotate.m23 = sin(angle)
        rotate.m32 = -sin(angle)
        rotate.m33 = cos(angle)
        var perspective = CATransform3DIdentity
        perspective.m34 = -1.0 / 900
        var transform = CATransform3DMakeScale(scale, scale, 1)
        transform = CATransform3DConcat(transform, rotate)
        transform = CATransform3DConcat(transform, CATransform3DMakeTranslation(0, -off * row, 0))
        return CATransform3DConcat(transform, perspective)
    }

    /// What a row says of when it was sent: "now", "3 min", "2 h", "4 d".
    static func ago(_ date: Date?, now: Date = Date()) -> String {
        guard let date else { return "" }
        let seconds = max(1, Int(now.timeIntervalSince(date).rounded()))
        if seconds < 60 { return "now" }
        let minutes = Int((Double(seconds) / 60).rounded())
        if minutes < 60 { return "\(minutes) min" }
        let hours = Int((Double(minutes) / 60).rounded())
        if hours < 24 { return "\(hours) h" }
        return "\(Int((Double(hours) / 24).rounded())) d"
    }

    /// A message on one line: each line break a "⏎".
    static func oneLine(_ text: String) -> String {
        text.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: #"\s*\n\s*"#, with: " ⏎ ", options: .regularExpression)
    }

    /// JavaScript's `Math.round`: halves go up, also below zero.
    static func round(_ value: Double) -> Int {
        Int(floor(value + 0.5))
    }
}

/// The composer's sizes, read once before anything is written
/// (composer-recall `measure`).
struct RecallGeometry {
    /// The pill's width and height.
    var width: Double
    var base: Double
    /// Rows of depth (lean, shrink, blur, fade) per row the shape holds:
    /// the wheel spreads its depth across however many rows it shows; the
    /// queued edit's one row is one row deep.
    var spread = 1.0
    /// The most rows' worth the shoulders curve in by: all of them for the
    /// wheel, one for the canvas (grown.ts `taperRows`).
    var taperRows = Double.infinity
    /// How far the grown top reaches past the pill's left and right edges:
    /// the canvas's, where its side edges were dragged out (grown.ts
    /// `wide`); the wheel's and the queued edit's are never wider.
    var wide = Wide()
}

/// How far a canvas stands past the pill's left and right edges, points.
struct Wide: Equatable {
    var left = 0.0
    var right = 0.0
}

// MARK: The frame clock

/// A display link that runs `step` every frame until it answers false.
@MainActor
final class FrameTicker: NSObject {
    private var link: CADisplayLink?
    private var step: ((CFTimeInterval) -> Bool)?

    var running: Bool { link != nil }

    func run(_ step: @escaping (CFTimeInterval) -> Bool) {
        stop()
        self.step = step
        let link = CADisplayLink(target: self, selector: #selector(tick))
        link.add(to: .main, forMode: .common)
        self.link = link
    }

    func stop() {
        link?.invalidate()
        link = nil
        step = nil
    }

    @objc private func tick() {
        guard let step else { return stop() }
        if !step(CACurrentMediaTime()) { stop() }
    }
}

// MARK: The grown shape

/// The grown composer, drawn behind the pill (composer-recall `.halo`):
/// solid raised, not the pill's glass, so the transcript never reads through
/// the rows; only its top fades, where the oldest row is already fading,
/// and its edge in the control ink fades in under it. Its drop (two shadows
/// that follow the drawn shape, as `drop-shadow()` does) and the frosted
/// bands of its fade come in once it stands still, and step aside while it
/// moves. It lives in the pill's ring, under the pill.
@MainActor
final class RecallHalo: UIView {
    private(set) var geometry: RecallGeometry
    private(set) var open = 0.0
    private(set) var extra: Double
    /// The shape just painted, in this view's box, and the box in the ring.
    var onPaint: (CGPath, CGRect) -> Void = { _, _ in }

    private let body = CALayer()
    private let fill = CAGradientLayer()
    private let fillShape = CAShapeLayer()
    private let edge = CAGradientLayer()
    private let edgeShape = CAShapeLayer()
    private var bands: [FrostBand] = []
    private let ticker = FrameTicker()
    private(set) var settled = false
    private var path = CGMutablePath() as CGPath
    /// Its grown top fades out over the transcript, frosted (the wheel's);
    /// a canvas's is solid to its edge (grown.ts `fade: false`).
    private let fades: Bool
    /// A morph is running.
    var moving: Bool { ticker.running }

    init(_ geometry: RecallGeometry, extra: Double, fades: Bool = true) {
        self.geometry = geometry
        self.extra = extra
        self.fades = fades
        super.init(frame: .zero)
        isUserInteractionEnabled = false
        layer.addSublayer(body)
        body.addSublayer(fill)
        body.addSublayer(edge)
        fill.mask = fillShape
        edge.mask = edgeShape
        edgeShape.fillColor = nil
        edgeShape.strokeColor = UIColor.black.cgColor
        edgeShape.lineWidth = 1
        for layer in [body, fill, fillShape, edge, edgeShape] { layer.actions = Self.still }
        layer.shadowOpacity = 0
        body.shadowOpacity = 0
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (halo: RecallHalo, _: UITraitCollection) in
            halo.colour()
            if halo.settled, halo.fades { halo.frost() }
        }
        colour()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("RecallHalo is built in code")
    }

    private static let still: [String: any CAAction] = [
        "bounds": NSNull(), "position": NSNull(), "path": NSNull(), "locations": NSNull(), "colors": NSNull(),
        "shadowPath": NSNull(), "shadowOpacity": NSNull(), "frame": NSNull(), "contents": NSNull(),
    ]

    /// The wheel was measured again (the keyboard moved): the depth per row
    /// the shoulders' taper follows, taken by the next paint.
    var spread: Double {
        get { geometry.spread }
        set { geometry.spread = newValue }
    }

    /// The pill's height changed under the shape (the field grew a line).
    var base: Double {
        get { geometry.base }
        set {
            guard abs(newValue - geometry.base) > 0.25 else { return }
            geometry.base = newValue
            paint()
            if settled, fades { frost() }
        }
    }

    private func colour() {
        let traits = traitCollection
        let raised = Palette.surfaceRaised.resolvedColor(with: traits)
        let control = Palette.borderControl.resolvedColor(with: traits)
        let top = fades ? 0.0 : 1.0
        fill.colors = [raised.withAlphaComponent(top).cgColor, raised.cgColor, raised.cgColor]
        edge.colors = [control.withAlphaComponent(top).cgColor, control.cgColor, control.cgColor]
        // The far drop on the shape, then the near one on the shape and its far drop, as the filter chain falls.
        let far = Shadow.shadowDrop[0], close = Shadow.shadowDropNear[0]
        body.shadowColor = far.ink.color.resolvedColor(with: traits).cgColor
        body.shadowOffset = CGSize(width: far.x, height: far.y)
        body.shadowRadius = far.blur * BoxShadow.blurScale
        layer.shadowColor = close.ink.color.resolvedColor(with: traits).cgColor
        layer.shadowOffset = CGSize(width: close.x, height: close.y)
        layer.shadowRadius = close.blur * BoxShadow.blurScale
    }

    /// How far the canvas's grown top stands past the pill's sides, taken by the next paint.
    var wide: Wide {
        get { geometry.wide }
        set { geometry.wide = newValue }
    }

    /// Writes only: every size it needs was measured when it grew. Its box
    /// reaches past the pill's sides as far as the canvas stands wide.
    func paint() {
        let shape = Recall.outline(geometry, open: open, extra: extra)
        let left = max(0, geometry.wide.left), right = max(0, geometry.wide.right)
        var shift = CGAffineTransform(translationX: left, y: 0)
        let local = shape.path.copy(using: &shift) ?? shape.path
        path = local
        let box = CGRect(x: -left, y: geometry.base - shape.height, width: geometry.width + left + right, height: shape.height)
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        frame = box
        let bounds = CGRect(origin: .zero, size: box.size)
        for layer in [body, fill, fillShape, edge, edgeShape] as [CALayer] { layer.frame = bounds }
        fillShape.path = local
        edgeShape.path = local
        // Only the top of the grown part fades: behind every row it is solid.
        let height = max(1, shape.height)
        let middle = min(24, shape.up * 0.25) / height
        let edgeBase = max(0.04, min(40, shape.up * 0.4) / height)
        fill.locations = [0, NSNumber(value: middle), 1]
        edge.locations = [0.04, NSNumber(value: edgeBase), 1]
        CATransaction.commit()
        onPaint(local, box)
    }

    /// Runs the shape to `open` and `extra` over `duration`; the drop and the
    /// frost are off while it moves, and come in once it stands still grown.
    func morph(to target: Double, extra targetExtra: Double, duration: TimeInterval, done: (() -> Void)? = nil) {
        ticker.stop()
        unsettle()
        let fromOpen = open, fromExtra = extra
        guard duration > 0, !UIAccessibility.isReduceMotionEnabled, window != nil else {
            open = target
            extra = targetExtra
            paint()
            settle()
            done?()
            return
        }
        let start = CACurrentMediaTime()
        ticker.run { [weak self] now in
            guard let self else { return false }
            let q = min(1, (now - start) / duration)
            open = fromOpen + (target - fromOpen) * q
            extra = fromExtra + (targetExtra - fromExtra) * Recall.drawer(q)
            paint()
            guard q >= 1 else { return true }
            settle()
            done?()
            return false
        }
    }

    func stop() {
        ticker.stop()
    }

    /// Stands grown at `extra` this frame, with no morph (a canvas's height
    /// under the grab): the drop and the frost step aside until `settle`.
    func stand(extra next: Double) {
        ticker.stop()
        unsettle()
        open = 1
        extra = next
        paint()
    }

    /// Standing still grown: the drop (and the frost, where it fades) come in.
    func settle() {
        guard open == 1 else { return }
        settled = true
        fade(to: 1)
        if fades { frost() }
        layer.rasterizationScale = traitCollection.displayScale
        layer.shouldRasterize = true
    }

    func unsettle() {
        guard settled else { return }
        settled = false
        layer.shouldRasterize = false
        fade(to: 0)
        for band in bands { band.show(false) }
    }

    private func fade(to opacity: Float) {
        for layer in [layer, body] {
            if window != nil, !UIAccessibility.isReduceMotionEnabled {
                let animation = CABasicAnimation(keyPath: "shadowOpacity")
                animation.fromValue = layer.presentation()?.shadowOpacity ?? layer.shadowOpacity
                animation.toValue = opacity
                animation.duration = Motion.durFade
                animation.timingFunction = Motion.easeOut.function
                layer.add(animation, forKey: "shadowOpacity")
            }
            layer.shadowOpacity = opacity
        }
    }

    /// The frosted fade (composer-recall `.halo-band`): each band a step
    /// lower down the fade, clipped to the shape, fading in over its first
    /// step and out over its last, the last holding to its foot. Not under
    /// Reduce Transparency, where the fade stays a plain fade.
    private func frost() {
        guard !UIAccessibility.isReduceTransparencyEnabled, let ring = superview else { return }
        if bands.isEmpty {
            bands = Recall.blurs.map { FrostBand(blur: $0) }
            for band in bands { ring.insertSubview(band, belowSubview: self) }
        }
        for (i, band) in bands.enumerated() {
            let last = i == bands.count - 1
            let top = Double(i) * Recall.band
            let height = (last ? 3 : 2) * Recall.band
            band.frame = CGRect(x: frame.minX, y: frame.minY + top, width: frame.width, height: height)
            var shift = CGAffineTransform(translationX: 0, y: -top)
            band.shape(path.copy(using: &shift) ?? path, fadesOut: !last, step: Recall.band)
            band.show(true)
        }
    }

    /// Takes the shape and its frost out of the ring.
    func remove() {
        ticker.stop()
        for band in bands { band.removeFromSuperview() }
        bands = []
        removeFromSuperview()
    }
}

/// One band of the frosted fade: the transcript behind it, blurred by
/// `blur` points. UIKit has no public blur of a given radius, so the band
/// holds a blur effect part of the way in with a paused animator (the
/// effect's own interpolation), at `blur` against the full effect's
/// radius. The animator is let go whenever the band leaves the window.
@MainActor
final class FrostBand: UIVisualEffectView {
    /// About how far the full `.regular` blur reaches, in points: the
    /// effect's radius is not public, so the bands' strengths are ratios of it.
    private static let fullBlur = 20.0
    private let blur: Double
    private var animator: UIViewPropertyAnimator?
    private let cover = UIImageView()

    init(blur: Double) {
        self.blur = blur
        super.init(effect: nil)
        isUserInteractionEnabled = false
        cover.alpha = 0
        mask = cover
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("FrostBand is built in code")
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        if window == nil {
            animator?.stopAnimation(true)
            animator = nil
            effect = nil
        } else if animator == nil {
            let animator = UIViewPropertyAnimator(duration: 1, curve: .linear) { [weak self] in
                self?.effect = UIBlurEffect(style: .regular)
            }
            animator.pausesOnCompletion = true
            animator.fractionComplete = min(1, blur / Self.fullBlur)
            self.animator = animator
        }
    }

    /// The band's mask: `path` (in the band's own box) filled under a fade
    /// in over `step`, then out over the next unless it is the last band.
    func shape(_ path: CGPath, fadesOut: Bool, step: Double) {
        let size = bounds.size
        guard size.width > 0, size.height > 0 else { return }
        let image = UIGraphicsImageRenderer(size: size).image { context in
            let cg = context.cgContext
            cg.addPath(path)
            cg.clip()
            let colours = (fadesOut ? [0.0, 1, 0] : [0.0, 1, 1]).map { UIColor(white: 0, alpha: $0).cgColor } as CFArray
            let stops: [CGFloat] = fadesOut ? [0, step / size.height, min(1, 2 * step / size.height)] : [0, step / size.height, 1]
            guard let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceGray(), colors: colours, locations: stops) else { return }
            cg.drawLinearGradient(gradient, start: .zero, end: CGPoint(x: 0, y: size.height), options: [])
        }
        cover.frame = bounds
        cover.image = image
    }

    func show(_ shown: Bool) {
        let alpha: CGFloat = shown ? 1 : 0
        guard window != nil, !UIAccessibility.isReduceMotionEnabled else {
            cover.alpha = alpha
            return
        }
        Motion.easeOut.animator(Motion.durFade) { self.cover.alpha = alpha }.startAnimation()
    }
}

// MARK: A ghost row

/// The faces a wheel's rows are set in, made once as it opens: a role's
/// font is its variable face scaled by Dynamic Type, made again on every
/// read, and every row coming into view would otherwise make each anew.
@MainActor
struct RecallFaces {
    /// The field's line height.
    let line: Double
    /// The words: the field's face in its ink, the selected ink on the line,
    /// muted ("Nothing you sent here matches"), and the empty draft's hint.
    let strong: [NSAttributedString.Key: Any]
    let selected: [NSAttributedString.Key: Any]
    let muted: [NSAttributedString.Key: Any]
    let subtle: [NSAttributedString.Key: Any]
    /// When it was sent (`font: 400 12px/22px` on the row's line box), with
    /// tabular figures, muted and on the line; and the "Queued" tag.
    let meta: [NSAttributedString.Key: Any]
    let metaSelected: [NSAttributedString.Key: Any]
    let queued: [NSAttributedString.Key: Any]

    init() {
        let field = ComposerView.fieldRole
        line = field.lineHeight
        strong = field.attributes(color: Palette.inkStrong)
        selected = field.attributes(color: Palette.selectedInk)
        muted = field.attributes(color: Palette.inkMuted)
        subtle = field.attributes(color: Palette.inkSubtle)
        let role = TypeRole(weight: .regular, size: TypeScale.textMeta ... TypeScale.textMeta, leading: line / TypeScale.textMeta,
                            family: FontFamily.fontBody)
        queued = role.attributes(color: Palette.statusAttnInk)
        func tabular(_ color: UIColor) -> [NSAttributedString.Key: Any] {
            var attributes = role.attributes(color: color)
            if let font = attributes[.font] as? UIFont {
                attributes[.font] = UIFont(descriptor: font.fontDescriptor.addingAttributes([.featureSettings: [[
                    UIFontDescriptor.FeatureKey.type: kNumberSpacingType,
                    UIFontDescriptor.FeatureKey.selector: kMonospacedNumbersSelector,
                ]]]), size: font.pointSize)
            }
            return attributes
        }
        meta = tabular(Palette.inkMuted)
        metaSelected = tabular(Palette.selectedInk)
    }
}

/// One row of the wheel (composer-recall `.ghost`): the words on one line in
/// the field's own face, and, at its end, when it was sent (and "Queued" for
/// a send not read yet). On the field's line, a message's words and time
/// take the selected ink; the reader's own draft keeps the field's ink.
@MainActor
final class RecallRow: UIView {
    enum Kind {
        case draft
        case sent
        /// "Nothing you sent here matches".
        case none
    }

    let kind: Kind
    var onActivate: () -> Void = {}
    /// Its blurred copy is ready, drawn in `style`: the wheel keeps it for
    /// the row's next time in view in that appearance.
    var onBlurred: (UIImage, UIUserInterfaceStyle, Double) -> Void = { _, _, _ in }
    /// It changed appearance, and let its blurred copy go.
    var onRestyled: () -> Void = {}
    /// Rows of depth it stands at, as last drawn (the DEBUG probe reads it).
    var depth = 0.0
    /// Points of blur it is softened by, as last drawn.
    private(set) var blur = 0.0
    /// Points of blur it will stand at once the roll comes to rest: what
    /// its blurred copy is drawn at, so at rest it shows that copy alone.
    private(set) var wanted = 0.0
    /// The blur the copy it shows was drawn at.
    private var softBlur = 0.0
    /// It stands at the width its blurred copy is drawn at: the shape's,
    /// clear of the field's line. Only then is a copy drawn for it or shown.
    var full = false
    private let content = UIView()
    private let words = UILabel()
    private let time = UILabel()
    private let queuedTag = TagLabel()
    private let soft = UIImageView()
    private let faces: RecallFaces
    private let text: String
    private let marks: Set<[UInt16]>
    private let date: Date?
    private let queued: Bool
    private let showsMeta: Bool
    private var picked = false
    /// The blur of the copy being drawn for it, off the main thread.
    private var blurring: Double?
    /// Counts the copies let go (the row was resized or changed appearance):
    /// a copy landing for an older one is dropped.
    private var generation = 0
    #if DEBUG
    /// How much of its blurred copy shows (the `-recall-probe` reads it).
    var softShown: Double { Double(soft.alpha) }
    /// Its words' and its time's boxes, in its own space, by the ink they
    /// are drawn in now (the probe's contrast as drawn).
    var probeBoxes: [(name: String, box: CGRect)] {
        let ink = switch kind {
        case .none: "muted"
        case .draft: text.isEmpty ? "subtle" : "strong"
        case .sent: picked ? "selected" : "strong"
        }
        let box = words.frame.width > 0 ? [(ink, words.frame)] : []
        guard showsMeta, time.frame.width > 0 else { return box }
        return box + [(picked ? "selected time" : "muted time", time.frame)]
    }

    /// Its words and time drawn sharp at full strength, in its appearance,
    /// `pad` points of room around them (the probe's blur sweep).
    func probeSharp() -> UIImage {
        draw()
    }
    #endif

    init(kind: Kind, text: String, marks: Set<[UInt16]> = [], date: Date? = nil, queued: Bool = false, showsMeta: Bool, faces: RecallFaces) {
        self.kind = kind
        self.faces = faces
        self.text = text
        self.marks = marks
        self.date = date
        self.queued = queued
        self.showsMeta = showsMeta && kind == .sent
        super.init(frame: .zero)
        isUserInteractionEnabled = false
        layer.anchorPoint = CGPoint(x: 0.5, y: 1)
        addSubview(content)
        addSubview(soft)
        soft.alpha = 0
        for label in [words, time] as [UILabel] {
            label.numberOfLines = 1
            content.addSubview(label)
        }
        words.lineBreakMode = .byTruncatingTail
        if queued, self.showsMeta {
            queuedTag.attributedText = NSAttributedString(string: "Queued", attributes: faces.queued)
            queuedTag.backgroundColor = Palette.statusAttnBg
            content.addSubview(queuedTag)
        }
        isAccessibilityElement = true
        accessibilityTraits = .button
        // A blurred copy holds the inks of the appearance it was drawn in.
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (row: RecallRow, _: UITraitCollection) in
            row.forgetBlur()
            row.onRestyled()
        }
        render()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("RecallRow is built in code")
    }

    private func render() {
        let words: [NSAttributedString.Key: Any] = switch kind {
        case .none: faces.muted
        case .draft: faces.strong
        case .sent: picked ? faces.selected : faces.strong
        }
        if kind == .draft, text.isEmpty {
            self.words.attributedText = NSAttributedString(string: "Your draft · type to search", attributes: faces.subtle)
        } else {
            let line = Recall.oneLine(text)
            let string = NSMutableAttributedString(string: line, attributes: words)
            if !marks.isEmpty { mark(line, in: string) }
            self.words.attributedText = string
        }
        if showsMeta {
            let ago = Recall.ago(date)
            time.attributedText = NSAttributedString(string: queued ? " · \(ago)" : ago, attributes: picked ? faces.metaSelected : faces.meta)
        }
        time.isHidden = !showsMeta
        accessibilityLabel = switch kind {
        case .none: "Nothing you sent here matches"
        case .draft: text.isEmpty ? "Your draft, empty" : "Your draft: \(text)"
        case .sent: [text, queued ? "queued" : nil, date.map { _ in Recall.ago(date) }].compactMap(\.self).joined(separator: ", ")
        }
        accessibilityTraits = picked ? [.button, .selected] : .button
        setNeedsLayout()
    }

    /// The message's words that matched, marked (`.ghost mark`).
    private func mark(_ line: String, in string: NSMutableAttributedString) {
        var at = 0
        for token in RecallSearch.tokenize(line) {
            let length = token.utf16.count
            if let term = RecallSearch.process(token), marks.contains(term) {
                string.addAttribute(.backgroundColor, value: Palette.selection, range: NSRange(location: at, length: length))
            }
            at += length
            // Past the separators that ended it.
            let rest = (line as NSString).substring(from: min(at, (line as NSString).length))
            at += rest.unicodeScalars.prefix { RecallSearch.separates($0) }.reduce(0) { $0 + UTF16.width($1) }
        }
    }

    /// On the field's line or not: the words and the time ease to their ink.
    func pick(_ picked: Bool) {
        guard picked != self.picked else { return }
        self.picked = picked
        if kind == .sent, window != nil, !UIAccessibility.isReduceMotionEnabled {
            for label in [words, time] {
                let fade = CATransition()
                fade.type = .fade
                fade.duration = Motion.durControl
                fade.timingFunction = Motion.easeOut.function
                label.layer.add(fade, forKey: "ink")
            }
        }
        render()
    }

    /// Softer the further the row has risen, `blur` points now and `wanted`
    /// once the roll rests. The sharp words give way to a blurred copy of
    /// them drawn at `wanted`: at rest the copy alone shows, exactly that
    /// blur; on the way there a share of it, as much as the row has of its
    /// blur. A row with none is never blurred. The copy is drawn off the
    /// main thread (`blurInBackground`), so no frame waits on a blur; until
    /// it lands the row shows the copy it had, or its sharp words.
    func soften(_ blur: Double, wanted: Double) {
        self.blur = blur
        self.wanted = wanted
        showSoftness()
    }

    /// Points of blur below which a row is drawn sharp.
    private static let least = 0.005

    /// The copy it should show at rest is not the one it shows.
    var needsCopy: Bool {
        full && wanted > Self.least && (soft.image == nil || abs(softBlur - wanted) > 1e-4)
    }

    /// It needs a copy, and none is being drawn at the blur it wants: the
    /// wheel begins one, in this frame or a later one.
    var waitsForBlur: Bool {
        needsCopy && blurring.map { abs($0 - wanted) > 1e-4 } ?? true
    }

    /// Soft, and not showing a copy drawn at the blur it has now (the probe reads it at rest).
    var blurPending: Bool {
        full && blur > Self.least && (soft.image == nil || abs(softBlur - blur) > 1e-4)
    }

    /// A copy blurred for this row before, `at` points, at this width and
    /// in this appearance (the wheel keeps them).
    func useBlurred(_ image: UIImage, at blur: Double) {
        placeSoft()
        soft.image = image
        softBlur = blur
        showSoftness()
    }

    /// Its blurred copy no longer matches it (its width or its appearance
    /// changed): the words show sharp until a new one is drawn.
    func forgetBlur() {
        generation += 1
        blurring = nil
        soft.image = nil
        showSoftness()
    }

    /// `width` wide, its foot's middle at `center`: a new width lets its blurred copy go.
    func place(width: Double, center: CGPoint) {
        if abs(bounds.width - width) > 0.25 {
            bounds = CGRect(x: 0, y: 0, width: width, height: Recall.row)
            if soft.image != nil || blurring != nil { forgetBlur() }
        }
        self.center = center
    }

    private func showSoftness() {
        let share = soft.image == nil || softBlur <= 0 ? 0 : min(1, max(0, blur / softBlur))
        soft.alpha = share
        content.alpha = 1 - share
    }

    static let pad = 8.0

    private func placeSoft() {
        soft.frame = bounds.insetBy(dx: -Self.pad, dy: -Self.pad)
    }

    /// Its words and time drawn sharp at full strength, in its own
    /// appearance, with `pad` around them.
    private func draw() -> UIImage {
        let pad = Self.pad
        layoutIfNeeded()
        let shown = content.alpha
        content.alpha = 1
        defer { content.alpha = shown }
        let size = CGSize(width: bounds.width + pad * 2, height: bounds.height + pad * 2)
        var drawn = UIImage()
        traitCollection.performAsCurrent {
            drawn = UIGraphicsImageRenderer(size: size).image { context in
                context.cgContext.translateBy(x: pad, y: pad)
                content.layer.render(in: context.cgContext)
            }
        }
        return drawn
    }

    /// Draws its copy at the blur it wants, off the main thread. A copy
    /// landing at another blur than it wants by then is kept by the wheel
    /// and shown only while it has none.
    func blurInBackground() {
        guard bounds.width > 0 else { return }
        let blur = wanted
        blurring = blur
        let drawn = draw()
        let style = traitCollection.userInterfaceStyle
        let generation = generation
        let radius = Float(blur * drawn.scale)
        Task { [weak self] in
            let image = await Task.detached(priority: .userInitiated) { Self.blurred(drawn, radius: radius) }.value
            guard let self, generation == self.generation, let image else { return }
            if blurring == blur { blurring = nil }
            onBlurred(image, style, blur)
            if abs(wanted - blur) <= 1e-4 || soft.image == nil { useBlurred(image, at: blur) }
        }
    }

    /// The first blur pays for Core Image's start: paid as a wheel opens, before any row needs one.
    nonisolated static func warm() {
        Task.detached(priority: .userInitiated) {
            let pixel = UIGraphicsImageRenderer(size: CGSize(width: 4, height: 4)).image { _ in }
            _ = blurred(pixel, radius: 1)
        }
    }

    /// `drawn` blurred by a Gaussian of `radius` pixels' standard deviation
    /// (CIGaussianBlur's radius is the deviation, as CSS `blur()`'s length
    /// is), blended in sRGB's own encoding as the screen and the web's
    /// `filter: blur()` blend: a linear-light blur thins dark words on a
    /// light surface.
    nonisolated static func blurred(_ drawn: UIImage, radius: Float) -> UIImage? {
        guard let input = CIImage(image: drawn) else { return nil }
        let filter = CIFilter.gaussianBlur()
        filter.inputImage = input
        filter.radius = radius
        guard let output = filter.outputImage?.cropped(to: input.extent),
              let cg = context.createCGImage(output, from: input.extent) else { return nil }
        return UIImage(cgImage: cg, scale: drawn.scale, orientation: .up)
    }

    private nonisolated static let context = CIContext(options: [
        .workingColorSpace: CGColorSpace(name: CGColorSpace.extendedSRGB) as Any,
    ])

    override func layoutSubviews() {
        super.layoutSubviews()
        content.frame = bounds
        let line = faces.line
        let top = max(0, (bounds.height - line) / 2)
        var end = bounds.width
        if showsMeta {
            let timeWidth = ceil(time.sizeThatFits(CGSize(width: bounds.width, height: line)).width)
            end -= timeWidth
            time.frame = CGRect(x: end, y: top, width: timeWidth, height: line)
            if queuedTag.superview != nil {
                let size = queuedTag.intrinsicContentSize
                end -= size.width
                queuedTag.frame = CGRect(x: end, y: top + (line - size.height) / 2, width: size.width, height: size.height)
            }
            end -= Space.space3
        }
        words.frame = CGRect(x: 0, y: top, width: max(0, end), height: line)
    }

    override func accessibilityActivate() -> Bool {
        onActivate()
        return true
    }
}

/// A pill of text (`.ghost .q`, the query chip's count): the label inset by
/// its padding, round at the ends.
final class TagLabel: UILabel {
    var insets = UIEdgeInsets(top: 1, left: 6, bottom: 1, right: 6)

    override init(frame: CGRect) {
        super.init(frame: frame)
        layer.cornerCurve = .continuous
        clipsToBounds = true
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("TagLabel is built in code")
    }

    override var intrinsicContentSize: CGSize {
        let size = super.intrinsicContentSize
        return CGSize(width: ceil(size.width) + insets.left + insets.right, height: ceil(size.height) + insets.top + insets.bottom)
    }

    override func drawText(in rect: CGRect) {
        super.drawText(in: rect.inset(by: insets))
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        layer.cornerRadius = bounds.height / 2
    }
}

// MARK: The query chip

/// What the reader has typed to filter by, and how many messages match
/// (composer-recall `.qchip`): on the field's last line, at its end.
@MainActor
final class QueryChip: UIView {
    private let glyph = GlyphView(.search, size: 13, tint: Palette.inkMuted)
    private let query = KitLabel(TypeRole(weight: .medium, size: TypeScale.textMeta ... TypeScale.textMeta, leading: 1.3, family: FontFamily.fontBody))
    private let count = KitLabel(TypeRole(weight: .medium, size: TypeScale.textMeta ... TypeScale.textMeta, leading: 1.3, family: FontFamily.fontBody),
                                 ink: Palette.inkMuted)

    override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = false
        backgroundColor = Palette.surfaceRecess
        layer.cornerCurve = .continuous
        layer.borderWidth = 1
        query.lineBreakMode = .byTruncatingTail
        query.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        count.tabular = true
        let row = UIStackView(arrangedSubviews: [glyph, query, count])
        row.spacing = 5
        row.alignment = .center
        row.translatesAutoresizingMaskIntoConstraints = false
        addSubview(row)
        NSLayoutConstraint.activate([
            row.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 8),
            row.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -8),
            row.topAnchor.constraint(equalTo: topAnchor, constant: 3),
            row.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -3),
        ])
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (chip: QueryChip, _: UITraitCollection) in chip.paint() }
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("QueryChip is built in code")
    }

    private func paint() {
        layer.borderColor = Palette.borderHairline.resolvedColor(with: traitCollection).cgColor
    }

    func show(_ text: String, matches: Int) {
        query.text = text
        count.text = "\(matches)"
        accessibilityLabel = "\(matches) matching \(text)"
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        layer.cornerRadius = bounds.height / 2
    }
}

// MARK: The wheel

/// The recall wheel, while it is up: its list (the draft and what was sent,
/// newest first, or the matches of what the reader types), where it has
/// rolled to, and the views it rolls them in. Opened by ↑, a swipe up from
/// the composer, or VoiceOver's "Show what you sent" on the field; ↑ and ↓
/// roll it, Return takes the row on the field's line into the composer,
/// ⌘Return sends it as it is, Escape goes back to the draft (clearing a
/// filter first), and with an empty draft what is typed filters it.
///
/// It stands half the window tall on a phone, 40% on an iPad or the Mac
/// (`Recall.reach`). Only the rows in view are built: a row
/// rolling out of the shape is let go, and its blurred copy kept for its
/// next time in view.
@MainActor
final class RecallWheel: NSObject, UIGestureRecognizerDelegate {
    private enum Entry {
        case draft
        case sent(RecallEntry, marks: Set<[UInt16]>)
    }

    private unowned let composer: ComposerView
    /// What was sent, newest first: older entries join at the end as the
    /// pages before them are read.
    private var entries: [RecallEntry]
    /// How many entries it held when it last asked for the page before them.
    private var askedAt: Int?
    let draft: String
    private let caret: NSRange
    /// Whether keys reach the wheel (↑ or VoiceOver's action); a swipe leaves the keyboard as it was.
    let keys: Bool
    private(set) var closing = false
    /// Dismissed: whatever a fold still under way would do next is dropped.
    private var cut = false
    private(set) var query = ""

    private var geometry = RecallGeometry(width: 0, base: 0)
    private var field = CGRect.zero
    private var halo: RecallHalo?
    private let ghosts = UIView()
    private let inner = UIView()
    private let clip = CAShapeLayer()
    private let top = CAGradientLayer()
    private var chip: QueryChip?
    /// Where the row on the field's line stops while a search filters: a
    /// step short of the query chip, in the ring.
    private var chipStop: Double?
    private var list: [Entry] = []
    /// The rows built, by their place in `list`: only those in view.
    private var rows: [Int: RecallRow] = [:]
    /// A row's blurred copy, by its place in `list`, the appearance it was
    /// drawn in and its blur (in ten-thousandths of a point).
    private struct Blurred: Hashable {
        let row: Int
        let style: UIUserInterfaceStyle
        let blur: Int

        init(row: Int, style: UIUserInterfaceStyle, blur: Double) {
            self.row = row
            self.style = style
            self.blur = Int((blur * 10000).rounded())
        }
    }

    /// Blurred copies of rows in view and near it, at the shape's width.
    private var blurred: [Blurred: UIImage] = [:]
    private var search: RecallSearch?
    private let showsMeta: Bool
    /// The rows' faces, made once as it opens.
    private let faces = RecallFaces()
    /// Rows above the field's line, and how far back the oldest stands
    /// (`Recall.depth`): measured at opening, and again when the keyboard moves.
    private var above = 1
    private var depth = 3
    /// The foot the rows were measured against: the window's, or the keyboard's top.
    private var foot = 0.0

    // The spring: `pos` rolls toward the nearest whole entry of `target`.
    private var pos = 0.0
    private var target = 0.0
    private var vel = 0.0
    private var shown = 0.0
    private var detent: Int?
    private var settled: (() -> Void)?
    private let spring = FrameTicker()
    /// Builds the rows and begins the blurred copies a fast roll left
    /// undone, once it stands still: a frame at a time, bounded as a roll is.
    private let finish = FrameTicker()
    private var unfinished = false
    private var outside: OutsideTouch?

    // A drag on the rows, or the swipe up from the composer that brought it up.
    private var lastY = 0.0
    private var lastTime = 0.0
    private var flick = 0.0
    private var swipeOrigin = 0.0
    private var scrolled = 0.0

    #if DEBUG
    /// The `-recall-probe` hears how long each drawn frame's rows took, how
    /// many rows it built and how many blurred copies it began.
    var probeCost: ((Double, Int, Int) -> Void)?
    private var probeBuilt = 0
    private var probeBlurs = 0
    #endif

    init(composer: ComposerView, entries: [RecallEntry], draft: String, caret: NSRange, keys: Bool) {
        self.composer = composer
        self.entries = entries
        self.draft = draft
        self.caret = caret
        self.keys = keys
        showsMeta = (composer.window?.bounds.width ?? 1000) > 560
        super.init()
    }

    var ghostsView: UIView { ghosts }

    /// Rows of depth per row: the oldest row in view stands `depth` back.
    private var spread: Double { Double(depth) / Double(above) }

    /// How many rows stand between the pill's top and half the window, or
    /// half the room above the keyboard while it is up (the host's keyboard
    /// guide sits at the safe area's foot while it is down).
    private func measureRows() {
        guard let window = composer.window else { return }
        let ring = composer.ring.convert(composer.ring.bounds, to: nil)
        foot = Double(window.bounds.height)
        if let host = composer.superview {
            let keyboard = host.keyboardLayoutGuide.layoutFrame
            if keyboard.height > host.safeAreaInsets.bottom + 1 { foot = host.convert(keyboard, to: nil).minY }
        }
        let regular = composer.traitCollection.horizontalSizeClass == .regular
        above = Recall.rowsAbove(top: ring.minY, floor: foot, regular: regular)
        depth = Recall.depth(regular: regular)
        geometry.spread = spread
    }

    /// The rows' box: across the shape, from the field's own line to the rows above it.
    private func placeGhosts() {
        let height = Recall.row * Double(above + 1)
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        defer { CATransaction.commit() }
        ghosts.frame = CGRect(x: 0, y: field.maxY - height, width: geometry.width, height: height)
        clip.frame = ghosts.bounds
        inner.frame = ghosts.bounds
        // The oldest row fades out at the top edge instead of being cut through.
        top.frame = inner.bounds
        top.locations = [0, NSNumber(value: 14 / height)]
        for row in rows.values { row.center.y = ghosts.bounds.height }
    }

    /// A row's sides, `off` rows above the field's line (RecallWheel.svelte
    /// `edges`): across the shape, the pill's padding in from each side; on
    /// the line it stops short of the pill's buttons, and of the query chip
    /// while a search filters. A row rising off the line widens to the
    /// shape's side as its words clear the buttons' top, over the room
    /// above its words. Answers its width and whether it is at the shape's.
    private func edges(off: Double) -> (left: Double, width: Double, full: Bool) {
        let pad = field.minX
        let side = geometry.width - pad
        let inkPad = max(1, (Recall.row - faces.line) / 2)
        let onLine = min(1, max(0, (Recall.row - off * Recall.row) / inkPad))
        let stop = min(field.maxX, chipStop ?? field.maxX)
        let right = side - (side - stop) * onLine
        return (pad, max(0, right - pad), onLine == 0)
    }

    /// Row `k` changed appearance while it is up (it let its blurred copy
    /// go, drawn in the other's inks): the copy kept for it in this one, or
    /// a new one drawn in a later frame, once its words are drawn anew.
    private func restyled(_ row: RecallRow, _ k: Int) {
        if !keep(row, k) { finishWhenStill() }
    }

    /// Shows the copy kept for row `k` at the blur it wants, if it needs
    /// one and one is kept: answers whether it still needs one.
    @discardableResult
    private func keep(_ row: RecallRow, _ k: Int) -> Bool {
        guard row.needsCopy else { return false }
        guard let image = blurred[Blurred(row: k, style: row.traitCollection.userInterfaceStyle, blur: row.wanted)] else { return true }
        row.useBlurred(image, at: row.wanted)
        return false
    }

    /// The keyboard came or went while the wheel is up (VoiceOver's action
    /// focuses the field, and the keyboard rises after the wheel measured):
    /// it stands half the new room tall, the shape following over `durFade`.
    @objc private func keyboardMoved() {
        guard !closing, let halo else { return }
        let before = above
        composer.superview?.layoutIfNeeded()
        measureRows()
        guard above != before else { return }
        halo.spread = spread
        placeGhosts()
        draw(shown)
        halo.morph(to: 1, extra: extraFor(), duration: Motion.durFade)
    }

    private var last: Int { max(0, list.count - 1) }
    private func clamp(_ value: Double) -> Double { max(0, min(Double(last), value)) }
    private func clampSoft(_ value: Double) -> Double {
        value < 0 ? value * 0.35 : value > Double(last) ? Double(last) + (value - Double(last)) * 0.35 : value
    }

    /// It keeps one row of room even when a search leaves nothing, so it
    /// stays the wheel and never drops back to the bare pill.
    private func extraFor() -> Double {
        let tall = query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? above : min(max(list.count - 1, 1), above)
        return Double(tall) * Recall.row + 6
    }

    // MARK: Opening

    func open() {
        let ring = composer.ring
        Feel.prepare()
        // Every size first, before anything is written.
        geometry = RecallGeometry(width: ring.bounds.width, base: ring.bounds.height)
        field = composer.pill.convert(composer.field.frame, to: ring)
        measureRows()
        composer.wheelStepsIn()
        let halo = RecallHalo(geometry, extra: extraFor())
        ring.insertSubview(halo, belowSubview: composer.pill)
        self.halo = halo
        // The rows sit on the field's own line and above it, shown only inside the shape.
        ghosts.layer.mask = clip
        clip.actions = ["path": NSNull(), "bounds": NSNull(), "position": NSNull()]
        inner.isUserInteractionEnabled = false
        top.colors = [UIColor.clear.cgColor, UIColor.black.cgColor]
        inner.layer.mask = top
        ghosts.addSubview(inner)
        placeGhosts()
        NotificationCenter.default.addObserver(self, selector: #selector(keyboardMoved), name: UIResponder.keyboardDidChangeFrameNotification, object: nil)
        ghosts.accessibilityLabel = "What you sent"
        ghosts.isAccessibilityElement = false
        ghosts.shouldGroupAccessibilityChildren = true
        ring.addSubview(ghosts)
        installGestures()
        halo.onPaint = { [weak self] path, box in self?.clipRows(path, box) }
        // What the reader types into an empty composer while it is up: the words it filters by.
        if draft.isEmpty {
            let chip = QueryChip()
            chip.isHidden = true
            ring.addSubview(chip)
            self.chip = chip
        }
        RecallRow.warm()
        buildRows()
        detent = nil
        // It opens rolling to the newest message: the rows' copies are drawn for where they will rest.
        pos = 0; target = clamp(1); vel = 0
        draw(0)
        if keys { Feel.opened() }
        halo.paint()
        halo.morph(to: 1, extra: extraFor(), duration: Motion.durGrow)
        // The newest message rolls down into the field as it grows.
        spin(to: 1)
        let outside = OutsideTouch { [weak self] point in self?.touched(point) }
        composer.window?.addGestureRecognizer(outside)
        self.outside = outside
    }

    private func clipRows(_ path: CGPath, _ box: CGRect) {
        var shift = CGAffineTransform(translationX: box.minX - ghosts.frame.minX, y: box.minY - ghosts.frame.minY)
        clip.path = path.copy(using: &shift)
    }

    private func installGestures() {
        let tap = UITapGestureRecognizer(target: self, action: #selector(tapped(_:)))
        let drag = UIPanGestureRecognizer(target: self, action: #selector(dragged(_:)))
        drag.allowedScrollTypesMask = []
        let scroll = UIPanGestureRecognizer(target: self, action: #selector(scrolled(_:)))
        scroll.allowedScrollTypesMask = .all
        scroll.allowedTouchTypes = []
        for recognizer in [tap, drag, scroll] as [UIGestureRecognizer] {
            recognizer.delegate = self
            ghosts.addGestureRecognizer(recognizer)
        }
    }

    // MARK: The list

    /// The list for the query, with no rows built yet: `draw` builds the ones in view.
    private func buildRows() {
        for row in rows.values { row.removeFromSuperview() }
        rows = [:]
        blurred = [:]
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        if q.isEmpty {
            list = [Entry.draft] + entries.map { Entry.sent($0, marks: []) }
        } else {
            if search == nil { search = RecallSearch(entries.map(\.text)) }
            list = (search?.search(q) ?? []).map { Entry.sent(entries[$0.index], marks: $0.terms) }
        }
        if let chip {
            chip.isHidden = q.isEmpty
            chip.show(query, matches: list.count)
            let size = chip.systemLayoutSizeFitting(UIView.layoutFittingCompressedSize)
            let width = min(ceil(size.width), field.width * 0.45)
            chip.frame = CGRect(x: field.maxX - width, y: field.maxY - Recall.row / 2 - size.height / 2, width: width, height: size.height)
            // While filtering, the row on the line stops short of the chip.
            chipStop = q.isEmpty ? nil : chip.frame.minX - 10
        }
        ghosts.accessibilityElements = []
    }

    /// Row `k`, built as it comes into view: "Nothing you sent here matches"
    /// in the first place when the list is empty.
    private func row(_ k: Int) -> RecallRow {
        if let row = rows[k] { return row }
        let row: RecallRow = if list.isEmpty {
            RecallRow(kind: .none, text: "Nothing you sent here matches", showsMeta: false, faces: faces)
        } else {
            switch list[k] {
            case .draft: RecallRow(kind: .draft, text: draft, showsMeta: showsMeta, faces: faces)
            case let .sent(sent, marks):
                RecallRow(kind: .sent, text: sent.text, marks: marks, date: sent.date, queued: sent.queued, showsMeta: showsMeta, faces: faces)
            }
        }
        row.onActivate = { [weak self] in self?.choose(k) }
        // Kept only while the row is still this list's row `k` (a search rebuilds the list).
        row.onBlurred = { [weak self, weak row] image, style, blur in
            guard let self, let row, rows[k] === row else { return }
            blurred[Blurred(row: k, style: style, blur: blur)] = image
        }
        row.onRestyled = { [weak self, weak row] in
            guard let self, let row, rows[k] === row else { return }
            restyled(row, k)
        }
        inner.addSubview(row)
        rows[k] = row
        return row
    }

    /// Row `row` `off` rows above the line: its sides.
    private func place(_ row: RecallRow, off: Double) {
        let edge = edges(off: off)
        row.place(width: edge.width, center: CGPoint(x: edge.left + edge.width / 2, y: ghosts.bounds.height))
        row.full = edge.full
    }

    /// What was sent, read again (an older page landed): the list takes the
    /// older entries in where it stands. Rows already built keep their
    /// place when only older entries joined; otherwise, or while a search
    /// filters, the list is built again, the wheel held where it was.
    func heard(_ next: [RecallEntry]) {
        guard !closing, next != entries else { return }
        let appended = next.count > entries.count && zip(entries, next).allSatisfy { $0.id == $1.id }
        entries = next
        search = nil
        if appended, query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            list = [Entry.draft] + entries.map { Entry.sent($0, marks: []) }
        } else {
            buildRows()
            pos = clamp(pos)
            target = clamp(target)
        }
        draw(min(shown, Double(last)))
        if let halo, extraFor() != halo.extra { halo.morph(to: 1, extra: extraFor(), duration: Motion.durFade) }
    }

    private func setQuery(_ next: String) {
        query = next
        buildRows()
        // The best match rolls onto the field's line; with no query, the newest message does.
        detent = nil
        pos = clamp(query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 1 : 0)
        target = pos
        vel = 0
        spring.stop()
        draw(pos)
        // The shape keeps only the room the matches need.
        if let halo, extraFor() != halo.extra { halo.morph(to: 1, extra: extraFor(), duration: Motion.durFade) }
    }

    // MARK: The roll

    private func spin(to index: Double) {
        target = clamp(index)
        kick()
    }

    /// A damped spring toward the nearest entry, stepped at the prototype's
    /// 60 frames a second whatever the display's rate, and drawn between steps.
    private func kick() {
        guard !UIAccessibility.isReduceMotionEnabled, composer.window != nil else {
            pos = Double(Recall.round(target))
            target = pos
            vel = 0
            draw(pos)
            fire()
            return
        }
        let step = 1.0 / 60
        var previous = pos
        var accumulated = 0.0
        var then = CACurrentMediaTime()
        spring.run { [weak self] now in
            guard let self else { return false }
            accumulated += min(0.1, now - then)
            then = now
            let goal = Double(Recall.round(target))
            while accumulated >= step {
                accumulated -= step
                previous = pos
                vel += (goal - pos) * 0.12 - vel * 0.32
                pos += vel
                if abs(goal - pos) < 0.002, abs(vel) < 0.002 {
                    pos = goal
                    target = goal
                    vel = 0
                    draw(pos)
                    if unfinished { finishWhenStill() }
                    fire()
                    return false
                }
            }
            draw(previous + (pos - previous) * accumulated / step)
            return true
        }
    }

    private func fire() {
        let done = settled
        settled = nil
        done?()
    }

    /// From the next frame on, while it stands still: the rows and blurred
    /// copies a roll left undone, a frame at a time, bounded as a roll is.
    /// The spring's own last frame calls it too, while its link still runs.
    private func finishWhenStill() {
        guard !finish.running, !closing else { return }
        finish.run { [weak self] _ in
            guard let self, !closing, !spring.running else { return false }
            draw(shown)
            return unfinished
        }
    }

    /// Every row where `p` puts it. Landing on another entry is a detent the
    /// reader feels and hears; overshooting past either end is not.
    private func draw(_ p: Double) {
        #if DEBUG
        let began = CACurrentMediaTime()
        defer { probeCost?(CACurrentMediaTime() - began, probeBuilt, probeBlurs) }
        #endif
        // A frame's work is bounded however fast it rolls: four rows built at
        // most, nearest the line first (a row flying past for a frame is not
        // seen), and two blurred copies begun at most, each at the blur its
        // row will stand at once the roll rests, so they are ready by then:
        // while the spring rolls to its rest, or a finger moves the wheel
        // slowly. What is left is done in the frames after, once it stands still.
        let copies = abs(p - shown) < 0.1 || spring.running
        var blurs = 0
        var built = 0
        unfinished = false
        shown = p
        let line = Recall.round(p)
        // Where the roll will rest: the entry the spring heads for, or the nearest.
        let rest = Double(Recall.round(target))
        // In view: from just under the field's line to just over the shape's top.
        let count = max(1, list.count)
        let low = max(0, Int((p - 1.2).rounded(.up)))
        let high = min(count - 1, Int((p + Double(above) + 0.6).rounded(.down)))
        let gone = rows.keys.filter { $0 < low || $0 > high }
        for k in gone {
            rows[k]?.removeFromSuperview()
            rows[k] = nil
        }
        let held = rows.count
        let spread = spread
        let near = stride(from: low, through: high, by: 1).sorted { abs(Double($0) - p) < abs(Double($1) - p) }
        for k in near {
            if rows[k] == nil {
                guard built < 4 else {
                    unfinished = true
                    continue
                }
                built += 1
            }
            let row = row(k)
            let off = Double(k) - p
            place(row, off: off)
            // Its depth: the rows in view share the wheel's, the oldest standing `depth` back.
            let deep = max(0, off) * spread
            row.depth = deep
            row.layer.transform = Recall.transform(off: off, up: deep)
            // Its blur at rest, if it stands in the shape then.
            let resting = Double(k) - rest
            row.soften(deep * Recall.soft, wanted: resting >= 0 && resting <= Double(above) ? resting * spread * Recall.soft : 0)
            if keep(row, k), row.waitsForBlur {
                if copies, blurs < 2 {
                    row.blurInBackground()
                    blurs += 1
                } else {
                    unfinished = true
                }
            }
            // On the field's line a row is at full strength; above it each is a touch fainter by its depth.
            row.alpha = off >= 0 ? Recall.presence(deep, of: depth) : max(0, 1 + off * 1.6)
            row.pick(line == k)
        }
        if built > 0 || !gone.isEmpty || rows.count != held {
            ghosts.accessibilityElements = rows.keys.sorted().compactMap { rows[$0] }
        }
        // Once more than three a row are kept, only the copies of the rows in view and two past each end stay.
        if blurred.count > 3 * (high - low + 5) {
            blurred = blurred.filter { $0.key.row >= low - 2 && $0.key.row <= high + 2 }
        }
        #if DEBUG
        probeBuilt = built
        probeBlurs = blurs
        #endif
        // Standing still with rows still to build or blur: a frame at a time until none is left.
        if unfinished, !spring.running { finishWhenStill() }
        // Nearing the oldest entry read (within a shape's rows of it), the
        // page before it is read: once for each count of entries held.
        if !list.isEmpty, high + above >= last, askedAt != entries.count {
            askedAt = entries.count
            composer.binding?.readOlder()
        }
        if line >= 0, line <= last, line != detent {
            if let detent, !list.isEmpty { Feel.detent(older: line > detent) }
            detent = line
        }
    }

    // MARK: Keys

    func up() {
        guard !closing else { return }
        spin(to: Double(Recall.round(target) + 1))
    }

    func down() {
        guard !closing else { return }
        if query.isEmpty, Recall.round(target) <= 0 { close(nil, send: false) } else { spin(to: Double(Recall.round(target) - 1)) }
    }

    func escape() {
        guard !closing else { return }
        if !query.isEmpty { setQuery("") } else { backToDraft() }
    }

    /// Words typed while it is up. With an empty draft they filter it, and
    /// stay out of the field; with a draft, typing goes back to it, and the
    /// key lands in it. Answers whether the field takes the words.
    func typed(_ text: String) -> Bool {
        guard !closing else { return true }
        guard draft.isEmpty else {
            close(nil, send: false)
            return true
        }
        let words = text.replacingOccurrences(of: "\n", with: " ")
        if !words.isEmpty { setQuery(query + words) }
        return false
    }

    /// A backspace while it is up; answers whether the field deletes too.
    func backspace() -> Bool {
        guard !closing else { return true }
        guard draft.isEmpty else {
            close(nil, send: false)
            return true
        }
        if !query.isEmpty { setQuery(String(query.dropLast())) }
        return false
    }

    /// Return (`send` false) or ⌘Return: the row on the field's line.
    func take(send: Bool) {
        guard !closing else { return }
        let k = Recall.round(pos)
        guard list.indices.contains(k) else { return }
        switch list[k] {
        case .draft: close(nil, send: false)
        case let .sent(entry, _): close(entry.text, send: send)
        }
    }

    /// Back to the draft, rolling there first unless a filter is up.
    func backToDraft() {
        guard !closing else { return }
        if !query.isEmpty || Recall.round(pos) == 0 {
            close(nil, send: false)
            return
        }
        settled = { [weak self] in self?.close(nil, send: false) }
        spin(to: 0)
    }

    private func choose(_ k: Int) {
        guard !closing else { return }
        if Recall.round(pos) == k { take(send: false) } else { spin(to: Double(k)) }
    }

    // MARK: Touch

    /// A touch anywhere but the composer and the rows sends the wheel back to the draft.
    private func touched(_ point: CGPoint) {
        guard !closing else { return }
        let ring = composer.ring
        if ring.bounds.contains(ring.convert(point, from: nil)) || ghosts.bounds.contains(ghosts.convert(point, from: nil)) { return }
        backToDraft()
    }

    @objc private func tapped(_ tap: UITapGestureRecognizer) {
        guard !closing, !list.isEmpty else { return }
        let rise = (ghosts.bounds.height - tap.location(in: ghosts).y) / Recall.row
        choose(max(0, min(last, Int(floor(rise + shown)))))
    }

    /// Dragging down pulls older messages down into the field.
    @objc private func dragged(_ drag: UIPanGestureRecognizer) {
        guard !closing else { return }
        let y = drag.location(in: ghosts).y
        let now = CACurrentMediaTime()
        switch drag.state {
        case .began:
            lastY = y
            lastTime = now
            flick = 0
            spring.stop()
        case .changed:
            let dy = y - lastY
            flick = dy / max(1, (now - lastTime) * 1000)
            lastY = y
            lastTime = now
            pos = clampSoft(pos + dy / Recall.row)
            target = pos
            draw(pos)
        default:
            target = clamp(Double(Recall.round(pos + flick * 6)))
            kick()
        }
    }

    /// A scroll wheel or two fingers on a trackpad roll it half a row per row scrolled.
    @objc private func scrolled(_ scroll: UIPanGestureRecognizer) {
        guard !closing else { return }
        let y = scroll.translation(in: ghosts).y
        switch scroll.state {
        case .began:
            scrolled = y
        case .changed:
            let delta = -(y - scrolled)
            scrolled = y
            target = clamp(target + delta / Recall.row * 0.5)
            kick()
        default:
            break
        }
    }

    func gestureRecognizer(_: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith _: UIGestureRecognizer) -> Bool {
        false
    }

    /// A swipe up from the composer brought it up: where the finger is now.
    func swipeBegan(at y: Double) {
        swipeOrigin = y
        lastY = y
        lastTime = CACurrentMediaTime()
        flick = 0
    }

    /// The rows follow the finger. While it is still going up, finishing the
    /// swipe that opened the wheel, the newest message holds the field's line
    /// and the swipe's top is where following starts; dragging back down
    /// pulls older messages down into the field, as dragging the rows does.
    func swipeMoved(to y: Double) {
        guard !closing else { return }
        let now = CACurrentMediaTime()
        flick = (y - lastY) / max(1, (now - lastTime) * 1000)
        lastY = y
        lastTime = now
        swipeOrigin = min(swipeOrigin, y)
        spring.stop()
        pos = clampSoft(1 + (y - swipeOrigin) / Recall.row)
        target = pos
        draw(pos)
    }

    /// Lifting leaves it up: a tap on a row takes it, a tap outside
    /// dismisses. A swipe that only ever went up was the opening alone, so
    /// its upward speed lands on nothing: the newest message stays on the line.
    func swipeEnded() {
        guard !closing else { return }
        target = lastY <= swipeOrigin ? clamp(1) : clamp(Double(Recall.round(pos + flick * 6)))
        kick()
    }

    // MARK: Closing

    /// Folds the wheel back down into the pill, the rows still inside it,
    /// fading as they go. `text` is what was taken into the field; nil goes
    /// back to the draft with the caret where it was.
    private func close(_ text: String?, send: Bool) {
        guard !closing else { return }
        closing = true
        spring.stop()
        settled = nil
        NotificationCenter.default.removeObserver(self, name: UIResponder.keyboardDidChangeFrameNotification, object: nil)
        if let outside { outside.view?.removeGestureRecognizer(outside) }
        outside = nil
        // The row on the field's line is always in view, so built.
        let line = rows[Recall.round(pos)]
        let still = UIAccessibility.isReduceMotionEnabled || composer.window == nil
        let fold = { [weak self] in
            guard let self, !cut else { return }
            // The ghost on the line becomes the field's own text.
            if let text { composer.wheelLanded(text) } else { composer.wheelReturned(caret: caret) }
            line?.isHidden = true
            if text == nil { Feel.closed() }
            chip?.removeFromSuperview()
            composer.wheelStepsOut()
            let ghosts = ghosts
            if !still {
                Motion.easeOut.animator(Motion.durFade) { ghosts.alpha = 0 }.startAnimation()
            }
            (composer.superview ?? composer).layoutIfNeeded()
            halo?.base = composer.ring.bounds.height
            let finish = { [weak self] in
                guard let self, !cut else { return }
                halo?.remove()
                halo = nil
                ghosts.removeFromSuperview()
                composer.wheelEnded(self, focus: keys || text != nil, caretAtEnd: text != nil, send: send && text != nil)
            }
            if let halo { halo.morph(to: 0, extra: halo.extra, duration: still ? 0 : Motion.durGrowExit, done: finish) } else { finish() }
        }
        if text != nil, !still, let line {
            Motion.easeOut.animator(Motion.durControl) { line.alpha = 1 }.startAnimation()
            DispatchQueue.main.asyncAfter(deadline: .now() + Motion.durControl) { fold() }
        } else {
            fold()
        }
    }

    /// Gone at once, nothing taken (the composer switched conversation). It
    /// cuts a fold still under way short too: what that fold would land and
    /// send belongs to the conversation being left.
    func dismiss() {
        guard !cut else { return }
        cut = true
        closing = true
        spring.stop()
        settled = nil
        NotificationCenter.default.removeObserver(self, name: UIResponder.keyboardDidChangeFrameNotification, object: nil)
        if let outside { outside.view?.removeGestureRecognizer(outside) }
        outside = nil
        chip?.removeFromSuperview()
        halo?.remove()
        halo = nil
        ghosts.removeFromSuperview()
        composer.wheelStepsOut()
        composer.wheelEnded(self, focus: false, caretAtEnd: false, send: false)
    }
}

#if DEBUG
/// What the `-recall-probe` reads off the wheel: its measures, and every
/// row in view as last drawn.
struct RecallProbeState {
    struct Row {
        let index: Int
        let off: Double
        let depth: Double
        let blur: Double
        let softShown: Double
        let alpha: Double
        /// Soft, at the shape's width, and its blurred copy not showing.
        let pending: Bool
        let view: RecallRow
    }

    /// The grown shape's top, in the window.
    let top: Double
    let floor: Double
    let above: Int
    let depth: Int
    let open: Double
    let matches: Int
    let rows: [Row]
    /// The shape's sides and the query chip's box, in the window.
    let shape: CGRect
    let chip: CGRect?
    /// The pill's padding: a row stands this far in from each side of the shape.
    let pad: Double
}

extension RecallWheel {
    var probeState: RecallProbeState {
        let top = halo.map { Double($0.convert($0.bounds, to: nil).minY) } ?? .nan
        let rows = rows.keys.sorted().compactMap { k in
            self.rows[k].map {
                RecallProbeState.Row(index: k, off: Double(k) - shown, depth: $0.depth, blur: $0.blur, softShown: $0.softShown, alpha: Double($0.alpha),
                                     pending: $0.blurPending, view: $0)
            }
        }
        let shape = halo.map { $0.convert($0.bounds, to: nil) } ?? .null
        let chip = chip.flatMap { $0.isHidden ? nil : $0.convert($0.bounds, to: nil) }
        return RecallProbeState(top: top, floor: foot, above: above, depth: depth, open: halo?.open ?? 0, matches: list.count, rows: rows,
                                shape: shape, chip: chip, pad: field.minX)
    }

    /// The spring is still rolling it.
    var probeRolling: Bool {
        spring.running
    }

    func probeSpin(to index: Double) {
        spin(to: index)
    }
}
#endif

/// Hears every touch that begins in the window, and lets each go on to
/// whatever it was for: the wheel's "tap outside dismisses". `onTouch` gets
/// the touch's place in the window.
@MainActor
final class OutsideTouch: UIGestureRecognizer {
    private let onTouch: @MainActor (CGPoint) -> Void

    init(_ onTouch: @escaping @MainActor (CGPoint) -> Void) {
        self.onTouch = onTouch
        super.init(target: nil, action: nil)
        cancelsTouchesInView = false
        delaysTouchesBegan = false
        delaysTouchesEnded = false
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
        if let point = touches.first?.location(in: nil) {
            // Heard once the touch has been handed on, so nothing changes under it.
            let onTouch = onTouch
            Task { @MainActor in onTouch(point) }
        }
        state = .failed
    }
}
