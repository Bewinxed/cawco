import UIKit

/// Where a hanging card meets its anchor (motion/hang.ts `Neck`): the
/// anchor's span along the card's top edge, in the card's own points, and
/// the flared foot each side of it; none on the side the card is flush with.
public struct HangNeck: Equatable, Sendable {
    /// The side the card stands flush with its anchor on: its top corner is square there.
    public enum Flush: Sendable { case start, end }

    public var start: Double
    public var end: Double
    public var flareStart: Double
    public var flareEnd: Double
    public var flush: Flush?

    public init(start: Double, end: Double, flareStart: Double, flareEnd: Double, flush: Flush?) {
        self.start = start
        self.end = end
        self.flareStart = flareStart
        self.flareEnd = flareEnd
        self.flush = flush
    }

    public static let none = HangNeck(start: 0, end: 0, flareStart: 0, flareEnd: 0, flush: nil)

    /// How far a flare's 1pt stroke lies along the card's top edge before it
    /// rises off it: the stroke is a band between radii f and f + 1 tangent to
    /// that row, which it leaves √(2f + 1) out (hang.ts `flareTail`).
    static func tail(_ flare: Double) -> Double { flare > 0 ? (2 * flare + 1).squareRoot() : 0 }
}

/// A card that hangs from its anchor as one shape with it, and grows out of
/// it (DESIGN.md, "A card that hangs from its anchor"; motion/hang.ts and
/// app.css `.kit-hang`): Caw's panel from his glass, and any card after it.
///
/// It stands on its anchor's foot with no gap. Its `borderControl` edge is
/// drawn inside its box, cut across the anchor's span and the anchor's
/// flared foot each side of it (`neck`), fading out over the flare stroke's
/// last √(2f + 1) points so the two strokes meet with no break; on a flush
/// side its top corner is square, and on an open end (a screen's edge) the
/// side draws no edge and its foot corner is square too. Its shadow is
/// `shadowOverlayHung`, cut at its top edge, so none falls on the anchor.
/// The anchor draws its own foot.
///
/// It opens as a clip that grows down out of the anchor's span and widens
/// to the card over `durPop`, and folds back into it over `durExit`, both
/// on `easeOut`; a fold caught mid-growth, or a growth caught mid-fold,
/// turns back from the clip it has reached. Shut, the clip keeps one point
/// of the card under the anchor's foot. With Reduce Motion it fades instead.
@MainActor
public final class HangCard: UIView {
    /// What the card holds: on its surface, clipped to its corners.
    public let content = UIView()
    /// Its trailing side is a screen's edge: no edge drawn there, and its foot corner square.
    public var openEnd = false {
        didSet { if openEnd != oldValue { setNeedsLayout() } }
    }

    public private(set) var neck = HangNeck.none
    /// Standing open, or growing; false while folding or shut.
    public private(set) var shown = false

    private let body = UIView()
    private let edge = CAShapeLayer()
    private let edgeMask = CALayer()
    /// The top edge's row, faded out across the neck.
    private let topRow = CAGradientLayer()
    private let restRows = CALayer()
    private let clip = CAShapeLayer()
    /// Each open and fold, so a fold's end only hides a card nothing has opened since.
    private var generation = 0

    /// Room past the card's sides and foot for its whole overlay shadow (hang.ts `CLIP_ROOM`).
    private static let room = 120.0
    /// What a shut clip keeps of the card's height (hang.ts `CLIP_SLIVER`).
    private static let sliver = 1.0

