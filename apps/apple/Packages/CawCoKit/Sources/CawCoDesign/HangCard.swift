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

/// A finger's pull on a hanging card, down off its anchor or back up into
/// it (DESIGN.md, "A card that hangs from its anchor": "a finger pulling it
/// down off the tab draws the same slide 1:1"): what a tab's options
/// (`TabOptionsSheet`) and Caw's panel let go on alike.
public enum HangPull {
    /// How far a release is carried along its speed, s.
    public static let project = 0.099
    /// A release this fast, pt/s, goes its way however short the pull: a
    /// flick, well over a finger slowing to a stop (55–130 pt/s measured on
    /// the simulator's slow drags), as Sonner takes any swipe past 0.11 px/ms.
    public static let flick = 300.0
    /// How far a finger travels before a pull is taken for one with less motion, pt.
    public static let opens = 24.0

    /// Let go `travel` pt out of the anchor at `velocity` pt/s (down
    /// positive), with the card `height` tall: it settles open (true) or
    /// back into the anchor. A flick goes its way; otherwise it opens once
    /// its travel, carried along its speed, is past half the card.
    public static func opens(travel: Double, velocity: Double, height: Double) -> Bool {
        if velocity >= flick { return true }
        if velocity <= -flick { return false }
        return travel + velocity * project >= height / 2
    }
}

/// A card that hangs from its anchor as one shape with it, and comes down
/// out of it (DESIGN.md, "A card that hangs from its anchor"; motion/hang.ts
/// and app.css `.kit-hang`): Caw's panel from his glass, and any card after it.
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
/// It is cut at its top edge, the anchor's foot, by a cut that never moves,
/// and slides down from behind that cut by its own height: over `durPop` in
/// and `durExit` out on `easeOut`, or 1:1 under a finger (`reveal`) and let
/// go on the house spring at the finger's speed (`settle`). Only the slide's
/// translation moves. A slide caught mid-way, by a finger or the other
/// way, turns back from where it has reached. With Reduce Motion it fades.
@MainActor
public final class HangCard: UIView {
    /// What the card holds: on its surface, clipped to its corners.
    public let content = UIView()
    /// Its trailing side is a screen's edge: no edge drawn there, and its foot corner square.
    public var openEnd = false {
        didSet { if openEnd != oldValue { setNeedsLayout() } }
    }

    public private(set) var neck = HangNeck.none
    /// Standing open, or coming out; false while going back in or shut.
    public private(set) var shown = false

    /// The card itself, surface and edge, as it slides under the cut.
    private let slider = UIView()
    /// Its shadow, sliding with it, lifting in over the first `liftTravel`
    /// of the way out (as a tab's pulled options lift off the page): a card
    /// still behind the cut casts nothing under the anchor.
    private let shade = UIView()
    private static let liftTravel = HangPull.opens
    private let body = UIView()
    private let edge = CAShapeLayer()
    private let edgeMask = CALayer()
    /// The top edge's row, faded out across the neck.
    private let topRow = CAGradientLayer()
    private let restRows = CALayer()
    /// The still cut at the card's top edge.
    private let cut = CAShapeLayer()
    /// The slide running now, if one is.
    private var slide: UIViewPropertyAnimator?
    /// How far out of the cut it stands when no slide runs: 0 behind it, 1 hanging.
    private var share = 0.0
    /// Each slide, so a slide's end only acts for a card nothing has moved since.
    private var generation = 0

    /// Room past the card's sides and foot for its whole overlay shadow (hang.ts `CLIP_ROOM`).
    private static let room = 120.0

