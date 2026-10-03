import ObjectiveC
import UIKit

/// CSS `box-shadow` on a view, from a shadow token (css-backgrounds-3 §7):
///
/// - the list is "ordered front to back": the first shadow paints on top;
/// - an outer shadow is the border box's rounded rect grown by its spread
///   (negative spread contracts it, and the corner radius with it), offset and
///   blurred, and it is clipped away inside the border box: it never tints the
///   surface;
/// - an inset shadow is "clipped to the element's padding box and appear[s]
///   above the background but below the content" (MDN `box-shadow`): the
///   shadow cast inward by everything outside the padding box shrunk by the
///   spread and moved by the offset.
///
/// Outer shadows are layers at the bottom of the view's layer, masked to the
/// outside of its rounded rect; inset shadows are layers above them, clipped
/// to the padding box, so every subview's content stays above both. They
/// follow the view's bounds and corner radius on every change (copying the
/// view's own bounds animation when it has one, and with no implicit
/// animation otherwise), and their colours re-resolve with its appearance.
public extension UIView {
    /// The shadow token the view casts; empty for none.
    var boxShadow: [ShadowLayer] {
        get { BoxShadow.attached(to: self)?.token ?? [] }
        set {
            if newValue.isEmpty {
                BoxShadow.attached(to: self)?.remove()
            } else {
                (BoxShadow.attached(to: self) ?? BoxShadow(host: self)).token = newValue
            }
        }
    }
}

@MainActor
final class BoxShadow {
    /// CSS blur radius to Core Animation's `shadowRadius`. CSS draws a blur
    /// radius B as a Gaussian of standard deviation B/2 (css-backgrounds-3
    /// §7.1.1). Measured on iOS 27.2 (simulator, 3x) against Chromium 1243
    /// (headless, 3x): a 120×40 black box's edge falloff fitted to a Gaussian
    /// gives σ = 0.974–0.993 × `shadowRadius` for R 4, 8, 12, 16, 24, and
    /// σ = 0.478–0.519 × B for CSS blur 8, 16, 24, 32, 48. So R = B × 0.5;
    /// the largest pixel difference between the pairs is 2–4/255.
    static let blurScale = 0.5

    private static var key: UInt8 = 0

    static func attached(to view: UIView) -> BoxShadow? {
        objc_getAssociatedObject(view, &key) as? BoxShadow
    }

    private weak var host: UIView?
    private let outer = CALayer()
    private let outerMask = CAShapeLayer()
    private let inner = CALayer()
    private let innerMask = CAShapeLayer()
    private var watches: [NSKeyValueObservation] = []
    private var traits: (any UITraitChangeRegistration)?

    var token: [ShadowLayer] = [] {
        didSet { build() }
    }

