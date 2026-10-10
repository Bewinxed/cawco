import CoreImage
import CoreImage.CIFilterBuiltins
import UIKit
import UIKit.UIGestureRecognizerSubclass

// The composer's recall (composer-recall, variant "Wheel"): the composer
// grows upward out of its history button, absolutely, so nothing above it
// moves, and what the reader sent here rolls down into its field as ghost
// rows on a gentle wheel. The row on the field's line is the one Return or
// a tap takes, tinted in the selected ink; above it the rows are ghosts,
// going softer as they rise.

/// The wheel's measures and the grown shape's curve.
enum Recall {
    /// One row: the field's own line box.
    static let row = Size.cComposerField
    /// Rows above the field's line, at most: five where the window has the
    /// room (640pt both ways, the web's phone breakpoint), three on a phone
    /// or in a short window.
    static func rowsAbove(in window: CGRect) -> Int {
        window.width >= 640 && window.height >= 640 ? 5 : 3
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
    /// How much softer each row up is than the one below it (points of
    /// blur), and the most a row's words soften: the top of the taller wheel.
    static let soft = 0.3
    static let softest = 5 * soft
    /// A ghost row `o` rows above the line: each a tenth fainter than the one below.
    static func ghost(_ o: Double) -> Double {
        0.7 * (1 - o * 0.1)
    }

    /// `--ease-drawer`, close enough for a frame-driven morph (composer-recall `drawer`).
    static func drawer(_ t: Double) -> Double {
        1 - pow(1 - min(1, max(0, t)), 3.2)
    }

    /// The shoulders' inward curve at full growth: as much as the top row has shrunk.
    static func taper(width: Double, extra: Double) -> Double {
        shrink * (max(0, (extra - 6) / row) + 0.5) * width / 2
    }

    /// The grown composer at `p` (0: the composer's own pill, 1: grown), in
    /// its own box, with its height and how far above the pill it reaches
    /// (composer-recall `outline()`). The whole pill rises, its top corners
    /// rounding all the way, the side with the history button a little ahead
    /// so the top leans toward it and levels out as it rises; then the
    /// shoulders curve in by the taper.
    static func outline(_ geometry: RecallGeometry, open p: Double, extra: Double) -> (path: CGPath, height: Double, up: Double) {
        let w = geometry.width
        let r = Radius.radiusLg
        let near = drawer(p * 1.25), far = drawer(p * 1.25 - 0.15)
        let (hR, hL) = geometry.button >= w / 2 ? (extra * near, extra * far) : (extra * far, extra * near)
        let up = max(hR, hL), height = geometry.base + up
        let tR = up - hR, tL = up - hL
        let pw = drawer((p - 0.25) / 0.75)
        let k = taper(width: w, extra: extra)
        let left = k * pw, right = w - k * pw
        // Each side runs straight up to the pill's top, then sweeps in to its rounded top corner.
        let sR = max(tR + r, up), sL = max(tL + r, up)
        let path = CGMutablePath()
        func point(_ x: Double, _ y: Double) -> CGPoint { CGPoint(x: x, y: y) }
        path.move(to: point(r, height))
        path.addLine(to: point(w - r, height))
        path.addArc(tangent1End: point(w, height), tangent2End: point(w, height - r), radius: r)
        path.addLine(to: point(w, sR))
        path.addCurve(to: point(right, tR + r), control1: point(w, sR - (sR - tR - r) * 0.55), control2: point(right, tR + r + (sR - tR - r) * 0.35))
        path.addQuadCurve(to: point(right - r, tR), control: point(right, tR))
        // The top eases from one side's height to the other's.
        let span = right - left - 2 * r
        path.addCurve(to: point(left + r, tL), control1: point(right - r - span * 0.4, tR), control2: point(left + r + span * 0.4, tL))
        path.addQuadCurve(to: point(left, tL + r), control: point(left, tL))
        path.addCurve(to: point(0, sL), control1: point(left, tL + r + (sL - tL - r) * 0.35), control2: point(0, sL - (sL - tL - r) * 0.55))
        path.addLine(to: point(0, height - r))
        path.addArc(tangent1End: point(0, height), tangent2End: point(r, height), radius: r)
        path.closeSubpath()
        return (path, height, up)
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

/// The composer's sizes and its history button's place, read once before
/// anything is written (composer-recall `measure`).
struct RecallGeometry {
    /// The pill's width and height.
    var width: Double
    var base: Double
    /// The history button's centre across the pill.
    var button: Double
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

    init(_ geometry: RecallGeometry, extra: Double) {
        self.geometry = geometry
        self.extra = extra
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
            if halo.settled { halo.frost() }
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

    /// The pill's height changed under the shape (the field grew a line).
    var base: Double {
        get { geometry.base }
        set {
            guard abs(newValue - geometry.base) > 0.25 else { return }
            geometry.base = newValue
            paint()
            if settled { frost() }
        }
    }

    private func colour() {
        let traits = traitCollection
        let raised = Palette.surfaceRaised.resolvedColor(with: traits)
        let control = Palette.borderControl.resolvedColor(with: traits)
        fill.colors = [raised.withAlphaComponent(0).cgColor, raised.cgColor, raised.cgColor]
        edge.colors = [control.withAlphaComponent(0).cgColor, control.cgColor, control.cgColor]
        // The far drop on the shape, then the near one on the shape and its far drop, as the filter chain falls.
        let far = Shadow.shadowDrop[0], close = Shadow.shadowDropNear[0]
        body.shadowColor = far.ink.color.resolvedColor(with: traits).cgColor
        body.shadowOffset = CGSize(width: far.x, height: far.y)
        body.shadowRadius = far.blur * BoxShadow.blurScale
        layer.shadowColor = close.ink.color.resolvedColor(with: traits).cgColor
        layer.shadowOffset = CGSize(width: close.x, height: close.y)
        layer.shadowRadius = close.blur * BoxShadow.blurScale
    }

    /// Writes only: every size it needs was measured when it grew.
    func paint() {
        let shape = Recall.outline(geometry, open: open, extra: extra)
        path = shape.path
        let box = CGRect(x: 0, y: geometry.base - shape.height, width: geometry.width, height: shape.height)
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        frame = box
        let local = CGRect(origin: .zero, size: box.size)
        for layer in [body, fill, fillShape, edge, edgeShape] as [CALayer] { layer.frame = local }
        fillShape.path = shape.path
        edgeShape.path = shape.path
        // Only the top of the grown part fades: behind every row it is solid.
        let height = max(1, shape.height)
        let middle = min(24, shape.up * 0.25) / height
        let edgeBase = max(0.04, min(40, shape.up * 0.4) / height)
        fill.locations = [0, NSNumber(value: middle), 1]
        edge.locations = [0.04, NSNumber(value: edgeBase), 1]
        CATransaction.commit()
        onPaint(shape.path, box)
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

    private func settle() {
        guard open == 1 else { return }
        settled = true
        fade(to: 1)
        frost()
        layer.rasterizationScale = traitCollection.displayScale
        layer.shouldRasterize = true
    }

    private func unsettle() {
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
    private let content = UIView()
    private let words = UILabel()
    private let time = UILabel()
    private let queuedTag = TagLabel()
    private let soft = UIImageView()
    private let text: String
    private let marks: Set<[UInt16]>
    private let date: Date?
    private let queued: Bool
    private let showsMeta: Bool
    private var picked = false
    private var softened = false

    init(kind: Kind, text: String, marks: Set<[UInt16]> = [], date: Date? = nil, queued: Bool = false, showsMeta: Bool) {
        self.kind = kind
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
            queuedTag.attributedText = NSAttributedString(string: "Queued", attributes: Self.metaRole.attributes(color: Palette.statusAttnInk))
            queuedTag.backgroundColor = Palette.statusAttnBg
            content.addSubview(queuedTag)
        }
        isAccessibilityElement = true
        accessibilityTraits = .button
        render()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("RecallRow is built in code")
    }

    /// The meta's face: `font: 400 12px/22px`, on the row's line box.
    private static var metaRole: TypeRole {
        TypeRole(weight: .regular, size: TypeScale.textMeta ... TypeScale.textMeta, leading: ComposerView.fieldRole.lineHeight / TypeScale.textMeta,
                 family: FontFamily.fontBody)
    }

    private func render() {
        let ink: UIColor = switch kind {
        case .none: Palette.inkMuted
        case .draft: Palette.inkStrong
        case .sent: picked ? Palette.selectedInk : Palette.inkStrong
        }
        var attributes = ComposerView.fieldRole.attributes(color: ink)
        if let paragraph = (attributes[.paragraphStyle] as? NSParagraphStyle)?.mutableCopy() as? NSMutableParagraphStyle {
            paragraph.lineBreakMode = .byTruncatingTail
            attributes[.paragraphStyle] = paragraph
        }
        if kind == .draft, text.isEmpty {
            words.attributedText = NSAttributedString(string: "Your draft · type to search",
                                                      attributes: ComposerView.fieldRole.attributes(color: Palette.inkSubtle))
        } else {
            let line = Recall.oneLine(text)
            let string = NSMutableAttributedString(string: line, attributes: attributes)
            if !marks.isEmpty { mark(line, in: string) }
            words.attributedText = string
        }
        if showsMeta {
            let ago = Recall.ago(date)
            var meta = Self.metaRole.attributes(color: picked ? Palette.selectedInk : Palette.inkMuted)
            if let font = meta[.font] as? UIFont {
                meta[.font] = UIFont(descriptor: font.fontDescriptor.addingAttributes([.featureSettings: [[
                    UIFontDescriptor.FeatureKey.type: kNumberSpacingType,
                    UIFontDescriptor.FeatureKey.selector: kMonospacedNumbersSelector,
                ]]]), size: font.pointSize)
            }
            time.attributedText = NSAttributedString(string: queued ? " · \(ago)" : ago, attributes: meta)
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

    /// Softer the further the row has risen: the sharp words give way to a
    /// blurred copy of them, `amount` points of blur of `Recall.softest`.
    func soften(_ amount: Double) {
        let share = min(1, max(0, amount / Recall.softest))
        if share > 0.02, !softened {
            softened = true
            soft.image = blurred()
        }
        soft.alpha = share
        content.alpha = 1 - share
    }

    private func blurred() -> UIImage? {
        let pad = 8.0
        let size = CGSize(width: bounds.width + pad * 2, height: bounds.height + pad * 2)
        guard size.width > pad * 2 else { return nil }
        let drawn = UIGraphicsImageRenderer(size: size).image { context in
            context.cgContext.translateBy(x: pad, y: pad)
            content.layer.render(in: context.cgContext)
        }
        guard let input = CIImage(image: drawn) else { return nil }
        let filter = CIFilter.gaussianBlur()
        filter.inputImage = input
        filter.radius = Float(Recall.softest * drawn.scale)
        guard let output = filter.outputImage?.cropped(to: input.extent),
              let cg = Self.context.createCGImage(output, from: input.extent) else { return nil }
        soft.frame = CGRect(x: -pad, y: -pad, width: size.width, height: size.height)
        return UIImage(cgImage: cg, scale: drawn.scale, orientation: .up)
    }

    private static let context = CIContext()

    override func layoutSubviews() {
        super.layoutSubviews()
        content.frame = bounds
        let line = ComposerView.fieldRole.lineHeight
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
/// rolled to, and the views it rolls them in. Opened by ↑, the history
/// button or a swipe up from the composer; ↑ and ↓ roll it, Return takes the row on the field's
/// line into the composer, ⌘Return sends it as it is, Escape goes back to
/// the draft (clearing a filter first), and with an empty draft what is
/// typed filters it.
@MainActor
final class RecallWheel: NSObject, UIGestureRecognizerDelegate {
    private enum Entry {
        case draft
        case sent(RecallEntry, marks: Set<[UInt16]>)
    }

    private unowned let composer: ComposerView
    private let entries: [RecallEntry]
    let draft: String
    private let caret: NSRange
    /// Whether keys reach the wheel (↑ or the history button); a swipe leaves the keyboard as it was.
    let keys: Bool
    private(set) var closing = false
    /// Dismissed: whatever a fold still under way would do next is dropped.
    private var cut = false
    private(set) var query = ""

    private var geometry = RecallGeometry(width: 0, base: 0, button: 0)
    private var field = CGRect.zero
    private var halo: RecallHalo?
    private let ghosts = UIView()
    private let inner = UIView()
    private let clip = CAShapeLayer()
    private let top = CAGradientLayer()
    private var chip: QueryChip?
    private var chipRoom = 0.0
    private var list: [Entry] = []
    private var rows: [RecallRow] = []
    private var search: RecallSearch?
    private let showsMeta: Bool
    private let above: Int

    // The spring: `pos` rolls toward the nearest whole entry of `target`.
    private var pos = 0.0
    private var target = 0.0
    private var vel = 0.0
    private var shown = 0.0
    private var detent: Int?
    private var settled: (() -> Void)?
    private let spring = FrameTicker()
    private var outside: OutsideTouch?

    // A drag on the rows, or the swipe up from the composer that brought it up.
    private var lastY = 0.0
    private var lastTime = 0.0
    private var flick = 0.0
    private var swipeOrigin = 0.0
    private var scrolled = 0.0

    init(composer: ComposerView, entries: [RecallEntry], draft: String, caret: NSRange, keys: Bool) {
        self.composer = composer
        self.entries = entries
        self.draft = draft
        self.caret = caret
        self.keys = keys
        showsMeta = (composer.window?.bounds.width ?? 1000) > 560
        above = Recall.rowsAbove(in: composer.window?.bounds ?? .zero)
        super.init()
    }

    var ghostsView: UIView { ghosts }

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
        geometry = RecallGeometry(width: ring.bounds.width, base: ring.bounds.height,
                                  button: composer.historyBox.convert(composer.historyBox.bounds, to: ring).midX)
        field = composer.pill.convert(composer.field.frame, to: ring)
        let height = Recall.row * Double(above + 1)
        composer.wheelStepsIn()
        let halo = RecallHalo(geometry, extra: extraFor())
        ring.insertSubview(halo, belowSubview: composer.pill)
        self.halo = halo
        // The rows sit on the field's own line and above it, shown only inside the shape.
        ghosts.frame = CGRect(x: field.minX, y: field.maxY - height, width: field.width, height: height)
        ghosts.layer.mask = clip
        clip.frame = ghosts.bounds
        clip.actions = ["path": NSNull(), "bounds": NSNull(), "position": NSNull()]
        inner.frame = ghosts.bounds
        inner.isUserInteractionEnabled = false
        // The oldest row fades out at the top edge instead of being cut through.
        top.frame = inner.bounds
        top.colors = [UIColor.clear.cgColor, UIColor.black.cgColor]
        top.locations = [0, NSNumber(value: 14 / height)]
        inner.layer.mask = top
        ghosts.addSubview(inner)
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
        buildRows()
        detent = nil
        pos = 0; target = 0; vel = 0
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

    private func buildRows() {
        for row in rows { row.removeFromSuperview() }
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        if q.isEmpty {
            list = [Entry.draft] + entries.map { Entry.sent($0, marks: []) }
        } else {
            if search == nil { search = RecallSearch(entries.map(\.text)) }
            list = (search?.search(q) ?? []).map { Entry.sent(entries[$0.index], marks: $0.terms) }
        }
        rows = list.enumerated().map { k, entry in
            let row: RecallRow = switch entry {
            case .draft: RecallRow(kind: .draft, text: draft, showsMeta: showsMeta)
            case let .sent(sent, marks): RecallRow(kind: .sent, text: sent.text, marks: marks, date: sent.date, queued: sent.queued, showsMeta: showsMeta)
            }
            row.onActivate = { [weak self] in self?.choose(k) }
            return row
        }
        if list.isEmpty { rows = [RecallRow(kind: .none, text: "Nothing you sent here matches", showsMeta: false)] }
        if let chip {
            chip.isHidden = q.isEmpty
            chip.show(query, matches: list.count)
            let size = chip.systemLayoutSizeFitting(UIView.layoutFittingCompressedSize)
            let width = min(ceil(size.width), field.width * 0.45)
            chip.frame = CGRect(x: field.maxX - width, y: field.maxY - Recall.row / 2 - size.height / 2, width: width, height: size.height)
            // While filtering, every row stops short of the chip.
            chipRoom = q.isEmpty ? 0 : width + 10
        }
        let width = ghosts.bounds.width - chipRoom
        for row in rows {
            row.bounds = CGRect(x: 0, y: 0, width: width, height: Recall.row)
            row.center = CGPoint(x: width / 2, y: ghosts.bounds.height)
            row.isHidden = true
            inner.addSubview(row)
        }
        ghosts.accessibilityElements = rows
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

    /// Every row where `p` puts it. Landing on another entry is a detent the
    /// reader feels and hears; overshooting past either end is not.
    private func draw(_ p: Double) {
        shown = p
        let line = Recall.round(p)
        for (k, row) in rows.enumerated() {
            let off = Double(k) - p
            if off > Double(above) + 0.6 || off < -1.2 {
                row.isHidden = true
                continue
            }
            row.isHidden = false
            let up = max(0, off)
            row.layer.transform = Recall.transform(off: off, up: up)
            row.soften(max(0, up - 1) * Recall.soft)
            // On the field's line a row is at full strength; above it the rows are ghosts, fading as they rise.
            row.alpha = off >= 0 ? max(0, off < 1 ? 1 + (Recall.ghost(1) - 1) * off : Recall.ghost(off)) : max(0, 1 + off * 1.6)
            row.pick(line == k)
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

    /// Folds the wheel back into the history button, the rows still inside
    /// it, fading as they go. `text` is what was taken into the field; nil
    /// goes back to the draft with the caret where it was.
    private func close(_ text: String?, send: Bool) {
        guard !closing else { return }
        closing = true
        spring.stop()
        settled = nil
        if let outside { outside.view?.removeGestureRecognizer(outside) }
        outside = nil
        let line = rows.indices.contains(Recall.round(pos)) ? rows[Recall.round(pos)] : nil
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