    override public init(frame: CGRect) {
        super.init(frame: frame)
        addSubview(shade)
        addSubview(slider)
        for part in [slider, shade] {
            part.layer.cornerRadius = Radius.radiusLg
            part.layer.cornerCurve = .continuous
        }
        shade.isUserInteractionEnabled = false
        body.frame = slider.bounds
        body.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        body.backgroundColor = Palette.surfaceRaised
        body.layer.cornerRadius = Radius.radiusLg
        body.layer.cornerCurve = .continuous
        body.clipsToBounds = true
        slider.addSubview(body)
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
        slider.layer.addSublayer(edge)
        shade.boxShadow = Shadow.shadowOverlayHung
        layer.mask = cut
        for part in [edge, edgeMask, topRow, restRows, cut] as [CALayer] {
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

    /// Where the card now meets its anchor: its edge is cut there.
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
        // The card keeps its box; the slide is its transform alone.
        for part in [slider, shade, body] {
            part.layer.maskedCorners = corners
        }
        for part in [slider, shade] {
            part.bounds = CGRect(origin: .zero, size: bounds.size)
            part.center = CGPoint(x: bounds.midX, y: bounds.midY)
        }
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        edge.frame = slider.bounds
        edge.path = edgePath(corners)
        edgeMask.frame = slider.bounds
        layEdgeMask()
        cut.frame = bounds
        cut.path = UIBezierPath(rect: CGRect(x: -Self.room, y: 0, width: bounds.width + 2 * Self.room, height: bounds.height + Self.room)).cgPath
        CATransaction.commit()
        // At rest, or under a finger, it stands where it was drawn; mid-slide it is the animator's.
        if slide == nil { draw(share) }
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

    // MARK: The slide

    /// The card `t` of the way out of the cut: its foot `t` of its height under the anchor's.
    private func draw(_ t: Double) {
        let h = bounds.height
        let slid = CGAffineTransform(translationX: 0, y: -h * (1 - t))
        slider.transform = slid
        shade.transform = slid
        shade.alpha = min(1, max(0, t * h / Self.liftTravel))
    }

    /// How far out of the cut the card is drawn now, mid-slide or at rest:
    /// 0 behind it, 1 hanging.
    public var revealed: Double {
        guard !isHidden else { return 0 }
        let h = bounds.height
        guard h > 0, slide != nil else { return share }
        let ty = slider.layer.presentation()?.affineTransform().ty ?? slider.transform.ty
        return min(1, max(0, 1 + ty / h))
    }

    /// Stops a slide where it has reached and leaves the card drawn there.
    @discardableResult
    private func hold() -> Double {
        let at = revealed
        slide?.stopAnimation(true)
        slide = nil
        share = at
        draw(at)
        return at
    }

    /// Slides to `target` on `animator`; `done` once it lands there.
    private func run(_ animator: UIViewPropertyAnimator, to target: Double, done: @escaping () -> Void = {}) {
        share = target
        animator.addAnimations { self.draw(target) }
        animator.addCompletion { [weak self, weak animator] position in
            guard let self, let animator, slide === animator else { return }
            slide = nil
            if position == .end { done() }
        }
        slide = animator
        animator.startAnimation()
    }

    /// Hidden once the card is shut, unless something has moved it since (`generation`).
    private func shut(_ mine: Int, done: @escaping () -> Void) -> () -> Void {
        { [weak self] in
            guard let self, generation == mine else { return }
            isHidden = true
            done()
        }
    }

    /// Comes down out of the anchor (`durPop`, `easeOut`), from wherever it stands.
    public func grow() {
        generation += 1
        shown = true
        layoutIfNeeded()
        let wasHidden = isHidden
        isHidden = false
        if UIAccessibility.isReduceMotionEnabled {
            hold()
            share = 1
            draw(1)
            if wasHidden { alpha = 0 }
            Motion.easeOut.animator(Motion.durPop) { self.alpha = 1 }.startAnimation()
            return
        }
        alpha = 1
        if wasHidden {
            share = 0
            draw(0)
        } else {
            hold()
        }
        run(Motion.easeOut.animator(Motion.durPop), to: 1)
    }

    /// Goes back up into the anchor (`durExit`, `easeOut`); `done` once it is shut and hidden.
    public func fold(done: @escaping () -> Void = {}) {
        generation += 1
        shown = false
        let finish = shut(generation, done: done)
        if UIAccessibility.isReduceMotionEnabled {
            let fade = Motion.easeOut.animator(Motion.durExit) { self.alpha = 0 }
            fade.addCompletion { _ in finish() }
            fade.startAnimation()
            return
        }
        hold()
        run(Motion.easeOut.animator(Motion.durExit), to: 0, done: finish)
    }

    /// Drawn `t` of the way out of the cut under a finger, 1:1: any slide
    /// stops where it stands and the finger has it.
    public func reveal(_ t: Double) {
        generation += 1
        if slide != nil { hold() }
        isHidden = false
        alpha = 1
        share = min(1, max(0, t))
        draw(share)
    }

    /// Let go by a finger at `velocity` pt/s (down positive): it settles
    /// hanging (`open`) or back behind the cut on the house spring, leaving
    /// at the finger's speed; `done` once it has landed shut and hidden.
    public func settle(open: Bool, velocity: Double, done: @escaping () -> Void = {}) {
        generation += 1
        shown = open
        let finish = open ? {} : shut(generation, done: done)
        let at = hold()
        let target = open ? 1.0 : 0.0
        let distance = (target - at) * bounds.height
        guard abs(distance) >= 0.5 else {
            share = target
            draw(target)
            finish()
            return
        }
        let spring = UIViewPropertyAnimator(duration: Motion.durSettle, timingParameters: HouseSpring.timing(velocity: velocity / distance))
        run(spring, to: target, done: finish)
    }
}
