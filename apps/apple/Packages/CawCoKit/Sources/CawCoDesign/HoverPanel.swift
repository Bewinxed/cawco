import UIKit

/// A row a hover card can open from: it names the session it stands for
/// (the web's `data-hover-session`). Any list's row adopts it; the host that
/// owns the pointer finds it under the pointer.
@MainActor
public protocol HoverSessionRow: UIView {
    var hoverSessionId: String? { get }
}

/// The house hover panel (HoverPanel.svelte): the delegate tray's chip panel
/// and the rail's session card. One surface for whichever thing the pointer
/// rests on: when the pointer moves to the next one the panel glides there
/// over `durMorph` on the drawer curve and takes the new content's size
/// while the content cross-fades over `durControl`, rather than closing and
/// opening again. It comes in over `durMenu` with a 4pt rise from 0.98,
/// growing from the point on its edge that faces its trigger, and leaves as
/// a fade over `durControl`.
///
/// Where it stands is the host's: `above` a row of chips (`x` along the row,
/// kept inside `span`, its foot 4pt over the row's top at `y`), or to the
/// `right` of a list at `x`, `y`. Either way the 4pt between the panel and
/// its trigger counts as the panel, so a pointer crossing it stays over it.
/// The host runs the timings (when to open, when to let go) and is told when
/// the pointer is on the panel (`onHold`) and when it leaves (`onRelease`).
@MainActor
public final class HoverPanel: UIView {
    public enum Side: Sendable { case above, right }

    public struct Place: Equatable, Sendable {
        public var x: Double
        public var y: Double
        /// Where on the edge facing the trigger the panel grows from: along
        /// its foot when above, down its side when to the right.
        public var origin: Double
        /// The row the panel must stay inside when above; nil, the host's width.
        public var span: Double?

        public init(x: Double, y: Double, origin: Double, span: Double? = nil) {
            self.x = x
            self.y = y
            self.origin = origin
            self.span = span
        }
    }

    public let side: Side
    /// The most the panel stands tall before its content scrolls (`--room`).
    public var room = 320.0
    public var onHold: () -> Void = {}
    public var onRelease: () -> Void = {}
    /// What it shows; nil while closed.
    public private(set) var key: String?

    private let cell = UIScrollView()
    private var body: UIView?
    private var place = Place(x: 0, y: 0, origin: 0)
    /// The size kept while the next content's tail is still on its way.
    private var held: CGSize?
    private static let pad = Space.space3
    private static let gap = 4.0

    public init(side: Side) {
        self.side = side
        super.init(frame: .zero)
        backgroundColor = Palette.surfaceRaised
        layer.cornerRadius = Radius.radiusLg
        layer.cornerCurve = .continuous
        layer.borderWidth = 1
        boxShadow = Shadow.shadowOverlay
        cell.layer.cornerRadius = Radius.radiusLg
        cell.layer.cornerCurve = .continuous
        cell.clipsToBounds = true
        cell.showsHorizontalScrollIndicator = false
        addSubview(cell)
        addGestureRecognizer(UIHoverGestureRecognizer(target: self, action: #selector(hovered(_:))))
        accessibilityElementsHidden = true
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (panel: HoverPanel, _: UITraitCollection) in panel.paint() }
        paint()
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("HoverPanel is built in code")
    }

    private func paint() {
        layer.borderColor = Palette.borderControl.resolvedColor(with: traitCollection).cgColor
    }

    @objc private func hovered(_ hover: UIHoverGestureRecognizer) {
        switch hover.state {
        case .began: onHold()
        case .ended, .cancelled, .failed: onRelease()
        default: break
        }
    }

    /// The gap facing the trigger is the panel's too.
    override public func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
        let reach = side == .right
            ? bounds.inset(by: UIEdgeInsets(top: 0, left: -Self.gap, bottom: 0, right: 0))
            : bounds.inset(by: UIEdgeInsets(top: 0, left: 0, bottom: -Self.gap, right: 0))
        return reach.contains(point)
    }

    // MARK: Showing