    override public init(frame: CGRect) {
        super.init(frame: frame)
        layer.cornerRadius = Radius.radiusLg
        layer.cornerCurve = .continuous
        body.frame = bounds
        body.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        body.backgroundColor = Palette.surfaceRaised
        body.layer.cornerRadius = Radius.radiusLg
        body.layer.cornerCurve = .continuous
        body.clipsToBounds = true
        addSubview(body)
        content.frame = body.bounds
        content.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        body.addSubview(content)
        edge.fillColor = nil
        edge.lineWidth = 1
        topRow.startPoint = CGPoint(x: 0, y: 0.5)
        topRow.endPoint = CGPoint(x: 1, y: 0.5)
        restRows.backgroundColor = UIColor.black.cgColor
        edgeMask.addSublayer(topRow)
        edgeMask.addSublayer(restRows)
        edge.mask = edgeMask
        layer.addSublayer(edge)
        boxShadow = Shadow.shadowOverlayHung
        layer.mask = clip
        for part in [edge, edgeMask, topRow, restRows, clip] as [CALayer] {
            part.actions = ["path": NSNull(), "bounds": NSNull(), "position": NSNull(), "frame": NSNull(),
                            "locations": NSNull(), "colors": NSNull()]
        }
        isHidden = true
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (card: HangCard, _: UITraitCollection) in card.paint() }
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("HangCard is built in code")
    }

    private func paint() {
        edge.strokeColor = Palette.borderControl.resolvedColor(with: traitCollection).cgColor
    }

    /// Where the card now meets its anchor: its edge is cut there, and a shut or growing clip starts from it.
    public func hang(from next: HangNeck) {
        guard next != neck else { return }
        neck = next
        setNeedsLayout()
    }

    // MARK: Drawing

    /// The corners the card rounds: all but the top on a flush side, and the foot on an open end.
    private var corners: CACornerMask {
        var mask: CACornerMask = [.layerMinXMinYCorner, .layerMaxXMinYCorner, .layerMinXMaxYCorner, .layerMaxXMaxYCorner]
        if neck.flush == .start { mask.remove(.layerMinXMinYCorner) }
        if neck.flush == .end { mask.remove(.layerMaxXMinYCorner) }
        if openEnd { mask.remove([.layerMaxXMinYCorner, .layerMaxXMaxYCorner]) }
        return mask
    }

    override public func layoutSubviews() {
        super.layoutSubviews()
        let corners = corners
        layer.maskedCorners = corners
        body.layer.maskedCorners = corners
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        edge.frame = bounds
        edge.path = edgePath(corners)
        edgeMask.frame = bounds
        layEdgeMask()
        clip.frame = bounds
        // At rest the clip is where the card stands; mid-flight it is the animation's.
        if clip.animation(forKey: "clip") == nil {
            clip.path = (shown ? openPath : shutPath).cgPath
        }
        CATransaction.commit()
    }

    /// The card's outline half a point in, its sides run in order so an open end leaves its side out.
    private func edgePath(_ corners: CACornerMask) -> CGPath {
        let box = bounds.insetBy(dx: 0.5, dy: 0.5)
        guard box.width > 0, box.height > 0 else { return CGMutablePath() }
        let r = min(Radius.radiusLg - 0.5, box.height / 2, box.width / 2)
        let tl = corners.contains(.layerMinXMinYCorner) ? r : 0
        let tr = corners.contains(.layerMaxXMinYCorner) ? r : 0
        let bl = corners.contains(.layerMinXMaxYCorner) ? r : 0
        let br = corners.contains(.layerMaxXMaxYCorner) ? r : 0
        let path = UIBezierPath()
        if openEnd {
            // From the top of the open side, round the card, to the foot of the open side.
            path.move(to: CGPoint(x: bounds.maxX, y: box.minY))
        } else {
            path.move(to: CGPoint(x: box.maxX - tr, y: box.minY))
        }
        path.addLine(to: CGPoint(x: box.minX + tl, y: box.minY))
        if tl > 0 { path.addArc(withCenter: CGPoint(x: box.minX + tl, y: box.minY + tl), radius: tl, startAngle: -.pi / 2, endAngle: .pi, clockwise: false) }
        path.addLine(to: CGPoint(x: box.minX, y: box.maxY - bl))
        if bl > 0 { path.addArc(withCenter: CGPoint(x: box.minX + bl, y: box.maxY - bl), radius: bl, startAngle: .pi, endAngle: .pi / 2, clockwise: false) }
        if openEnd {
            path.addLine(to: CGPoint(x: bounds.maxX, y: box.maxY))
            return path.cgPath
        }
        path.addLine(to: CGPoint(x: box.maxX - br, y: box.maxY))
        if br > 0 { path.addArc(withCenter: CGPoint(x: box.maxX - br, y: box.maxY - br), radius: br, startAngle: .pi / 2, endAngle: 0, clockwise: false) }
        path.addLine(to: CGPoint(x: box.maxX, y: box.minY + tr))
        if tr > 0 { path.addArc(withCenter: CGPoint(x: box.maxX - tr, y: box.minY + tr), radius: tr, startAngle: 0, endAngle: -.pi / 2, clockwise: false) }
        path.close()
        return path.cgPath
    }

    /// The edge's top row shows from the card's leading end to the neck's
    /// flared foot, fades out across each flare's tail, and shows again past
    /// the far flare (app.css `.kit-hang::after` mask); every other row shows whole.
    private func layEdgeMask() {
        let w = bounds.width
        guard w > 0 else { return }
        topRow.frame = CGRect(x: 0, y: 0, width: w, height: 1)
        restRows.frame = CGRect(x: 0, y: 1, width: w, height: max(0, bounds.height - 1))
        let from = neck.start - neck.flareStart
        let to = neck.end + neck.flareEnd
        let stops = [0, from, from + HangNeck.tail(neck.flareStart), to - HangNeck.tail(neck.flareEnd), to, w]
            .map { NSNumber(value: min(1, max(0, $0 / w))) }
        let on = UIColor.black.cgColor
        let off = UIColor.clear.cgColor
        topRow.colors = [on, on, off, off, on, on]
        topRow.locations = stops
    }

    // MARK: Growing and folding

    /// Open: the card, with room past its sides and foot for its whole shadow, cut at its top edge.
    private var openPath: UIBezierPath {
        UIBezierPath(rect: CGRect(x: -Self.room, y: 0, width: bounds.width + 2 * Self.room, height: bounds.height + Self.room))
    }

    /// Shut: the anchor's span at the card's top edge, one point deep.
    private var shutPath: UIBezierPath {
        let start = max(0, neck.start)
        let end = max(start, min(bounds.width, neck.end))
        return UIBezierPath(rect: CGRect(x: start, y: 0, width: end - start, height: Self.sliver))
    }

    /// Grows out of the anchor (`durPop`, `easeOut`), from wherever a fold left it.
    public func grow() {
        generation += 1
        shown = true
        layoutIfNeeded()
        let wasHidden = isHidden
        isHidden = false
        if UIAccessibility.isReduceMotionEnabled {
            clip.removeAnimation(forKey: "clip")
            clip.path = openPath.cgPath
            if wasHidden { alpha = 0 }
            Motion.easeOut.animator(Motion.durPop) { self.alpha = 1 }.startAnimation()
            return
        }
        alpha = 1
        play(from: wasHidden ? shutPath.cgPath : drawnClip, to: openPath.cgPath, duration: Motion.durPop)
    }

    /// Folds back into the anchor (`durExit`, `easeOut`); `done` once it is shut and hidden.
    public func fold(done: @escaping () -> Void = {}) {
        generation += 1
        let mine = generation
        shown = false
        let finish = { [weak self] in
            guard let self, generation == mine else { return }
            isHidden = true
            done()
        }
        if UIAccessibility.isReduceMotionEnabled {
            let fade = Motion.easeOut.animator(Motion.durExit) { self.alpha = 0 }
            fade.addCompletion { _ in finish() }
            fade.startAnimation()
            return
        }
        play(from: drawnClip, to: shutPath.cgPath, duration: Motion.durExit)
        // Shut once the fold has played, unless an open has come since (`generation`).
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(Motion.durExit))
            finish()
        }
    }

    /// Where the clip is drawn now, mid-flight or at rest.
    private var drawnClip: CGPath {
        clip.presentation()?.path ?? clip.path ?? shutPath.cgPath
    }

    private func play(from: CGPath, to: CGPath, duration: TimeInterval) {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        let move = CABasicAnimation(keyPath: "path")
        move.fromValue = from
        move.toValue = to
        move.duration = duration
        move.timingFunction = Motion.easeOut.function
        clip.path = to
        clip.add(move, forKey: "clip")
        CATransaction.commit()
    }
}