    init(host: UIView) {
        self.host = host
        objc_setAssociatedObject(host, &Self.key, self, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
        for layer in [outer, inner] {
            layer.actions = Self.still
            layer.name = "box-shadow"
        }
        outerMask.actions = Self.still
        innerMask.actions = Self.still
        outer.mask = outerMask
        inner.mask = innerMask
        host.layer.insertSublayer(inner, at: 0)
        host.layer.insertSublayer(outer, at: 0)
        let layer = host.layer
        let relayout: (CALayer) -> Void = { [weak self] _ in MainActor.assumeIsolated { self?.layout() } }
        watches = [
            layer.observe(\.bounds) { l, _ in relayout(l) },
            layer.observe(\.cornerRadius) { l, _ in relayout(l) },
            layer.observe(\.borderWidth) { l, _ in relayout(l) },
            layer.observe(\.maskedCorners) { l, _ in relayout(l) },
            layer.observe(\.cornerCurve) { l, _ in relayout(l) },
        ]
        traits = host.registerForTraitChanges([UITraitUserInterfaceStyle.self, UITraitAccessibilityContrast.self, UITraitDisplayScale.self]) { [weak self] (_: UIView, _: UITraitCollection) in
            self?.paint()
        }
    }

    func remove() {
        watches = []
        if let traits, let host { host.unregisterForTraitChanges(traits) }
        outer.removeFromSuperlayer()
        inner.removeFromSuperlayer()
        if let host { objc_setAssociatedObject(host, &Self.key, nil, .OBJC_ASSOCIATION_RETAIN_NONATOMIC) }
    }

    /// No implicit animation on anything here.
    private static let still: [String: any CAAction] = [
        "bounds": NSNull(), "position": NSNull(), "path": NSNull(), "shadowPath": NSNull(),
        "shadowColor": NSNull(), "shadowOffset": NSNull(), "shadowRadius": NSNull(), "frame": NSNull(),
    ]

    /// Each shadow and the layer that casts it.
    private var casts: [(layer: CALayer, shadow: ShadowLayer)] = []

    /// One layer per shadow, front first in the token: added back to front.
    private func build() {
        for cast in casts { cast.layer.removeFromSuperlayer() }
        casts = token.reversed().map { shadow in
            let layer = CALayer()
            layer.actions = Self.still
            layer.shadowOpacity = 1
            layer.shadowOffset = CGSize(width: shadow.x, height: shadow.y)
            layer.shadowRadius = shadow.blur * Self.blurScale
            (shadow.inset ? inner : outer).addSublayer(layer)
            return (layer, shadow)
        }
        paint()
        layout()
    }

    /// Colours for the appearance, and the screen's scale: a layer made here
    /// starts at 1x, which would rasterise the shadows and masks at 1x and
    /// blur a 1pt ring over two device pixels.
    private func paint() {
        guard let host else { return }
        let traits = host.traitCollection
        // Off screen the scale is unknown (0); it arrives as a trait change.
        if traits.displayScale > 0 {
            for layer in [outer, outerMask, inner, innerMask] + casts.map(\.layer) {
                layer.contentsScale = traits.displayScale
            }
        }
        for cast in casts {
            cast.layer.shadowColor = cast.shadow.ink.color.resolvedColor(with: traits).cgColor
        }
    }

    /// The view's rounded rect, wound clockwise: continuous corners as UIKit
    /// draws them, circular ones as CSS does.
    private func path(_ rect: CGRect, radius: Double, curve: CALayerCornerCurve) -> UIBezierPath {
        guard rect.width > 0, rect.height > 0 else { return UIBezierPath() }
        let r = max(0, min(radius, min(rect.width, rect.height) / 2))
        // The corners the view rounds (`maskedCorners`), the rest square.
        let masked = host?.layer.maskedCorners ?? [.layerMinXMinYCorner, .layerMaxXMinYCorner, .layerMinXMaxYCorner, .layerMaxXMaxYCorner]
        if curve == .continuous {
            var corners: UIRectCorner = []
            if masked.contains(.layerMinXMinYCorner) { corners.insert(.topLeft) }
            if masked.contains(.layerMaxXMinYCorner) { corners.insert(.topRight) }
            if masked.contains(.layerMinXMaxYCorner) { corners.insert(.bottomLeft) }
            if masked.contains(.layerMaxXMaxYCorner) { corners.insert(.bottomRight) }
            return UIBezierPath(roundedRect: rect, byRoundingCorners: corners, cornerRadii: CGSize(width: r, height: r))
        }
        let tl = masked.contains(.layerMinXMinYCorner) ? r : 0
        let tr = masked.contains(.layerMaxXMinYCorner) ? r : 0
        let bl = masked.contains(.layerMinXMaxYCorner) ? r : 0
        let br = masked.contains(.layerMaxXMaxYCorner) ? r : 0
        let p = UIBezierPath()
        p.move(to: CGPoint(x: rect.minX + tl, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.maxX - tr, y: rect.minY))
        if tr > 0 { p.addArc(withCenter: CGPoint(x: rect.maxX - tr, y: rect.minY + tr), radius: tr, startAngle: -.pi / 2, endAngle: 0, clockwise: true) }
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - br))
        if br > 0 { p.addArc(withCenter: CGPoint(x: rect.maxX - br, y: rect.maxY - br), radius: br, startAngle: 0, endAngle: .pi / 2, clockwise: true) }
        p.addLine(to: CGPoint(x: rect.minX + bl, y: rect.maxY))
        if bl > 0 { p.addArc(withCenter: CGPoint(x: rect.minX + bl, y: rect.maxY - bl), radius: bl, startAngle: .pi / 2, endAngle: .pi, clockwise: true) }
        p.addLine(to: CGPoint(x: rect.minX, y: rect.minY + tl))
        if tl > 0 { p.addArc(withCenter: CGPoint(x: rect.minX + tl, y: rect.minY + tl), radius: tl, startAngle: .pi, endAngle: .pi * 1.5, clockwise: true) }
        p.close()
        return p
    }

    /// `outside` with `hole` cut from it: the hole wound the other way, so the
    /// non-zero rule a shadow path is filled by leaves it empty.
    private func frame(_ outside: CGRect, hole: UIBezierPath) -> CGPath {
        let p = UIBezierPath(rect: outside)
        p.append(hole.reversing())
        return p.cgPath
    }

    private func layout() {
        guard let host else { return }
        let layer = host.layer
        let box = layer.bounds
        let radius = layer.cornerRadius
        let curve = layer.cornerCurve
        // Ours stay at the bottom, below whatever the view has added since.
        if layer.sublayers?.first !== outer { layer.insertSublayer(outer, at: 0) }
        if layer.sublayers?.dropFirst().first !== inner { layer.insertSublayer(inner, above: outer) }
        // Follow the view's own bounds animation, if it is animating one.
        let moving = (layer.animation(forKey: "bounds.size") ?? layer.animation(forKey: "bounds")) as? CABasicAnimation
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        defer { CATransaction.commit() }

        // Wide enough for any token's reach: offset, spread and three blur radii each way.
        var reach: Double = 1
        for shadow in token {
            let extent: Double = abs(shadow.x) + abs(shadow.y) + abs(shadow.spread) + shadow.blur * 3
            reach = max(reach, extent + 1)
        }
        let far = box.insetBy(dx: -reach, dy: -reach)
        outer.frame = box
        inner.frame = box
        set(outerMask, path: frame(far, hole: path(box, radius: radius, curve: curve)), like: moving)
        let border = layer.borderWidth
        let padding = box.insetBy(dx: border, dy: border)
        set(innerMask, path: path(padding, radius: radius - border, curve: curve).cgPath, like: moving)

        for (shadowLayer, shadow) in casts {
            shadowLayer.frame = box
            let shape: CGPath
            if shadow.inset {
                // Everything outside the padding box shrunk by the spread: its
                // shadow falls inward. The offset moves the shadow, not the hole.
                let hole = path(padding.insetBy(dx: shadow.spread, dy: shadow.spread), radius: radius - border - shadow.spread, curve: curve)
                shape = frame(far, hole: hole)
            } else {
                shape = path(box.insetBy(dx: -shadow.spread, dy: -shadow.spread), radius: radius + shadow.spread, curve: curve).cgPath
            }
            set(shadowLayer, shadowPath: shape, like: moving)
        }
    }

    private func set(_ mask: CAShapeLayer, path: CGPath, like moving: CABasicAnimation?) {
        if let moving, let from = mask.presentation()?.path { mask.add(Self.following(moving, "path", from: from, to: path), forKey: "path") }
        mask.frame = host?.layer.bounds ?? .zero
        mask.path = path
    }

    private func set(_ layer: CALayer, shadowPath: CGPath, like moving: CABasicAnimation?) {
        if let moving, let from = layer.presentation()?.shadowPath { layer.add(Self.following(moving, "shadowPath", from: from, to: shadowPath), forKey: "shadowPath") }
        layer.shadowPath = shadowPath
    }

    private static func following(_ moving: CABasicAnimation, _ key: String, from: CGPath, to: CGPath) -> CABasicAnimation {
        let animation = CABasicAnimation(keyPath: key)
        animation.fromValue = from
        animation.toValue = to
        animation.duration = moving.duration
        animation.timingFunction = moving.timingFunction
        animation.beginTime = moving.beginTime
        animation.fillMode = moving.fillMode
        return animation
    }
}