    /// Shows `content` for `key` at `place` in `host`: opening if the panel
    /// was closed, gliding there if it was showing something else. `pending`:
    /// the content's tail is still being read, so the panel keeps the size it
    /// has until `settle()` says it landed.
    public func show(_ key: String, content: UIView, at place: Place, in host: UIView, pending: Bool = false) {
        let opening = self.key == nil || superview !== host
        let old = body
        self.key = key
        self.place = place
        held = pending && !opening ? cell.bounds.size : nil
        content.translatesAutoresizingMaskIntoConstraints = true
        body = content
        cell.addSubview(content)
        if opening {
            layer.removeAllAnimations()
            old?.removeFromSuperview()
            host.addSubview(self)
            UIView.performWithoutAnimation { self.lay() }
            alpha = 0
            transform = UIAccessibility.isReduceMotionEnabled ? .identity : entrance
            Motion.easeOut.animator(Motion.durMenu) {
                self.alpha = 1
                self.transform = .identity
            }.startAnimation()
            return
        }
        // The old content fades where it stood while the panel travels and resizes under both.
        content.alpha = 0
        Motion.easeOut.animator(Motion.durControl) {
            content.alpha = 1
            old?.alpha = 0
        }.startAnimation()
        DispatchQueue.main.asyncAfter(deadline: .now() + Motion.durControl) { old?.removeFromSuperview() }
        alpha = 1
        morph()
    }

    /// The pending content landed: the panel takes its size, once.
    public func settle() {
        guard held != nil else { return }
        held = nil
        morph()
    }

    /// The content changed size on its own (a tail's next line): the panel follows.
    public func contentChanged() {
        guard key != nil, held == nil else { return }
        morph()
    }

    public func hide() {
        guard key != nil else { return }
        key = nil
        held = nil
        let leaving = body
        body = nil
        let fade = Motion.easeOut.animator(Motion.durControl) { self.alpha = 0 }
        fade.addCompletion { _ in
            guard self.key == nil else { return }
            leaving?.removeFromSuperview()
            self.removeFromSuperview()
        }
        fade.startAnimation()
    }

    // MARK: Layout

    private func morph() {
        guard !UIAccessibility.isReduceMotionEnabled else { return lay() }
        UIViewPropertyAnimator(duration: Motion.durMorph, timingParameters: Motion.easeDrawer.parameters).also {
            $0.addAnimations { self.lay() }
        }.startAnimation()
    }

    /// The content at its own width, capped at 440pt or the row (less the
    /// border), and the panel round it, no taller than its room.
    private func lay() {
        guard let body, let host = superview else { return }
        let cap = min(440, place.span ?? host.bounds.width) - 2
        let fit = body.systemLayoutSizeFitting(CGSize(width: cap - Self.pad * 2, height: UIView.layoutFittingCompressedSize.height),
                                               withHorizontalFittingPriority: .fittingSizeLevel, verticalFittingPriority: .fittingSizeLevel)
        let width = min(cap - Self.pad * 2, ceil(fit.width))
        let height = ceil(body.systemLayoutSizeFitting(CGSize(width: width, height: UIView.layoutFittingCompressedSize.height),
                                                       withHorizontalFittingPriority: .required, verticalFittingPriority: .fittingSizeLevel).height)
        body.frame = CGRect(x: Self.pad, y: Self.pad, width: width, height: height)
        let natural = CGSize(width: width + Self.pad * 2, height: min(room, height + Self.pad * 2))
        let inner = held ?? natural
        let size = CGSize(width: inner.width + 2, height: inner.height + 2)
        let origin: CGPoint = switch side {
        case .right:
            CGPoint(x: place.x, y: place.y)
        case .above:
            CGPoint(x: max(0, min(place.x, (place.span ?? host.bounds.width) - size.width)), y: place.y - Self.gap - size.height)
        }
        // The frame is set through bounds and centre, so an entrance still in flight keeps its transform.
        bounds = CGRect(origin: .zero, size: size)
        center = CGPoint(x: origin.x + size.width / 2, y: origin.y + size.height / 2)
        cell.frame = CGRect(x: 1, y: 1, width: inner.width, height: inner.height)
        cell.contentSize = CGSize(width: inner.width, height: height + Self.pad * 2)
    }

    /// From 0.98 and 4pt back toward the trigger, about the point it grows from.
    private var entrance: CGAffineTransform {
        let anchor: CGPoint = side == .right
            ? CGPoint(x: -bounds.width / 2, y: min(place.origin, bounds.height) - bounds.height / 2)
            : CGPoint(x: min(place.origin, bounds.width) - bounds.width / 2, y: bounds.height / 2)
        let lift = side == .right ? CGAffineTransform(translationX: -4, y: 0) : CGAffineTransform(translationX: 0, y: 4)
        return CGAffineTransform(translationX: anchor.x, y: anchor.y).scaledBy(x: 0.98, y: 0.98).translatedBy(x: -anchor.x, y: -anchor.y).concatenating(lift)
    }
}

private extension UIViewPropertyAnimator {
    func also(_ configure: (UIViewPropertyAnimator) -> Void) -> UIViewPropertyAnimator {
        configure(self)
        return self
    }
}
